// miniprogram/pages/resume-profile/index.ts
import { normalizeLanguage, t, AppLanguage } from '../../utils/i18n/index'
import { attachLanguageAware } from '../../utils/languageAware'
import { attachThemeAware } from '../../utils/themeAware'
import { ui } from '../../utils/ui'
import { ResumeDecision } from '../../utils/resumeDecision'
import { callApi, formatFileUrl } from '../../utils/request'
import { cacheImage } from '../../utils/fileCache'
import { checkResumeOnboarding, requestGenerateResume } from '../../utils/resume'
import * as UIConfig from '../../utils/i18n/configs/resume-profile'
const { serverUrl } = require('../../env.js')

Page({
  data: {
    // UI State
    showPreviewModal: false,
    showOnboardingDrawer: false,
    previewType: 'image' as 'image' | 'pdf',
    previewPath: '',
    previewName: '',
    // 个人信息 (当前显示的数据)
    name: '',
    photo: '',
    gender: '',
    birthday: '',
    location: '',
    wechat: '',
    email: '',
    phone: '',
    phone_en: '',
    website: '',
    whatsapp: '',
    telegram: '',
    linkedin: '',
    currentLang: 'Chinese', // 'Chinese' or 'English'
    zh: {} as any,
    en: {} as any,
    showSkillsDrawer: false,
    showCertificatesDrawer: false,
    skillsForm: [] as string[],
    certificatesForm: [] as string[],
    // 教育经历（可以有多个）
    educations: [] as Array<{ 
      school: string; 
      school_en?: string;
      school_cn?: string;
      country_chinese?: string;
      country_english?: string;
      degree: string; 
      major: string; 
      major_en?: string;
      startDate: string; 
      endDate: string;
      description?: string;
      graduationDate?: string; // 兼容旧版
    }>,
    // 证书
    certificates: [] as string[],
    
    // 编辑状态
    showEduDrawer: false,
    showWorkDrawer: false,
    showBasicInfoDrawer: false,
    showContactInfoDrawer: false,
    showDegreePicker: false,
    degreePickerValue: [0, 0],
    studyTypes: [] as string[],
    showGenderPicker: false,
    showDatePicker: false,
    currentDatePickingField: '', // 'startDate' | 'endDate' | 'birthday'
    datePickerValue: [0, 0],
    years: [] as number[],
    months: [] as number[],
    skills: [] as string[],
    workExperiences: [] as Array<{
      company: string;
      jobTitle: string;
      businessDirection: string;
      workContent?: string;
      startDate: string;
      endDate: string;
    }>,
    aiMessage: '',
    showAiMessageSheet: false,
    isAiMessageFocus: false,
    aiMessageValid: false,
    aiMessageForm: '',
    editingEduIndex: -1, // -1 表示新增
    editingWorkIndex: -1, // -1 表示新增
    universitySuggestions: [] as Array<{ chinese_name: string, english_name: string }>,
    showUniversitySuggestions: false,
    majorSuggestions: [] as Array<{ chinese_name: string, english_name: string }>,
    showMajorSuggestions: false,
    eduForm: {
      school: '',
      school_en: '',
      country_chinese: '',
      country_english: '',
      degree: '',
      major: '',
      major_en: '',
      startDate: '',
      endDate: '',
      description: '',
    },
    workForm: {
      company: '',
      jobTitle: '',
      businessDirection: '',
      workContent: '',
      startDate: '',
      endDate: '',
    },
    basicInfoForm: {
      name: '',
      gender: '',
      birthday: '',
      location: '',
    },
    contactInfoForm: {
      wechat: '',
      email: '',
      phone: '',
      phone_en: '',
      whatsapp: '',
      telegram: '',
      linkedin: '',
      website: '',
    },
    degreeOptions: [] as string[],
    genderOptions: [] as string[],
    
    // UI 文本
    ui: {} as Record<string, any>,
    completeness_cn: 0,
    completeness_en: 0,
    percent_cn: 0,
    percent_en: 0,
    currentPercent: 0,
    currentCompleteness: 0,
    interfaceLang: 'Chinese' as AppLanguage,
  },

  onLoad() {
    // attach language-aware behavior
    ;(this as any)._langDetach = attachLanguageAware(this, {
      onLanguageRevive: () => {
        wx.setNavigationBarTitle({ title: '' })
        this.updateLanguage()
      },
    })

    // attach theme-aware behavior
    ;(this as any)._themeDetach = attachThemeAware(this, {
      onThemeChange: () => {
        this.updateLanguage()
      },
    })

    const app = getApp<IAppOption>() as any
    const userUpdateHandler = () => {
      console.log('[ResumeProfile] User updated, reloading data...')
      this.loadResumeData()
    }
    app.onUserChange(userUpdateHandler)
    ;(this as any)._userDetach = () => app.offUserChange(userUpdateHandler)

    this.updateLanguage()
    this.initDateOptions()
    this.loadResumeData()
  },

  initDateOptions() {
    const years = []
    const currentYear = new Date().getFullYear()
    for (let i = currentYear - 50; i <= currentYear + 10; i++) {
      years.push(i)
    }
    const months = []
    for (let i = 1; i <= 12; i++) {
      months.push(i)
    }
    this.setData({ years, months })
  },

  onUnload() {
    const fn = (this as any)._langDetach
    if (typeof fn === 'function') fn()
    ;(this as any)._langDetach = null

    const themeFn = (this as any)._themeDetach
    if (typeof themeFn === 'function') themeFn()
    ;(this as any)._themeDetach = null

    const userFn = (this as any)._userDetach
    if (typeof userFn === 'function') userFn()
    ;(this as any)._userDetach = null
  },

  onShow() {
    wx.setNavigationBarTitle({ title: '' })
    this.updateLanguage()
    checkResumeOnboarding()
  },

  onSwitchLang(e: any) {
    const lang = e.currentTarget.dataset.lang
    this.setData({ currentLang: lang }, () => {
      this.updateLanguage()
      this.refreshDisplayData()
    })
  },

  async onSyncFromChinese() {
    const { zh, ui: uiStrings } = this.data
    if (!zh || Object.keys(zh).length === 0) return

    ui.showModal({
      title: t('resume.syncConfirmTitle') || uiStrings.syncFromCn || '同步确认',
      content: t('resume.syncConfirmContent'),
      success: async (res) => {
        if (res.confirm) {
          // 将中文数据整体移动到英文侧进行保存
          const syncData = JSON.parse(JSON.stringify(zh))
          
          // 排除基本信息，保持独立性
          delete syncData.name;
          // delete syncData.gender;
          // delete syncData.birthday;
          // delete syncData.photo; // Keeps photo synced

          // 特殊处理 1：教育经历中的 school_en/major_en 需要转正
          if (syncData.educations) {
            syncData.educations = syncData.educations.map((e: any) => {
              return {
                ...e,
                school: e.school_en || e.school,
                major: e.major_en || e.major,
                degree: this.translateDegreeToEn(e.degree)
              }
            })
          }

          // 特殊处理 2：性别翻译
          if (syncData.gender) {
            const genderOptionsCn = t('resume.genderOptions', 'Chinese') as string[]
            const genderOptionsEn = t('resume.genderOptions', 'English') as string[]
            const idx = genderOptionsCn.indexOf(syncData.gender)
            if (idx !== -1) {
              syncData.gender = genderOptionsEn[idx]
            }
          }

          // 特殊处理 3：所在地，如果中文没填，英文默认中国
          if (!syncData.location) {
            syncData.location = 'China'
          }

          await this.saveResumeProfile(syncData)
          ui.showSuccess(t('resume.synced'))
          
          // 重新加载数据
          await this.loadResumeData()
        }
      }
    })
  },

  refreshDisplayData() {
    const { currentLang, zh, en, completeness_cn, completeness_en, percent_cn, percent_en } = this.data
    
    // Safety check: ensure we have something to show
    const profile = currentLang === 'English' ? (en || {}) : (zh || {})
    const currentPercent = currentLang === 'English' ? (percent_en || 0) : (percent_cn || 0)
    const currentCompleteness = currentLang === 'English' ? (completeness_en || 0) : (completeness_cn || 0)
    
    console.log(`[ResumeProfile] Refreshing UI. Lang: ${currentLang}, Score: ${currentPercent}%, Level: ${currentCompleteness}`)
    console.log(`[ResumeProfile] Stats - CN: ${percent_cn}%, EN: ${percent_en}%`)

    this.setData({
      name: profile.name || '',
      photo: formatFileUrl(profile.photo) || '',
      gender: profile.gender || '',
      birthday: profile.birthday || '',
      location: profile.location || '',
      wechat: profile.wechat || '',
      email: profile.email || '',
      phone: profile.phone || '',
      phone_en: profile.phone_en || profile.phone || '',
      website: profile.website || '',
      whatsapp: profile.whatsapp || '',
      telegram: profile.telegram || '',
      linkedin: profile.linkedin || '',
      educations: profile.educations || [],
      certificates: profile.certificates || [],
      skills: profile.skills || [],
      workExperiences: profile.workExperiences || [],
      aiMessage: profile.aiMessage || '',
      currentCompleteness: currentCompleteness,
      currentPercent: currentPercent
    }, () => {
       // 如果有头像是远程地址，尝试静默缓存并替换为本地地址
       if (profile.photo && profile.photo.startsWith('http')) {
           cacheImage(profile.photo).then(localPath => {
               if (localPath !== profile.photo) {
                   console.log('[ResumeProfile] Using cached resume photo:', localPath);
                   this.setData({ photo: localPath });
               }
           }).catch(console.error);
       }
    })
  },

  updateLanguage() {
    const app = getApp<IAppOption>() as any
    const lang = normalizeLanguage(app?.globalData?.language)
    
    const uiStrings = UIConfig.buildPageUI(lang, this.data)

    const degreeOptions = t<string[]>('resume.degreeOptions')
    const studyTypes = t<string[]>('resume.studyTypes')
    const genderOptions = t<string[]>('resume.genderOptions')

    this.setData({ 
      ui: uiStrings, 
      degreeOptions, 
      studyTypes, 
      genderOptions, 
      interfaceLang: lang 
    })
  },

  updateTips() {
    this.setData({
      ['ui.tips']: UIConfig.buildPageUI(this.data.interfaceLang, this.data).tips
    })
  },

  loadResumeData() {
    const app = getApp<IAppOption>() as any
    const user = app?.globalData?.user

    if (user) {
      const profile = user.resume_profile || {}
      const zh = profile.zh || {}
      const en = profile.en || {}

      console.log('[ResumeProfile] Loading data for user:', user._id)
      console.log('[ResumeProfile] Raw profile zh:', JSON.stringify(zh).substring(0, 100))
      console.log('[ResumeProfile] Raw profile en:', JSON.stringify(en).substring(0, 100))

      // 以后端物理字段 completeness 为准，不再在前端进行 fallback 计算
      const zhCompleteness = zh.completeness || { score: 0, level: 0 };
      const enCompleteness = en.completeness || { score: 0, level: 0 };

      console.log(`[ResumeProfile] Scores - CN: ${zhCompleteness.score}%, EN: ${enCompleteness.score}%`)

      this.setData({
        zh,
        en,
        completeness_cn: zhCompleteness.level || 0,
        completeness_en: enCompleteness.level || 0,
        percent_cn: zhCompleteness.score || 0,
        percent_en: enCompleteness.score || 0
      }, () => {
        this.refreshDisplayData()
        this.updateTips()
      })
    } else {
      console.warn('[ResumeProfile] No user object found in globalData')
    }
  },

  async saveResumeProfile(data: any, showSuccessToast = true, showMask = false) {
    const { ui: uiStrings, currentLang } = this.data
    try {
      ui.showLoading(uiStrings.saving, showMask)

      const isChinese = currentLang === 'Chinese'
      const updates: any = {}
      
      if (isChinese) {
        // 1. Prepare updates for zh
        for (const key in data) {
          updates[`zh.${key}`] = data[key]
        }
        
        // 2. Handle one-way sync (CN -> EN)
        // Note: For education/work lists, we already handled potential English fields in onSaveEducation
        // but since we want they to be independent, we only push what was specifically prepared.
        // If data contains 'en_sync', we apply it to 'en'.
        if (data._en_sync) {
          const syncData = data._en_sync
          for (const key in syncData) {
            updates[`en.${key}`] = syncData[key]
          }
          delete data._en_sync // remove from zh updates
          delete updates[`zh._en_sync`]
        }
      } else {
        // Prepare updates for en only (no sync to zh)
        for (const key in data) {
          updates[`en.${key}`] = data[key]
        }
      }

      const res: any = await callApi('updateUserProfile', { 
        resume_profile: updates
      })
      
      if (res?.success && res.result?.user) {
        const app = getApp<IAppOption>() as any
        app.globalData.user = res.result.user
        this.loadResumeData()
        // ui.hideLoading() // Removed: Allow transition to Success directly
        if (showSuccessToast) {
          ui.showSuccess(uiStrings.saveSuccess)
        }
        return true
      } else {
        throw new Error(t('resume.saveFailed'))
      }
    } catch (err) {
      console.error(err)
      ui.hideLoading()
      ui.showError(uiStrings.saveFailed)
      return false
    }
  },

  // UI Event Handlers
  onEditPhoto() {
    const { ui: uiStrings } = this.data
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        ui.showLoading(uiStrings.uploading)
        try {
          const openid = wx.getStorageSync('user_openid')
          const token = wx.getStorageSync('token')

          wx.uploadFile({
            url: `${serverUrl}/api/upload`,
            filePath: tempFilePath,
            name: 'file',
            header: {
              'x-openid': openid || '',
              'Authorization': token ? `Bearer ${token}` : ''
            },
            success: async (uploadRes) => {
              try {
                const data = JSON.parse(uploadRes.data)
                if (data.success) {
                  // 后端返回的是远程 URL，我们保存远程 URL
                  const payload: any = { photo: data.url }
                  
                  // 但为了可以立即在界面上看到（不用等下载），我们可以先把本地临时路径存入缓存映射
                  // 这样下一次 cacheImage(data.url) 就会直接命中这个 tempFilePath (如果它是永久的)
                  // 不过 tempFilePath 可能是临时文件，所以更好的做法是：
                  // 保存成功后，setData 先用 tempFilePath 展示，后台再让 cacheImage 去下载/同步
                  
                  this.setData({ photo: tempFilePath }); // 立即展示用户选择的图，不等网络与刷新

                  const saved = await this.saveResumeProfile(payload, false)
                  if (saved) {
                    ui.showSuccess(uiStrings.uploadSuccess || t('me.uploadSuccess') || t('resume.saveSuccess') || '头像更新成功')
                  }
                } else {
                  console.error('[Upload] Backend error:', data)
                  ui.showToast(data.message || uiStrings.uploadFailed)
                }
              } catch (parseErr) {
                console.error('[Upload] Parse error:', uploadRes.data)
                ui.showToast(uiStrings.uploadFailed)
              }
            },
            fail: (err) => {
              console.error('[Upload] wx.uploadFile fail:', err)
              ui.showToast(uiStrings.uploadFailed)
            },
            complete: () => {
              ui.hideLoading()
            }
          })
        } catch (e) {
          console.error('[Upload] Exception:', e)
          ui.hideLoading()
          ui.showToast(uiStrings.uploadFailed)
        }
      }
    })
  },
  
  // 个人基本信息相关逻辑
  onEditBasicInfo() {
    this.setData({
      showBasicInfoDrawer: true,
      basicInfoForm: {
        name: this.data.name,
        gender: this.data.gender,
        birthday: this.data.birthday,
        location: this.data.location,
      }
    })
  },
  closeBasicInfoDrawer() {
    this.setData({ showBasicInfoDrawer: false })
  },
  onEditContactInfo() {
    this.setData({
      showContactInfoDrawer: true,
      contactInfoForm: {
        wechat: this.data.wechat,
        email: this.data.email,
        phone: this.data.phone,
        phone_en: this.data.phone_en,
        whatsapp: this.data.whatsapp,
        telegram: this.data.telegram,
        linkedin: this.data.linkedin,
        website: this.data.website,
      }
    })
  },
  closeContactInfoDrawer() {
    this.setData({ showContactInfoDrawer: false })
  },
  onContactInput(e: any) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`contactInfoForm.${field}`]: e.detail.value
    })
  },
  async onSaveContactInfo() {
    const { contactInfoForm, currentLang } = this.data
    
    let payload: any = {}
    if (currentLang === 'Chinese') {
      // Chinese fields only
      payload = {
        wechat: contactInfoForm.wechat,
        email: contactInfoForm.email,
        phone: contactInfoForm.phone,
        website: contactInfoForm.website
      }
    } else {
      // English fields only
      payload = {
        email: contactInfoForm.email,
        phone_en: contactInfoForm.phone_en,
        whatsapp: contactInfoForm.whatsapp,
        telegram: contactInfoForm.telegram,
        linkedin: contactInfoForm.linkedin,
        website: contactInfoForm.website,
      }
    }

    const success = await this.saveResumeProfile(payload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
      this.closeContactInfoDrawer()
    }
  },
  onBasicNameInput(e: any) {
    this.setData({ 'basicInfoForm.name': e.detail.value })
  },
  onBasicLocationInput(e: any) {
    this.setData({ 'basicInfoForm.location': e.detail.value })
  },
  openGenderPicker() {
    this.setData({ showGenderPicker: true })
  },
  closeGenderPicker() {
    this.setData({ showGenderPicker: false })
  },
  onSelectGender(e: any) {
    this.setData({ 
      'basicInfoForm.gender': e.currentTarget.dataset.value,
      showGenderPicker: false
    })
  },
  openBirthdayPicker() {
    const currentBirthday = this.data.basicInfoForm.birthday
    let yearIndex = this.data.years.indexOf(new Date().getFullYear() - 25) // 默认25岁
    let monthIndex = 0

    if (currentBirthday) {
      const [y, m] = currentBirthday.split('-').map(Number)
      const foundYearIndex = this.data.years.indexOf(y)
      if (foundYearIndex > -1) yearIndex = foundYearIndex
      monthIndex = m - 1
    }

    this.setData({ 
      showDatePicker: true,
      currentDatePickingField: 'birthday',
      datePickerValue: [yearIndex, monthIndex]
    })
  },
  async onSaveBasicInfo() {
    const { basicInfoForm, ui: uiStrings, currentLang } = this.data
    const isEnglish = currentLang === 'English'

    if (!basicInfoForm.name.trim()) {
      ui.showToast(uiStrings.namePlaceholder)
      return
    }

    const dataToUpdate: any = {
      gender: basicInfoForm.gender,
      birthday: basicInfoForm.birthday,
      name: basicInfoForm.name,
    }

    // 仅英文侧有所在地字段
    if (isEnglish) {
      dataToUpdate.location = basicInfoForm.location
    }

    await this.saveResumeProfile(dataToUpdate, false)
    ui.showSuccess(this.data.ui.saveSuccess)
    this.closeBasicInfoDrawer()
  },

  // 教育经历相关逻辑
  onAddEducation() {
    this.setData({
      showEduDrawer: true,
      editingEduIndex: -1,
      showUniversitySuggestions: false,
      universitySuggestions: [],
      eduForm: {
        school: '',
        school_en: '',
        country_chinese: '',
        country_english: '',
        degree: '',
        major: '',
        major_en: '',
        startDate: '',
        endDate: '',
        description: '',
      }
    })
  },
  onEditEducation(e: any) {
    const index = e.currentTarget.dataset.index
    const edu = this.data.educations[index]
    
    // Regardless of language, 'edu.school' should contain the school name for the current profile.
    // We use a fallback to school_en/major_en just in case of inconsistent data.
    let displayedSchool = edu.school || edu.school_en || ''
    let displayedMajor = edu.major || edu.major_en || ''

    this.setData({
      showEduDrawer: true,
      editingEduIndex: index,
      showUniversitySuggestions: false,
      universitySuggestions: [],
      showMajorSuggestions: false,
      majorSuggestions: [],
      eduForm: {
        school: displayedSchool,
        school_en: edu.school_en || '',
        country_chinese: edu.country_chinese || '',
        country_english: edu.country_english || '',
        degree: edu.degree || '',
        major: displayedMajor,
        major_en: edu.major_en || '',
        startDate: edu.startDate || '',
        endDate: edu.endDate || edu.graduationDate || '', // 兼容
        description: edu.description || '',
      }
    })
  },
  closeEduDrawer() {
    this.setData({ showEduDrawer: false })
  },
  
  // 自定义学历选择器逻辑
  openDegreePicker() {
    // 同时也关闭院校建议，防止遮挡
    this.setData({ showUniversitySuggestions: false })

    const currentDegree = this.data.eduForm.degree
    let degreeIndex = 0
    let typeIndex = 0

    if (currentDegree) {
      // 尝试匹配 "本科 (全日制)" 这种格式
      const match = currentDegree.match(/^(.+?)\s*\((.+?)\)$/)
      if (match) {
        const d = match[1]
        const t = match[2]
        const di = this.data.degreeOptions.indexOf(d)
        const ti = this.data.studyTypes.indexOf(t)
        if (di > -1) degreeIndex = di
        if (ti > -1) typeIndex = ti
      } else {
        // 如果不匹配，尝试简单匹配学历
        const di = this.data.degreeOptions.indexOf(currentDegree)
        if (di > -1) degreeIndex = di
      }
    }

    this.setData({ 
      showDegreePicker: true,
      degreePickerValue: [degreeIndex, typeIndex]
    })
  },
  closeDegreePicker() {
    this.setData({ showDegreePicker: false })
  },
  onDegreePickerChange(e: any) {
    this.setData({ degreePickerValue: e.detail.value })
  },
  onConfirmDegree() {
    const { degreePickerValue, degreeOptions, studyTypes, currentLang } = this.data
    const [dIdx, tIdx] = degreePickerValue
    const degree = degreeOptions[dIdx]
    
    let degreeStr = degree
    if (currentLang === 'Chinese') {
      const type = studyTypes[tIdx || 0]
      degreeStr = `${degree} (${type})`
    }
    
    this.setData({
      'eduForm.degree': degreeStr,
      showDegreePicker: false
    })
  },

  // 自定义日期选择器逻辑
  openDatePicker(e: any) {
    this.setData({ showUniversitySuggestions: false })
    const field = e.currentTarget.dataset.field
    const isWorkField = field.startsWith('work_')
    const actualField = isWorkField ? field.replace('work_', '') : field
    const currentDate = isWorkField ? (this.data.workForm as any)[actualField] : (this.data.eduForm as any)[actualField]
    
    let yearIndex = this.data.years.indexOf(new Date().getFullYear())
    let monthIndex = new Date().getMonth()

    if (currentDate) {
      const [y, m] = currentDate.split('-').map(Number)
      const foundYearIndex = this.data.years.indexOf(y)
      if (foundYearIndex > -1) yearIndex = foundYearIndex
      monthIndex = m - 1
    }

    this.setData({ 
      showDatePicker: true,
      currentDatePickingField: field,
      datePickerValue: [yearIndex, monthIndex]
    })
  },
  closeDatePicker() {
    this.setData({ showDatePicker: false })
  },
  onDatePickerChange(e: any) {
    this.setData({ datePickerValue: e.detail.value })
  },
  onSetToPresent() {
    const field = this.data.currentDatePickingField
    const isWorkField = field.startsWith('work_')
    const actualField = isWorkField ? field.replace('work_', '') : field
    const formPrefix = isWorkField ? 'workForm' : 'eduForm'
    
    this.setData({
      [`${formPrefix}.${actualField}`]: this.data.ui.toPresent,
      showDatePicker: false
    })
  },
  onConfirmDate() {
    const [yIdx, mIdx] = this.data.datePickerValue
    const year = this.data.years[yIdx]
    const month = String(this.data.months[mIdx]).padStart(2, '0')
    const dateStr = `${year}-${month}`
    
    const field = this.data.currentDatePickingField
    
    if (field === 'birthday') {
      this.setData({
        'basicInfoForm.birthday': dateStr,
        showDatePicker: false
      })
      return
    }

    const isWorkField = field.startsWith('work_')
    const actualField = isWorkField ? field.replace('work_', '') : field
    const otherField = actualField === 'startDate' ? 'endDate' : 'startDate'
    const formPrefix = isWorkField ? 'workForm' : 'eduForm'
    const otherDate = (this.data[formPrefix] as any)[otherField]

    // 校验：开始时间不能晚于结束时间
    if (otherDate && dateStr !== this.data.ui.toPresent && otherDate !== this.data.ui.toPresent) {
      if (actualField === 'startDate' && dateStr > otherDate) {
        ui.showToast(t('me.startAfterEnd'))
        return
      }
      if (actualField === 'endDate' && dateStr < otherDate) {
        ui.showToast(t('me.endBeforeStart'))
        return
      }
    }
    
    this.setData({
      [`${formPrefix}.${actualField}`]: dateStr,
      showDatePicker: false
    })
  },

  async searchUniversities(keyword: string) {
    if (!keyword || keyword.length < 2) {
      this.setData({ showUniversitySuggestions: false })
      return
    }

    try {
      const res = await callApi('searchUniversities', { keyword })
      
      const items = res?.result?.items || []
      this.setData({
        universitySuggestions: items,
        showUniversitySuggestions: items.length > 0
      })
    } catch (e) {
      console.error(e)
    }
  },

  onSelectUniversity(e: any) {
    const item = e.currentTarget.dataset.item
    const isEnglish = this.data.currentLang === 'English'
    this.setData({
      'eduForm.school': isEnglish ? item.english_name : item.chinese_name,
      'eduForm.school_en': item.english_name || '',
      'eduForm.country_chinese': item.country_chinese || '',
      'eduForm.country_english': item.country_english || '',
      showUniversitySuggestions: false
    })
  },

  onEduSchoolFocus(e: any) {
    const keyword = e.detail.value
    if (keyword && keyword.length >= 2) {
      this.searchUniversities(keyword)
    }
  },

  onEduSchoolBlur() {
    // 清除可能存在的搜索定时器，防止失焦后搜索结果回来重新打开列表
    if ((this as any)._searchTimer) clearTimeout((this as any)._searchTimer);

    // 延迟关闭，确保点击建议项的事件能先触发
    setTimeout(() => {
      this.setData({ showUniversitySuggestions: false })
    }, 200)
  },

  onEduSchoolInput(e: any) {
    const keyword = e.detail.value
    this.setData({ 
      'eduForm.school': keyword,
      'eduForm.country_chinese': '',
      'eduForm.country_english': '',
      // We don't automatically clear school_en/school_cn here to respect "no automatic change"
      // They will only be updated if a new suggestion is selected.
    })
    
    if ((this as any)._searchTimer) clearTimeout((this as any)._searchTimer);
    (this as any)._searchTimer = setTimeout(() => {
        this.searchUniversities(keyword)
    }, 500)
  },
  onEduDegreeChange(e: any) {
    this.setData({ 'eduForm.degree': this.data.degreeOptions[e.detail.value] })
  },

  async searchMajors(keyword: string) {
    if (!keyword || keyword.length < 2) {
      this.setData({ showMajorSuggestions: false })
      return
    }

    const { degree } = this.data.eduForm
    let levelQuery = ''
    if (degree.includes('本科')) {
      levelQuery = 'Bachelor'
    } else if (degree.includes('硕士')) {
      levelQuery = 'Master'
    }

    if (!levelQuery) {
      this.setData({ showMajorSuggestions: false })
      return
    }

    try {
      const res = await callApi('searchMajors', { keyword, level: levelQuery })
      
      const items = res?.result?.items || []
      this.setData({
        majorSuggestions: items,
        showMajorSuggestions: items.length > 0
      })
    } catch (e) {
      console.error(e)
    }
  },

  onSelectMajor(e: any) {
    const item = e.currentTarget.dataset.item
    const isEnglish = this.data.currentLang === 'English'
    this.setData({
      'eduForm.major': isEnglish ? (item.english_name || item.chinese_name) : (item.chinese_name || item.english_name),
      'eduForm.major_en': item.english_name || '',
      showMajorSuggestions: false
    })
  },

  onEduMajorFocus(e: any) {
    const keyword = e.detail.value
    if (keyword && keyword.length >= 2) {
      this.searchMajors(keyword)
    }
  },

  onEduMajorBlur() {
    if ((this as any)._majorSearchTimer) clearTimeout((this as any)._majorSearchTimer);
    
    setTimeout(() => {
      this.setData({ showMajorSuggestions: false })
    }, 200)
  },

  onEduMajorInput(e: any) {
    const keyword = e.detail.value
    this.setData({ 
      'eduForm.major': keyword,
      showMajorSuggestions: false // Fixed typo from showUniversitySuggestions
    })

    if ((this as any)._majorSearchTimer) clearTimeout((this as any)._majorSearchTimer);
    (this as any)._majorSearchTimer = setTimeout(() => {
        this.searchMajors(keyword)
    }, 500)
  },
  onEduStartDateChange(e: any) {
    this.setData({ 
      'eduForm.startDate': e.detail.value,
      showUniversitySuggestions: false
    })
  },
  onEduEndDateChange(e: any) {
    this.setData({ 
      'eduForm.endDate': e.detail.value,
      showUniversitySuggestions: false
    })
  },
  onEduDescriptionInput(e: any) {
    this.setData({ 
      'eduForm.description': e.detail.value,
      showUniversitySuggestions: false
    })
  },
  
  // 工作经历相关逻辑
  onAddWorkExperience() {
    this.setData({
      showWorkDrawer: true,
      editingWorkIndex: -1,
      workForm: {
        company: '',
        jobTitle: '',
        businessDirection: '',
        workContent: '',
        startDate: '',
        endDate: '',
      }
    })
  },
  onEditWorkExperience(e: any) {
    const index = e.currentTarget.dataset.index
    const work = this.data.workExperiences[index]
    this.setData({
      showWorkDrawer: true,
      editingWorkIndex: index,
      workForm: {
        company: work.company || '',
        jobTitle: work.jobTitle || '',
        businessDirection: work.businessDirection || '',
        workContent: work.workContent || '',
        startDate: work.startDate || '',
        endDate: work.endDate || '',
      }
    })
  },
  closeWorkDrawer() {
    this.setData({ showWorkDrawer: false })
  },
  onWorkCompanyInput(e: any) {
    this.setData({ 'workForm.company': e.detail.value })
  },
  onWorkJobTitleInput(e: any) {
    this.setData({ 'workForm.jobTitle': e.detail.value })
  },
  onWorkBusinessDirectionInput(e: any) {
    this.setData({ 'workForm.businessDirection': e.detail.value })
  },
  onWorkContentInput(e: any) {
    this.setData({ 'workForm.workContent': e.detail.value })
  },
  async onSaveWorkExperience() {
    const { workForm, editingWorkIndex, workExperiences, ui: uiStrings } = this.data

    if (!workForm.company.trim()) {
      ui.showToast(uiStrings.companyPlaceholder || t('resume.companyPlaceholder'))
      return
    }
    if (!workForm.jobTitle.trim()) {
      ui.showToast(uiStrings.jobTitlePlaceholder || t('resume.jobTitlePlaceholder'))
      return
    }
    if (!workForm.startDate) {
      ui.showToast(t('me.selectStartTime'))
      return
    }
    if (!workForm.endDate) {
      ui.showToast(t('me.selectEndTime'))
      return
    }

    if (workForm.startDate && workForm.endDate && workForm.startDate !== uiStrings.toPresent && workForm.endDate !== uiStrings.toPresent) {
      if (workForm.startDate > workForm.endDate) {
        ui.showToast(t('me.startAfterEnd'))
        return
      }
    }

    const newWorks = [...workExperiences]
    const workData = { ...workForm }

    if (editingWorkIndex === -1) {
      newWorks.push(workData)
    } else {
      newWorks[editingWorkIndex] = workData
    }

    const payload: any = { workExperiences: newWorks }

    const success = await this.saveResumeProfile(payload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
      this.closeWorkDrawer()
    }
  },
  async onDeleteWorkExperience() {
    const { editingWorkIndex, workExperiences } = this.data
    if (editingWorkIndex === -1) return

    ui.showModal({
      title: t('resume.delete'),
      content: t('resume.deleteWorkConfirm'),
      success: async (res) => {
        if (res.confirm) {
          const newWorks = [...workExperiences]
          newWorks.splice(editingWorkIndex, 1)
          
          const payload: any = { workExperiences: newWorks }
          
          const success = await this.saveResumeProfile(payload, false)
          if (success) {
            ui.showSuccess(this.data.ui.saveSuccess)
            this.closeWorkDrawer()
          }
        }
      }
    })
  },

  translateDegreeToEn(cnDegree: string) {
    if (!cnDegree) return ''
    const degreeOptionsCn = t('resume.degreeOptions', 'Chinese') as string[]
    const degreeOptionsEn = t('resume.degreeOptions', 'English') as string[]
    
    // Parse "Degree (Type)" such as "本科 (全日制)"
    const match = cnDegree.match(/^(.+?)\s*\((.+?)\)$/)
    if (match) {
      const pureCnDegree = match[1]
      const idx = degreeOptionsCn.indexOf(pureCnDegree)
      return idx !== -1 ? degreeOptionsEn[idx] : pureCnDegree
    }
    
    const idx = degreeOptionsCn.indexOf(cnDegree)
    return idx !== -1 ? degreeOptionsEn[idx] : cnDegree
  },

  async onSaveEducation() {
    const { eduForm, editingEduIndex, educations, ui: uiStrings } = this.data

    // 全字段校验
    if (!eduForm.school.trim()) {
      ui.showToast(uiStrings.schoolPlaceholder || t('resume.schoolPlaceholder'))
      return
    }
    if (!eduForm.degree) {
      ui.showToast(uiStrings.degreePlaceholder || t('resume.degreePlaceholder'))
      return
    }
    if (!eduForm.major.trim()) {
      ui.showToast(uiStrings.majorPlaceholder || t('resume.majorPlaceholder'))
      return
    }
    if (!eduForm.startDate) {
      ui.showToast(t('me.selectStartTime'))
      return
    }
    if (!eduForm.endDate) {
      ui.showToast(t('me.selectEndTime'))
      return
    }

    // 时间逻辑校验
    if (eduForm.startDate && eduForm.endDate && eduForm.startDate !== uiStrings.toPresent && eduForm.endDate !== uiStrings.toPresent) {
      if (eduForm.startDate > eduForm.endDate) {
        ui.showToast(t('me.startAfterEnd'))
        return
      }
    }

    const newEducations = [...educations]
    const eduData = { ...eduForm }
    
    // 准备更新的对象
    const updatePayload: any = {}

    if (editingEduIndex === -1) {
      newEducations.push(eduData)
    } else {
      newEducations[editingEduIndex] = eduData
    }
    updatePayload.educations = newEducations

    const success = await this.saveResumeProfile(updatePayload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
      this.closeEduDrawer()
    }
  },

  // 技能相关逻辑
  onEditSkills() {
    this.setData({
      showSkillsDrawer: true,
      skillsForm: this.data.skills.length > 0 ? [...this.data.skills] : ['']
    })
  },
  
  onSkillInput(e: any) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const skillsForm = [...this.data.skillsForm]
    skillsForm[index] = value
    this.setData({ skillsForm })
  },

  addSkillRow() {
    this.setData({
      skillsForm: [...this.data.skillsForm, '']
    })
  },

  removeSkillRow(e: any) {
    const index = e.currentTarget.dataset.index
    const skillsForm = [...this.data.skillsForm]
    skillsForm.splice(index, 1)
    // 保持至少一行
    if (skillsForm.length === 0) skillsForm.push('')
    this.setData({ skillsForm })
  },

  closeSkillsDrawer() {
    this.setData({ showSkillsDrawer: false })
  },

  async onSaveSkills() {
    const { skillsForm } = this.data
    // 过滤掉空项
    const newSkills = skillsForm.map(s => s.trim()).filter(s => s !== '')
    
    const payload: any = { skills: newSkills }
    
    const success = await this.saveResumeProfile(payload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
    }
    return success
  },

  async onDeleteEducation() {
    const { editingEduIndex, educations } = this.data
    if (editingEduIndex === -1) return

    ui.showModal({
      title: t('resume.delete'),
      content: t('resume.deleteEducationConfirm'),
      success: async (res) => {
        if (res.confirm) {
          const newEducations = [...educations]
          newEducations.splice(editingEduIndex, 1)
          
          const payload: any = { educations: newEducations }
          
          const success = await this.saveResumeProfile(payload, false)
          if (success) {
            ui.showSuccess(this.data.ui.saveSuccess)
            this.closeEduDrawer()
          }
        }
      }
    })
  },
  
  // 证书相关逻辑
  onEditCertificates() {
    this.setData({
      showCertificatesDrawer: true,
      certificatesForm: this.data.certificates.length > 0 ? [...this.data.certificates] : ['']
    })
  },

  onCertificateInput(e: any) {
    const index = e.currentTarget.dataset.index
    const value = e.detail.value
    const certificatesForm = [...this.data.certificatesForm]
    certificatesForm[index] = value
    this.setData({ certificatesForm })
  },

  addCertificateRow() {
    this.setData({
      certificatesForm: [...this.data.certificatesForm, '']
    })
  },

  removeCertificateRow(e: any) {
    const index = e.currentTarget.dataset.index
    const certificatesForm = [...this.data.certificatesForm]
    certificatesForm.splice(index, 1)
    // 保持至少一行
    if (certificatesForm.length === 0) certificatesForm.push('')
    this.setData({ certificatesForm })
  },

  closeCertificatesDrawer() {
    this.setData({ showCertificatesDrawer: false })
  },

  async onSaveCertificates() {
    const { certificatesForm } = this.data
    // 过滤掉空项
    const newCertificates = certificatesForm.map(c => c.trim()).filter(c => c !== '')
    
    const payload: any = { certificates: newCertificates }
    
    const success = await this.saveResumeProfile(payload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
    }
    return success
  },

  onEditAiMessage() {
    const val = this.data.aiMessage || '';
    const isValid = this.checkAiMessageValidity(val);
    this.setData({
      showAiMessageSheet: true,
      aiMessageForm: val,
      aiMessageValid: isValid
    })
    setTimeout(() => {
      this.setData({ isAiMessageFocus: true })
    }, 400)
  },

  checkAiMessageValidity(text: string) {
    if (!text) return false;
    const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    const isPureNumbers = /^\d+$/.test(text.trim());
    const isPureSymbols = /^[^a-zA-Z0-9\u4e00-\u9fa5]+$/.test(text.trim());

    return (chineseCount > 5 || englishCount > 10) && !isPureNumbers && !isPureSymbols;
  },

  closeAiMessageSheet() {
    this.setData({ 
      showAiMessageSheet: false,
      isAiMessageFocus: false
    })
  },

  onAiMessageInput(e: any) {
    const val = e.detail.value;
    const isValid = this.checkAiMessageValidity(val);
    this.setData({ 
      aiMessageForm: val,
      aiMessageValid: isValid
    })
  },

  onAiMessageConfirm(e: any) {
    const { complete, fail } = e.detail;
    this.onSaveAiMessageSheet()
        .then(success => success ? complete() : fail())
        .catch(() => fail());
  },

  onGenderConfirm(e: any) {
    const { complete } = e.detail;
    complete();
  },

  onSkillsConfirm(e: any) {
    const { complete, fail } = e.detail;
    this.onSaveSkills()
        .then(success => success ? complete() : fail())
        .catch(() => fail());
  },

  onCertificatesConfirm(e: any) {
    const { complete, fail } = e.detail;
    this.onSaveCertificates()
        .then(success => success ? complete() : fail())
        .catch(() => fail());
  },

  onDateConfirm(e: any) {
    const { complete } = e.detail;
    this.onConfirmDate();
    complete();
  },

  onDegreePickConfirm(e: any) {
    const { complete } = e.detail;
    this.onConfirmDegree();
    complete();
  },

  async onSaveAiMessageSheet() {
    const payload: any = { aiMessage: this.data.aiMessageForm || '' }
    const success = await this.saveResumeProfile(payload, false)
    if (success) {
      ui.showSuccess(this.data.ui.saveSuccess)
    }
    return success
  },

  // --- Onboarding Flow ---
  handleOnboardingStart() {
    const app = getApp<any>();
    const lang = normalizeLanguage(app.globalData.language);
    const user = app.globalData.user;
    const membership = user?.membership || {};
    const level = membership.level || 0;
    const lastParseAt = membership.last_resume_parse_at ? new Date(membership.last_resume_parse_at).getTime() : 0;
    const now = Date.now();

    // Cooldown Strategies
    let cooldownMs = 24 * 3600 * 1000; // Free: 24h
    if (level === 1) cooldownMs = 12 * 3600 * 1000;
    else if (level === 2 || level === 3) cooldownMs = 4 * 3600 * 1000;
    else if (level >= 4) cooldownMs = 0; // VIP+

    if (now - lastParseAt < cooldownMs) {
        const remainingHours = Math.ceil((cooldownMs - (now - lastParseAt)) / (3600 * 1000));
        const limitHours = cooldownMs / 3600000;
        
        ui.showModal({
            title: '更新过于频繁',
            content: lang === 'English' 
                ? `Your current plan allows updates every ${limitHours} hours. Please try again in ${remainingHours} hours.` 
                : `您当前会员等级限制每 ${limitHours} 小时更新一次简历，请 ${remainingHours} 小时后再试。`,
            confirmText: t('membership.viewDetails', lang),
            success: (res) => {
                if (res.confirm) {
                      wx.navigateTo({ url: '/pages/membership/index' });
                }
            }
        });
        return;
    }

    this.setData({ showOnboardingDrawer: true });
  },

  closeOnboardingDrawer() {
    this.setData({ showOnboardingDrawer: false });
  },

  async onOnboardingParseSuccess(e: any) {
    const { result } = e.detail;
    if (!result) {
      ui.showToast('处理失败');
      return;
    }

    const detectedLang = result.language === 'english' ? 'english' : 'chinese';
    this.setData({ showOnboardingDrawer: false });

    // Use Encapsulated Decision Logic (with small delay for smooth transition)
    setTimeout(async () => {
         const decision = await ResumeDecision.decide('PROFILE_UPDATE', detectedLang);
         
         if (decision) {
             const type = decision as 'combined' | 'single';
             this.applyParsedData({ success: true, result }, type);
         }
    }, 400);
  },

  async applyParsedData(data: any, type: 'single' | 'combined') {
    if (!data) return;
    ui.showLoading('AI 生成中...', true);
    try {
      // Data passed directly

      if (!data.success || !data.result) {
        ui.hideLoading();
        ui.showToast('解析失败，请重试');
        return;
      }

      const profile = data.result.profile;
      const detectedLang = data.result.language; // 'chinese' or 'english'
      const isCombined = type === 'combined';

      const mapEdu = (eduList: any[]) => (eduList || []).map((e: any) => ({
        school: e.school || "",
        degree: e.degree || "",
        major: e.major || "",
        startDate: e.startTime || "",
        endDate: e.endTime || ""
      }));

      const mapExp = (expList: any[]) => (expList || []).map((e: any) => ({
        company: e.company || "",
        jobTitle: e.role || "",
        workContent: e.description || "",
        startDate: e.startTime || "",
        endDate: e.endTime || ""
      }));

      // 如果后端返回了双语结构，优先使用
      const updates: any = {};
      
      if (profile.zh && profile.en) {
        const targetSingleLang = detectedLang === 'english' ? 'English' : 'Chinese';

        // Handle EN block
        if (isCombined || targetSingleLang === 'English') {
          updates.en = {
            educations: mapEdu(profile.en.education),
            workExperiences: mapExp(profile.en.experience),
            // completeness: { score: 85, level: 2 }, // Backend Calculates
            name: profile.en.name || undefined,
            location: profile.en.city || undefined,
            linkedin: profile.en.linkedin || undefined,
            whatsapp: profile.en.whatsapp || undefined,
            telegram: profile.en.telegram || undefined,
            email: profile.en.email || undefined,
            phone: profile.en.mobile || undefined,
          };
        }

        // Handle ZH block
        if (isCombined || targetSingleLang === 'Chinese') {
          updates.zh = {
            educations: mapEdu(profile.zh.education),
            workExperiences: mapExp(profile.zh.experience),
            // completeness: { score: 85, level: 2 }, // Backend Calculates
            name: profile.zh.name || undefined,
            wechat: profile.zh.wechat || undefined,
            email: profile.zh.email || undefined,
            phone: profile.zh.mobile || undefined,
            gender: profile.zh.gender || undefined,
            birthday: profile.zh.birthday || undefined,
          };
        }
      } else {
        const extracted = profile;
        const mappedEducations = mapEdu(extracted.education);
        const mappedExperiences = mapExp(extracted.experience);

        // 分配到对应的语言槽位
        const targetData = { 
          educations: mappedEducations, 
          workExperiences: mappedExperiences, 
          // completeness: { score: 85, level: 2 }, // Backend Calculates
          name: extracted.name || undefined,
          email: extracted.email || undefined,
          phone: extracted.mobile || undefined,
          gender: extracted.gender || undefined,
          birthday: extracted.birthday || undefined,
        };

        if (detectedLang === 'english') {
          updates.en = {
            ...targetData,
            location: extracted.city || undefined,
            linkedin: extracted.linkedin || undefined,
          };
          
          if (isCombined) {
            updates.zh = JSON.parse(JSON.stringify(targetData));
            // Ensure language-specific fields don't bleed over inappropriately unless generic
          }
        } else {
          updates.zh = {
             ...targetData,
             wechat: extracted.wechat || undefined,
          };

          if (isCombined) {
            updates.en = JSON.parse(JSON.stringify(targetData));
          }
        }
      }

      // 执行更新
      const res: any = await callApi('updateUserProfile', { 
        resume_profile: updates
      });

      ui.hideLoading();

      if (res?.success && res.result?.user) {
        // Critical: Update global user first, then reload local logic
        const app = getApp<any>();
        console.log('[ResumeProfile] Update success. Syncing global user...', res.result.user.resume_profile);
        app.globalData.user = res.result.user;
        
        // Force reload from the newly updated global user
        this.loadResumeData();

        ui.showSuccess('资料已更新');
      } else {
        ui.showToast('更新失败');
      }

    } catch (e) {
      ui.hideLoading();
      ui.showToast('处理失败');
      console.error(e);
    }
  },
})

