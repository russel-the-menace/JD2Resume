// miniprogram/utils/resume.ts
import { ui } from './ui'
import { callApi } from './request'
import { normalizeLanguage, t, AppLanguage } from './i18n/index'
import { StatusCode } from './statusCodes'

export interface ResumeGenerateOptions {
  onStart?: () => void
  onFinish?: (success: boolean) => void
  onCancel?: () => void
  showSuccessModal?: boolean
  waitForCompletion?: boolean
  isPaid?: boolean
  overrideProfile?: any // NEW: Allow passing an already extracted profile
  skipLangSelect?: boolean
  preferredLang?: 'chinese' | 'english'
}

/**
 * 统一处理生成 AI 简历的业务流：刷新用户、校验完整度、构造数据、调用 API、处理异常、展示成功弹窗
 */
export async function requestGenerateResume(jobData: any, options: ResumeGenerateOptions = {}): Promise<string | boolean | void> {
  const app = getApp<any>()
  
  if (options.onStart) options.onStart()

  try {
    // 1. 获取用户信息（如果提供了 overrideProfile，我们仍然刷新用户以获取头像等基础资料）
    const user = await app.refreshUser()
    if (!user) {
      if (options.onFinish) options.onFinish(false)
      ui.showError('获取用户信息失败，请重试')
      return 
    }

    const profile = options.overrideProfile || user.resume_profile || {}
    const interfaceLang = normalizeLanguage(app.globalData.language)

    // 2. 语言选择对话框
    let selectContent = t('resume.generateResumeContent', interfaceLang)
    let isEnglishStatus = jobData?.is_english

    if (jobData && jobData._is_custom) {
      // 首页手动输入模式，判断 JD 语言含量
      const jd = jobData.description || ''
      const englishChars = jd.match(/[a-zA-Z]/g) || []
      const totalLen = jd.length || 1
      const isActuallyEnglish = (englishChars.length / totalLen) > 0.6
      
      isEnglishStatus = isActuallyEnglish ? 1 : 0
      selectContent = isActuallyEnglish 
        ? t('resume.jobMayBeEnglish', interfaceLang) 
        : t('resume.jobMayBeChinese', interfaceLang)
    } else if (jobData && typeof jobData.is_english !== 'undefined') {
      isEnglishStatus = jobData.is_english === 1 ? 1 : 0
      selectContent = jobData.is_english === 1 
        ? t('resume.jobIsEnglish', interfaceLang) 
        : t('resume.jobIsChinese', interfaceLang)
    } else if (options.overrideProfile) {
      // 简历上传/润色模式：根据 AI 解析出的简历语言判断
      const isEnglishDetected = options.overrideProfile.language === 'english';
      isEnglishStatus = isEnglishDetected ? 1 : 0;
      selectContent = isEnglishDetected
        ? t('resume.resumeIsEnglish', interfaceLang)
        : t('resume.resumeIsChinese', interfaceLang)
    }

    if (options.skipLangSelect) {
      // Direct execution without modal
      // We wrap the logic in a self-executing async function or just call the handler if we extracted it.
      // Since extraction is hard with 'replace_string', we will just mock the modal response.
      // But we can't mock the modal response easily here.
      // So we will trigger the success callback logic directly.
      // Wait, let's just make the modal OPTIONAL.
    }

    return new Promise((resolve) => {
      const runGeneration = async (chosenIsChinese: boolean) => {
          // --- NEW CONTENT CHECK & LOADING LOGIC ---
          ui.showLoading(t('resume.aiChecking', interfaceLang), true);
          const startTime = Date.now();

          try {
            // Check all relevant text fields
            const contentToCheck = [
              jobData.title,
              jobData.description,
              jobData.ai_message
            ].filter(Boolean);

            const checkRes = await callApi('check-content', { content: contentToCheck });

            if (checkRes.code !== StatusCode.SUCCESS) {
              ui.hideLoading();
              ui.showError(checkRes.message || '内容包含敏感词汇，请修改后重试');
              if (options.onFinish) options.onFinish(false);
              resolve(false)
              return;
            }
          } catch (e) {
            console.error('[ResumeService] Content check failed:', e);
          }

          // --- RE-RESTORE 2.5S DELAY ---
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, 2500 - elapsedTime);
          if (remainingTime > 0) {
            await new Promise(resolveTime => setTimeout(resolveTime, remainingTime));
          }
          
          ui.showLoading(t('resume.generating', interfaceLang), true);
          
          const completeness = chosenIsChinese 
            ? (profile.zh?.completeness || { level: 0 }) 
            : (profile.en?.completeness || { level: 0 });

          if (completeness.level < 1) {
            ui.hideLoading();
            ui.showModal({
              title: t('jobs.basicInfoIncompleteTitle', interfaceLang),
              content: t('jobs.profileIncompleteContent', interfaceLang),
              confirmText: t('jobs.profileIncompleteConfirm', interfaceLang),
              cancelText: t('jobs.generateAnyway', interfaceLang),
              success: async (modalRes) => {
                if (modalRes.confirm) {
                  wx.navigateTo({ url: '/pages/resume-profile/index' })
                  if (options.onCancel) options.onCancel()
                  if (options.onFinish) options.onFinish(false)
                  resolve(false)
                } else if (modalRes.cancel) {
                  await executeGenerateInternal(chosenIsChinese);
                }
              }
            });
          } else {
             await executeGenerateInternal(chosenIsChinese);
          }
      };

      const executeGenerateInternal = async (chosenIsChinese: boolean) => {
          const result = await doGenerate(user, profile, jobData, chosenIsChinese, interfaceLang, options);
          if (result && !options.waitForCompletion && options.showSuccessModal === false) {
             ui.hideLoading(); // Hide loading if not showing modal and not waiting
          }
          resolve(result);
      };

      if (options.skipLangSelect) {
          runGeneration(options.preferredLang === 'chinese');
          return;
      }

      ui.showModal({
        title: t('resume.generateResumeTitle', interfaceLang),
        content: selectContent,
        confirmText: t('resume.langChinese', interfaceLang),
        cancelText: t('resume.langEnglish', interfaceLang),
        emphasis: isEnglishStatus === 1 ? 'left' : 'right',
        showCancel: true,
        success: async (selectRes: any) => {
           if (selectRes && selectRes.isMask) {
              if (options.onCancel) options.onCancel();
              resolve(undefined);
              return;
           }
           if (!selectRes || (!selectRes.confirm && !selectRes.cancel)) {
              if (options.onCancel) options.onCancel();
              resolve(undefined);
              return;
           }
           runGeneration(selectRes.confirm);
        }
      });
    });


  } catch (err) {
    console.error('[ResumeService] Generation flow failed:', err)
    if (options.onFinish) options.onFinish(false)
    const app = getApp<any>()
    const lang = normalizeLanguage(app.globalData.language)
    ui.showError(t('jobs.checkFailed', lang))
    return false
  }
}

/**
 * 执行实际的生成请求
 */
async function doGenerate(user: any, profile: any, job: any, isChineseEnv: boolean, lang: AppLanguage, options: ResumeGenerateOptions): Promise<string | boolean> {
  try {
    // 构造 AI 生成所需的 Profile 数据，合并顶层字段与当前语言偏好
    let aiProfile: any = {
      ...profile,
      gender: user.gender,
      photo: user.avatar || profile.photo
    }
    
    const currentLangProfile = isChineseEnv ? (profile.zh || {}) : (profile.en || {})
    
    aiProfile = {
      ...aiProfile,
      ...currentLangProfile,
      // 确保数组字段存在
      workExperiences: currentLangProfile.workExperiences || profile.workExperiences || [],
      educations: currentLangProfile.educations || profile.educations || [],
      skills: currentLangProfile.skills || profile.skills || [],
      certificates: currentLangProfile.certificates || profile.certificates || [],
      zh: profile.zh,
      en: profile.en
    }

    // 规则：
    // 1) 文字生成简历（_is_custom）优先使用页面输入框的 ai_message；
    // 2) 岗位列表生成保持使用数据库中的 resume_profile.aiMessage。
    if (job && job._is_custom && typeof job.ai_message === 'string' && job.ai_message.trim()) {
      aiProfile.aiMessage = job.ai_message.trim();
    }

    const res = await callApi<any>('generate', {
      jobId: job._id,
      openid: user.openid,
      resume_profile: aiProfile,
      job_data: job,
      is_paid: options.isPaid || false,
      language: isChineseEnv ? 'chinese' : 'english'
    })

    if (res.success && res.result?.task_id) {
      if (options.onFinish) options.onFinish(true)
      
      if (options.showSuccessModal !== false) {
        // 展示统一的成功提效模态框
        showGenerationSuccessModal()
      }
      return res.result.task_id;
    } else {
      throw new Error('Service response error')
    }
  } catch (err: any) {
    console.error('[ResumeService] API call failed:', err)
    if (options.onFinish) options.onFinish(false)
    handleGenerateError(err, lang)
    return false;
  }
}

/**
 * 成功触发生成后的全局统一提示
 * @deprecated Use ui.showGenerationSuccessModal()
 */
export function showGenerationSuccessModal() {
  ui.hideLoading();
  ui.showGenerationSuccessModal();
}

/**
 * 统一处理生成过程中的业务错误（配额、并发等）
 */
function handleGenerateError(err: any, _lang: string) {
  const isQuotaError = (err?.data?.code === StatusCode.QUOTA_EXHAUSTED) || (err?.statusCode === StatusCode.HTTP_FORBIDDEN) || (err?.data?.error === 'Quota exhausted');
  const isProcessingError = (err?.statusCode === StatusCode.HTTP_CONFLICT) || (err?.data?.message && err.data.message.includes('生成中'));

  if (isProcessingError) {
    ui.showModal({
      title: t('jobs.generatingTitle'),
      content: t('jobs.generatingContent'),
      showCancel: false,
      confirmText: t('jobs.generatingConfirm'),
      isAlert: true
    });
    return;
  }

  if (isQuotaError) {
    ui.showModal({
      title: t('jobs.quotaExhaustedTitle'),
      content: err?.data?.message || t('jobs.quotaExhaustedContent'),
      confirmText: t('jobs.quotaExhaustedConfirm'),
      cancelText: t('jobs.quotaExhaustedCancel'),
      isAlert: true,
      success: (res) => {
        if (res.confirm) {
          const app = getApp<any>();
          app.globalData.tabSelected = 2;
          app.globalData.openMemberHubOnShow = true;
          wx.reLaunch({ url: '/pages/main/index' })
        }
      }
    })
    return;
  }

  ui.showModal({
    title: t('jobs.generateFailedTitle'),
    content: err?.data?.message || err?.message || t('jobs.generateFailedTitle'),
    showCancel: false,
    isAlert: true
  })
}

const pollingTasks = new Set<string>();

/**
 * 轮询特定任务的状态 (Resolve on Finish)
 */
export async function waitForTask(taskId: string): Promise<boolean> {
  const check = async (attempt: number): Promise<boolean> => {
    if (attempt > 60) { // 300s timeout
       return false;
    }

    try {
      const res = await callApi<any>('getGeneratedResumes', { task_id: taskId });
      if (res.success && res.result?.items && res.result.items.length > 0) {
        const task = res.result.items[0];
        if (task.status === 'completed' || task.status === 'success') {
          return true;
        } else if (task.status === 'failed') {
          return false;
        }
      }
    } catch(e) { console.error(e) }

    await new Promise(r => setTimeout(r, 5000));
    return check(attempt + 1);
  };
  
  return check(0);
}

/**
 * 启动后台任务检查逻辑 (用于用户异常退出后的补偿)
 * 会在 App 启动且登录成功后调用一次
 */
export async function startBackgroundTaskCheck() {
  try {
    const app = getApp<any>();
    
    // 1. 查找是否有正在处理中的任务
    const processingRes = await callApi<any>('getGeneratedResumes', { 
      status: 'processing',
      limit: 5 
    });

    if (processingRes.success && processingRes.result?.items) {
      processingRes.result.items.forEach((task: any) => {
        if (!pollingTasks.has(task.task_id)) {
          pollTaskStatus(task.task_id);
        }
      });
    }

    // 2. 补偿机制：查找最近 10 分钟内完成，但用户可能没看到的任务
    const completedRes = await callApi<any>('getGeneratedResumes', {
      status: 'completed',
      limit: 3
    });

    if (completedRes.success && completedRes.result?.items) {
      const now = Date.now();
      completedRes.result.items.forEach((task: any) => {
        const finishTime = new Date(task.completeTime || task.createTime).getTime();
        // 如果是 10 分钟内完成的，且用户通过 App 启动进入，提示一次
        if (now - finishTime < 10 * 60 * 1000) {
          const shownKey = `shown_task_${task.task_id}`;
          if (!wx.getStorageSync(shownKey)) {
            const lang = normalizeLanguage(app.globalData.language);
            ui.showGenerationSuccessModal(
              t('jobs.generateFinishedTitle', lang),
              t('jobs.generateFinishedContent', lang)
            );
            wx.setStorageSync(shownKey, true); // 防止重复弹窗
          }
        }
      });
    }
  } catch (err) {
    console.error('[TaskCheck] Failed to check pending tasks:', err);
  }
}

/**
 * 轮询特定任务的状态
 */
async function pollTaskStatus(taskId: string, attempt = 0) {
  if (attempt > 30) { // 最多轮询 30 次 (约 5 分钟)
    console.warn(`[TaskCheck] Poll timeout for task ${taskId}`);
    pollingTasks.delete(taskId);
    return;
  }

  pollingTasks.add(taskId);

  try {
    const res = await callApi<any>('getGeneratedResumes', { task_id: taskId });
    if (res.success && res.result?.items && res.result.items.length > 0) {
      const task = res.result.items[0];
      if (task.status === 'completed' || task.status === 'success') {
        console.log(`[TaskCheck] Task ${taskId} finished successfully! Showing modal.`);
        pollingTasks.delete(taskId);
        const lang = normalizeLanguage(getApp().globalData.language);
        ui.showGenerationSuccessModal(
          t('jobs.generateFinishedTitle', lang),
          t('jobs.generateFinishedContent', lang)
        );
      } else if (task.status === 'failed') {
        console.warn(`[TaskCheck] Task ${taskId} failed.`);
        pollingTasks.delete(taskId);
      } else {
        // Still processing, wait 10s and retry
        setTimeout(() => pollTaskStatus(taskId, attempt + 1), 10000);
      }
    } else {
      // Not found or success but empty?
      pollingTasks.delete(taskId);
    }
  } catch (err) {
    console.error(`[TaskCheck] Poll error for ${taskId}:`, err);
    // Errored, retry later
    setTimeout(() => pollTaskStatus(taskId, attempt + 1), 15000);
  }
}

/**
 * 检查是否需要触发简历完善度引导
 */
export async function checkResumeOnboarding() {
  const app = getApp<any>();
  const user = app.globalData.user;
  if (!user) return;

  const interfaceLang = normalizeLanguage(app.globalData.language);
  
  // 1. 本地冷冻期检查 (24h)
  const nextNotifyTime = wx.getStorageSync('resume_onboarding_next_time');
  if (nextNotifyTime && Date.now() < nextNotifyTime) {
    return;
  }

  // 2. 简历完成度检查 (只要主语言完成度 <= 45 即可，这里我们以业务偏好为主)
  const profile = user.resume_profile || {};
  const completeness = profile.zh?.completeness?.score || 0;
  if (completeness > 45) return;

  // 3. 数据库冷却期检查 (后台策略)
  const membership = user.membership || {};
  const level = membership.level || 0;
  const lastParseAt = membership.last_resume_parse_at ? new Date(membership.last_resume_parse_at).getTime() : 0;
  const now = Date.now();

  let cooldownMs = 24 * 3600 * 1000;
  if (level === 1) cooldownMs = 12 * 3600 * 1000;
  else if (level === 2 || level === 3) cooldownMs = 4 * 3600 * 1000;
  else if (level >= 4) cooldownMs = 0;

  if (now - lastParseAt < cooldownMs) return;

  // 4. 展示引导弹窗
  ui.showModal({
    title: t('resume.onboardingTitle', interfaceLang),
    content: t('resume.onboardingContent', interfaceLang),
    cancelText: t('resume.onboardingCancel', interfaceLang),
    confirmText: t('resume.onboardingConfirm', interfaceLang),
    success: (res) => {
      if (res.confirm) {
        // 点击立刻体验，触发组件内的上传逻辑
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1] as any;
        const resumeView = currentPage.selectComponent('#resume-view');
        
        // 分支 1: 如果是在主页 (包含 resume-view 组件)
        if (resumeView && resumeView.onSelectFromLocal) {
            if (currentPage.route.indexOf('pages/main/index') !== -1) {
                currentPage.setData({ activeTab: 1 });
                app.globalData.tabSelected = 1;
            }
            resumeView.setData({ onboardingMode: true });
            resumeView.onSelectFromLocal();
        } 
        // 分支 2: 如果是在简历资料详情页 (resume-profile)
        else if (currentPage.route.indexOf('pages/resume-profile/index') !== -1 && currentPage.handleOnboardingStart) {
            currentPage.handleOnboardingStart();
        }
        // 分支 3: 其他页面，回退到主页处理
        else {
            app.globalData.tabSelected = 1;
            app.globalData._triggerResumeImport = true;
            
            if (pages.length > 1) {
                wx.navigateBack({ delta: 1 });
            } else {
                wx.reLaunch({ url: '/pages/main/index' });
            }
        }
      } else if (res.cancel) {
        // 24h 不再提醒
        wx.setStorageSync('resume_onboarding_next_time', Date.now() + 24 * 3600 * 1000);
      }
    }
  });
}

