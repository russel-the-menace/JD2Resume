// miniprogram/components/job-list/index.ts
import { normalizeLanguage, t } from '../../utils/i18n/index'

Component({
  properties: {
    jobs: {
      type: Array,
      value: [],
    },
    loading: {
      type: Boolean,
      value: false,
    },
    hasMore: {
      type: Boolean,
      value: true,
    },

    // scroll-view passthrough props
    scrollY: {
      type: Boolean,
      value: true,
    },
    scrollTop: {
      type: Number,
      value: 0,
    },
    lowerThreshold: {
      type: Number,
      value: 100,
    },
    scrollWithAnimation: {
      type: Boolean,
      value: true,
    },
    enableBackToTop: {
      type: Boolean,
      value: false,
    },
    enablePassive: {
      type: Boolean,
      value: true,
    },
    className: {
      type: String,
      value: '',
    },

    // Optional: handle opening a job-detail drawer automatically
    enableDetail: {
      type: Boolean,
      value: false,
    },
    detailSelector: {
      type: String,
      value: '',
    },
    // If your pages sometimes need to override which collection to read from,
    // pass a function-like hint is not possible, so we accept a fallback collection name.
    detailCollectionFallback: {
      type: String,
      value: '',
    },

    bottomSpace: {
      type: Number,
      value: 0,
    },
  },

  data: {
    showNoMore: false,
    noMoreVisible: false,
    _prevLoading: true,
    _prevHasMore: true,
    isAIEnglish: false,
    isNormalEnglish: false,
    isAIChinese: false,
    isStandardChinese: false,
    ui: {} as any,
  },

  lifetimes: {
    attached() {
      const app = getApp<IAppOption>() as any
      const updateLanguage = () => {
        const lang = normalizeLanguage(app?.globalData?.language)
        this.setData({ 
          isAIEnglish: lang === 'AIEnglish',
          isNormalEnglish: lang === 'English',
          isAIChinese: lang === 'AIChinese',
          isStandardChinese: lang === 'Chinese',
          ui: {
            loading: t('jobs.loading', lang),
            allDataLoaded: t('jobs.allDataLoaded', lang),
            unknownCompany: t('jobs.unknownCompany', lang),
          }
        })
      }
      
      ;(this as any)._langListener = updateLanguage
      if (app?.onLanguageChange) app.onLanguageChange(updateLanguage)
      
      // 初始化
      updateLanguage()
    },

    detached() {
      const app = getApp<IAppOption>() as any
      const listener = (this as any)._langListener
      if (listener && app?.offLanguageChange) app.offLanguageChange(listener)
      ;(this as any)._langListener = null
      
      // Clean up timers when component is detached
      this._clearNoMoreTimers()
    },
  },

  observers: {
    'loading,hasMore': function(loading: boolean, hasMore: boolean) {
      // Reset flag and hide immediately when a new loading starts
      if (loading) {
        (this as any)._hasShownNoMore = false
        this._hideNoMoreTip()
      }

      // NO AUTOMATIC SHOW on observer. 
      // We only ever trigger the animation from onScrollLower 
      // or when user actually tries to scroll.

      this.setData({ _prevLoading: loading, _prevHasMore: hasMore })
    },
  },

  methods: {
    _clearNoMoreTimers() {
      const self = this as any
      if (self._noMoreTimer) clearTimeout(self._noMoreTimer)
      if (self._noMoreFadeOutTimer) clearTimeout(self._noMoreFadeOutTimer)
      if (self._noMoreRemoveTimer) clearTimeout(self._noMoreRemoveTimer)
      self._noMoreTimer = null
      self._noMoreFadeOutTimer = null
      self._noMoreRemoveTimer = null
    },

    _showNoMoreTip() {
      // Only show ONCE per loading cycle
      if ((this as any)._hasShownNoMore || this.data.showNoMore) return 
      
      (this as any)._hasShownNoMore = true
      this._clearNoMoreTimers()
      const self = this as any
      
      this.setData({ showNoMore: true }, () => {
        self._noMoreTimer = setTimeout(() => {
          this.setData({ noMoreVisible: true })
        }, 50)
        
        self._noMoreFadeOutTimer = setTimeout(() => {
          this.setData({ noMoreVisible: false }, () => {
            self._noMoreRemoveTimer = setTimeout(() => {
              this.setData({ showNoMore: false })
            }, 300)
          })
        }, 2000)
      })
    },

    _hideNoMoreTip() {
       this._clearNoMoreTimers()
       if (this.data.noMoreVisible || this.data.showNoMore) {
         this.setData({ noMoreVisible: false, showNoMore: false })
       }
    },

    onItemTap(e: WechatMiniprogram.TouchEvent) {
      const job = e.currentTarget.dataset.job
      const id = e.currentTarget.dataset._id

      if (this.data.enableDetail && this.data.detailSelector) {
        const detail = this.selectComponent(this.data.detailSelector as any) as any
        const collection = (job && (job.sourceCollection || job.collection)) || this.data.detailCollectionFallback
        if (detail && typeof detail.open === 'function' && id && collection) {
          detail.open(id, collection)
        }
      }

      this.triggerEvent('itemtap', { job, _id: id })
    },

    onScrollLower(e: any) {
      this.triggerEvent('scrolltolower', e.detail)
      
      // When user slides to the absolute bottom, show the tip if no more data exists
      const { loading, hasMore, jobs } = this.data
      if (!loading && !hasMore && jobs && jobs.length > 0) {
        this._showNoMoreTip()
      }
    },

    onScroll(e: any) {
      this.triggerEvent('scroll', e.detail)
    },

    onTouchStart() {
      this.triggerEvent('touchstart')
    },

    onTouchEnd() {
      this.triggerEvent('touchend')
    },
  },
})
