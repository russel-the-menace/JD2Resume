// miniprogram/components/job-tab/index.ts
import type { JobItem } from '../../utils/job'
import { mapJobs } from '../../utils/job'
import { normalizeLanguage, t, type AppLanguage } from '../../utils/i18n/index'
import { callApi } from '../../utils/request'
import { ui } from '../../utils/ui'
import { bootManager } from '../../utils/bootManager'
import { themeManager } from '../../utils/themeManager'
import { attachThemeAware } from '../../utils/themeAware'

type DrawerFilterValue = {
  salary: string
  experience: string
  source_name?: string[]
  region?: string
}

const DEFAULT_DRAWER_FILTER: DrawerFilterValue = {
  salary: '全部',
  experience: '全部',
  source_name: [],
  region: '全部',
}

Component({
  properties: {
    // tab类型: 0=公开, 1=精选, 2=收藏
    tabType: {
      type: Number,
      value: 0,
    },
    // 是否激活（当前显示的tab）
    active: {
      type: Boolean,
      value: false,
    },
    // 是否精选tab已解锁
    isFeaturedUnlocked: {
      type: Boolean,
      value: false,
    },
    // 精选tab是否允许滚动
    featuredScrollEnabled: {
      type: Boolean,
      value: true,
    },
    // 恢复的搜索条件（用于从父组件传递）
    restoreCondition: {
      type: Object,
      value: undefined,
    },
  },

  data: {
    jobs: [] as JobItem[],
    loading: false,
    hasMore: true,
    pageSize: 15,
    lastLoadTime: 0,
    lowerThreshold: 100,
    
    // tab内部状态
    searchKeyword: '',
    scrollTop: 0,
    showSaveMenu: false,
    isSearching: false,
    drawerFilter: { ...DEFAULT_DRAWER_FILTER } as DrawerFilterValue,
    
    // 是否已加载过
    hasLoaded: false,
    
    // UI文本（国际化）
    ui: {
      searchPlaceholder: t('jobs.searchPlaceholder'),
      filterLabel: t('jobs.filterLabel'),
      saveMenuLabel: t('jobs.saveMenuLabel'),
      collectAllLabel: t('jobs.collectAllLabel'),
      saveSearchLabel: t('jobs.saveSearchLabel'),
      restoreSearchLabel: t('jobs.restoreSearchLabel'),
      emptyFavorites: t('jobs.noSavedJobs'),
      featuredSubscribeText: t('jobs.featuredSubscribeText'),
    },
  },

  lifetimes: {
    attached() {
      this.getSystemInfo()
      this.syncLanguageFromApp()
      
      // 1. 监听语言变化
      const app = getApp<IAppOption>() as any
      if (app?.onLanguageChange) {
        ;(this as any)._langListener = () => {
          this.syncLanguageFromApp()
          // 如果已加载，重新加载数据以使用新语言
          if (this.data.hasLoaded) {
            this.loadData(true)
          }
        }
        app.onLanguageChange((this as any)._langListener)
      }

      // attach theme-aware behavior
      ;(this as any)._themeDetach = attachThemeAware(this, {
        onThemeChange: () => {
          this.syncLanguageFromApp()
        },
      })

      // 2. 工业级预加载逻辑：监听 BootManager 信号
      // 当全局启动就绪或确定为未授权时，无论当前 Tab 是否激活，都触发并行加载
      const checkAndLoad = () => {
          const status = bootManager.getStatus();
          if ((status === 'success' || status === 'unauthorized') && !this.data.hasLoaded) {
              this.loadData(true);
          }
      };

      // 订阅广播
      (this as any)._unsubBoot = bootManager.onStatusChange(checkAndLoad);

      // 如果当前已经就绪，直接加载
      const status = bootManager.getStatus();
      if ((status === 'success' || status === 'unauthorized') && !this.data.hasLoaded) {
          this.loadData(true);
      }
      // 保留原有的 active 触发逻辑（作为兜底）
      else if ((this.properties.active as boolean) && !this.data.hasLoaded) {
        this.loadData(true)
      }
    },
    
    detached() {
      if ((this as any)._themeDetach) {
        (this as any)._themeDetach()
      }
      
      const app = getApp<IAppOption>() as any
      const listener = (this as any)._langListener
      if (listener && app?.offLanguageChange) {
        app.offLanguageChange(listener)
      }
      ;(this as any)._langListener = null

      if (typeof (this as any)._themeDetach === 'function') {
        (this as any)._themeDetach()
      }

      // 自动清理 BootManager 订阅
      if ((this as any)._unsubBoot) {
          (this as any)._unsubBoot();
      }
    },
  },

  observers: {
    'active': function(active: boolean) {
      // 当tab激活时，如果未加载则加载数据
      if (active && !this.data.hasLoaded) {
        this.loadData(true)
      }
    },
    'restoreCondition': function(condition: any) {
      // 当收到恢复的搜索条件时，应用它
      if (condition && condition.tabType === (this.properties.tabType as number)) {
        const searchKeyword = condition.searchKeyword || ''
        const drawerFilter = condition.drawerFilter || { ...DEFAULT_DRAWER_FILTER }
        
        this.setData({
          searchKeyword,
          drawerFilter: { ...DEFAULT_DRAWER_FILTER, ...drawerFilter },
          scrollTop: 0,
        })
        
        // 重新加载数据
        this.loadData(true)
        
        // 清空恢复条件，避免重复触发
        this.setData({ restoreCondition: null })
      }
    },
  },

  methods: {
    getSystemInfo() {
      try {
        const windowInfo = wx.getWindowInfo()
        const lowerThreshold = windowInfo.windowHeight / 2
        this.setData({ lowerThreshold })
      } catch (err) {
        // ignore
      }
    },

    syncLanguageFromApp() {
      this.setData({
        ui: {
          searchPlaceholder: t('jobs.searchPlaceholder'),
          filterLabel: t('jobs.filterLabel'),
          saveMenuLabel: t('jobs.saveMenuLabel'),
          collectAllLabel: t('jobs.collectAllLabel'),
          saveSearchLabel: t('jobs.saveSearchLabel'),
          restoreSearchLabel: t('jobs.restoreSearchLabel'),
          emptyFavorites: t('jobs.noSavedJobs'),
          featuredSubscribeText: t('jobs.featuredSubscribeText'),
          cursorColor: themeManager.getPrimaryColor(),
        },
      })
    },

    async loadData(reset = false) {
      if (this.data.loading) return
      
      // 如果是重置加载（如切换语言），立即清空当前列表并显示加载中，避免旧语言数据闪烁
      if (reset) {
        this.setData({ 
          jobs: [], 
          hasMore: true, 
          hasLoaded: false,
          scrollTop: 0 
        })
      }
      
      this.setData({ loading: true })

      // 确保先确定好语言（等待 app.ts 中的 refreshUser 完成）
      const app = getApp<IAppOption>() as any
      if (app?.globalData?.userPromise) {
        await app.globalData.userPromise
        // 重新同步 UI 文本和语言状态
        this.syncLanguageFromApp()
      }

      try {
        const tabType = this.properties.tabType as number
        
        // 如果有搜索关键词，执行搜索
        if (this.data.searchKeyword && this.data.searchKeyword.trim()) {
          await this.performCollectionSearch(this.data.searchKeyword, reset)
          return
        }
        
        if (tabType === 2) {
          // 收藏tab
          await this.loadSavedJobs(reset)
        } else {
          // 公开或精选tab
          await this.loadRemoteJobs(reset)
        }
      } catch (err) {
        console.error('Load data error:', err)
        this.setData({ loading: false, hasMore: true })
      }
    },

    async loadRemoteJobs(reset = false) {
      const existingJobs = reset ? [] : this.data.jobs
      const skip = existingJobs.length
      const tabType = this.properties.tabType as number
      
      // 构建筛选参数
      const filterParams: any = {}
      
      // 语言设置
      const app = getApp<any>()
      const currentLang = normalizeLanguage(app?.globalData?.language || 'Chinese')
      const isEnglishEnv = (currentLang === 'English' || currentLang === 'AIEnglish')
      
      filterParams.language = currentLang
      
      // 来源筛选
      const source_names = this.data.drawerFilter?.source_name || []
      if (Array.isArray(source_names) && source_names.length > 0) {
        if (isEnglishEnv) {
          filterParams.source_name_english = source_names
        } else {
          filterParams.source_name = source_names
        }
      }
      
      // 薪资筛选
      const salary = this.data.drawerFilter?.salary || '全部'
      if (salary && salary !== '全部') {
        if (isEnglishEnv) {
          filterParams.salary_english = salary
        } else {
          filterParams.salary = salary
        }
      }
      
      const functionName = tabType === 0 ? 'getPublicJobList' : 'getFeaturedJobList'

      // --- 大厂级预取优化：优先使用 App 级预取的数据 ---
      const prefetched = app.globalData.prefetchedData
      const isInitialNoFilter = reset && !this.data.searchKeyword && !filterParams.salary && !filterParams.experience && (!filterParams.source_name || filterParams.source_name.length === 0)
      
      let jobs: any[] = []
      let usePrefetched = false

      if (isInitialNoFilter && prefetched && prefetched.timestamp > 0) {
          const now = Date.now()
          // 预取数据 5 分钟内有效
          if (now - prefetched.timestamp < 5 * 60 * 1000) {
              const prefetchedList = tabType === 0 ? prefetched.publicJobs : prefetched.featuredJobs
              if (prefetchedList && prefetchedList.length > 0) {
                  console.log(`[JobTab] Using prefetched data for ${functionName}`)
                  jobs = prefetchedList
                  usePrefetched = true
                  
                  // 使用后清理该 Tab 的预取标记，避免后续刷新还走这里 (可选)
                  // tabType === 0 ? prefetched.publicJobs = null : prefetched.featuredJobs = null
              }
          }
      }

      if (!usePrefetched) {
          const res = await callApi<any>(functionName, {
            pageSize: this.data.pageSize,
            skip,
            ...filterParams,
          })
          
          if (res.success && res.result) {
            jobs = res.result.jobs || []
          } else {
            console.error(`[JobTab] ${functionName} failed:`, res)
            this.setData({ loading: false, hasMore: true })
            return
          }
      }
      
      const newJobs = mapJobs(jobs, currentLang) as JobItem[]
      const merged = reset ? newJobs : [...existingJobs, ...newJobs]
      const hasMore = newJobs.length >= this.data.pageSize
      
      this.setData({
        jobs: merged,
        loading: false,
        hasMore,
        hasLoaded: true,
        lastLoadTime: Date.now(),
      })
      
      if (reset) {
        this.setData({ scrollTop: 0 })
      }
      
      // 通知父组件数据已更新
      this.triggerEvent('dataupdate', { jobs: merged, hasMore })
    },

    async loadSavedJobs(reset = false) {
      const app = getApp<IAppOption>() as any
      const user = app?.globalData?.user
      const openid = user?.openid
      const isVerified = !!(user && user.isAuthed)
      
      if (!isVerified || !openid) {
        this.setData({ 
          jobs: [], 
          loading: false, 
          hasMore: false,
          hasLoaded: true,
        })
        this.triggerEvent('dataupdate', { jobs: [], hasMore: false })
        return
      }
      
      try {
        const existingJobs = reset ? [] : this.data.jobs
        const skip = existingJobs.length
        
        const res = await callApi('getSavedJobs', {
          skip,
          limit: this.data.pageSize,
          openid
        })
        
        const responseData = res.result
        const savedJobs = (responseData?.jobs || []) as any[]
        const hasMore = savedJobs.length >= this.data.pageSize
        
        // 获取用户语言设置
        const userLanguage = normalizeLanguage(app?.globalData?.language || 'Chinese')
        
        const normalized = mapJobs(savedJobs, userLanguage) as JobItem[]
        const finalJobs = reset ? normalized : [...existingJobs, ...normalized]
        
        this.setData({
          jobs: finalJobs,
          loading: false,
          hasMore,
          hasLoaded: true,
          lastLoadTime: Date.now(),
        })
        
        if (reset) {
          this.setData({ scrollTop: 0 })
        }
        
        this.triggerEvent('dataupdate', { jobs: finalJobs, hasMore })
      } catch (err) {
        console.error('Load saved jobs error:', err)
        this.setData({ loading: false, hasMore: true })
      }
    },

    async performCollectionSearch(keyword: string, reset = false) {
      if (!keyword || !keyword.trim()) {
        this.setData({ loading: false, isSearching: false })
        return
      }
      
      if (reset) {
        this.setData({ isSearching: true, scrollTop: 0 })
      }
      
      try {
        const existingJobs = reset ? [] : this.data.jobs
        const skip = existingJobs.length
        
        // 获取语言和筛选参数
        const app = getApp<IAppOption>() as any
        const userLanguage = normalizeLanguage(app?.globalData?.language || 'Chinese')
        
        const res = await callApi('searchJobs', {
          keyword,
          skip,
          limit: this.data.pageSize,
          tabType: this.properties.tabType,
          drawerFilter: this.data.drawerFilter,
          language: userLanguage
        })
        
        const responseData = res.result
        const jobs = responseData?.jobs || []
        const hasMore = jobs.length >= this.data.pageSize
        
        const mappedJobs = mapJobs(jobs, userLanguage) as JobItem[]
        const mergedJobs = reset ? mappedJobs : [...existingJobs, ...mappedJobs]
        
        this.setData({
          jobs: mergedJobs,
          loading: false,
          hasMore,
          hasLoaded: true,
          lastLoadTime: Date.now(),
        })
        
        if (reset) {
          this.setData({ scrollTop: 0 })
        }
        
        this.triggerEvent('dataupdate', { jobs: mergedJobs, hasMore })
      } catch (err) {
        ui.showToast(t('jobs.searchFailed'))
        if (reset) {
          this.setData({ isSearching: false })
        }
        this.setData({ loading: false })
      }
    },

    async maybeLoadMore() {
      const { loading, hasMore, lastLoadTime } = this.data
      const now = Date.now()
      if (loading || !hasMore || now - lastLoadTime < 500) return
      
      this.setData({ lastLoadTime: now })
      await this.loadData(false)
    },

    onScrollLower() {
      this.maybeLoadMore()
    },

    onItemTap(e: any) {
      // job-list 触发的事件格式: { job, _id }
      // 数据在 e.detail 中
      const job = e.detail?.job
      const id = e.detail?._id
      
      if (!job || !id) {
        console.warn('job-tab onItemTap: missing job or id', { job, id, detail: e.detail })
        return
      }
      
      // 确保 _id 存在
      if (!job._id && id) {
        job._id = id
      }
      
      this.triggerEvent('itemtap', { job, _id: id })
    },

    onSearchInput(e: WechatMiniprogram.Input) {
      const keyword = (e.detail.value || '').trim()
      this.setData({ searchKeyword: keyword })
      
      // 防抖搜索
      const self = this as any
      if (self._searchTimer) {
        clearTimeout(self._searchTimer)
      }
      self._searchTimer = setTimeout(() => {
        const currentKeyword = this.data.searchKeyword.trim()
        if (currentKeyword) {
          this.performCollectionSearch(currentKeyword, true)
        } else {
          this.setData({ isSearching: false })
          this.loadData(true)
        }
      }, 500)
    },

    toggleDrawer() {
      if (this.data.showSaveMenu) {
        this.setData({ showSaveMenu: false })
      }
      // 通知父组件打开 drawer
      this.triggerEvent('openfilter', {
        tabIndex: this.properties.tabType as number,
        filter: this.data.drawerFilter,
      })
    },

    toggleSaveMenu() {
      const showSaveMenu = !this.data.showSaveMenu
      this.setData({ showSaveMenu })
    },

    // 应用筛选条件（由父组件调用）
    applyFilter(filter: DrawerFilterValue) {
      this.setData({ drawerFilter: filter })
      // 重新加载数据
      this.loadData(true)
    },

    async onSaveAllJobs() {
      this.setData({ showSaveMenu: false })
      
      // 检查认证状态
      const app = getApp<IAppOption>() as any
      const user = app?.globalData?.user
      const openid = user?.openid
      const isVerified = !!(user && user.isAuthed)
      if (!isVerified || !openid) {
        ui.showToast(t('jobs.pleaseLogin'))
        return
      }
      
      const currentJobs = this.data.jobs
      if (currentJobs.length === 0) {
        ui.showToast(t('jobs.listEmpty'))
        return
      }
      
      ui.showLoading(t('jobs.saving'))
      try {
        // 构建批量保存参数
        // 直接提交所有有效职位，让后端去重
        const jobsToCheck = currentJobs.filter(job => job._id && job._id.trim())
        
        if (jobsToCheck.length === 0) {
          ui.hideLoading()
          ui.showToast(t('jobs.listEmpty'))
          return
        }

        const jobIds = jobsToCheck.map(job => job._id)
        const jobData: Record<string, { type: string; createdAt: any }> = {}
        jobsToCheck.forEach(job => {
          if (job._id) {
            jobData[job._id] = {
              type: job.type || '',
              // 兼容字符串或 Date 对象
              createdAt: job.createdAt || new Date(),
            }
          }
        })
        
        await callApi('batchSaveJobs', {
          jobIds,
          jobData,
        })
        
        ui.hideLoading()
        ui.showToast(t('jobs.saveSuccess'))
        
        // 更新职位列表的isSaved状态
        const savedJobIds = new Set(jobIds)
        this.setData({
          jobs: this.data.jobs.map(job => ({
            ...job,
            isSaved: job.isSaved || savedJobIds.has(job._id),
          }))
        })
        
        // 通知父组件刷新收藏tab
        this.triggerEvent('refreshsaved')
      } catch (err) {
        ui.hideLoading()
        ui.showToast(t('jobs.saveFailed'))
      }
    },

    async onSaveSearchCondition() {
      this.setData({ showSaveMenu: false })
      
      // 检查认证状态
      const app = getApp<IAppOption>() as any
      const user = app?.globalData?.user
      const openid = user?.openid
      const isVerified = !!(user && user.isAuthed)
      if (!isVerified || !openid) {
        ui.showToast(t('jobs.pleaseLogin'))
        return
      }
      
      const searchKeyword = (this.data.searchKeyword || '').trim()
      const drawerFilter = this.data.drawerFilter || { ...DEFAULT_DRAWER_FILTER }
      
      // 检查是否有搜索关键词或筛选条件
      const hasKeyword = !!searchKeyword
      const hasSourceFilter = !!(drawerFilter?.source_name && Array.isArray(drawerFilter.source_name) && drawerFilter.source_name.length > 0)
      const hasRegionFilter = !!(drawerFilter?.region && drawerFilter.region !== '全部')
      const hasSalaryFilter = !!(drawerFilter?.salary && drawerFilter.salary !== '全部')
      const hasExperienceFilter = !!(drawerFilter?.experience && drawerFilter.experience !== '全部')
      const hasAnyFilter = hasSourceFilter || hasRegionFilter || hasSalaryFilter || hasExperienceFilter
      
      // 如果既没有搜索关键词，也没有筛选条件，提示用户
      if (!hasKeyword && !hasAnyFilter) {
        const lang = normalizeLanguage(app?.globalData?.language)
        ui.showToast(t('jobs.tryAddFilterHint', lang))
        return
      }
      
      const searchCondition = {
        searchKeyword,
        drawerFilter,
        tabIndex: this.properties.tabType as number,
      }
      
      try {
        await callApi('saveSearchCondition', {
          openid,
          ...searchCondition,
        })
        
        ui.showToast(t('jobs.searchSaved'))
      } catch (err) {
        ui.showToast(t('jobs.saveFailed'))
      }
    },

    async onRestoreSearchCondition() {
      this.setData({ showSaveMenu: false })
      
      // 检查认证状态
      const app = getApp<IAppOption>() as any
      const user = app?.globalData?.user
      const openid = user?.openid
      const isVerified = !!(user && user.isAuthed)
      if (!isVerified || !openid) {
        ui.showToast(t('jobs.pleaseLogin'))
        return
      }
      
      // 通知父组件显示恢复搜索条件的弹窗
      this.triggerEvent('restoresearch', { tabType: this.properties.tabType as number })
    },

    onFeaturedSubscribeTap() {
      this.triggerEvent('featuresubscribe')
    },

    // 应用搜索条件（由父组件调用）
    applySearchCondition(condition: { searchKeyword: string; drawerFilter: DrawerFilterValue }) {
      const { searchKeyword = '', drawerFilter = { ...DEFAULT_DRAWER_FILTER } } = condition
      
      this.setData({
        searchKeyword,
        drawerFilter: { ...DEFAULT_DRAWER_FILTER, ...drawerFilter },
        scrollTop: 0,
      })
      
      // 重新加载数据
      this.loadData(true)
    },
  },
})
