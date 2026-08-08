import { ui } from '../../utils/ui'
import { t, normalizeLanguage } from '../../utils/i18n/index'
import { attachLanguageAware } from '../../utils/languageAware'
import { attachThemeAware } from '../../utils/themeAware'
import { themeManager } from '../../utils/themeManager'
import { requestGenerateResume } from '../../utils/resume'
import { ResumeDecision } from '../../utils/resumeDecision'

const DRAFT_STORAGE_KEY = 'resume_generator_draft';

Page({
  data: {
    // ... data properties
    parsedData: null as any, // Flag to indicate if data came from screenshot
    ui: {
      title: '',
      subtitle: '',
      jobTitle: '',
      jobTitlePlaceholder: '',
      workYears: '',
      workYearsPlaceholder: '',
      jobDescription: '',
      jdPlaceholder: '',
    },
    targetJob: {
      title: '',
      experience: '',
      content: ''
    },
    isPaid: false,
    aiMessage: '',
    experienceRange: [] as string[],
    experienceIndex: 0,
    tempExperienceIndex: [0], // picker-view value is an array
    showExperiencePicker: false,
    
    // 校验状态: 'valid' | 'invalid' | ''
    validation: {
      title: '',
      experience: '',
      content: '',
      aiMessage: 'valid' // 默认有效
    },
    shakeField: '', // 触发抖动的字段名
    isReady: false
  },
  
  isSubmitting: false,

  onLoad(options: any) {
    this.initUIStrings();
    
    // attach language-aware behavior
    ;(this as any)._langDetach = attachLanguageAware(this, {
      onLanguageRevive: () => {
        this.initUIStrings()
      },
    })

    // attach theme-aware behavior
    ;(this as any)._themeDetach = attachThemeAware(this, {
      onThemeChange: () => {
        this.initUIStrings()
      },
    })

    // Check for draft or passed data
    console.log('[ResumeGenerator] onLoad Options:', options); // Debug
    if (options && (options.title || options.from === 'upload' || options.from === 'screenshot' || options.content)) {
        let data = options;
        
        // If from upload or legacy screenshot, try to retrieve full data from globalData (to avoid URL length limits)
        if (options.from === 'upload' || options.from === 'screenshot') {
            const app = getApp<any>();
            console.log('[ResumeGenerator] Global Data Prefilled:', app.globalData._prefilledJob); // Debug
            
            if (app.globalData._prefilledJob) {
                const job = app.globalData._prefilledJob;
                data = {
                    ...options,
                    title: job.title,
                    content: job.description, 
                    years: job.experience
                };
                console.log('[ResumeGenerator] Merged Data:', data); // Debug
                // Clear it after retrieving to avoid stale data later
                app.globalData._prefilledJob = null;
            } else {
                console.warn('[ResumeGenerator] Failed to find prefilled job data in globalData'); // Debug
            }
        }

        this.initializeWithData(data);
    } else if (Object.keys(options).length === 0) {
      // Try EventChannel (usually from components)
      const eventChannel = this.getOpenerEventChannel();
      if (eventChannel && typeof eventChannel.on === 'function') {
        eventChannel.on('acceptDataFromOpenerPage', (data: any) => {
            if (data) {
                this.initializeWithData(data);
            }
        });
      } else {
         this.checkDraft();
      }
    } else {
        this.checkDraft();
    }
  },

  initializeWithData(options: any) {
      const safeDecode = (str: any) => {
        if (!str) return '';
        try {
          // If already decoded, decodeURIComponent might throw if it contains %
          // But usually we want to ensure it's decoded once.
          return decodeURIComponent(str);
        } catch (e) {
          return str;
        }
      };

      let experience = safeDecode(options.experience);
      // Handle direct years number passing (from EventChannel or processed options)
      if (!experience && options.years !== undefined && options.years !== null) {
        const yearSuffix = t('resume.year') || '年';
        const y = parseInt(options.years, 10);
        if (!isNaN(y)) {
          experience = `${y}${yearSuffix}`;
        }
      }

      this.setData({
        'targetJob.title': safeDecode(options.title),
        'targetJob.content': safeDecode(options.content),
        'targetJob.experience': experience,
        isPaid: options.from === 'upload' || options.from === 'screenshot',
        parsedData: (options.from === 'upload' || options.from === 'screenshot') ? { from: 'upload' } : null
      }, () => {
        // 如果有传入经验，尝试匹配 picker index
        if (this.data.targetJob.experience) {
          let range = this.data.experienceRange;
          // Fallback if range not yet set by async initUIStrings
          if (!range || range.length === 0) {
             const yearSuffix = t('resume.year') || '年';
             range = Array.from({ length: 50 }, (_, i) => `${i + 1}${yearSuffix}`);
          }

          const idx = range.findIndex(item => item === this.data.targetJob.experience);
          if (idx >= 0) {
            this.setData({ 
              experienceIndex: idx,
              tempExperienceIndex: [idx]
            });
          }
        }
        this.validateAllFields();
      });
  },

  validateAllFields() {
    ['title', 'experience', 'content', 'aiMessage'].forEach(field => this.validateField(field));
  },

  initUIStrings() {
    const yearSuffix = t('resume.year') || '年';
    this.setData({
      experienceRange: Array.from({ length: 50 }, (_, i) => `${i + 1}${yearSuffix}`),
      'ui.title': t('resume.toolTextTitle') || '文字生成简历',
      'ui.subtitle': t('resume.tips') || '完善以下信息，让 AI 更好地为您生成简历',
      'ui.jobTitle': t('resume.jobTitle') || '职位名称',
      'ui.jobTitlePlaceholder': t('resume.jobTitlePlaceholder') || '请输入职位名称',
      'ui.workYears': t('resume.targetExperience') || '目标岗位年限',
      'ui.workYearsPlaceholder': t('resume.selectExperience') || '请选择年限',
      'ui.jobDescription': t('resume.jobDescription') || '职位描述',
      'ui.jdPlaceholder': t('resume.jdPlaceholder') || '粘贴职位描述或手动输入...',
      'ui.aiMessageLabel': t('resume.aiMessageLabel') || '想对 AI 说的话',
      'ui.aiMessagePlaceholder': t('resume.aiMessagePlaceholder') || '给 AI 的提示词...',
      'ui.syncFromProfile': t('resume.syncFromProfile') || '与简历资料同步',
      'ui.confirmGenerate': t('resume.confirmGenerate') || '生成简历',
      'ui.confirm': t('resume.confirm') || '确定',
      'ui.cursorColor': themeManager.getPrimaryColor(),
      aiMessage: this.data.aiMessage || t('resume.aiMessageDefault')
    });
  },

  onFieldChange(e: any) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value

    if (field === 'aiMessage') {
      this.setData({ aiMessage: value }, () => {
        this.validateField('aiMessage');
        this.saveDraft();
      });
    } else {
      this.setData({
        [`targetJob.${field}`]: value
      }, () => {
        this.validateField(field);
        this.saveDraft();
      });
    }
  },

  openExperiencePicker() {
    this.setData({ 
      showExperiencePicker: true,
      tempExperienceIndex: [this.data.experienceIndex]
    });
  },

  closeExperiencePicker() {
    this.setData({ showExperiencePicker: false });
  },

  onExperiencePickerChange(e: any) {
    this.setData({ tempExperienceIndex: e.detail.value });
  },

  onExperienceConfirm() {
    const index = this.data.tempExperienceIndex[0];
    const value = this.data.experienceRange[index];
    this.setData({
      experienceIndex: index,
      'targetJob.experience': value,
      showExperiencePicker: false
    }, () => {
      this.validateField('experience');
      this.saveDraft();
    });
  },

  onExperienceChange() {
    // Deprecated by custom picker confirm
  },

  onSyncResume() {
    const app = getApp<any>();
    const user = app.globalData?.user;
    if (!user || !user.resume_profile) return;

    const lang = normalizeLanguage(app.globalData.language);
    const profile = user.resume_profile;
    
    // Choose which profile to sync from based on current UI language
    const isEn = (lang === 'English' || lang === 'AIEnglish');
    const primary = isEn ? profile.en : profile.zh;
    const secondary = isEn ? profile.zh : profile.en;

    // Use primary language aiMessage if available, otherwise fallback to the other one
    const content = (primary && primary.aiMessage && primary.aiMessage.trim())
      ? primary.aiMessage
      : (secondary && secondary.aiMessage && secondary.aiMessage.trim())
        ? secondary.aiMessage
        : null;

    if (content) {
      this.setData({ aiMessage: content }, () => {
        this.validateField('aiMessage');
        ui.showToast(t('resume.syncedMessage') || '已同步简历提示词');
      });
    } else {
        // No content found in profile, as per requirement: "无需改动" (no change)
    }
  },

  validateField(field: string) {
    const { targetJob, aiMessage } = this.data;
    let isValid = false;
    let isInvalid = false;

    // Helper to calculate length (Chinese=1, English=0.5 based on requirements)
    // Req: Title >= 2 CN (4 EN), no uncommon special chars, NOT all numbers/punc
    // Req: Content >= 10 CN (20 EN), NOT all numbers/punc
    // Req: AI Message <= 500 CN (1000 EN), NOT all numbers/punc
    const getLen = (str: string) => {
      let len = 0;
      for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 127 || str.charCodeAt(i) === 94) {
          len += 1;
        } else {
          len += 0.5;
        }
      }
      return len;
    };

    const isNotEmptyOrPunc = (str: string) => {
      // Must contain at least one Chinese character or English letter
      return /[a-zA-Z\u4e00-\u9fa5]/.test(str);
    };

    if (field === 'title') {
      const len = getLen(targetJob.title);
      // Removed strict regex check to allow common titles like ".NET" or "C++" 
      // Just ensure it's not super weird and has content
      const isCommonChars = true; // /^[a-zA-Z0-9\u4e00-\u9fa5\s\-\(\)\/\.\+&]+$/.test(targetJob.title); 
      if (len >= 2 && isNotEmptyOrPunc(targetJob.title)) isValid = true;
      
      if (len > 50 || (targetJob.title.length > 0 && !isNotEmptyOrPunc(targetJob.title))) isInvalid = true;
    } 
    else if (field === 'experience') {
      // Experience: Selected
      if (targetJob.experience) isValid = true;
    } 
    else if (field === 'content') {
      const len = getLen(targetJob.content);
      if (len >= 10 && isNotEmptyOrPunc(targetJob.content)) isValid = true;
      // Increased limit to 10000 (roughly 20k English chars) as per requirement
      if (len > 10000 || (targetJob.content.length > 0 && len >= 10 && !isNotEmptyOrPunc(targetJob.content))) isInvalid = true;
    }  
    else if (field === 'aiMessage') {
      const len = getLen(aiMessage);
      if (len <= 500 && (aiMessage.length === 0 || isNotEmptyOrPunc(aiMessage))) isValid = true;
      else isInvalid = true;
    }

    const validationState = isInvalid ? 'invalid' : (isValid ? 'valid' : '');
    
    this.setData({
      [`validation.${field}`]: validationState
    }, () => this.checkFormValidity());
  },

  checkFormValidity() {
    const { validation } = this.data;
    const isReady = validation.title === 'valid' && 
                    validation.experience === 'valid' && 
                    validation.content === 'valid' && 
                    validation.aiMessage === 'valid';
    
    if (isReady !== this.data.isReady) {
      this.setData({ isReady });
    }
  },

  onDisabledTap() {
    // Find first invalid field
    const { validation } = this.data;
    const fields = ['title', 'experience', 'content', 'aiMessage'];
    let firstInvalid = fields.find(f => validation[f as keyof typeof validation] !== 'valid');

    if (firstInvalid) {
      // Trigger shake
      this.setData({ shakeField: firstInvalid });
      // Clear shake after animation
      setTimeout(() => {
        this.setData({ shakeField: '' });
      }, 300);
      
      // Haptic feedback
      wx.vibrateShort({ type: 'medium' });
    }
  },

  handleSubmit() {
    // Quota Check
    const app = getApp<any>();
    const user = app.globalData.user;
    const level = user?.membership?.level || 0;
    const points = user?.membership?.points || 0;

    if (level <= 0 && points <= 0) {
        ui.showModal({
        title: t('membership.quotaExceededTitle') || '额度不足',
            content: t('membership.quotaExceededContent'),
            confirmText: t('membership.viewDetails'),
            success: (res) => {
                if (res.confirm) {
                    wx.navigateTo({ url: '/pages/membership/index' });
                }
            }
        });
        return;
    }

    if (this.data.isReady && !this.isSubmitting) {
      this.isSubmitting = true;
      this.clearDraft();
      
      wx.vibrateShort({ type: 'medium' });

      const { targetJob, aiMessage } = this.data
    const mockJobData = {
      _id: `CUSTOM_${Date.now()}`,
      _is_custom: true,
      title: targetJob.title,
      title_chinese: targetJob.title,
      title_english: targetJob.title,
      description: targetJob.content,
      experience: targetJob.experience,
      ai_message: aiMessage,
      source_name: '自定义',
      createdAt: new Date().toISOString()
    }

    const startGeneration = async () => {
        // Step 1: Analyze Input Language
        const detectedLang = ResumeDecision.analyzeTextLanguage(targetJob.content);
        
        // Step 2: Ask User Decision
        const targetLang = await ResumeDecision.decide('GENERATE_TEXT', detectedLang);
        
        if (!targetLang) {
            this.isSubmitting = false; 
            return;
        }

        // Pass explicit language param to backend
        const payloadWithLang = {
            ...mockJobData,
            generation_language: targetLang
        };

        const result = await requestGenerateResume(payloadWithLang, {
            isPaid: this.data.isPaid,
          showSuccessModal: true,
          waitForCompletion: false,
            skipLangSelect: true,
            preferredLang: targetLang === 'chinese' ? 'chinese' : 'english'
            // We handle finish manually
        });

        if (typeof result === 'string' || result === true) {
          this.clearDraft();
          this.isSubmitting = false;
          return;
        }

        ui.hideLoading();
        this.isSubmitting = false;
    };

    startGeneration();
    }
  },

  showMissingFieldsToast() {
    // Deprecated by onDisabledTap logic
  },

  handleError(err: any) {
    this.isSubmitting = false;
    ui.showModal({
      title: t('resume.errorShort') || '提示',
      content: (err && err.message) || t('resume.saveFailed') || '系统繁忙，请重试',
      showCancel: false
    });
  },

  onHide() {
    this.saveDraft();
  },

  onUnload() {
    this.saveDraft();
    
    // Detach listeners
    const fn = (this as any)._langDetach
    if (typeof fn === 'function') fn()
    ;(this as any)._langDetach = null

    const themeFn = (this as any)._themeDetach
    if (typeof themeFn === 'function') themeFn()
    ;(this as any)._themeDetach = null
  },

  checkDraft() {
    const draft = wx.getStorageSync(DRAFT_STORAGE_KEY);
    if (draft && (draft.targetJob.title || draft.targetJob.content || draft.aiMessage !== (t('resume.aiMessageDefault') || ''))) {
      ui.showModal({
        title: t('resume.errorShort') || '提示',
        content: t('resume.draftContinue') || '上次有没写完的岗位信息，是否继续填写？',
        cancelText: t('resume.clear') || '清除',
        confirmText: t('resume.continue') || '继续',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              targetJob: draft.targetJob,
              aiMessage: draft.aiMessage,
              experienceIndex: draft.experienceIndex || 0,
              tempExperienceIndex: [draft.experienceIndex || 0]
            }, () => this.validateAllFields());
          } else {
            this.clearDraft();
          }
        }
      });
    }
  },

  saveDraft() {
    if (this.isSubmitting) return;

    // Only save if there's actual content or non-default AI message
    const { targetJob, aiMessage, experienceIndex } = this.data;
    if (targetJob.title || targetJob.content || aiMessage !== (t('resume.aiMessageDefault') || '')) {
      wx.setStorageSync(DRAFT_STORAGE_KEY, {
        targetJob,
        aiMessage,
        experienceIndex
      });
    }
  },

  clearDraft() {
    wx.removeStorageSync(DRAFT_STORAGE_KEY);
  }
})



