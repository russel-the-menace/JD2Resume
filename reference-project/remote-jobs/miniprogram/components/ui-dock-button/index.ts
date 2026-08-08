Component({
  properties: {
    text: { type: String, value: '' },
    icon: { type: String, value: '' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    animateIcon: { type: Boolean, value: true },
    visible: { type: Boolean, value: true },
    customClass: { type: String, value: '' },
    width: { type: String, value: '42.5%' }
  },
  methods: {
    onTap() {
      if (this.data.loading) return;
      if (this.data.disabled) {
        this.triggerEvent('disabledTap');
        return;
      }
      this.triggerEvent('tap');
    }
  }
})
