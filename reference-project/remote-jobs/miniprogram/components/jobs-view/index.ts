// components/jobs-view/index.ts
import { normalizeLanguage, t, type AppLanguage } from '../../utils/i18n/index'
import { attachLanguageAware } from '../../utils/languageAware'
import { toDateMs } from '../../utils/time'
import { isAiChineseUnlocked } from '../../utils/subscription'
import { request, callApi } from '../../utils/request'
import { ui } from '../../utils/ui'
import { checkIsAuthed } from '../../utils/util'

// Define App Option type locally if not imported
interface IAppOption {
    globalData: {
      user: any
      bootStatus: any
      language: string
      tabSelected: number
      _pageData: any
    }
}

Component({
  properties: {
      active: {
          type: Boolean,
          value: false,
          observer(newVal) {
              if (newVal) {
                 this.onShowCompat()
              }
          }
      },
      isLoggedIn: {
          type: Boolean,
          value: false
      }
  },

  data: {
    currentTab: 0,
    isFeaturedUnlocked: false,
    featuredScrollEnabled: true,
    selectedCollection: 'remote_jobs',
    showRestoreSheet: false,
    restoreSheetOpen: false,
    savedSearchConditions: [] as any[],
    isRestoreEditing: false,

    ui: {
      tabPublic: '',
      tabFeatured: '',
      tabSaved: '',
      editLabel: '',
      noSavedSearchConditions: '',
    } as Record<string, string>,
  },

  lifetimes: {
      attached() {
          console.log('[CommunityView] attached')
          ;(this as any)._langDetach = attachLanguageAware(this, {
              onLanguageRevive: () => {
                  this.syncLanguageFromApp()
              },
          })

          this.syncLanguageFromApp()
          this.checkFeaturedSubscription()
      },

      detached() {
          const fn = (this as any)._langDetach
          if (typeof fn === 'function') fn()
          ;(this as any)._langDetach = null
      }
  },

  pageLifetimes: {
      show() {
          if (this.data.active) {
              this.onShowCompat()
          }
      }
  },

  methods: {
    onShowCompat() {
        console.log('[JobsView] onShowCompat')
        const app = getApp<IAppOption>();
        
        // 同步全局选中的 Tab 索引，防止闪烁 (岗位现在是 Index 0)
        if (app.globalData) {
            app.globalData.tabSelected = 0;
        }

        this.syncLoginState();
        this.checkFeaturedSubscription();

        // 检查是否有筛选结果需要应用
        const pageData = app?.globalData?._pageData;
        if (pageData?.filterResult && pageData?.filterAction) {
            const filterResult = pageData.filterResult;
            const tabIndex = pageData.filterTabIndex || 0;
            const action = pageData.filterAction;
            
            // 清除临时数据
            pageData.filterResult = null;
            pageData.filterTabIndex = 0;
            pageData.filterAction = null;
            
            // 应用筛选条件
            setTimeout(() => {
                const tabComponent = this.selectComponent(`#jobTab${tabIndex}`) as any;
                if (tabComponent && typeof tabComponent.applyFilter === 'function') {
                    if (action === 'reset') {
                        tabComponent.applyFilter({ salary: '全部', experience: '全部', source_name: [], region: '全部' });
                    } else {
                        tabComponent.applyFilter(filterResult);
                    }
                }
            }, 100);
        }
    },

    syncLoginState() {
        const app = getApp<IAppOption>();
        const user = app.globalData.user;
        const bootStatus = app.globalData.bootStatus;

        const isLoggedIn = !!(checkIsAuthed(user) && bootStatus === 'success');
        
        console.log('[CommunityView] syncLoginState:', {
            hasUser: !!user,
            hasPhone: !!user?.phoneNumber,
            bootStatus,
            isLoggedIn
        });

        this.setData({
            isLoggedIn
        });
    },

    onLoginSuccess() {
        this.syncLoginState();
    },

    syncLanguageFromApp() {
        const uiData = {
            tabPublic: t('jobs.tabPublic'),
            tabFeatured: t('jobs.tabFeatured'),
            tabSaved: t('jobs.tabSaved'),
            editLabel: t('jobs.editLabel'),
            doneLabel: t('jobs.doneLabel'),
            clearAllLabel: t('jobs.clearAllLabel'),
            noSavedSearchConditions: t('jobs.noSavedSearchConditions'),
            restoreSearchLabel: t('jobs.restoreSearchLabel'),
        }

        this.setData({
            ui: uiData,
        })
    },

    checkFeaturedSubscription() {
        const app = getApp<IAppOption>() as any
        const user = app?.globalData?.user
        
        const isUnlocked = isAiChineseUnlocked(user)
        this.setData({ isFeaturedUnlocked: isUnlocked, featuredScrollEnabled: isUnlocked })
    },

    onTabTap(e: any) {
        const idx = Number(e.currentTarget.dataset.idx || 0)
        if (idx === this.data.currentTab) return
        
        this.setData({ currentTab: idx })
        
        if (idx === 1) {
            this.checkFeaturedSubscription()
        }
    },

    onSwiperChange(e: any) {
        const idx = e.detail.current || 0
        if (idx === this.data.currentTab) return
        
        this.setData({ currentTab: idx })
        
        if (idx === 1) {
            this.checkFeaturedSubscription()
        }
    },

    onJobTap(e: any) {
        // job-tab 传递的事件格式: { job, _id }
        const job = e?.detail?.job
        const _id = e?.detail?._id || job?._id

        if (!_id || !job) {
            console.warn('onJobTap: missing job or _id', { job, _id, detail: e?.detail })
            return
        }

        // 存储到全局状态并跳转
        const app = getApp<IAppOption>() as any
        if (app?.globalData?._pageData) {
            // 如果从收藏tab打开，确保isSaved为true，避免UI闪烁
            let jobData = { ...job }
            if (this.data.currentTab === 2) {
                jobData.isSaved = true
            }
            app.globalData._pageData.jobData = jobData
        }
        
        wx.navigateTo({
            url: '/pages/job-detail/index',
            events: {
                // 监听详情页发出的刷新通知
                refreshsaved: () => {
                    this.onRefreshSaved()
                }
            }
        })
    },

    onRefreshSaved() {
        // 通知收藏tab刷新数据
        const savedTabComponent = this.selectComponent('#jobTab2') as any
        if (savedTabComponent && typeof savedTabComponent.loadData === 'function') {
            // 如果收藏tab已激活，刷新数据
            if (this.data.currentTab === 2) {
                savedTabComponent.loadData(true)
            } else {
                // 如果收藏tab未激活，标记为未加载，下次激活时会自动加载
                savedTabComponent.setData({ hasLoaded: false })
            }
        }
    },

    onRestoreSearch(e: any) {
        // 检查认证状态
        const app = getApp<IAppOption>() as any
        const user = app?.globalData?.user
        const isVerified = checkIsAuthed(user)
        if (!isVerified) {
            ui.showToast(t('jobs.pleaseLogin'))
            return
        }

        // 获取当前tab类型
        const tabType = e?.detail?.tabType ?? this.data.currentTab
        this.loadSavedSearchConditions(tabType)
    },

    async loadSavedSearchConditions(tabType: number) {
        const app = getApp<IAppOption>() as any
        const user = app?.globalData?.user
        const openid = user?.openid
        if (!openid) return

        try {
            const res = await callApi<any>('getSavedSearchConditions', {
                tabIndex: tabType,
                openid
            })

            const savedConditions = (res.result?.items || []) as any[]
            
            // 如果没有保存的搜索条件，只显示toast，不弹窗
            if (savedConditions.length === 0) {
                ui.showToast(t('jobs.trySaveSearchHint'))
                return
            }
            
            // 格式化数据用于显示
            // 翻译 tab 名称
            const tabNames = [
                t('jobs.tabPublic'),
                t('jobs.tabFeatured'),
                t('jobs.tabSaved'),
            ]
            
            const formattedConditions = savedConditions.map((condition) => {
                const keyword = condition.searchKeyword || ''
                const filter = condition.drawerFilter || {}
                
                // 构建描述文本
                const keywordLabel = t('jobs.filterKeywordLabel')
                const regionLabel = t('jobs.filterRegionLabel')
                const sourceLabel = t('jobs.filterSourceLabel')
                const salaryLabel = t('jobs.filterSalaryLabel')
                const noFilterText = t('jobs.noFilterConditions')
                
                const parts: string[] = []
                if (keyword) {
                    parts.push(`${keywordLabel}: ${keyword}`)
                }
                if (filter.region && filter.region !== '全部' && tabType !== 0) {
                    const regionText = useEnglish 
                        ? (filter.region === '国内' ? 'Domestic' : filter.region === '国外' ? 'Abroad' : filter.region === 'web3' ? 'Web3' : filter.region)
                        : filter.region
                    parts.push(`${regionLabel}: ${regionText}`)
                }
                // ... (filtering logic)
                if (filter.source_name && Array.isArray(filter.source_name) && filter.source_name.length > 0 && tabType !== 0) {
                    const validSources = filter.source_name.filter((s: string) => ['BOSS直聘', '智联招聘'].includes(s))
                    if (validSources.length > 0) {
                        const sourceTexts = validSources.map((s: string) => (useEnglish ? (EN_SOURCE[s] || s) : s))
                        parts.push(`${sourceLabel}: ${sourceTexts.join(',')}`)
                    }
                }
                if (filter.salary && filter.salary !== '全部') {
                    const EN_SALARY: Record<string, string> = {
                        '全部': 'All',
                        '10k以下': '< 10K',
                        '10-20K': '10–20K',
                        '20-50K': '20–50K',
                        '50K以上': '50K+',
                        '项目制/兼职': 'Project/Part-time',
                    }
                    const salaryText = useEnglish ? (EN_SALARY[filter.salary] || filter.salary) : filter.salary
                    parts.push(`${salaryLabel}: ${salaryText}`)
                }
                
                const desc = parts.length > 0 ? parts.join(' | ') : noFilterText
                return {
                    ...condition,
                    title: tabName,
                    desc,
                }
            })

            // 显示底部弹窗
            this.setData({
                savedSearchConditions: formattedConditions,
                showRestoreSheet: true,
                isRestoreEditing: false,
            })
        } catch (err) {
            ui.showToast(t('jobs.loadFailed'))
        }
    },

    closeRestoreSheet() {
        this.setData({ 
            showRestoreSheet: false, 
            savedSearchConditions: [],
            isRestoreEditing: false,
        })
    },

    onRestoreConfirm(e: any) {
        const { complete } = e.detail;
        complete();
    },

    goToMe() {
        this.triggerEvent('tabChange', { index: 2 });
    },

    toggleRestoreEdit() {
        this.setData({ isRestoreEditing: !this.data.isRestoreEditing })
    },

    async onDeleteRestoreCondition(e: any) {
        const index = e.currentTarget.dataset.index
        const condition = this.data.savedSearchConditions[index]
        if (!condition || !condition._id) return

        const isLastItem = this.data.savedSearchConditions.length === 1

        const updatedConditions = [...this.data.savedSearchConditions]
        updatedConditions[index] = { ...updatedConditions[index], deleting: true }
        this.setData({ savedSearchConditions: updatedConditions })

        try {
            await callApi('deleteSearchCondition', { id: condition._id })

            setTimeout(() => {
                if (isLastItem) {
                    this.closeRestoreSheet()
                } else {
                    const collapsingConditions = [...this.data.savedSearchConditions]
                    collapsingConditions[index] = { ...collapsingConditions[index], collapsing: true }
                    this.setData({ savedSearchConditions: collapsingConditions })

                    setTimeout(() => {
                        const finalConditions = this.data.savedSearchConditions.filter((_, idx) => idx !== index)
                        this.setData({ savedSearchConditions: finalConditions })
                    }, 200)
                }
            }, 200)
        } catch (err) {
            const restoredConditions = [...this.data.savedSearchConditions]
            restoredConditions[index] = { ...restoredConditions[index], deleting: false, collapsing: false }
            this.setData({ savedSearchConditions: restoredConditions })
            ui.showToast(t('jobs.deleteFailed'))
        }
    },

    async onClearAllRestoreConditions() {
        const app = getApp<IAppOption>() as any
        const user = app?.globalData?.user
        const openid = user?.openid
        if (!openid) return

        const lang = normalizeLanguage(app?.globalData?.language)

      ui.showModal({
            confirmText: t('drawer.confirm', lang),
            cancelText: t('resume.cancel', lang),
            success: async (res) => {
                if (res.confirm) {
                    try {
                        await callApi('clearAllSearchConditions', { openid })

                        this.setData({ savedSearchConditions: [] })
                        this.closeRestoreSheet()
                        ui.showToast(t('jobs.cleared', lang))
                    } catch (err) {
                        ui.showToast(t('jobs.clearFailed', lang))
                    }
                }
            },
        })
    },

    async onSelectRestoreCondition(e: any) {
        const index = e.currentTarget.dataset.index
        const selectedCondition = this.data.savedSearchConditions[index]
        if (!selectedCondition) return

        this.closeRestoreSheet()

        const tabIndex = selectedCondition.tabIndex ?? this.data.currentTab
        if (tabIndex !== this.data.currentTab) {
            this.setData({ currentTab: tabIndex })
        }

        setTimeout(() => {
            const tabComponent = this.selectComponent(`#jobTab${tabIndex}`) as any
            if (tabComponent && typeof tabComponent.applySearchCondition === 'function') {
                tabComponent.applySearchCondition({
                    searchKeyword: selectedCondition.searchKeyword || '',
                    drawerFilter: selectedCondition.drawerFilter || {},
                })
            }
        }, 100)
    },

    onFeaturedSubscribeTap() {
        const app = getApp<IAppOption>() as any
        const lang = normalizeLanguage(app?.globalData?.language)

        ui.showModal({
            title: t('jobs.unlockFeaturedTitle', lang),
            content: t('jobs.unlockFeaturedContent', lang),
            confirmText: t('jobs.goSubscribe', lang),
            cancelText: t('jobs.thinkAgain', lang),
            success: (res) => {
                if (res.confirm) {
                    // Navigate to Main Page Tab 2 (Me)
                    // Since we are in SPA, we can just switch tab via global or event
                     const app = getApp<any>()
                     if (app && app.globalData) {
                         app.globalData.tabSelected = 2 // target "me" tab index
                         // We might need to handle this navigation more gracefully in SPA
                         // For now rely on main page noticing the global change if checking in onShow
                         // OR dispatch an event if possible. But standard switchTab won't work perfectly inside SPA if target is same page.
                         // However, app.json hasn't defined standard pages for tabs anymore.
                         
                         // Hack: reLaunch to main with tab param
                         wx.reLaunch({ url: '/pages/main/index?tab=2' })
                     }
                }
            },
        })
    },

    onOpenFilterDrawer(e: any) {
        const tabIndex = e?.detail?.tabIndex ?? this.data.currentTab
        const currentFilter = e?.detail?.filter || { salary: '全部', experience: '全部', source_name: [], region: '全部' }
        
        const app = getApp<IAppOption>() as any
        if (app?.globalData?._pageData) {
            app.globalData._pageData.filterValue = currentFilter
            app.globalData._pageData.filterTabIndex = tabIndex
        }
        
        wx.navigateTo({
            url: '/pages/filter/index',
        })
    },
  }
})
