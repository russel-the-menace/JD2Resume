// miniprogram/components/education-drawer/index.ts
import { normalizeLanguage, t, type AppLanguage } from '../../utils/i18n'
import { attachLanguageAware } from '../../utils/languageAware'
import { attachThemeAware } from '../../utils/themeAware'
import { themeManager } from '../../utils/themeManager'
import { ui } from '../../utils/ui'

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    isEdit: {
      type: Boolean,
      value: false
    },
    educationData: {
      type: Object,
      value: null,
      observer(newVal) {
        if (newVal) {
          this.setData({
            formData: {
              school: newVal.school || '',
              degree: newVal.degree || '',
              major: newVal.major || '',
              startDate: newVal.startDate || '',
              endDate: newVal.endDate || newVal.graduationDate || ''
            }
          })
        } else {
          this.resetForm()
        }
      }
    }
  },

  data: {
    formData: {
      school: '',
      degree: '',
      major: '',
      startDate: '',
      endDate: ''
    },
    ui: {} as any,
    degreeIndex: -1
  },

  lifetimes: {
    attached() {
      ;(this as any)._langDetach = attachLanguageAware(this, {
        onLanguageRevive: () => {
          this.updateLanguage()
        },
      })

      // attach theme-aware behavior
      ;(this as any)._themeDetach = attachThemeAware(this, {
        onThemeChange: () => {
          this.updateLanguage()
        },
      })

      this.updateLanguage()
    },
    detached() {
      if (typeof (this as any)._langDetach === 'function') {
        (this as any)._langDetach()
      }
      if (typeof (this as any)._themeDetach === 'function') {
        (this as any)._themeDetach()
      }
    }
  },

  methods: {
    updateLanguage() {
      const app = getApp<IAppOption>() as any
      const lang = normalizeLanguage(app?.globalData?.language)
      
      const ui = {
        addEducation: t('resume.addEducation', lang),
        editEducation: t('resume.editEducation', lang) || '编辑教育经历',
        school: t('resume.school', lang),
        degree: t('resume.degree', lang),
        major: t('resume.major', lang),
        dateRange: t('resume.dateRange', lang),
        startDate: t('resume.startDate', lang),
        endDate: t('resume.endDate', lang),
        schoolPlaceholder: t('resume.schoolPlaceholder', lang),
        majorPlaceholder: t('resume.majorPlaceholder', lang),
        degreePlaceholder: t('resume.degreePlaceholder', lang),
        save: t('resume.save', lang),
        cancel: t('resume.cancel', lang),
        delete: t('resume.delete', lang),
        cursorColor: themeManager.getPrimaryColor(),
        degreeOptions: lang === 'English' || lang === 'AIEnglish' 
          ? ['Associate', 'Bachelor', 'Master', 'PhD', 'Other']
          : ['大专', '本科', '硕士', '博士', '其他']
      }

      this.setData({ ui })
    },

    resetForm() {
      this.setData({
        formData: {
          school: '',
          degree: '',
          major: '',
          startDate: '',
          endDate: ''
        },
        degreeIndex: -1
      })
    },

    onClose() {
      this.triggerEvent('close')
    },

    onInputChange(e: any) {
      const { field } = e.currentTarget.dataset
      const { value } = e.detail
      this.setData({
        [`formData.${field}`]: value
      })
    },

    onDegreeChange(e: any) {
      const index = e.detail.value
      const degree = this.data.ui.degreeOptions[index]
      this.setData({
        degreeIndex: index,
        'formData.degree': degree
      })
    },

    onDateChange(e: any) {
      const { field } = e.currentTarget.dataset
      const { value } = e.detail
      this.setData({
        [`formData.${field}`]: value
      })
    },

    onSave() {
      const { formData } = this.data
      if (!formData.school) {
        ui.showToast(t('resume.inputSchool'))
        return
      }
      this.triggerEvent('save', { education: formData })
    },

    onDelete() {
      ui.showModal({
        title: t('resume.syncConfirmTitle'),
        content: t('resume.deleteEducationConfirm'),
        success: (res) => {
          if (res.confirm) {
            this.triggerEvent('delete')
          }
        }
      })
    },

    stopPropagation() {}
  }
})

