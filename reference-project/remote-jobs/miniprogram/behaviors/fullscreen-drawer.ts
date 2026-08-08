// miniprogram/behaviors/fullscreen-drawer.ts
// Behavior for fullscreen drawer components with tabBar management

module.exports = Behavior({
  data: {
    closeButtonVisible: false,
    closeButtonTop: 0, // 关闭按钮的 top 位置（px）
  },

  methods: {
    // 隐藏 tabBar 实现全屏显示
    hideTabBar() {
      try {
        wx.hideTabBar({ animation: true })
      } catch (err) {
        // 忽略错误（可能不在 tabBar 页面）
      }
    },

    // 显示 tabBar 恢复底部导航
    showTabBar() {
      try {
        wx.showTabBar({ animation: true })
      } catch (err) {
        // 忽略错误（可能不在 tabBar 页面）
      }
    },

    // 停止当前动画
    stopAnimation() {
      if ((this as any)._animation && typeof (this as any)._animation.stop === 'function') {
        ;(this as any)._animation.stop()
        ;(this as any)._animation = null
      }
    },

    // 初始化 drawer 打开状态
    // 应该在 show observer 中调用，当 show 为 true 时
    initDrawerOpen() {
      // 隐藏 tabBar
      this.hideTabBar()
      
      // 停止当前动画
      this.stopAnimation()
      
      // 获取屏幕宽度并设置初始位置
      const windowInfo = wx.getWindowInfo()
      const screenWidth = windowInfo.windowWidth
      
      // 计算关闭按钮位置（系统导航栏左侧，垂直居中）
      // 导航栏高度通常是 44px，状态栏高度从系统信息获取
      // 按钮需要在导航栏区域内垂直居中
      const systemInfo = wx.getSystemInfoSync()
      const statusBarHeight = systemInfo.statusBarHeight || 0
      const navBarHeight = 44 // 导航栏高度（px）
      // top 位置 = 状态栏高度 + (导航栏高度 - 按钮高度) / 2，使按钮垂直居中在导航栏内
      // 按钮高度是 88rpx，需要转换为 px（假设屏幕宽度 375px，1rpx = 0.5px，88rpx = 44px）
      const buttonHeightPx = 44 // 按钮高度（px，88rpx ≈ 44px）
      const closeButtonTop = statusBarHeight + (navBarHeight - buttonHeightPx) / 2
      
      this.setData({ 
        animationData: null,
        drawerTranslateX: screenWidth,
        closeButtonTop: closeButtonTop,
        closeButtonVisible: false, // 先隐藏，等待动画
      })
      
      // 延迟设置 drawerTranslateX 为 0，实现滑入动画
      // 同时显示关闭按钮
      setTimeout(() => {
        if ((this as any).data.show) {
          this.setData({ 
            drawerTranslateX: 0,
            closeButtonVisible: true, // 显示关闭按钮（带动画）
          } as any)
        }
      }, 50)
    },

    // 初始化 drawer 关闭状态
    // 应该在 show observer 中调用，当 show 为 false 时
    initDrawerClose() {
      // 隐藏关闭按钮（带动画）
      this.setData({ closeButtonVisible: false })
      
      // 显示 tabBar
      this.showTabBar()
      
      // 停止当前动画
      this.stopAnimation()
      
      // 获取屏幕宽度并重置位置
      const windowInfo = wx.getWindowInfo()
      const screenWidth = windowInfo.windowWidth
      
      // 只有在没有正在进行的动画时才重置（closeDrawer 方法会处理动画）
      if (!(this as any)._animation) {
        this.setData({
          drawerTranslateX: screenWidth,
          animationData: null,
        })
      }
    },
  },
})

