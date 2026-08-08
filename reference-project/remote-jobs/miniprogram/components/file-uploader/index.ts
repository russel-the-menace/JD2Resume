import { ui } from '../../utils/ui';
import { uploadApi } from '../../utils/request';
import { StatusCode } from '../../utils/statusCodes';
import { type AppLanguage, t, normalizeLanguage } from '../../utils/i18n/index';

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    config: {
      type: Object,
      value: {
        title: '上传简历',
        selectFromChat: '从聊天记录选择',
        uploadFromLocal: '从相册选择图片',
        confirmUpload: '确认上传',
        previewTip: '点击预览文件',
        cancel: '取消',
        quotaWarning: '请确保文件清晰'
      }
    },
    mode: {
        type: String,
        value: 'resume' // 'resume' | 'job'
    }
  },

  data: {
    showPreviewModal: false,
    previewType: 'image', // 'image' | 'pdf'
    previewPath: '',
    previewName: '',
    previewSize: 0
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onSelectFromChat() {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['pdf', 'png', 'jpg', 'jpeg'],
        success: (res) => {
          const file = res.tempFiles[0];
          this.validateAndConfirm(file);
        },
        fail: (err) => {
          if (err.errMsg.indexOf('cancel') === -1) {
            ui.showToast('选择文件失败');
          }
        }
      });
    },

    onSelectFromLocal() {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res: any) => {
          const file = res.tempFiles ? res.tempFiles[0] : { path: res.tempFilePaths[0], size: 2 * 1024 * 1024 };
          this.validateAndConfirm({
            path: file.path,
            size: file.size,
            name: 'image.jpg'
          });
        },
        fail: (err) => {
          if (err.errMsg.indexOf('cancel') === -1) {
            ui.showToast('选择图片失败');
          }
        }
      });
    },

    validateAndConfirm(file: { path: string, size: number, name: string }) {
      const MAX_SIZE = 10 * 1024 * 1024; // 10MB
      const MIN_SIZE = 100; // 100 Bytes

      if (file.size > MAX_SIZE) {
        ui.showModal({
          title: '文件过大',
          content: `文件大小超过限制 (10MB)`,
          showCancel: false,
          isAlert: true
        });
        return;
      }

      if (file.size < MIN_SIZE) {
        ui.showModal({
          title: '文件无效',
          content: '文件内容为空或太小',
          showCancel: false,
          isAlert: true
        });
        return;
      }

      const allowedExts = ['pdf', 'png', 'jpg', 'jpeg'];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext && !allowedExts.includes(ext)) {
        ui.showModal({
          title: '格式不支持',
          content: '仅支持 PDF, PNG, JPG 格式',
          showCancel: false,
          isAlert: true
        });
        return;
      }

      this.triggerEvent('close'); // Close the selection drawer
      this.setData({
        showPreviewModal: true,
        previewPath: file.path,
        previewName: file.name,
        previewSize: file.size,
        previewType: ext === 'pdf' ? 'pdf' : 'image'
      });
    },

    onCancelPreview() {
      this.setData({ showPreviewModal: false });
    },

    onConfirmPreview() {
      this.setData({ showPreviewModal: false });
      this.processUpload();
    },

    async processUpload() {
      const app = getApp<any>();
      const lang: AppLanguage = normalizeLanguage(app.globalData.language);
      
      console.log('[FileUploader] Starting upload. Mode:', this.data.mode); // Debug Log

      ui.showLoading(t('resume.aiChecking', lang)); // "AI 校验中"

      try {
        const url = this.data.mode === 'job' ? '/parse-job-screenshot' : '/resume/parse';
        console.log('[FileUploader] Target URL:', url, 'FilePath:', this.data.previewPath); // Debug Log
        
        const data = await uploadApi<any>({
          url: url,
          filePath: this.data.previewPath,
          name: 'file'
        });

        console.log('[FileUploader] Upload success, response:', data); // Debug Log
        ui.hideLoading();

        if (!data.success || !data.result) {
          console.warn('[FileUploader] Logical failure:', data); // Debug Log
          this.handleUploadError({ data: data }, lang);
          return;
        }

        // Parsing successful, emit result to parent to handle "next steps"
        this.triggerEvent('success', {
            result: data.result,
            originalFile: {
                path: this.data.previewPath,
                name: this.data.previewName
            }
        });

      } catch (err: any) {
        console.error('[FileUploader] Upload failed:', err); // Debug Log
        ui.hideLoading();
        this.handleUploadError(err, lang);
        this.triggerEvent('fail', err);
      }
    },

    handleUploadError(err: any, lang: AppLanguage) {
      let errData = err.data;
      if (typeof errData === 'string') {
        try { errData = JSON.parse(errData); } catch (e) { }
      }
      const code = (errData && errData.code) || err.code;

      if (err.statusCode === 401) {
        ui.showToast(t('resume.authFailedLogin', lang));
      } else if (code === StatusCode.QUOTA_EXHAUSTED) {
        ui.showModal({
          title: t('membership.quotaExceededTitle', lang),
          content: t('membership.quotaExceededContent', lang),
          showCancel: false,
          isAlert: true
        });
      } else if (code === StatusCode.INVALID_DOCUMENT_CONTENT || code === StatusCode.MISSING_IDENTITY_INFO) {
        ui.showModal({
          title: t('resume.refineErrorTitle', lang) || '识别受阻',
          content: t('resume.refineErrorContent', lang),
          showCancel: false,
          isAlert: true
        });
      } else {
        const msg = (errData && errData.message) || err.message || t('app.error', lang);
        ui.showToast(msg);
      }
    },
    
    openPdfPreview() {
        if (this.data.previewType === 'pdf' && this.data.previewPath) {
             wx.openDocument({
                 filePath: this.data.previewPath,
                 showMenu: true,
                 fail: () => {
                     ui.showToast('无法预览 PDF');
                 }
             })
        }
    }
  }
});
