import { t, normalizeLanguage } from './i18n/index'

/**
 * UI 反馈工具类
 * 需要在 WXML 中引入 <ui-feedback id="ui-feedback" />
 */

export const ui = {
  /**
   * 显示加载中
   */
  showLoading(title?: string, mask: boolean = true, maskClosable: boolean = false) {
    const finalTitle = title || t('app.loading')
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;
    if (feedback) {
      feedback.setData({ title: finalTitle, type: 'loading', mask, maskClosable, visible: true });
    } else {
      // 降级使用原生
      // wx.showLoading({ title: finalTitle, mask });
    }
  },

  /**
   * 隐藏加载
   */
  hideLoading() {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;
    if (feedback) {
      feedback.setData({ visible: false });
    } else {
      wx.hideLoading();
    }
  },

  /**   * 显示生成成功的统一弹窗
   */
  showGenerationSuccessModal(customTitle?: string, customContent?: string) {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    
    // 如果用户当前就在已生成的简历页面，不用再弹窗提醒去查看
    if (currentPage && currentPage.route === 'pages/generated-resumes/index') {
      // this.showSuccess(t('jobs.generateRequestSubmittedTitle', normalizeLanguage(getApp<any>().globalData.language)));
      return;
    }

    const app = getApp<any>()
    const lang = normalizeLanguage(app.globalData.language)
    
    this.showModal({
      title: customTitle || t('jobs.generateRequestSubmittedTitle', lang),
      content: customContent || t('jobs.generateRequestSubmittedContent', lang),
      confirmText: t('jobs.generateRequestSubmittedConfirm', lang),
      cancelText: t('jobs.generateRequestSubmittedCancel', lang),
      zIndex: 5000,
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/generated-resumes/index' });
        }
      }
    });
  },

  /**   * 显示成功提示
   */
  showSuccess(title: string, duration: number = 2000) {
    // 自动隐藏任何可能存在的原生 Toast (如剪贴板提示)
    wx.hideToast();
    
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;
    if (feedback) {
      feedback.setData({ title, type: 'success', mask: false, visible: true });
      setTimeout(() => feedback.setData({ visible: false }), duration);
    } else {
      console.warn('UI feedback component not found on current page');
    }
  },

  /**
   * 显示错误提示
   */
  showError(title: string, duration: number = 2500) {
    wx.hideToast();
    
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;
    if (feedback) {
      feedback.setData({ title, type: 'error', mask: false, visible: true });
      setTimeout(() => feedback.setData({ visible: false }), duration);
    } else {
      console.warn('UI feedback component not found on current page');
    }
  },

  /**
   * 显示轻量级提示 (替代原生 showToast)
   */
  showToast(title: string, duration: number = 2000) {
    wx.hideToast();
    
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;
    if (feedback) {
      // type: 'info' 或者不传，在 ui-feedback 中实现为中性样式
      feedback.setData({ title, type: 'info', mask: false, visible: true });
      setTimeout(() => feedback.setData({ visible: false }), duration);
    } else {
      console.warn('UI feedback component not found on current page');
    }
  },

  /**
   * 显示对话框 (替代原生 showModal)
   */
  showModal(options: {
    title?: string;
    content?: string;
    confirmText?: string;
    confirmColor?: string;
    cancelText?: string;
    cancelColor?: string;
    showCancel?: boolean;
    maskClosable?: boolean;
    emphasis?: 'left' | 'right';
    isAlert?: boolean;
    zIndex?: number;
    success?: (res: { confirm: boolean; cancel: boolean }) => void;
  }) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const feedback = page?.selectComponent('#ui-feedback') as any;

    if (feedback) {
      feedback.setData({
        title: options.title || '',
        modalContent: options.content || '',
        confirmText: options.confirmText || t('app.confirm'),
        confirmColor: options.confirmColor || (options.isAlert ? '#F59E0B' : (options.emphasis === 'left' ? '#64748B' : '#2E5FE9')),
        cancelText: options.cancelText || t('app.cancel'),
        cancelColor: options.cancelColor || (options.emphasis === 'left' ? '#2E5FE9' : '#64748B'),
        showCancel: options.showCancel !== false,
        maskClosable: options.maskClosable !== false,
        emphasis: options.emphasis || 'right',
        type: options.isAlert ? 'alert' : 'modal',
        mask: true,
        visible: true,
        zIndex: options.zIndex || 20000
      });

      // 绑定回调
      feedback.onConfirm = () => {
        feedback.setData({ visible: false });
        if (options.success) options.success({ confirm: true, cancel: false });
      };
      feedback.onCancel = (event?: any) => {
        feedback.setData({ visible: false });
        // 如果是点击 mask 导致的 cancel，我们额外标识一下，但在标准的 confirm/cancel 结构中
        // 通常点击 mask 被视为一种特殊的取消
        const isMask = event && event.detail && event.detail.isMask;
        if (options.success) {
          options.success({ 
            confirm: false, 
            cancel: true,
            // @ts-ignore
            isMask: !!isMask 
          });
        }
      };
    } else {
      // 降级使用原生
      wx.showModal(options);
    }
  }
};
