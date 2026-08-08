Component({
  externalClasses: ['custom-class'],
  properties: {
    type: { type: String, value: 'primary' },
    size: { type: String, value: 'md' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    openType: { type: String, value: '' },
    formType: { type: String, value: '' }
  },
  methods: {
    onTap(e: any) {
      if (!this.properties.disabled && !this.properties.loading) {
        this.triggerEvent('tap', e.detail);
      }
    }
  }
})
