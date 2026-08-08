// components/resume-view/index.ts

import { ui } from '../../utils/ui'
import { normalizeLanguage, t, type AppLanguage } from '../../utils/i18n/index'
import { attachLanguageAware } from '../../utils/languageAware'
import { attachThemeAware } from '../../utils/themeAware'
import { themeManager } from '../../utils/themeManager'
import { checkIsAuthed } from '../../utils/util'
import { requestGenerateResume, startBackgroundTaskCheck } from '../../utils/resume'
import { ResumeDecision } from '../../utils/resumeDecision'
import { uploadApi } from '../../utils/request'
import { StatusCode } from '../../utils/statusCodes'

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
    uploaderMode: 'resume', 
    uploaderConfig: {},
    isInitializing: true,
    ui: {
      title: t('resume.toolTitle'),
      subtitle: t('resume.toolSubtitle'),
      toolScreenshotTitle: t('resume.toolScreenshotTitle'),
      toolScreenshotDesc: t('resume.toolScreenshotDesc'),
      toolTextTitle: t('resume.toolTextTitle'),
      toolTextDesc: t('resume.toolTextDesc'),
      toolRefineTitle: t('resume.toolRefineTitle'),
      toolRefineDesc: t('resume.toolRefineDesc'),
      refineRefineReminder: t('resume.refineRefineReminder'),
      screenshotReminder: t('resume.screenshotReminder'),
      selectFromChat: t('resume.selectFromChat'),
      uploadFromLocal: t('resume.uploadFromLocal'),
      confirmUpload: t('resume.confirmUpload'),
      previewTip: t('resume.previewTip'),
      cancel: t('resume.cancel')
    },
    showRefineDrawer: false,
    // Preview Modal State
    showPreviewModal: false,
    previewAction: 'refine' as 'refine' | 'screenshot', // Context for the preview modal
    previewType: 'image', // 'image' | 'pdf'
    previewPath: '',
    previewName: '',
    previewSize: 0,
    onboardingMode: false
  },

  lifetimes: {
    attached() {
      ;(this as any)._langDetach = attachLanguageAware(this, {
        onLanguageRevive: (lang: AppLanguage) => {
          this.setData({
            ui: {
              title: t('resume.toolTitle', lang),
              subtitle: t('resume.toolSubtitle', lang),
              toolScreenshotTitle: t('resume.toolScreenshotTitle', lang),
              toolScreenshotDesc: t('resume.toolScreenshotDesc', lang),
              toolTextTitle: t('resume.toolTextTitle', lang),
              toolTextDesc: t('resume.toolTextDesc', lang),
              toolRefineTitle: t('resume.toolRefineTitle', lang),
              toolRefineDesc: t('resume.toolRefineDesc', lang),
              refineRefineReminder: t('resume.refineRefineReminder', lang),
              screenshotReminder: t('resume.screenshotReminder', lang),
              selectFromChat: t('resume.selectFromChat', lang),
              uploadFromLocal: t('resume.uploadFromLocal', lang),
              confirmUpload: t('resume.confirmUpload', lang),
              previewTip: t('resume.previewTip', lang),
              cancel: t('resume.cancel', lang)
            }
          });
        }
      });

      // attach theme-aware behavior
      ;(this as any)._themeDetach = attachThemeAware(this, {
        onThemeChange: () => {
          this.setData({
            'ui.cursorColor': themeManager.getPrimaryColor()
          });
        }
      });
    },
    detached() {
      if (typeof (this as any)._langDetach === 'function') {
        (this as any)._langDetach();
      }
      if (typeof (this as any)._themeDetach === 'function') {
        (this as any)._themeDetach();
      }
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
        const app = getApp<any>();
        
        // 同步全局选中的 Tab 索引，防止闪烁 (简历现在是 Index 1)
        if (app.globalData) {
            app.globalData.tabSelected = 1;

            if (app.globalData._openRefineOnShow) {
                app.globalData._openRefineOnShow = false;
                setTimeout(() => {
                    this.onRefineOldResume();
                }, 300);
            }

            if (app.globalData._triggerResumeImport) {
                app.globalData._triggerResumeImport = false;
                setTimeout(() => {
                    // Just open the drawer, don't auto-pick
                    this.setData({ showRefineDrawer: true });
                }, 300);
            }
        }

        this.syncLoginState();
    },

    async syncLoginState() {
        const app = getApp<any>();
        
        // 等待全局 Auth 完成，防止状态闪烁
        if (app.globalData.userPromise) {
        await app.globalData.userPromise;
        }

        const user = app.globalData.user;
        const isLoggedIn = checkIsAuthed(user);

        this.setData({
        isLoggedIn,
        isInitializing: false
        });
    },

    onLoginSuccess() {
        this.setData({ isLoggedIn: true });
    },

    checkQuota() {
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);
        const user = app.globalData.user;
        // Logic: VIP (level > 0) OR Points > 0
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
            return false;
        }
        return true;
    },

    checkUpdateCooldown() {
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
                confirmText: t('membership.viewDetails'),
                success: (res) => {
                    if (res.confirm) {
                         wx.navigateTo({ url: '/pages/membership/index' });
                    }
                }
            });
            return false;
        }
        return true;
    },

    // Helper to ensure phone is bound before AI actions
    checkPhonePermission() {
        const app = getApp<any>()
        const user = app.globalData.user
      const lang = normalizeLanguage(app.globalData.language)
        
        if (!checkIsAuthed(user)) {
      ui.showModal({
        title: t('me.authRequiredTitle', lang),
        content: t('me.authRequiredContent', lang),
        confirmText: t('me.authRequiredConfirm', lang),
        showCancel: false,
        success: (res) => {
        if (res.confirm) {
          this.setData({ isLoggedIn: false });
        }
        }
      })
        return false
        }
        return true
    },

    openJdDrawer() {
        if (!this.checkPhonePermission()) return
        wx.navigateTo({
            url: '/pages/resume-generator/index'
        });
    },

    // --- Resume Refine Actions ---
    onRefineOldResume() {
        if (!this.checkPhonePermission()) return;
        if (!this.checkQuota()) return;
        
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);

        this.setData({ 
            showRefineDrawer: true,
            uploaderMode: 'resume',
            uploaderConfig: {
                title: t('resume.toolRefineTitle', lang),
                selectFromChat: t('resume.selectFromChat', lang),
                uploadFromLocal: t('resume.uploadFromLocal', lang),
                confirmUpload: t('resume.confirmUpload', lang),
                previewTip: t('resume.previewTip', lang),
                cancel: t('resume.cancel', lang),
                quotaWarning: t('resume.refineRefineReminder', lang)
            }
        });
    },

    closeRefineDrawer() {
        this.setData({ showRefineDrawer: false });
    },

    async onUploaderSuccess(e: any) {
        if (this.data.uploaderMode === 'job') {
            await this.handleJobParseSuccess(e);
        } else {
            await this.handleRefineSuccess(e);
        }
    },

    async handleRefineSuccess(e: any) {
        const { result } = e.detail;
        if (!result) return;
        
        const detectedLang = result.language === 'english' ? 'english' : 'chinese';
        
        // Use Encapsulated Decision Logic
        const targetLang = await ResumeDecision.decide('REFINE', detectedLang);
        
        if (targetLang) {
             this.applyRefineData(result, targetLang as 'chinese' | 'english');
        }
    },

    async handleJobParseSuccess(e: any) {
        const { result } = e.detail;
        if (!result) return;
        
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);
        const { title, years, description } = result;

        // Fallback check on frontend (though backend validation catches most)
        if (!description || (years === undefined || years === null)) {
            ui.showModal({
                title: t('resume.parseJobErrorContent', lang), // "未识别到有效的职位描述..."
                content: t('resume.parseJobErrorContent', lang),
                showCancel: false,
                isAlert: true
            });
            return;
        }
        
        // Navigate to generator with extracted job info
        // We pass it via globalData or url params (url params limited length)
        // Use globalData for complex objects
        app.globalData._prefilledJob = {
            title,
            experience: years,
            description // JD Content
        };
        
        wx.navigateTo({
            url: '/pages/resume-generator/index?from=upload'
        });
        
        // Close drawer? Usually navigation does this automatically or keeps it open?
        // Better to close drawer after navigation starts or success
        this.setData({ showRefineDrawer: false });
    },

    async applyRefineData(result: any, targetLang: 'chinese' | 'english') {

        // Map to internal profile structure using Bilingual blocks
        const profile = result.profile;
        const langCode = targetLang === 'english' ? 'en' : 'zh';
        const extracted = profile[langCode] || profile;

        // Step 2: Construct Dummy Job Data for "Polishing" flow
        const isTargetEn = targetLang === 'english';
        const latestJob = (extracted.experience && extracted.experience[0]) || {};
        const targetTitle = latestJob.role || (extracted.name ? (isTargetEn ? `${extracted.name}'s Resume` : `${extracted.name}的简历`) : (isTargetEn ? "Candidate" : "求职者"));

        const dummyJob = {
            _id: `POLISH_${Date.now()}`,
            title: targetTitle,
            title_chinese: targetTitle,
            title_english: targetTitle,
            description: isTargetEn ? "General Resume Refinement & Enhancement" : "通用简历润色与增强",
            experience: "3 years"
        };

        // Step 3: Map to internal profile structure
        const overrideProfile: any = {
            name: extracted.name || "",
            gender: extracted.gender || "",
            phone: profile.mobile || "", // Use shared top-level field
            email: profile.email || "",   // Use shared top-level field
            wechat: extracted.wechat || "",
            location: extracted.city || "", 
            linkedin: extracted.linkedin || "",
            whatsapp: extracted.whatsapp || "",
            telegram: extracted.telegram || "",
            website: profile.website || "", 
            language: targetLang, 
            is_override: true 
        };

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
        if (profile.zh && profile.en) {
            overrideProfile.zh = {
                educations: mapEdu(profile.zh.education),
                workExperiences: mapExp(profile.zh.experience),
                completeness: { level: 2 }
            };
            overrideProfile.en = {
                educations: mapEdu(profile.en.education),
                workExperiences: mapExp(profile.en.experience),
                completeness: { level: 2 }
            };
            // 姓名、位置及社交平台精准映射
            if (profile.zh.name) overrideProfile.name = profile.zh.name;
            if (profile.en.city) overrideProfile.location = profile.en.city;
            if (profile.zh.wechat) overrideProfile.wechat = profile.zh.wechat;
            if (profile.en.linkedin) overrideProfile.linkedin = profile.en.linkedin;
            if (profile.en.whatsapp) overrideProfile.whatsapp = profile.en.whatsapp;
            if (profile.en.telegram) overrideProfile.telegram = profile.en.telegram;
            if (profile.website) overrideProfile.website = profile.website;
        } else {
            const mappedEducations = mapEdu(extracted.education);
            const mappedExperiences = mapExp(extracted.experience);

            if (targetLang === 'english') {
                overrideProfile.en = { educations: mappedEducations, workExperiences: mappedExperiences, completeness: { level: 2 } };
                // 润色模式下，即使是单语言，也同步一份过去，保证资料库不为空
                overrideProfile.zh = JSON.parse(JSON.stringify(overrideProfile.en));
            } else {
                overrideProfile.zh = { educations: mappedEducations, workExperiences: mappedExperiences, completeness: { level: 2 } };
                overrideProfile.en = JSON.parse(JSON.stringify(overrideProfile.zh));
            }
        }

        // Step 4: Call Unified Generation Flow
        // Note: isPaid is true because /parse already cost quota (handled by backend usually? or we assume parse+generate is one flow?)
        // The previous code said "isPaid: true // Mark as paid because /parse already cost 1pt"
        const genResult = await requestGenerateResume(dummyJob, {
            overrideProfile,
            isPaid: true, 
            showSuccessModal: true,
            waitForCompletion: false
        });

        if (genResult && typeof genResult === 'string') {
                // Generation task started successfully, task_id returned
                startBackgroundTaskCheck();
        }
    },

    onCancelPreview() {
        this.setData({ showPreviewModal: false });
    },

    onConfirmPreview() {
        this.setData({ showPreviewModal: false });
        if (this.data.previewAction === 'screenshot') {
            this.processScreenshotUpload();
        }
    },

    // ... handleUploadError can be removed if only used by Refine? 
    // No, processScreenshotUpload uses it?
    // Let's check processScreenshotUpload again.


    async processOnboardingUpload(path: string, _name: string) {
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);
        ui.showLoading(t('resume.aiChecking', lang));
        
        try {
            // Step 1: Parse and Apply to Profile directly
            const res = await uploadApi<any>({
                url: '/resume/apply-parsed',
                filePath: path,
                name: 'file'
            });

            ui.hideLoading();
            this.setData({ onboardingMode: false });

            if (res.success) {
                // Update global user data
                if (res.result?.user) {
                    app.globalData.user = res.result.user;
                }
                
                ui.showModal({
                    title: t('app.success', lang),
                    content: t('resume.onboardingSuccess', lang),
                    showCancel: false,
                    success: () => {
                        // Refresh current view (profile etc)
                        this.onShowCompat();
                    }
                });
            } else {
                this.handleUploadError(res);
            }
        } catch (err: any) {
            ui.hideLoading();
            this.setData({ onboardingMode: false });
            this.handleUploadError(err);
        }
    },

    handleUploadError(err: any) {
        let errData = err.data;
        if (typeof errData === 'string') {
            try { errData = JSON.parse(errData); } catch(e){}
        }
        const code = (errData && errData.code) || err.code;

        if (err.statusCode === 401) {
            ui.showToast(t('resume.authFailedLogin'));
        } else if (code === StatusCode.QUOTA_EXHAUSTED) {
            ui.showModal({
                title: t('membership.quotaExceededTitle'),
                content: t('membership.quotaExceededContent'),
                showCancel: false,
                isAlert: true
            });
        } else if (code === StatusCode.INVALID_DOCUMENT_CONTENT || code === StatusCode.MISSING_IDENTITY_INFO) {
             ui.showModal({
                    title: t('resume.refineErrorTitle') || '识别受阻',
                    content: t('resume.refineErrorContent'),
                    showCancel: false,
                    isAlert: true
            });
        } else {
            const msg = (errData && errData.message) || err.message || t('app.error');
            ui.showToast(msg);
        }
    },

    openPdfPreview() {
        if (this.data.previewType === 'pdf' && this.data.previewPath) {
             wx.openDocument({
                 filePath: this.data.previewPath,
                 showMenu: true,
                 success: function () {
                    console.log('PDF Preview Open');
                 },
                 fail: (_err) => {
                     ui.showToast(t('resume.cannotPreview'));
                 }
             })
        }
    },

    /* Deprecated: Replaced by Custom Preview Modal
    showConfirmUpload(path: string, fileName: string) {
        ...
    },
    */

    async processUpload(path: string, _name: string) {
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);
        ui.showLoading(t('resume.aiChecking', lang));
        
        try {
            // Step 1: Parse the file to get profile data and detect language
            const data = await uploadApi<any>({
                url: '/resume/parse',
                filePath: path,
                name: 'file'
            });

            if (!data.success || !data.result) {
                ui.hideLoading();
                // Handle Logical Errors
                if (data.code === StatusCode.INVALID_DOCUMENT_CONTENT || data.code === StatusCode.MISSING_IDENTITY_INFO) { 
                    ui.showModal({
                        title: t('resume.refineErrorTitle') || '识别受阻',
                        content: t('resume.refineErrorContent'),
                        showCancel: false,
                        isAlert: true
                    });
                } else if (data.code === StatusCode.QUOTA_EXHAUSTED) {
                    ui.showModal({
                        title: t('membership.quotaExceededTitle') || '额度不足',
                        content: t('membership.quotaExceededContent'),
                        showCancel: false,
                        isAlert: true
                    });
                } else {
                    ui.showToast(data.message || t('app.error'));
                }
                return;
            }

            const extracted = data.result.profile;
            const detectedLang = data.result.language; // 'chinese' or 'english'

            // Step 2: Construct Dummy Job Data for "Polishing" flow
            const latestJob = (extracted.experience && extracted.experience[0]) || {};
            const targetTitle = latestJob.role || (extracted.name ? `${extracted.name}的简历` : "求职者");

            const dummyJob = {
                _id: `POLISH_${Date.now()}`,
                title: targetTitle,
                title_chinese: targetTitle,
                title_english: targetTitle,
                description: "通用简历润色与增强",
                experience: "3 years"
            };

            // Step 3: Map to internal profile structure (aligned with backend expectations)
            const overrideProfile: any = {
                name: extracted.name || "",
                gender: extracted.gender || "",
                phone: extracted.mobile || "",
                email: extracted.email || "",
                wechat: extracted.wechat || "",
                location: extracted.city || "",
                language: detectedLang, // Store detected language
                // Note: requestGenerateResume expects profile.zh or profile.en for completeness check
                // but since we are overriding, we'll bypass the deep completeness check structure
                is_override: true 
            };

            const mappedEducations = (extracted.education || []).map((e: any) => ({
                school: e.school || "",
                degree: e.degree || "",
                major: e.major || "",
                startDate: e.startTime || "",
                endDate: e.endTime || ""
            }));

            const mappedExperiences = (extracted.experience || []).map((e: any) => ({
                company: e.company || "",
                jobTitle: e.role || "",
                workContent: e.description || "",
                startDate: e.startTime || "",
                endDate: e.endTime || ""
            }));

            // Wrap based on detected lang to satisfy requestGenerateResume's completeness check
            if (detectedLang === 'english') {
                overrideProfile.en = { educations: mappedEducations, workExperiences: mappedExperiences, completeness: { level: 2 } };
                overrideProfile.zh = { educations: [], workExperiences: [], completeness: { level: 0 } };
            } else {
                overrideProfile.zh = { educations: mappedEducations, workExperiences: mappedExperiences, completeness: { level: 2 } };
                overrideProfile.en = { educations: [], workExperiences: [], completeness: { level: 0 } };
            }

            ui.hideLoading();

            // Step 4: Ask User for Decision (Scenario 1: Generate from Scan)
            // Use Encapsulated Decision Logic
            const targetLang = await ResumeDecision.decide('GENERATE_SCAN', detectedLang);
            if (!targetLang) return; // User cancelled

            // Override profile language to match decision
            overrideProfile.language = targetLang;

            const result = await requestGenerateResume(dummyJob, {
                overrideProfile,
                isPaid: true, 
                showSuccessModal: true,
                waitForCompletion: false
            });

            if (result && typeof result === 'string') {
                    startBackgroundTaskCheck();
            }

        } catch (err: any) {
            ui.hideLoading();
            console.error('[Upload] Error:', err);
            
            // Parse error data from non-2xx response
            let errData = err.data;
            if (typeof errData === 'string') {
                try { errData = JSON.parse(errData); } catch(e){}
            }
            const code = (errData && errData.code);

            if (err.statusCode === 401) {
                ui.showToast(t('resume.authFailedLogin'));
            } else if (code === StatusCode.QUOTA_EXHAUSTED) { // Quota Exhausted (403)
                ui.showModal({
                    title: t('membership.quotaExceededTitle') || '额度不足',
                    content: t('membership.quotaExceededContent'),
                    showCancel: false,
                    isAlert: true
                });
            } else if (code === StatusCode.INVALID_DOCUMENT_CONTENT || code === StatusCode.MISSING_IDENTITY_INFO) { // Identify/Content Error (403/400)
                 ui.showModal({
                        title: t('resume.refineErrorTitle') || '识别受阻',
                        content: t('resume.refineErrorContent'),
                        showCancel: false,
                        isAlert: true
                });
            } else {
                const msg = (errData && errData.message) || err.message || t('app.error');
                ui.showToast(msg);
            }
        }
    },

    async processScreenshotUpload() {
        const path = this.data.previewPath;
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);
        ui.showLoading(t('resume.aiChecking', lang));

        try {
            const data = await uploadApi<any>({
                url: '/parse-job-screenshot',
                filePath: path,
                name: 'file'
            });

            ui.hideLoading();

            if (data.success && data.result) {
                const { title, years, description } = data.result;

                // Fallback check on frontend (though backend validation catches most)
                if (!description || (years === undefined || years === null)) {
                    ui.showModal({
                        title: t('resume.missingJdOrExperience', lang),
                        content: t('resume.missingJdOrExperienceContent', lang),
                        showCancel: false,
                        isAlert: true
                    });
                    return;
                }
                
                // Navigate to generator with extracted job info
                // We pass it via globalData or url params (url params limited length)
                // Use globalData for complex objects
                app.globalData._prefilledJob = {
                    title,
                    experience: years,
                    description // JD Content
                };
                
                wx.navigateTo({
                    url: '/pages/resume-generator/index?from=upload'
                });

            } else {
                // Handle Logical Errors (200 OK but success=false)
                if (data.code === StatusCode.INVALID_DOCUMENT_CONTENT || data.code === StatusCode.MISSING_IDENTITY_INFO) {
                    ui.showModal({
                        title: t('resume.refineErrorTitle') || '识别受阻',
                        content: t('resume.parseJobErrorContent'),
                        showCancel: false,
                        isAlert: true
                    });
                } else if (data.code === StatusCode.QUOTA_EXHAUSTED) {
                    ui.showModal({
                        title: t('membership.quotaExceededTitle') || '额度不足',
                        content: t('membership.quotaExceededContent'),
                        showCancel: false,
                        isAlert: true
                    });
                } else {
                    const errMsg = data.message || t('resume.parseJobFailed');
                    ui.showToast(errMsg);
                }
            }
        } catch (err: any) {
            ui.hideLoading();
            console.error('[Screenshot Upload] Error:', err);

            let errData = err.data;
            if (typeof errData === 'string') {
                try { errData = JSON.parse(errData); } catch (e) { }
            }
            const code = (errData && errData.code);

            if (err.statusCode === 401) {
                ui.showToast(t('resume.authFailedLogin'));
            } else if (code === StatusCode.QUOTA_EXHAUSTED) {
                ui.showModal({
                    title: t('membership.quotaExceededTitle') || '额度不足',
                    content: t('membership.quotaExceededContent'),
                    showCancel: false,
                    isAlert: true
                });
            } else if (code === StatusCode.INVALID_DOCUMENT_CONTENT || code === StatusCode.MISSING_IDENTITY_INFO) {
                ui.showModal({
                    title: t('resume.refineErrorTitle') || '识别受阻',
                    content: t('resume.parseJobErrorContent'),
                    showCancel: false,
                    isAlert: true
                });
            } else {
                const errMsg = (errData && errData.message) || err.message || t('resume.parseJobFailed');
                ui.showToast(errMsg);
            }
        }
    },

    // --- Template Actions ---
    onTemplateTap() {
        if (!this.checkPhonePermission()) return

        wx.navigateTo({
        url: '/pages/resume-profile/index'
        })
    },

    onTextResumeTap() {
        if (!this.checkPhonePermission()) return
        wx.navigateTo({
            url: '/pages/resume-generator/index'
        })
    },

    // Unified action name matching WXML
    onUploadScreenshot() {
        if (!this.checkPhonePermission()) return;
        if (!this.checkQuota()) return;
        
        const app = getApp<any>();
        const lang = normalizeLanguage(app.globalData.language);

        this.setData({ 
            showRefineDrawer: true,
            uploaderMode: 'job',
            uploaderConfig: {
                title: t('resume.uploadJdTitle', lang),
                selectFromChat: t('resume.selectFromChat', lang),
                uploadFromLocal: t('resume.uploadFromLocal', lang),
                confirmUpload: t('resume.confirmUpload', lang),
                previewTip: t('resume.previewTip', lang),
                cancel: t('resume.cancel', lang),
                quotaWarning: t('resume.screenshotReminder', lang) // Use existing reminder for job
            }
        });
    },

    onImportTap() {
        if (!this.checkPhonePermission()) return
        if (!this.checkUpdateCooldown()) return
        
        // Reuse Refine Drawer for now, but maybe with a different mode if needed
        // For now, allow upload flow
        this.setData({ showRefineDrawer: true })
    }
  }
})
