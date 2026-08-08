import { normalizeLanguage, t } from '../../utils/i18n/index'
import { ui } from '../../utils/ui'
import { callApi, formatFileUrl } from '../../utils/request'
import { StatusCode } from '../../utils/statusCodes'

Page({
  data: {
    resumes: [] as any[],
    loading: true,
    loadingMore: false,
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    ui: {} as any,
    isEditMode: false,
    isPolling: false,
  },

  watcher: null as any,

  onLoad() {
    this.syncLanguage()
    this.fetchResumes({ reset: true })
    this.startPolling()
  },

  onShow() {
    // 每次显示页面时，如果不在轮询中，刷新一次列表
    if (!this.data.isPolling) {
       this.fetchResumes({ reset: true })
       this.startPolling()
    }
  },

  onUnload() {
    this.stopPolling()
  },

  onToggleEdit() {
    this.setData({
      isEditMode: !this.data.isEditMode
    } as any)
  },

  async onRetryResume(e: any) {
    const { item } = e.currentTarget.dataset
    if (!item || !item._id) return

    // NO Loading as per user request for minimal UI interference
    try {
        const res = await callApi('retryGenerateResume', {
            resumeId: item._id
        })
        
        if (res.success) {
          ui.showSuccess(t('resume.retrying'))
            
            // Start polling first to ensure we don't miss the window
            this.startPolling()
            
            // Then refresh to show "Processing" status immediately
            // Await it so we are sure the list reflects the new state
            await this.fetchResumes(true)
        } else {
          ui.showModal({
            title: t('resume.deleteFailedShort'),
            content: res.message || t('resume.errorShort'),
            showCancel: false
          })
        }
    } catch (err: any) {
        console.error('Retry failed', err)
        
        const isQuotaError = (err?.statusCode === StatusCode.HTTP_FORBIDDEN) || (err?.data?.error === 'Quota exhausted') || (err?.message && err.message.includes('Quota'));
        const app = getApp<IAppOption>();

        if (isQuotaError) {
          ui.showModal({
            title: t('jobs.quotaExhaustedTitle'),
            content: err?.data?.message || t('jobs.quotaExhaustedContent'),
            confirmText: t('jobs.quotaExhaustedConfirm'),
            cancelText: t('jobs.quotaExhaustedCancel'),
            success: (res) => {
              if (res.confirm) {
                app.globalData.tabSelected = 2;
                app.globalData.openMemberHubOnShow = true;
                wx.reLaunch({
                  url: '/pages/main/index'
                })
              }
            }
          })
            return;
        }
        
        ui.showError(t('resume.errorShort'))
    }
  },

  onDeleteResume(e: any) {
    const { item } = e.currentTarget.dataset
    if (!item || !item._id) return

    ui.showModal({
      title: this.data.ui.delete || t('resume.deleteResumeConfirm'),
      // 删除确认文案
      content: t('resume.deleteResumeConfirm'),
      confirmColor: '#ef4444',
      success: async (res) => {
        if (res.confirm) {
              ui.showLoading(t('resume.deleting'))
            try {
                const res = await callApi('deleteGeneratedResume', {
                    resumeId: item._id
                })
                
                ui.hideLoading()
                
                if (res.success) {
                    ui.showSuccess(t('resume.deleteSuccess'))
                    // Remove from local list
                    const updatedResumes = this.data.resumes.filter((r: any) => r._id !== item._id)
                    this.setData({
                      resumes: updatedResumes,
                      total: Math.max(0, (this.data.total || 0) - 1)
                    } as any);
                    
                    // If list becomes empty, exit edit mode
                    if (updatedResumes.length === 0) {
                        this.setData({ isEditMode: false } as any)
                    }
                } else {
                    ui.showError(t('resume.deleteFailedShort'))
                }
            } catch (err) {
                ui.hideLoading()
                console.error('Delete failed', err)
                ui.showError(t('resume.errorShort'))
            }
        }
      }
    })
  },

  onHide() {
    this.stopPolling()
  },

  // 简单的轮询机制
  pollingTimer: null as any,
  startPolling() {
      if (this.data.isPolling) return
      
      this.setData({ isPolling: true } as any)
      
      this.pollingTimer = setInterval(() => {
        // 用户已加载到第 2 页及以上时，避免轮询重置列表位置
        if ((this.data.page || 1) > 2) return
        this.fetchResumes({ silent: true, reset: true })
      }, 3000)
  },

  stopPolling() {
      if (this.pollingTimer) {
          clearInterval(this.pollingTimer)
          this.pollingTimer = null
      }
      this.setData({ isPolling: false } as any)
  },

  async fetchResumes(options: { silent?: boolean; reset?: boolean; append?: boolean } = {}) {
    const { silent = false, reset = false, append = false } = options

    if (append) {
      if (this.data.loadingMore || this.data.loading || !this.data.hasMore) return
      this.setData({ loadingMore: true })
    } else if (!silent) {
      this.setData({ loading: true })
    }

    const pageSize = this.data.pageSize || 20
    const targetPage = reset ? 1 : this.data.page
    const skip = (targetPage - 1) * pageSize
    
    try {
      const res = await callApi<any>('getGeneratedResumes', {
        limit: pageSize,
        skip
      })

      const list = res.result?.items || []
      const formattedList = this.processResumes(list)
      const nextResumes = append
        ? [...this.data.resumes, ...formattedList]
        : formattedList
      const total = Number(res.result?.total || 0)
      const hasMore = nextResumes.length < total

      this.setData({
        resumes: nextResumes,
        total,
        hasMore,
        page: hasMore ? targetPage + 1 : targetPage,
        loading: false,
        loadingMore: false,
      })
      
      // 检查是否还有 processing 状态的任务
      const hasProcessing = nextResumes.some((item: any) => item.status === 'processing')
      if (!hasProcessing) {
          this.stopPolling()
      } else {
          // 确保轮询开启
          if (!this.pollingTimer) this.startPolling()
      }

    } catch (err) {
      console.error('获取简历列表失败:', err)
      if (!silent) ui.showToast(t('resume.loadingFailed'))
      this.setData({ loading: false, loadingMore: false })
    }
  },

  syncLanguage() {
    const app = getApp<IAppOption>() as any
    const lang = normalizeLanguage(app?.globalData?.language)
    this.setData({
      currentLang: lang,
      ui: {
        assetCount: t('resume.assetCount'),
        syncingAssets: t('resume.syncingAssets'),
        statusFailed: t('resume.statusFailed'),
        edit: t('resume.edit'),
        done: t('resume.done'),
        delete: t('resume.delete'),
        retry: t('resume.retry'),
        generalResume: t('resume.generalResume'),
        view: t('resume.view'),
        loadFailed: t('jobs.loadFailed'),
        loading: t('jobs.loading'),
        allDataLoaded: t('jobs.allDataLoaded'),
        totalPrefix: t('resume.totalPrefix'),
        emptyTitle: t('resume.emptyTitle'),
        emptySubtitle: t('resume.emptySubtitle'),
        goJobs: t('resume.goJobs'),
      }
    })
  },

  onPullDownRefresh() {
    this.fetchResumes({ reset: true })
      .finally(() => {
        wx.stopPullDownRefresh()
      })
  },

  onReachBottom() {
    this.fetchResumes({ append: true, silent: true })
  },



  processResumes(data: any[]) {
    const formattedResumes = data.map((item: any) => {
      const date = item.createTime ? new Date(item.createTime) : new Date()
      return {
        ...item,
        formattedDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
    })

    return formattedResumes
  },

  async onPreviewResume(e: any) {
    const item = e.currentTarget.dataset.item
    
    // 如果还在生成中，不处理预览
    if (item.status === 'processing') {
      ui.showToast(t('resume.aiProcessing'))
      return
    }

    if (item.status === 'failed') {
      ui.showModal({
        title: t('resume.generateFailed'),
        content: item.errorMessage || t('resume.tryAgain'),
        showCancel: false
      })
      return
    }

    if (!item.fileUrl && !item.fileId) return

    ui.showLoading(t('resume.fetchingFile'))

    try {
      let tempFilePath = '';
      
      // 优先使用 fileUrl
      if (item.fileUrl) {
         const url = formatFileUrl(item.fileUrl);
         console.log('Downloading resume from:', url);
         const downloadRes = await new Promise<any>((resolve, reject) => {
             wx.downloadFile({
                 url,
                 success: resolve,
                 fail: reject
             })
         });
         if (downloadRes.statusCode === 200) {
             tempFilePath = downloadRes.tempFilePath;
         } else if (downloadRes.statusCode === 404) {
              // 物理文件由于 24 小时过期已被系统回收，触发免 AI 重新渲染恢复
              ui.hideLoading();
              ui.showLoading(t('resume.recoveringExpiredFile'))
              
              try {
                 const restoreRes = await callApi('restoreResume', {
                     resumeId: item._id
                 });
                 
                 if (restoreRes.success) {
                     // 启动轮询，这样列表会自动更新显示 "Processing"
                     this.startPolling();
                     // 提示用户稍等
                     setTimeout(() => {
                         ui.hideLoading();
                         ui.showToast(t('resume.cloudRerenderingToast'))
                     }, 500);
                 } else {
                     throw new Error(restoreRes.message || 'Restoration failed');
                 }
                 return; // 退出，等待轮询
              } catch (restoreErr: any) {
                  console.error('Restore failed:', restoreErr);
                  ui.showError(restoreErr.message || t('resume.oldFileUnavailable'));
                  return;
              }
         } else {
             throw new Error('Download failed status ' + downloadRes.statusCode);
         }
      } else if (item.fileId) {
        ui.showError(t('resume.oldFileUnavailable'));
        ui.hideLoading();
        return;
      }

      if (!tempFilePath) throw new Error('No file path obtained');

      // 2. 预览
      wx.openDocument({
        filePath: tempFilePath,
        showMenu: true,
        success: () => {
          ui.hideLoading()
        },
        fail: (err) => {
          console.error(err)
          ui.hideLoading()
          ui.showError(t('resume.cannotOpenDocument'))
        }
      })
    } catch (err) {
      console.error(err)
      ui.hideLoading()
      ui.showError(t('resume.downloadFailed'))
    }
  },

  goJobsList() {
    getApp<IAppOption>().globalData.tabSelected = 0;
    wx.reLaunch({
      url: '/pages/main/index'
    })
  }
})

