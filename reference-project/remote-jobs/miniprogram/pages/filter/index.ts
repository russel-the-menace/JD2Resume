// miniprogram/pages/filter/index.ts

import { normalizeLanguage, t } from '../../utils/i18n/index'
import { attachLanguageAware } from '../../utils/languageAware'

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
const ALL_SOURCE_OPTIONS: string[] = ['全部', 'BOSS直聘', '智联招聘', 'Wellfound']

// Mapping from internal Chinese keys to i18n key suffixes
const SALARY_KEY_MAP: Record<string, string> = {
  '全部': 'salary_all',
  '10k以下': 'salary_lt_10k',
  '10-20K': 'salary_10_20k',
  '20-50K': 'salary_20_50k',
  '50K以上': 'salary_50_plus',
  '项目制/兼职': 'salary_project_parttime',
}

const EXP_KEY_MAP: Record<string, string> = {
  '全部': 'exp_all',
  '经验不限': 'exp_any',
  '1年以内': 'exp_lt_1y',
  '1-3年': 'exp_1_3y',
  '3-5年': 'exp_3_5y',
  '5-10年': 'exp_5_10y',
  '10年以上': 'exp_10_plus',
}

const SOURCE_KEY_MAP: Record<string, string> = {
  '全部': 'source_all',
  'BOSS直聘': 'source_boss',
  '智联招聘': 'source_zhilian',
  'Wellfound': 'source_wellfound',
}

const REGION_KEY_MAP: Record<string, string> = {
  '全部': 'regionAll',
  '国内': 'regionDomestic',
  '国外': 'regionOverseas',
  'web3': 'regionWeb3',
}

Page({
  data: {
    tempValue: { salary: '全部', experience: '全部', source_name: [], region: '全部' } as DrawerValue,

    // internal keys (Chinese)
    salaryOptions: SALARY_KEYS,
    experienceOptions: EXP_KEYS,
    regionOptions: REGION_KEYS,
    sourceOptions: ALL_SOURCE_OPTIONS,

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

    sourceSelected: {} as Record<string, boolean>,

    ui: {} as Record<string, string>,
  },

  onLoad() {
    // 从全局状态获取数据
    const app = getApp<IAppOption>() as any
    const filterValue = app?.globalData?._pageData?.filterValue || { salary: '全部', experience: '全部', source_name: [], region: '全部' }
    const tabIndex = app?.globalData?._pageData?.filterTabIndex || 0

    const region = filterValue.region || '全部'
    const source_name = Array.isArray(filterValue.source_name) ? filterValue.source_name : (filterValue.source_name === '全部' ? [] : (filterValue.source_name ? [filterValue.source_name] : []))
    
    // 根据 tabIndex 调整导航和选项
    let navTabs = [
      { key: 'salary', label: t('drawer.salary') },
      { key: 'experience', label: t('drawer.experience') },
      { key: 'region', label: t('drawer.regionTitle') },
      { key: 'source', label: t('drawer.sourceTitle') },
    ]
    let regionOptions = ['全部', '国内', '国外', 'web3']
    
    if (tabIndex === 0) {
      // 公开 tab: 去掉工作类型和招聘软件
      navTabs = navTabs.filter(t => t.key !== 'region' && t.key !== 'source')
    } else if (tabIndex === 1) {
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
        salary: filterValue.salary || '全部',
        experience: filterValue.experience || '全部',
        source_name: source_name,
        region: region,
      },
      navTabs,
      regionOptions,
      sourceOptions: ALL_SOURCE_OPTIONS,
      sourceSelected: sourceSelected,
      _tabIndex: tabIndex, // 保存tab索引，用于返回时应用筛选
    })

    // 清除临时数据
    if (app?.globalData?._pageData) {
      app.globalData._pageData.filterValue = null
      app.globalData._pageData.filterTabIndex = 0
    }

    // attach language-aware behavior
    ;(this as any)._langDetach = attachLanguageAware(this, {
      onLanguageRevive: () => {
        this.syncLanguageFromApp()
      },
    })

    this.syncLanguageFromApp()
  },

  onUnload() {
    const fn = (this as any)._langDetach
    if (typeof fn === 'function') fn()
    ;(this as any)._langDetach = null
  },

  onShow() {
    wx.setNavigationBarTitle({ title: '' })
  },

  onNavTabTap(e: any) {
    const key = e.currentTarget.dataset.key
    const index = e.currentTarget.dataset.index
    if (!key || index === undefined) return
    
    if (this.data.currentNavTab === index) {
      return
    }
    
    if (this.data.isManualTabSwitch) {
      return
    }
    
    this.setData({
      isManualTabSwitch: true,
      currentNavTab: index,
    })
    
    this.setData({
      scrollIntoView: `section-${key}`,
    })
    
    setTimeout(() => {
      this.setData({
        scrollIntoView: '',
        isManualTabSwitch: false,
      })
    }, 500)
  },

  onScrollViewScroll(_e: any) {
    if (this.data.isManualTabSwitch) {
      return
    }
    
    if ((this as any)._scrollTimer) {
      clearTimeout((this as any)._scrollTimer)
    }
    
    ;(this as any)._scrollTimer = setTimeout(() => {
      if (this.data.isManualTabSwitch) {
        return
      }
      
      const query = wx.createSelectorQuery()
      
      query.select('#section-salary').boundingClientRect()
      query.select('#section-experience').boundingClientRect()
      query.select('#section-region').boundingClientRect()
      query.select('#section-source').boundingClientRect()
      query.exec((res: any) => {
        if (!res || res.length < 4) return
        
        if (this.data.isManualTabSwitch) {
          return
        }
        
        const sections = [
          { index: 0, rect: res[0] },
          { index: 1, rect: res[1] },
          { index: 2, rect: res[2] },
          { index: 3, rect: res[3] },
        ]
        
        const threshold = 28
        let currentIndex = 0
        
        for (let i = sections.length - 1; i >= 0; i--) {
          if (sections[i].rect && sections[i].rect.top <= threshold) {
            currentIndex = sections[i].index
            break
          }
        }
        
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

    const useEnglish = lang === 'English' || lang === 'AIEnglish'
    const displaySalaryOptions = (this.data.salaryOptions as SalaryKey[]).map((k) => {
      const mapped = SALARY_KEY_MAP[k]
      return mapped ? t(`jobs.${mapped}` as any) : (useEnglish ? k : k)
    })
    const displayExperienceOptions = (this.data.experienceOptions as ExpKey[]).map((k) => {
      const mapped = EXP_KEY_MAP[k]
      return mapped ? t(`jobs.${mapped}` as any) : (useEnglish ? k : k)
    })
    
    // 区域选项显示处理
    const displayRegionOptions = (this.data.regionOptions || []).map((k) => {
      const mapped = REGION_KEY_MAP[k]
      return mapped ? t(`jobs.${mapped}` as any) : k
    })
    const displaySourceOptions = (this.data.sourceOptions || []).map((k) => {
      const mapped = SOURCE_KEY_MAP[k]
      return mapped ? t(`jobs.${mapped}` as any) : (useEnglish ? k : k)
    })

    // 重新根据 data.navTabs 中的 key 来设置 label
    const navTabs = (this.data.navTabs || []).map(tab => {
        let label = tab.label
        if (tab.key === 'salary') label = t('drawer.salary')
        if (tab.key === 'experience') label = t('drawer.experience')
        if (tab.key === 'region') label = t('drawer.regionTitle')
        if (tab.key === 'source') label = t('drawer.sourceTitle')
        return { ...tab, label }
    })

    this.setData({
      displaySalaryOptions,
      displayExperienceOptions,
      displayRegionOptions,
      displaySourceOptions,
      navTabs,
      ui: {
        salaryTitle: t('drawer.salary'),
        experienceTitle: t('drawer.experience'),
        regionTitle: t('drawer.regionTitle'),
        sourceTitle: t('drawer.sourceTitle'),
        clear: t('drawer.clear'),
        confirm: t('drawer.confirm'),
      },
    })

    wx.setNavigationBarTitle({ title: t('jobs.filterLabel') })
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
    if (!Array.isArray(currentSource)) {
      currentSource = currentSource === '全部' ? [] : (currentSource ? [currentSource] : [])
    }
    
    let newSource: string[]
    if (value === '全部') {
      newSource = []
    } else {
      const index = currentSource.indexOf(value)
      if (index > -1) {
        newSource = currentSource.filter(s => s !== value)
        if (newSource.length === 0) {
          newSource = []
        }
      } else {
        if (currentSource.length === 0) {
          newSource = [value]
        } else {
          newSource = [...currentSource, value]
        }
      }
    }
    
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
    
    this.setData({ tempValue: { ...this.data.tempValue, region: newRegion } })
  },

  onReset() {
    const value = { salary: '全部', experience: '全部', source_name: [], region: '全部' }
    
    const sourceSelected: Record<string, boolean> = {}
    for (const sourceKey of ALL_SOURCE_OPTIONS) {
      sourceSelected[sourceKey] = sourceKey === '全部'
    }
    
    this.setData({ 
      tempValue: value,
      sourceSelected: sourceSelected,
    })
    
    // 存储到全局状态并返回
    const app = getApp<IAppOption>() as any
    if (app?.globalData?._pageData) {
      app.globalData._pageData.filterResult = value
      app.globalData._pageData.filterTabIndex = (this as any).data._tabIndex || 0
      app.globalData._pageData.filterAction = 'reset'
    }
    
    wx.navigateBack()
  },

  onConfirm() {
    // 存储到全局状态并返回
    const app = getApp<IAppOption>() as any
    if (app?.globalData?._pageData) {
      app.globalData._pageData.filterResult = { ...this.data.tempValue }
      app.globalData._pageData.filterTabIndex = (this as any).data._tabIndex || 0
      app.globalData._pageData.filterAction = 'confirm'
    }
    
    wx.navigateBack()
  },
})

