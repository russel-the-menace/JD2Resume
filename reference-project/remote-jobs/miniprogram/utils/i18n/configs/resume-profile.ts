import { t, type AppLanguage } from '../index'
import { themeManager } from '../../themeManager'

/**
 * 简历编辑页面 UI 文案配置映射表
 */
const UI_MAP = {
    // --- 页面通栏 ---
    /** 页面标题 */
    title: 'resume.title',
    /** 中文版 Tab */
    tabCn: 'resume.tabCn',
    /** 英文版 Tab */
    tabEn: 'resume.tabEn',
    /** 中国 */
    china: 'resume.china',
    /** 与中文版同步 */
    syncFromCn: 'resume.syncFromCn',
    
    // --- 分部分标题 ---
    /** 基本信息 */
    personalInfo: 'resume.personalInfo',
    /** 联系方式 */
    contactInfo: 'resume.contactInfo',
    /** 档案标题 */
    name: 'resume.name',
    /** 照片标题 */
    photo: 'resume.photo',
    /** 教育经历标题 */
    education: 'resume.education',
    /** 工作经历标题 */
    workExperience: 'resume.workExperience',
    /** 专业技能标题 */
    skills: 'resume.skills',
    /** 证书标题 */
    certificates: 'resume.certificates',
    /** AI 寄语标题 */
    aiMessageLabel: 'resume.aiMessageLabel',
    /** 编辑文本 */
    edit: 'jobs.editLabel',

    // --- 字段 Label ---
    /** 性别 */
    gender: 'resume.gender',
    /** 出生年月 */
    birthday: 'resume.birthday',
    /** 身份 */
    identity: 'resume.identity',
    /** 所在地 */
    location: 'resume.location',
    /** 微信号 */
    wechat: 'resume.wechat',
    /** 邮箱 */
    email: 'resume.email',
    /** 手机号 */
    phone: 'resume.phone',
    /** 手机号 (国际) */
    phoneEn: 'resume.phoneEn',
    /** 网站 */
    personalWebsite: 'resume.personalWebsite',
    /** WhatsApp */
    whatsapp: 'resume.whatsapp',
    /** Telegram */
    telegram: 'resume.telegram',
    /** LinkedIn */
    linkedin: 'resume.linkedin',
    /** 学位 */
    degree: 'resume.degree',
    /** 专业 */
    major: 'resume.major',
    /** 开始日期 */
    startDate: 'resume.startDate',
    /** 结束日期 */
    endDate: 'resume.endDate',
    /** 毕业日期 */
    graduationDate: 'resume.graduationDate',
    /** 时间段 */
    timePeriod: 'resume.timePeriod',
    /** 在校描述 */
    description: 'resume.description',
    /** 公司名称 */
    company: 'resume.company',
    /** 职位名称 */
    jobTitle: 'resume.jobTitle',
    /** 业务方向 */
    businessDirection: 'resume.businessDirection',
    /** 工作内容 */
    workContent: 'resume.workContent',

    // --- Placeholder ---
    /** 学校输入提示 */
    schoolPlaceholder: 'resume.schoolPlaceholder',
    /** 专业输入提示 */
    majorPlaceholder: 'resume.majorPlaceholder',
    /** 学位选择提示 */
    degreePlaceholder: 'resume.degreePlaceholder',
    /** 性别选择提示 */
    genderPlaceholder: 'resume.genderPlaceholder',
    /** 身份选择提示 */
    identityPlaceholder: 'resume.identityPlaceholder',
    /** 生日选择提示 */
    birthdayPlaceholder: 'resume.birthdayPlaceholder',
    /** 描述输入提示 */
    descriptionPlaceholder: 'resume.descriptionPlaceholder',
    /** 技能输入提示 */
    skillPlaceholder: 'resume.skillPlaceholder',
    /** 证书输入提示 */
    certificatesPlaceholder: 'resume.certificatesPlaceholder',
    /** 公司输入提示 */
    companyPlaceholder: 'resume.companyPlaceholder',
    /** 职位输入提示 */
    jobTitlePlaceholder: 'resume.jobTitlePlaceholder',
    /** 业务方向输入提示 */
    businessDirectionPlaceholder: 'resume.businessDirectionPlaceholder',
    /** 工作内容输入提示 */
    workContentPlaceholder: 'resume.workContentPlaceholder',
    /** AI默认寄语 */
    aiMessageDefault: 'resume.aiMessageDefault',
    /** 学校搜索提示 */
    universityPlaceholder: 'resume.universityPlaceholder',

    // --- 动作与状态 ---
    /** 添加教育经历 */
    addEducation: 'resume.addEducation',
    /** 添加技能 */
    addSkill: 'resume.addSkill',
    /** 添加证书 */
    addCertificate: 'resume.addCertificate',
    /** 添加工作经历 */
    addWorkExperience: 'resume.addWorkExperience',
    /** 保存 */
    save: 'resume.save',
    /** 关闭 */
    close: 'app.close',
    /** 取消 */
    cancel: 'resume.cancel',
    /** 删除 */
    delete: 'resume.delete',
    /** 至今 */
    toPresent: 'resume.toPresent',
    /** 暂无数据 */
    noData: 'resume.noData',
    /** 选填标记 */
    optional: 'resume.optional',
    /** 年 */
    year: 'resume.year',
    /** 月 */
    month: 'resume.month',

    // --- 通用操作 (来自 common 或重复定义) ---
    /** 保存中 */
    saving: 'me.saving',
    /** 上传中 */
    uploading: 'me.uploading',
    /** 上传成功 */
    uploadSuccess: 'me.uploadSuccess',
    /** 保存成功 */
    saveSuccess: 'resume.saveSuccess',
    /** 保存失败 */
    saveFailed: 'resume.saveFailed',
    /** 上传失败 */
    uploadFailed: 'me.uploadFailed',
} as const

/**
 * 构造简历页面所需的完整 UI 对象
 * @param lang 当前界面语言 (AppLanguage)
 * @param data 页面当前的 Data，用于填充动态占位符和根据 Tab 切换文案
 */
export function buildPageUI(lang: AppLanguage, data: any) {
    const ui: Record<string, string> = {}
    const isEnglishResume = data.currentLang === 'English'

    // 1. 自动执行全量静态 Key 映射
    Object.keys(UI_MAP).forEach((key) => {
        const i18nPath = UI_MAP[key as keyof typeof UI_MAP]
        ui[key] = t(i18nPath as any, lang)
    })

    // 注入主题色
    ui.cursorColor = themeManager.getPrimaryColor()

    // 2. 特殊逻辑：根据 Tab (中文/英文版) 切换的 Label
    ui.nameLabel = isEnglishResume ? t('resume.nameEn', lang) : t('resume.realName', lang)
    ui.namePlaceholder = isEnglishResume ? t('resume.nameEn', lang) : t('resume.namePlaceholder', lang)

    // 3. 特殊逻辑：根据完整度显示的提示语 (Tips)
    const completeness = isEnglishResume ? (data.completeness_en || 0) : (data.completeness_cn || 0)
    let tips = t('resume.tips', lang)
    if (completeness === 1) {
        tips = t('resume.tipsComplete', lang)
    } else if (completeness === 2) {
        tips = t('resume.tipsPerfect', lang)
    }
    ui.tips = tips

    return ui
}
