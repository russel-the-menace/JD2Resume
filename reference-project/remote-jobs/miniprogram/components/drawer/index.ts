// miniprogram/components/drawer/index.ts

import { normalizeLanguage, t } from '../../utils/i18n'
const swipeToClose = require('../../behaviors/swipe-to-close')
const fullscreenDrawerBehavior = require('../../behaviors/fullscreen-drawer')

type DrawerValue = { salary: string; experience: string; source_name?: string[]; region?: string }

// loosen key types to avoid mixed ASCII/non-ASCII literal warnings from tooling
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type SalaryKey = string
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type ExpKey = string

const SALARY_KEYS: SalaryKey[] = ['全部', '10k以下', '10-20K', '20-50K', '50K以上', '项目制/兼职']
const EXP_KEYS: ExpKey[] = ['全部', '经验不限', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上']
const REGION_KEYS: string[] = ['全部', '国内', '国外', 'web3']

// 所有来源选项（不再根据区域动态变化）
const ALL_SOURCE_OPTIONS: string[] = ['全部', 'BOSS直聘', '智联招聘']

const EN_SALARY: Record<string, string> = {
  '全部': 'All',
  '10k以下': '< 10K',
  '10-20K': '10–20K',
  '20-50K': '20–50K',
  '50K以上': '50K+',
  '项目制/兼职': 'Project/Part-time',
}

const EN_EXP: Record<string, string> = {
  '全部': 'All',
  '经验不限': 'Any',
  '1年以内': '< 1y',
  '1-3年': '1–3y',
  '3-5年': '3–5y',
  '5-10年': '5–10y',
  '10年以上': '10y+',
}

const EN_SOURCE: Record<string, string> = {
  '全部': 'All',
  'BOSS直聘': 'BOSS Zhipin',
  '智联招聘': 'Zhilian Zhaopin',
}

Component({
  behaviors: [swipeToClose, fullscreenDrawerBehavior],
  options: {
    addGlobalClass: true
  },
  
  properties: {
    show: { type: Boolean, value: false },
    tabType: { type: Number, value: 0 },
    value: {
      type: Object,
      value: { salary: '全部', experience: '全部', source_name: [], region: '全部' },
    },
  },

  data: {
    tempValue: { salary: '全部', experience: '全部', source_name: [], region: '全部' } as DrawerValue,

    // internal keys (Chinese)
    salaryOptions: SALARY_KEYS,
    experienceOptions: EXP_KEYS,
    regionOptions: REGION_KEYS,
    sourceOptions: ALL_SOURCE_OPTIONS, // 固定显示所有来源选项

    // display labels
    displaySalaryOptions: [] as string[],
    displayExperienceOptions: [] as string[],
    displayRegionOptions: [] as string[],
    displaySourceOptions: [] as string[],

    // 导航tab相关
    navTabs: [] as Array<{ key: string; label: string }>,

    // 滚动定位
    scrollIntoView: '',
    
    // 当前选中的导航tab索引
    currentNavTab: 0,
    
    // 是否正在手动切换tab（防止滚动监听覆盖手动选择）
    isManualTabSwitch: false,

    ui: {} as Record<string, string>,
  },

  observers: {
    show(open) {
      if (open) {
        // 初始化 drawer 打开状态（包含 tabBar 隐藏和动画初始化）
        ;(this as any).initDrawerOpen()
        
        this.syncLanguageFromApp()

        const v = (this.properties && (this.properties.value as any)) || { salary: '全部', experience: '全部', source_name: [], region: '全部' }
        const tabType = this.properties.tabType || 0
        const region = v.region || '全部'
        const source_name = Array.isArray(v.source_name) ? v.source_name : (v.source_name === '全部' ? [] : (v.source_name ? [v.source_name] : []))
        
        // 分离 navTabs 逻辑
        let navTabs = [
          { key: 'salary', label: '薪资' },
          { key: 'experience', label: '经验' },
          { key: 'region', label: '工作类型' },
          { key: 'source', label: '招聘软件' },
        ]
        let regionOptions = ['全部', '国内', '国外', 'web3']
        
        if (tabType === 0) {
          // 公开 tab: 去掉工作类型和招聘软件
          navTabs = navTabs.filter(t => t.key !== 'region' && t.key !== 'source')
        } else if (tabType === 1) {
          // 精选 tab: 去掉国内
          regionOptions = ['全部', '国外', 'web3']
        }

        // 计算每个来源的选中状态
        const sourceSelected: Record<string, boolean> = {}
        for (const sourceKey of ALL_SOURCE_OPTIONS) {
          if (sourceKey === '全部') {
            sourceSelected[sourceKey] = source_name.length === 0
          } else {
            sourceSelected[sourceKey] = source_name.indexOf(sourceKey) > -1
          }
        }
        
        this.setData({
          tempValue: {
            salary: v.salary || '全部',
            experience: v.experience || '全部',
            source_name: source_name,
            region: region,
          },
          navTabs,
          regionOptions,
          sourceOptions: ALL_SOURCE_OPTIONS,
          sourceSelected: sourceSelected,
        })
        
        // 重新同步语言设置以更新 displaySourceOptions
        this.syncLanguageFromApp()
      } else {
        // 初始化 drawer 关闭状态（包含 tabBar 显示和状态重置）
        ;(this as any).initDrawerClose()
      }
    },
    value(v) {
      if (this.properties && this.properties.show) {
        const next = (v as any) || { salary: '全部', experience: '全部', source_name: [], region: '全部' }
        const region = next.region || '全部'
        const source_name = Array.isArray(next.source_name) ? next.source_name : (next.source_name === '全部' ? [] : (next.source_name ? [next.source_name] : []))
        
        // 计算每个来源的选中状态
        const sourceSelected: Record<string, boolean> = {}
        for (const sourceKey of ALL_SOURCE_OPTIONS) {
          if (sourceKey === '全部') {
            sourceSelected[sourceKey] = source_name.length === 0
          } else {
            sourceSelected[sourceKey] = source_name.indexOf(sourceKey) > -1
          }
        }
        
        this.setData({
          tempValue: {
            salary: next.salary || '全部',
            experience: next.experience || '全部',
            source_name: source_name,
            region: region,
          },
          sourceOptions: ALL_SOURCE_OPTIONS,
          sourceSelected: sourceSelected,
        })
        
        // 重新同步语言设置以更新 displaySourceOptions
        this.syncLanguageFromApp()
      }
    },
  },

  lifetimes: {
    attached() {
      const app = getApp<IAppOption>() as any
      const listener = () => {
        // update only when mounted; safe even if hidden
        this.syncLanguageFromApp()
      }
      ;(this as any)._langListener = listener
      if (app?.onLanguageChange) app.onLanguageChange(listener)

      // initialize display values
      this.syncLanguageFromApp()
    },

    detached() {
      const app = getApp<IAppOption>() as any
      const listener = (this as any)._langListener
      if (listener && app?.offLanguageChange) app.offLanguageChange(listener)
      ;(this as any)._langListener = null
    },
  },

  methods: {
    onNavTabTap(e: any) {
      const key = e.currentTarget.dataset.key
      const index = e.currentTarget.dataset.index
      if (!key || index === undefined) return
      
      // 如果点击的是当前已选中的tab，不执行任何操作
      if (this.data.currentNavTab === index) {
        return
      }
      
      // 如果正在手动切换，忽略新的点击（防止快速点击导致状态混乱）
      if (this.data.isManualTabSwitch) {
        return
      }
      
      // 立即更新状态，避免闪烁
      // 先设置手动切换标志和当前tab，防止滚动监听覆盖
      this.setData({
        isManualTabSwitch: true,
        currentNavTab: index,
      })
      
      // 然后设置滚动定位
      this.setData({
        scrollIntoView: `section-${key}`,
      })
      
      // 延迟清除，确保滚动完成，并允许滚动监听重新工作
      setTimeout(() => {
        this.setData({
          scrollIntoView: '',
          isManualTabSwitch: false,
        })
      }, 500)
    },

    onScrollViewScroll(_e: any) {
      // 如果正在手动切换tab，不更新（防止覆盖手动选择）
      if (this.data.isManualTabSwitch) {
        return
      }
      
      // 防抖处理，避免频繁更新
      if ((this as any)._scrollTimer) {
        clearTimeout((this as any)._scrollTimer)
      }
      
      (this as any)._scrollTimer = setTimeout(() => {
        // 再次检查标志，可能在防抖期间发生了变化
        if (this.data.isManualTabSwitch) {
          return
        }
        
        // 根据滚动位置更新当前选中的导航tab
        const query = wx.createSelectorQuery().in(this)
        
        // 查询各个section的位置
        query.select('#section-salary').boundingClientRect()
        query.select('#section-experience').boundingClientRect()
        query.select('#section-region').boundingClientRect()
        query.select('#section-source').boundingClientRect()
        query.exec((res: any) => {
          if (!res || res.length < 4) return
          
          // 再次检查标志，可能在查询期间发生了变化
          if (this.data.isManualTabSwitch) {
            return
          }
          
          const sections = [
            { index: 0, rect: res[0] },
            { index: 1, rect: res[1] },
            { index: 2, rect: res[2] },
            { index: 3, rect: res[3] },
          ]
          
          // 找到当前最接近顶部的section（考虑28rpx的padding）
          const threshold = 28
          let currentIndex = 0
          
          for (let i = sections.length - 1; i >= 0; i--) {
            if (sections[i].rect && sections[i].rect.top <= threshold) {
              currentIndex = sections[i].index
              break
            }
          }
          
          // 更新当前选中的导航tab
          if (this.data.currentNavTab !== currentIndex) {
            this.setData({
              currentNavTab: currentIndex,
            })
          }
        })
      }, 100)
    },
    
    syncLanguageFromApp() {
      const app = getApp<IAppOption>() as any
      const lang = normalizeLanguage(app?.globalData?.language)

      // AIEnglish 和 English 都使用英文翻译
      const useEnglish = lang === 'English' || lang === 'AIEnglish'
      const displaySalaryOptions = (this.data.salaryOptions as SalaryKey[]).map((k) => (useEnglish ? EN_SALARY[k] : k))
      const displayExperienceOptions = (this.data.experienceOptions as ExpKey[]).map((k) => (useEnglish ? EN_EXP[k] : k))
      const displayRegionOptions = (this.data.regionOptions || []).map((k) => {
        if (useEnglish) {
          const map: Record<string, string> = { '全部': 'All', '国内': 'Domestic', '国外': 'Abroad', 'web3': 'Web3' }
          return map[k] || k
        }
        return k
      })
      const displaySourceOptions = (this.data.sourceOptions || []).map((k) => (useEnglish ? (EN_SOURCE[k] || k) : k))

      // 更新导航 tab 的 label
      const navTabs = [
        { key: 'salary', label: t('drawer.salary', lang) },
        { key: 'experience', label: t('drawer.experience', lang) },
        { key: 'region', label: t('drawer.regionTitle', lang) },
        { key: 'source', label: t('drawer.sourceTitle', lang) },
      ]

      this.setData({
        displaySalaryOptions,
        displayExperienceOptions,
        displayRegionOptions,
        displaySourceOptions,
        navTabs,
        ui: {
          salaryTitle: t('drawer.salary', lang),
          experienceTitle: t('drawer.experience', lang),
          regionTitle: t('drawer.regionTitle', lang),
          sourceTitle: t('drawer.sourceTitle', lang),
          clear: t('drawer.clear', lang),
          confirm: t('drawer.confirm', lang),
        },
      })
    },

    stopPropagation() {},

    onClose() {
      (this as any).closeDrawer()
    },

    onPickSalary(e: any) {
      const value = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '全部'
      this.setData({ tempValue: { ...this.data.tempValue, salary: value } })
    },

    onPickExperience(e: any) {
      const value = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '全部'
      this.setData({ tempValue: { ...this.data.tempValue, experience: value } })
    },

    onPickSource(e: any) {
      const value = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) as string
      if (!value) return
      
      let currentSource = this.data.tempValue.source_name || []
      // 确保 currentSource 是数组
      if (!Array.isArray(currentSource)) {
        currentSource = currentSource === '全部' ? [] : (currentSource ? [currentSource] : [])
      }
      
      let newSource: string[]
      if (value === '全部') {
        // 点击"全部"：切换到"全部"（清空所有选择）
        newSource = []
      } else {
        // 点击具体来源
        const index = currentSource.indexOf(value)
        if (index > -1) {
          // 已选中，取消选中
          newSource = currentSource.filter(s => s !== value)
          // 如果取消后为空，表示回到"全部"
          if (newSource.length === 0) {
            newSource = []
          }
        } else {
          // 未选中，添加选中
          // 如果当前是空数组（"全部"），直接设置为 [value]
          // 否则添加到现有数组
          if (currentSource.length === 0) {
            newSource = [value]
          } else {
            newSource = [...currentSource, value]
          }
        }
      }
      
      // 计算每个来源的选中状态
      const sourceSelected: Record<string, boolean> = {}
      for (const sourceKey of this.data.sourceOptions) {
        if (sourceKey === '全部') {
          sourceSelected[sourceKey] = newSource.length === 0
        } else {
          sourceSelected[sourceKey] = newSource.indexOf(sourceKey) > -1
        }
      }
      
      this.setData({ 
        'tempValue.source_name': newSource,
        sourceSelected: sourceSelected,
      })
    },

    onPickRegion(e: any) {
      const value = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.value) || '全部'
      const newRegion = value === '全部' ? '全部' : value
      
      // 更新区域
      this.setData({ tempValue: { ...this.data.tempValue, region: newRegion } })
    },

    onReset() {
      const value = { salary: '全部', experience: '全部', source_name: [], region: '全部' }
      
      // 重置来源选中状态
      const sourceSelected: Record<string, boolean> = {}
      for (const sourceKey of ALL_SOURCE_OPTIONS) {
        sourceSelected[sourceKey] = sourceKey === '全部'
      }
      
      this.setData({ 
        tempValue: value,
        sourceSelected: sourceSelected,
      })
      this.triggerEvent('reset', { value })
    },

    onConfirm() {
      this.triggerEvent('confirm', { value: { ...this.data.tempValue } })
    },
  },
})
