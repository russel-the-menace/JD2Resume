import { normalizeLanguage, type AppLanguage } from './utils/i18n/index'
import { bootManager, type BootStatus } from './utils/bootManager'
import { themeManager } from './utils/themeManager'
import { request, callApi, performLogin } from './utils/request'
import { checkIsAuthed } from './utils/util'
import { startBackgroundTaskCheck } from './utils/resume'
import { cacheImage } from './utils/fileCache'
import { StatusCode } from './utils/statusCodes'

App<IAppOption>({
  globalData: {
    user: null as any,
    userPromise: null,
    bootStatus: 'loading' as BootStatus,
    theme: 'light' as 'light' | 'dark',
    language: 'AIChinese' as AppLanguage,
    _langListeners: new Set<any>(),
    _userListeners: new Set<any>(),
    _splashAnimated: false,
    tabSelected: 1,
    _pageData: {
      jobData: null,
      filterValue: null,
      filterTabIndex: 0,
      filterResult: null,
      filterAction: null,
    },
    systemConfig: {
      isBeta: true,
      isMaintenance: false,
    },
    prefetchedData: {
      publicJobs: null,
      featuredJobs: null,
      memberSchemes: null,
      timestamp: 0,
    },
    _prefilledJob: null as any,
  },

  onLaunch() {
    console.log('[App] onLaunch');
    
    // Initialize Theme Manager early to capture launch theme
    themeManager.init();
    
    wx.onError((err) => {
      console.error('[Global Error]', err);
    });

    bootManager.onStatusChange((status) => {
      this.globalData.bootStatus = status;
    });

    this.bootstrap().catch((err: any) => {
      console.error('[App] Bootstrap crash:', err);
    });
  },

  async bootstrap() {
    console.log('[App] Bootstrap sequence started...');
    this.initNetworkListener();

    const coreTasks = [
      this.refreshUser(),
      this.refreshSystemConfig(),
      this.preFetchJobs(),
    ];

    await bootManager.start(coreTasks);

    const user = this.globalData.user;
    const currentStatus = bootManager.getStatus();
    
    if (currentStatus === 'loading' || currentStatus === 'success') {
        if (checkIsAuthed(user)) {
            bootManager.setStatus('success');
            // Login success, check for background tasks (Resume generation, etc.)
            startBackgroundTaskCheck();
        } else if (this.globalData.bootStatus !== 'server-down' && this.globalData.bootStatus !== 'no-network') {
            bootManager.setStatus('unauthorized');
        } else if (currentStatus === 'loading') {
            // 如果加载完成但没有用户数据，判定为未授权
            bootManager.setStatus('unauthorized'); 
        }
    }

    this.applyLanguage();
    console.log('[App] Bootstrap complete.');
  },

  initNetworkListener() {
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          bootManager.setStatus('no-network');
        }
      }
    });

    wx.onNetworkStatusChange((res) => {
      if (res.isConnected && bootManager.getStatus() === 'no-network') {
        bootManager.setStatus('loading');
        this.refreshUser().then(() => {
          if (checkIsAuthed(this.globalData.user)) {
            bootManager.setStatus('success');
          }
        }).catch(() => {});
      }
    });
  },

  async refreshSystemConfig() {
    try {
      const res: any = await request({
        url: '/system-config',
        method: 'POST',
        data: {}
      })
      const config = res?.result || res
      this.globalData.systemConfig = config || { isBeta: true, isMaintenance: false }
    } catch (err) {
      this.globalData.systemConfig = { isBeta: true, isMaintenance: false }
    }
  },

  async preFetchJobs() {
    try {
      const [publicRes, featuredRes, schemesRes] = await Promise.all([
        callApi<any>('getPublicJobList', { page: 1, pageSize: 15 }),
        callApi<any>('getFeaturedJobList', { page: 1, pageSize: 15 }),
        callApi<any>('getMemberSchemes', {})
      ]);

      this.globalData.prefetchedData = {
        publicJobs: publicRes?.result?.jobs || [],
        featuredJobs: featuredRes?.result?.jobs || [],
        memberSchemes: schemesRes?.result?.schemes || [],
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('[App] Pre-fetch failed:', err);
    }
  },

  async refreshUser() {
    try {
      // 1. 尝试从缓存加载用户，实现"秒开"且避免意外展示登录墙
      try {
        const cachedUser = wx.getStorageSync('user_cache');
        if (cachedUser) {
          console.log('[App] Loaded user from cache:', cachedUser.phone || cachedUser.phoneNumber);
          this.globalData.user = cachedUser;
          
          // 尝试使用本地缓存的头像
          if (cachedUser.avatar) {
            cacheImage(cachedUser.avatar).then(localPath => {
              // 只有当路径真正改变（变成更快的本地路径）时才触发更新
              if (this.globalData.user && this.globalData.user.avatar !== localPath) {
                 this.globalData.user.avatar = localPath;
                 this.notifyUserListeners(this.globalData.user);
              }
            }).catch(e => console.error('[App] Avatar cache failed:', e));
          }

          // 此时虽然已经 loaded，但为了数据新鲜度，继续走网络请求（静默刷新）
        }
      } catch (e) {
        console.error('[App] Failed to load user cache:', e);
      }

      let openid = wx.getStorageSync('user_openid');
      if (!openid) {
        console.log('[App] No openid in storage, attempting silent login...');
        try {
          openid = await performLogin();
          console.log('[App] Silent login successful, openid:', openid);
        } catch (e) {
          console.error('[App] Silent login failed:', e);
        }
      }

      if (!openid) {
        console.log('[App] No openid available after attempt');
        return;
      }

      console.log('[App] Calling loginByOpenid with:', openid);
      const res = await callApi<any>('loginByOpenid', { openid });
      
      if (res.success && res.result && res.result.user) {
        const responseData = res.result;
        console.log('[App] User refreshed successfully:', responseData.user.phone || responseData.user.phoneNumber);
        this.globalData.user = responseData.user;

        // 尝试预缓存并更新头像为本地路径
        if (responseData.user.avatar) {
             cacheImage(responseData.user.avatar).then(localPath => {
                 if (this.globalData.user && this.globalData.user._id === responseData.user._id) {
                     this.globalData.user.avatar = localPath;
                     this.notifyUserListeners(this.globalData.user);
                 }
             }).catch(e => console.error('[App] Live avatar cache failed:', e));
        }
        
        // Sync language from user profile
        if (responseData.user.language) {
          this.globalData.language = normalizeLanguage(responseData.user.language);
          this.notifyLanguageListeners(this.globalData.language);
        }

        this.notifyUserListeners(this.globalData.user);

        if (responseData.token) {
          wx.setStorageSync('token', responseData.token);
        }
        
        // 关键：持久化缓存用户信息，防止无网或 API 异常时应用进入登录墙
        wx.setStorageSync('user_cache', this.globalData.user);

        return this.globalData.user;
      } else {
        console.warn('[App] loginByOpenid failed or no user:', res.message || 'Unknown error');
        
        // 如果后端明确返回成功但没有用户 (说明被删号或未注册)，或者 Token 失效
        // 此时必须清除本地僵尸缓存，否则用户永远卡在"看似已登录但实际无权限"的状态
        if (this.globalData.user && !res.success) {
           // 网络正常但返回失败（如数据库查无此人），必须清除缓存
           console.warn('[App] Local user exists but remote validation failed. Clearing local session.');
           this.globalData.user = null;
           wx.removeStorageSync('user_cache');
           wx.removeStorageSync('token');
           // 通知 BootManager 状态变为 unauthorized，触发登录墙展示
           bootManager.setStatus('unauthorized');
        }
        
        return null;
      }
    } catch (err: any) {
      // 关键修正：识别"用户不存在"的业务错误 (404)
      // 如果后端明确返回 404，说明此 OpenID 无效或用户被删，必须强制登出
      // request.ts 会将非 2xx 响应包装为 Error 对象并抛出，statusCode 挂载在 error 对象上
      // 兼容后端逻辑：返回的是 404 状态码，且 code 是 USER_NOT_FOUND (40103)
      if (err?.statusCode === 404 || err?.data?.code === StatusCode.USER_NOT_FOUND) { 
          console.warn('[App] Remote confirmed user not found (404). Clearing local session.');
          this.globalData.user = null;
          wx.removeStorageSync('user_cache');
          wx.removeStorageSync('token');
          bootManager.setStatus('unauthorized');
          return null;
      }

      console.error('[App] refreshUser fatal error:', err);
      // 网络断开，保留现有本地登录态，不强制登出
      if (err?.errMsg?.includes('request:fail') || err?.errMsg === 'Network Error') { 
          // 弱网或服务器宕机，用户继续使用本地缓存，不触发 unauthorized
          console.log('[App] Network failed, running in offline mode with cached user.');
          return this.globalData.user;
      }
      return this.globalData.user;
    }
  },

  applyLanguage() {
    // Navigation bar titles are explicitly disabled by user request
  },

  async setLanguage(lang: AppLanguage) {
    const normalized = normalizeLanguage(lang);
    this.globalData.language = normalized;
    if (this.globalData.user) {
      this.globalData.user.language = normalized;
      await callApi('updateUserLanguage', { language: normalized });
    }
    this.notifyLanguageListeners(normalized);
    this.applyLanguage();
  },

  onLanguageChange(fn: (lang: AppLanguage) => void) {
    this.globalData._langListeners.add(fn);
  },

  offLanguageChange(fn: (lang: AppLanguage) => void) {
    this.globalData._langListeners.delete(fn);
  },

  notifyLanguageListeners(lang: AppLanguage) {
    this.globalData._langListeners.forEach((fn: any) => fn(lang));
  },

  notifyUserListeners(user: any) {
    this.globalData._userListeners.forEach((fn: any) => fn(user));
  },

  onUserChange(fn: (user: any) => void) {
    this.globalData._userListeners.add(fn);
  },

  offUserChange(fn: (user: any) => void) {
    this.globalData._userListeners.delete(fn);
  }
})
