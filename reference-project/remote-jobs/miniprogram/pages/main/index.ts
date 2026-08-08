
import { bootManager } from '../../utils/bootManager';
import { attachLanguageAware } from '../../utils/languageAware';
import { attachThemeAware } from '../../utils/themeAware'
import { t } from '../../utils/i18n/index';
import { checkIsAuthed } from '../../utils/util';
import { startBackgroundTaskCheck } from '../../utils/resume';

const app = getApp<IAppOption>();

Page({
  data: {
    activeTab: 1, // Default to Resume (Index 1)
    bootStatus: 'loading',
    user: null as any,
    isLoggedIn: false,
    tabLabels: {
      jobs: t('tab.jobs'),
      resume: t('tab.resume'),
      me: t('tab.me')
    }
  },

  onLoad(options: any) {
    console.log('[Main] onLoad', options);
    
    // 监听语言变化，同步更新 Tab Bar 文字
    ;(this as any)._langDetach = attachLanguageAware(this, {
      onLanguageRevive: () => {
        this.setData({
          tabLabels: {
            jobs: t('tab.jobs'),
            resume: t('tab.resume'),
            me: t('tab.me')
          }
        });
      }
    });

    // 监听主题变化 (Industrial-Grade Theme Support)
    ;(this as any)._themeDetach = attachThemeAware(this);

    // 1. Initial Sync
    this.syncState();

    // 2. Listen for boot changes
    bootManager.onStatusChange((_status) => {
      this.syncState();
    });
  },

  onUnload() {
    if (typeof (this as any)._langDetach === 'function') {
      (this as any)._langDetach();
    }
    if (typeof (this as any)._themeDetach === 'function') {
        (this as any)._themeDetach();
    }
  },

  syncState() {
    const app = getApp<IAppOption>();
    const user = app.globalData.user;
    const bootStatus = bootManager.getStatus();
    
    // 兼容多种字段名，确保登录态正确判断
    const hasPhone = checkIsAuthed(user);
    const isLoggedIn = !!(hasPhone && bootStatus === 'success');
    
    console.log('[Main] syncState:', {
        hasPhone,
        bootStatus,
        isLoggedIn,
        userId: (user as any)?._id
    });
    
    this.setData({ 
        bootStatus,
        user,
        activeTab: (app.globalData.tabSelected !== undefined && app.globalData.tabSelected !== null) ? app.globalData.tabSelected : 1,
        isLoggedIn
    });
  },

  onShow() {
    this.syncState();
  },

  onLoginSuccess(_e: any) {
    console.log('[Main] Login Success event caught');
    this.syncState();
    // After login animation/wall, check for background tasks
    startBackgroundTaskCheck();
  },

  onTabChange(e: any) {
    const index = e.detail?.index ?? parseInt(e.currentTarget.dataset.index);
    if (isNaN(index)) return;
    if (this.data.activeTab === index) return;
    
    console.log('[Main] Tab switched to:', index);
    this.setData({ activeTab: index });
    app.globalData.tabSelected = index;
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },

  onShareAppMessage() {
    return {
      title: t('me.appShareTitle'),
      path: '/pages/main/index'
    }
  }
})
