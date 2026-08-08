Component({
  properties: {
    title: { 
      type: null, 
      value: ''
    },
    modalContent: { type: String, value: '' },
    confirmText: { type: String, value: '确定' },
    cancelText: { type: String, value: '取消' },
    showCancel: { type: Boolean, value: true },
    type: { type: String, value: 'loading' }, // 'loading', 'success', 'error', 'info', 'modal'
    mask: { type: Boolean, value: false },
    maskClosable: { type: Boolean, value: true },
    emphasis: { type: String, value: 'right' },
    zIndex: { type: Number, value: 20000 },
    visible: { 
      type: Boolean, 
      value: false,
      observer(newVal) {
        const self = this as any;
        if (newVal) {
          if (self._hideTimer) {
            clearTimeout(self._hideTimer);
            self._hideTimer = null;
          }
          this.setData({ 
            innerVisible: true,
            displayVisible: true
          });
        } else {
          // 延迟开始隐藏动画，防止在 loading -> success 切换时的瞬时闪烁
          self._hideTimer = setTimeout(() => {
            this.setData({ displayVisible: false });
            // 给消失动画留出时间
            setTimeout(() => {
              if (!this.data.visible) {
                this.setData({ innerVisible: false });
              }
            }, 300);
            self._hideTimer = null;
          }, 50);
        }
      }
    }
  },
  data: {
    innerVisible: false,
    displayVisible: false
  },
  methods: {
    onCancel() {
      if (typeof (this as any).onCancel === 'function') {
        (this as any).onCancel();
      }
      this.triggerEvent('cancel');
      this.setData({ visible: false });
    },
    onConfirm() {
      if (typeof (this as any).onConfirm === 'function') {
        (this as any).onConfirm();
      }
      this.triggerEvent('confirm');
      this.setData({ visible: false });
    },
    onMaskTap() {
      if (this.data.mask && this.data.maskClosable) {
        if (typeof (this as any).onCancel === 'function') {
          (this as any).onCancel({ detail: { isMask: true } });
        }
        this.triggerEvent('cancel', { isMask: true });
        this.setData({ visible: false });
      }
    },
    onContentTap() {
      // 阻止冒泡到 maskTap
    }
  }
})
