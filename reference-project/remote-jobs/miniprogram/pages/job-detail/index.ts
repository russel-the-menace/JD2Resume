// miniprogram/pages/job-detail/index.ts
import { normalizeLanguage, t } from '../../utils/i18n/index'
import { normalizeJobTags, translateFieldValue } from '../../utils/job'
import { attachLanguageAware } from '../../utils/languageAware'
import { attachThemeAware } from '../../utils/themeAware'
import { requestGenerateResume } from '../../utils/resume'
import { callApi } from '../../utils/request'
import { ui } from '../../utils/ui'
import { checkIsAuthed } from '../../utils/util'
require('../../env.js')

const SAVE_DEBOUNCE_DELAY = 300

function formatDescription(description?: string): string {
  if (!description) return ''
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  return description
    .split(/\n+/)
    .map((line) => {
      const content = escapeHtml(line.trim())
      return `<p>${content || '&nbsp;'}</p>`
    })
    .join('')
}

type JobDetailItem = {
  _id: string
  createdAt: string
  source_url: string
  salary: string
  source_name: string
  summary: string
  description?: string
  team: string
  title: string
  type: string
  tags: string[]
  displayTags?: string[]
}

Page({
  data: {
    job: null as (JobDetailItem & { richDescription: string }) | null,
    loading: false,
    saved: false,
    saveBusy: false,
    saveDocId: '',
    isAIEnglish: false,
    isNormalEnglish: false,
    isAIChinese: false,
    isStandardChinese: false,
    loadingText: t('jobs.loading'),
    loadFailedText: t('jobs.loadFailed'),
    saveText: t('jobs.alreadySaved'),
    unsaveText: t('jobs.saveAction'),
    oneClickApplyText: t('jobs.applyAction'),
    applyMenuTitle: t('jobs.applyMenuTitle'),
    copySourceLinkText: t('jobs.copySourceLink'),
    aiResumeGenerateText: t('jobs.aiResumeGenerate'),
    oneClickSubmitResumeText: t('jobs.oneClickSubmitResume'),
    noSourceLinkText: t('jobs.noSourceLink'),
    linkCopiedText: t('jobs.linkCopied'),
    featureDevelopingText: t('jobs.featureDeveloping'),
    dataLoadFailedText: t('jobs.dataLoadFailed'),
    pleaseLoginText: t('jobs.pleaseLogin'),
    saveSuccessText: t('jobs.saveSuccess'),
    unsaveSuccessText: t('jobs.unsaveSuccess'),
    operationFailedText: t('jobs.operationFailed'),
    showApplyMenu: false,
    applyMenuOpen: false,
    isGenerating: false,
  },

  onLoad() {
    // 先更新语言，确保所有文本都已初始化
    this.updateLanguage()
    
    // 从全局状态获取数据
    const app = getApp<IAppOption>() as any
    const jobData = app?.globalData?._pageData?.jobData

    if (jobData && jobData._id) {
      this.setJobFromData(jobData)
      // 清除临时数据
      if (app?.globalData?._pageData) {
        app.globalData._pageData.jobData = null
      }
    } else {
      this.setData({ loading: false })
      ui.showToast(this.data.dataLoadFailedText)
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }

    // attach language-aware behavior
    ;(this as any)._langDetach = attachLanguageAware(this, {
      onLanguageRevive: () => {
        wx.setNavigationBarTitle({ title: '' })
        this.updateLanguage()
        // 如果已有数据，根据语言重新处理显示
        if (this.data.job) {
          const app = getApp<IAppOption>() as any
          const lang = normalizeLanguage(app?.globalData?.language)
          const job = this.data.job
          
          // 根据当前语言环境，优先选择对应的翻译内容
          let currentDesc = job.description || ''
          if (lang === 'AIChinese' && (job as any).description_chinese) {
            currentDesc = (job as any).description_chinese
          } else if (lang === 'AIEnglish' && (job as any).description_english) {
            currentDesc = (job as any).description_english
          }

          const experience = (job as any).experience && typeof (job as any).experience === 'string' ? (job as any).experience.trim() : ''
          const { displayTags } = normalizeJobTags(job, lang, experience)
          
          const isEng = lang === 'AIEnglish' || lang === 'English'
          const rawSalary = (isEng && job.salary_english) ? job.salary_english : (job.salary || '')
          const salaryStr = typeof rawSalary === 'string' ? rawSalary.trim() : ''
          const translatedSalary = translateFieldValue(salaryStr, 'salary', lang)
          
          const rawSourceName = (isEng && job.source_name_english) ? job.source_name_english : (job.source_name || '')
          const sourceNameStr = typeof rawSourceName === 'string' ? rawSourceName.trim() : ''

          this.setData({
            job: {
              ...job,
              richDescription: formatDescription(currentDesc),
              salary: translatedSalary || salaryStr,
              source_name: sourceNameStr,
              displayTags,
            } as any,
          })
        }
      },
    })

    this.updateLanguage()

    ;(this as any)._themeDetach = attachThemeAware(this)
  },

  onUnload() {
    const fn = (this as any)._langDetach
    if (typeof fn === 'function') fn()
    ;(this as any)._langDetach = null

    const themeFn = (this as any)._themeDetach
    if (typeof themeFn === 'function') themeFn()
    ;(this as any)._themeDetach = null
  },

  onShow() {
    wx.setNavigationBarTitle({ title: '' })
  },

  updateLanguage() {
    const app = getApp<IAppOption>() as any
    const lang = normalizeLanguage(app?.globalData?.language)
    this.setData({
      isAIEnglish: lang === 'AIEnglish',
      isNormalEnglish: lang === 'English',
      isAIChinese: lang === 'AIChinese',
      isStandardChinese: lang === 'Chinese',
      loadingText: t('jobs.loading'),
      loadFailedText: t('jobs.loadFailed'),
      saveText: t('jobs.alreadySaved'),
      unsaveText: t('jobs.saveAction'),
      oneClickApplyText: t('jobs.applyAction'),
      applyMenuTitle: t('jobs.applyMenuTitle'),
      copySourceLinkText: t('jobs.copySourceLink'),
      aiResumeGenerateText: t('jobs.aiResumeGenerate'),
      oneClickSubmitResumeText: t('jobs.oneClickSubmitResume'),
      noSourceLinkText: t('jobs.noSourceLink'),
      linkCopiedText: t('jobs.linkCopied'),
      featureDevelopingText: t('jobs.featureDeveloping'),
      dataLoadFailedText: t('jobs.dataLoadFailed'),
      pleaseLoginText: t('jobs.pleaseLogin'),
      saveSuccessText: t('jobs.saveSuccess'),
      unsaveSuccessText: t('jobs.unsaveSuccess'),
      operationFailedText: t('jobs.operationFailed'),
      ui: {
        unknownCompany: t('jobs.unknownCompany'),
        cancel: t('resume.cancel'),
      }
    })
  },

  async setJobFromData(jobData: any) {
    const _id = jobData._id
    if (!_id) return

    let displayTags = jobData.displayTags
    if (!displayTags || !Array.isArray(displayTags) || displayTags.length === 0) {
      const app = getApp<IAppOption>() as any
      const lang = normalizeLanguage(app?.globalData?.language)
      const experience = jobData.experience && typeof jobData.experience === 'string' ? jobData.experience.trim() : ''
      
      const { displayTags: generatedDisplayTags } = normalizeJobTags(jobData, lang, experience)
      displayTags = generatedDisplayTags
    }

    const isSaved = jobData.isSaved !== undefined ? jobData.isSaved : null
    
    const app = getApp<IAppOption>() as any
    const lang = normalizeLanguage(app?.globalData?.language)
    
    const isEng = lang === 'AIEnglish' || lang === 'English'
    const rawSalary = (isEng && jobData.salary_english) ? jobData.salary_english : (jobData.salary || '')
    const salaryStr = typeof rawSalary === 'string' ? rawSalary.trim() : ''
    const translatedSalary = translateFieldValue(salaryStr, 'salary', lang)
    
    // 来源处理
    const rawSourceName = (isEng && jobData.source_name_english) ? jobData.source_name_english : (jobData.source_name || '')
    const sourceNameStr = typeof rawSourceName === 'string' ? rawSourceName.trim() : ''
    
    this.setData({
      job: {
        ...jobData,
        salary: translatedSalary || salaryStr,
        source_name: sourceNameStr,
        displayTags,
        richDescription: formatDescription(jobData.description),
      } as JobDetailItem & { richDescription: string },
      loading: false,
      saved: isSaved !== null ? isSaved : false,
    })

    if (isSaved === null) {
      try {
        const isSavedState = await this.checkSavedState(_id, true)
        this.setData({ saved: isSavedState })
      } catch (err) {
        this.setData({ saved: false })
      }
    }
  },

  async toggleSave() {
    const job = this.data.job
    if (!job || this.data.saveBusy) return

    const app = getApp<IAppOption>() as any
    const user = app?.globalData?.user
    const isVerified = checkIsAuthed(user)
    if (!isVerified) {
      ui.showToast(this.data.pleaseLoginText)
      return
    }

    this.setData({ saveBusy: true })
    const targetSaved = !this.data.saved

    try {
      if (targetSaved) {
        await this.addSavedRecord(job)
      } else {
        await this.removeSavedRecord(job._id)
      }

      this.setData({ saved: targetSaved })
      
      // 通知来源页面（如收藏列表）状态已改变，触发刷新
      const eventChannel = (this as any).getOpenerEventChannel()
      if (eventChannel && typeof eventChannel.emit === 'function') {
        eventChannel.emit('refreshsaved')
      }
      
      ui.showSuccess(targetSaved ? (this.data.saveSuccessText || 'Saved') : (this.data.unsaveSuccessText || 'Unsaved'))
    } catch (err) {
      ui.showError(this.data.operationFailedText || 'Error')
    } finally {
      setTimeout(() => {
        this.setData({ saveBusy: false })
      }, SAVE_DEBOUNCE_DELAY)
    }
  },

  onOneClickApply() {
    // 如果弹窗已打开，则关闭
    if (this.data.showApplyMenu && this.data.applyMenuOpen) {
      this.closeApplyMenu()
      return
    }
    // 否则打开弹窗
    this.setData({ showApplyMenu: true })
  },

  closeApplyMenu() {
    this.setData({ showApplyMenu: false })
  },


  onViewSource() {
    const job = this.data.job
    if (!job?.source_url) {
      ui.showToast(this.data.noSourceLinkText || 'No Link')
      return
    }
    this.closeApplyMenu()
    // 复制链接或打开链接
    wx.setClipboardData({
      data: job.source_url,
      success: () => {
        ui.showSuccess(this.data.linkCopiedText || 'Copied')
      },
    })
  },

  async onGenerateResume() {
    this.closeApplyMenu()
    
    const jobId = this.data.job?._id
    
    try {
      ui.showLoading(t('jobs.checkingStatus'))
      
      // 1. 检查是否已经为该岗位生成过简历（包括正在生成中的）
      const checkRes = await callApi<any>('getGeneratedResumes', {
        jobId,
        limit: 1
      })
      const existingList = checkRes.result?.items || []

      ui.hideLoading()

      if (existingList.length > 0) {
        ui.showModal({
          title: t('jobs.generatedResumeExistsTitle'),
          content: t('jobs.generatedResumeExistsContent'),
          confirmText: t('jobs.generatedResumeExistsConfirm'),
          cancelText: t('jobs.generatedResumeExistsCancel'),
          emphasis: 'left',
          success: (res) => {
            if (res.confirm) {
              this.doGenerateResumeAction()
            } else if (res.cancel) {
              wx.navigateTo({
                url: '/pages/generated-resumes/index'
              })
            }
          }
        })
        return
      }

      // 2. 如果没有生成过，直接进入生成流程
      await this.doGenerateResumeAction()
      
    } catch (err) {
      ui.hideLoading()
      console.error('检查记录失败:', err)
      // 如果检查失败，为了不阻塞用户，直接尝试生成
      this.doGenerateResumeAction()
    }
  },

  async doGenerateResumeAction() {
    if (this.data.isGenerating) return
    
    await requestGenerateResume(this.data.job, {
      onStart: () => {
        this.setData({ isGenerating: true })
      },
      onFinish: () => {
        this.setData({ isGenerating: false })
      },
      onCancel: () => {
        this.setData({ isGenerating: false })
      }
    })
  },

  async addSavedRecord(job: JobDetailItem) {
    // Removed strict openid check as backend uses phoneNumber from JWT
    
    const res = await callApi<any>('saveJob', {
      jobId: job._id,
      type: job.type || 'remote',
      createdAt: job.createdAt || new Date().toISOString(),
    })

    if (res.success) {
      this.setData({ saveDocId: String(res.result?._id || job._id) })
    } else {
      throw new Error(res.message || 'Save failed')
    }
  },

  async removeSavedRecord(_id: string) {
    const res = await callApi<any>('unsaveJob', { jobId: _id })
    if (res.success) {
      this.setData({ saveDocId: '' })
    } else {
      throw new Error(res.message || 'Unsave failed')
    }
  },

  async checkSavedState(_id: string, silent = false) {
    if (!_id) return false

    const app = getApp<IAppOption>() as any
    const user = app?.globalData?.user
    
    // 如果没有用户数据（未登录），直接返回 false
    if (!user) {
      if (!silent) this.setData({ saved: false, saveDocId: '' })
      return false
    }

    try {
      const res = await callApi<any>('checkJobSaved', { jobId: _id })
      const exists = !!res.result?.exists
      const updates: Partial<typeof this.data> = {
        saveDocId: String(res.result?._id || _id),
      }
      if (!silent) updates.saved = exists
      this.setData(updates)
      return exists
    } catch (err) {
      if (!silent) {
        this.setData({ saved: false, saveDocId: '' })
      } else {
        this.setData({ saveDocId: '' })
      }
      return false
    }
  },
})

