// miniprogram/behaviors/swipe-to-close.ts
// Behavior for swipe-to-close gesture on drawer components

module.exports = Behavior({
  lifetimes: {
    created() {
      // Store scroll position state
      ;(this as any)._scrollViewAtTop = true
      // Performance optimization: use animation API for smoother updates
      ;(this as any)._animation = null
      ;(this as any)._lastUpdateTime = 0
      ;(this as any)._velocity = 0 // Track swipe velocity for momentum
      ;(this as any)._lastTranslateX = 0
      ;(this as any)._lastTouchTime = 0
      ;(this as any)._touchHistory = [] // Track recent touch positions for velocity calculation
    },
  },

  data: {
    // Swipe gesture state
    swipeStartX: 0,
    swipeStartY: 0,
    swipeCurrentX: 0,
    isSwiping: false,
    drawerTranslateX: 0, // Current translateX value for drawer
    animationData: null as any, // Animation data for smooth transitions
  },

  methods: {
    // Swipe gesture handlers
    onScrollViewScroll(e: any) {
      // Track scroll position to prevent swipe-to-close when scrolling
      const scrollTop = e.detail?.scrollTop || 0
      ;(this as any)._scrollViewAtTop = scrollTop <= 10
    },

    onTouchStart(e: any) {
      if (!(this as any).data.show) return
      
      const touch = e.touches?.[0]
      if (!touch) return

      const startX = touch.clientX
      const startY = touch.clientY
      const now = Date.now()

      // Reset velocity tracking
      ;(this as any)._velocity = 0
      ;(this as any)._lastTranslateX = 0
      ;(this as any)._lastTouchTime = now
      ;(this as any)._touchHistory = [{ x: startX, time: now }]

      // Stop any ongoing animation
      if ((this as any)._animation && typeof (this as any)._animation.stop === 'function') {
        ;(this as any)._animation.stop()
        ;(this as any)._animation = null
      }

      this.setData({
        swipeStartX: startX,
        swipeStartY: startY,
        swipeCurrentX: startX,
        isSwiping: false,
      })
    },

    onTouchMove(e: any) {
      if (!(this as any).data.show) return

      const touch = e.touches?.[0]
      if (!touch) return

      const currentX = touch.clientX
      const currentY = touch.clientY
      const startX = this.data.swipeStartX
      const startY = this.data.swipeStartY

      const deltaX = currentX - startX
      const deltaY = currentY - startY

      // Only handle right swipe (positive deltaX)
      if (deltaX <= 0) {
        // If user swipes left or not swiping right, don't handle
        if (this.data.isSwiping) {
          // Reset if we were swiping
          this.setData({
            isSwiping: false,
            drawerTranslateX: 0,
          })
        }
        return
      }

      // Check if this is primarily a horizontal swipe
      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)
      
      // If vertical movement is much larger, it's probably a scroll
      // But if we're already swiping, continue swiping to avoid jitter
      if (!this.data.isSwiping && absDeltaY > absDeltaX * 0.7 && absDeltaY > 10) {
        // This looks like a scroll, don't interfere
        return
      }

      // Check if scroll-view is at top
      // If not at top and there's vertical movement, it's probably a scroll
      // But if we're already swiping, continue swiping to avoid jitter
      if (!this.data.isSwiping && !(this as any)._scrollViewAtTop && absDeltaY > 5) {
        // User is scrolling, not swiping to close
        return
      }

      // This is a right swipe, handle it
      if (!this.data.isSwiping && absDeltaX > 10) {
        // Start swiping - disable scroll during swipe
        this.setData({ isSwiping: true })
      }

      if (this.data.isSwiping) {
        // Update drawer position - follow finger exactly
        const windowInfo = wx.getWindowInfo()
        const maxTranslate = windowInfo.windowWidth // Max translate is full screen width
        const translateX = Math.min(deltaX, maxTranslate)
        const now = Date.now()
        
        // Track velocity for momentum scrolling
        const timeDelta = now - (this as any)._lastTouchTime
        if (timeDelta > 0) {
          const translateDelta = translateX - (this as any)._lastTranslateX
          ;(this as any)._velocity = translateDelta / timeDelta // pixels per ms
          
          // Keep history for better velocity calculation (last 100ms)
          ;(this as any)._touchHistory.push({ x: currentX, time: now })
          // Remove old entries (keep only last 100ms)
          const cutoff = now - 100
          ;(this as any)._touchHistory = (this as any)._touchHistory.filter((entry: any) => entry.time > cutoff)
        }
        
        ;(this as any)._lastTranslateX = translateX
        ;(this as any)._lastTouchTime = now
        
        // Direct setData for real-time following (most responsive)
        // For touch following, direct setData is faster than animation API
        // Only update drawerTranslateX to minimize setData overhead
        this.setData({
          drawerTranslateX: translateX,
        })
      }
    },

    onTouchEnd(_e: any) {
      // Stop any ongoing animation
      if ((this as any)._animation && typeof (this as any)._animation.stop === 'function') {
        ;(this as any)._animation.stop()
        ;(this as any)._animation = null
      }
      
      if (!(this as any).data.show || !this.data.isSwiping) {
        this.setData({
          swipeStartX: 0,
          swipeStartY: 0,
          swipeCurrentX: 0,
          isSwiping: false,
        })
        return
      }

      const windowInfo = wx.getWindowInfo()
      const screenWidth = windowInfo.windowWidth
      const threshold = screenWidth * 0.3 // Close if swiped more than 30% of screen width
      const currentTranslate = this.data.drawerTranslateX
      
      // Calculate average velocity from recent history for momentum
      let avgVelocity = 0
      if ((this as any)._touchHistory.length >= 2) {
        const recent = (this as any)._touchHistory.slice(-5) // Use last 5 points
        let totalVelocity = 0
        let count = 0
        for (let i = 1; i < recent.length; i++) {
          const deltaX = recent[i].x - recent[i - 1].x
          const deltaTime = recent[i].time - recent[i - 1].time
          if (deltaTime > 0) {
            totalVelocity += deltaX / deltaTime
            count++
          }
        }
        if (count > 0) {
          avgVelocity = totalVelocity / count
        }
      }
      
      // Consider velocity in decision: if velocity is high enough, close even if below threshold
      const velocityThreshold = 0.5 // pixels per ms
      const shouldClose = currentTranslate >= threshold || (avgVelocity > velocityThreshold && currentTranslate > screenWidth * 0.15)

      if (shouldClose) {
        // Swiped enough or has momentum, close the drawer
        this.setData({ isSwiping: false })
        
        // Use animation API for smooth closing with momentum
        const finalTranslate = screenWidth
        const remainingDistance = finalTranslate - currentTranslate
        const estimatedTime = Math.min(Math.abs(remainingDistance / Math.max(avgVelocity, 0.3)), 300) // Cap at 300ms
        
        ;(this as any)._animation = wx.createAnimation({
          duration: estimatedTime,
          timingFunction: 'ease-out', // Smooth deceleration
          transformOrigin: 'right center',
        })
        
        ;(this as any)._animation.translateX(finalTranslate).step()
        this.setData({
          drawerTranslateX: finalTranslate,
          animationData: (this as any)._animation.export(),
        })
        
        // Wait for animation to complete before closing
        setTimeout(() => {
          // Reset state and close
          // Don't reset drawerTranslateX here, let the observer handle it when show becomes false
          this.setData({
            swipeStartX: 0,
            swipeStartY: 0,
            swipeCurrentX: 0,
            animationData: null,
          })
          ;(this as any)._animation = null
          // Call onClose method (should be implemented by component)
          // This will trigger the observer to set show: false, which will reset drawerTranslateX
          if (typeof (this as any).onClose === 'function') {
            ;(this as any).onClose()
          }
        }, estimatedTime)
      } else {
        // Not enough, spring back smoothly with bounce effect
        this.setData({ isSwiping: false })
        
        ;(this as any)._animation = wx.createAnimation({
          duration: 300,
          timingFunction: 'ease-out', // Smooth spring back
          transformOrigin: 'right center',
        })
        
        ;(this as any)._animation.translateX(0).step()
        this.setData({
          drawerTranslateX: 0,
          animationData: (this as any)._animation.export(),
        })
        
        setTimeout(() => {
          this.setData({
            swipeStartX: 0,
            swipeStartY: 0,
            swipeCurrentX: 0,
            animationData: null,
          })
          ;(this as any)._animation = null
        }, 300)
      }
      
      // Clear touch history
      ;(this as any)._touchHistory = []
      ;(this as any)._velocity = 0
    },

    // Close drawer with animation
    closeDrawer() {
      if (!(this as any).data.show) {
        this.triggerEvent('close')
        return
      }
      
      // 隐藏关闭按钮（如果存在）
      if ((this as any).data.closeButtonVisible !== undefined) {
        this.setData({ closeButtonVisible: false })
      }
      
      const windowInfo = wx.getWindowInfo()
      const screenWidth = windowInfo.windowWidth
      
      if ((this as any)._animation && typeof (this as any)._animation.stop === 'function') {
        ;(this as any)._animation.stop()
        ;(this as any)._animation = null
      }
      
      ;(this as any)._animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease-out',
        transformOrigin: 'right center',
      })
      
      ;(this as any)._animation.translateX(screenWidth).step()
      this.setData({
        drawerTranslateX: screenWidth,
        animationData: (this as any)._animation.export(),
      })
      
      // Wait for animation to complete before triggering close event
      // This ensures the animation is visible before the element is removed
      setTimeout(() => {
        ;(this as any)._animation = null
        this.setData({
          animationData: null,
        })
        // Trigger close event after animation completes
        this.triggerEvent('close')
      }, 300)
    },
  },
})

