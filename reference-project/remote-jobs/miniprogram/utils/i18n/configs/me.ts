import { t, type AppLanguage } from '../index'
import { themeManager } from '../../themeManager'

/**
 * 界面文案配置映射表
 * 
 * 使用对象结构定义 UI 变量与 i18n Key 的对应关系。
 * 支持 TSDoc 注释，在代码中引用 ui.xxx 时可直接查看功能描述。
 */
const UI_MAP = {
    // --- 导航与状态 ---
    /** 语言设置行标题 */
    languageEntry: 'me.languageEntry',
    /** 邀请码行标题 */
    inviteCodeEntry: 'me.inviteCodeEntry',
    /** 立即登录 */
    loginNow: 'me.loginNow',
    /** 查看并编辑个人资料 */
    viewEditProfile: 'me.viewEditProfile',
    /** 会员到期后缀 */
    expiresSuffix: 'me.expiresSuffix',
    
    // --- 简历与功能入口 ---
    /** 简历资料入口 */
    resumeProfileEntry: 'me.resumeProfileEntry',
    /** 简历资料副标题 */
    resumeProfileSubtitle: 'me.resumeProfileSubtitle',
    /** AI 润色入口 */
    refineResumeEntry: 'me.refineResumeEntry',
    /** AI 润色副标题 */
    refineResumeSubtitle: 'me.refineResumeSubtitle',
    /** 已生成简历入口 */
    generatedResumesEntry: 'me.generatedResumesEntry',
    /** 已生成简历副标题 */
    generatedResumesSubtitle: 'me.generatedResumesSubtitle',
    /** 联系作者 */
    contactAuthor: 'me.contactAuthor',
    /** 作者微信引导文案 */
    authorWechatSlogan: 'me.authorWechatSlogan',
    /** 二维码识别提示 */
    qrHint: 'me.qrHint',
    /** 反馈标签 - Bug */
    feedbackTagBug: 'me.feedbackTagBug',
    /** 反馈标签 - 辅导 */
    feedbackTagCoach: 'me.feedbackTagCoach',
    /** 反馈标签 - 合作 */
    feedbackTagCollab: 'me.feedbackTagCollab',
    /** 复制微信号按钮 */
    copyWechatId: 'me.copyWechatId',
    /** 微信号已复制提示 */
    wechatIdCopied: 'me.wechatIdCopied',

    // --- 会员与配额 ---
    /** 会员权益管理 */
    manageBenefits: 'me.manageBenefits',
    /** 立即解锁 */
    unlockNow: 'me.unlockNow',
    /** 岗位提炼配额标题 */
    jobQuota: 'me.jobQuota',
    /** 开启全部会员特权提示 */
    memberFullAccess: 'me.memberFullAccess',
    /** 解锁 AI 特权提示 */
    unlockAIFeatures: 'me.unlockAIFeatures',
    /** 普通用户标识 */
    regularUser: 'me.regularUser',
    /** VIP 标签 */
    vipTag: 'me.vipTag',
    /** 会员到期日期提示 */
    memberExpiredDate: 'me.memberExpiredDate',
    /** 额度点数 */
    points: 'me.points',
    /** 额度单位 (如: 额度/pts) */
    unitPoints: 'me.unitPoints',
    /** 可用 */
    available: 'me.available',
    /** 会员中心 */
    memberCenter: 'me.memberCenter',
    /** 生效中 */
    active: 'me.active',
    /** 未激活 */
    inactive: 'me.inactive',
    /** 未开通 */
    notActivated: 'me.notActivated',
    /** 充值与升级 */
    rechargeUpgrade: 'me.rechargeUpgrade',
    /** 天 */
    unitDays: 'me.unitDays',
    /** 永久 */
    forever: 'me.forever',

    // --- 邀请码弹窗 ---
    /** 邀请码弹窗标题 */
    inviteDialogTitle: 'me.inputInviteCode',
    /** 邀请码输入提示 */
    invitePlaceholder: 'me.inputInviteCodePlaceholder',
    /** 无效邀请码提示 */
    invalidInviteCode: 'me.inviteCodeInvalid',
    /** 已激活成功提示 */
    inviteSuccess: 'me.inviteCodeApplied',

    // --- 语言选择 ---
    /** 语言选择面板标题 */
    languageSheetTitle: 'me.languageSheetTitle',
    /** 基础模式标题 */
    basicMode: 'me.basicMode',
    /** 中文版显示名 */
    langChinese: 'me.langChinese',
    /** 中文版描述 */
    langChineseDesc: 'me.langChineseDesc',
    /** 英文版显示名 */
    langEnglish: 'me.langEnglish',
    /** 英文版描述 */
    langEnglishDesc: 'me.langEnglishDesc',
    /** AI 模式标题 */
    aiMode: 'me.aiMode',
    /** AI 中文 */
    langAIChinese: 'me.langAIChinese',
    /** AI 中文描述 */
    langAIChineseDesc: 'me.langAIChineseDesc',
    /** AI 英文 */
    langAIEnglish: 'me.langAIEnglish',
    /** AI 英文描述 */
    langAIEnglishDesc: 'me.langAIEnglishDesc',

    // --- 邀请好友 ---
    /** 邀请好友计划标题 */
    inviteFriendPlan: 'me.inviteFriendPlan',
    /** 邀请奖励描述 */
    inviteRewardDesc: 'me.inviteRewardDesc',
    /** 我有邀请码按钮 */
    iHaveInviteCode: 'me.iHaveInviteCode',
    /** 我的邀请码标题 */
    myInviteCode: 'me.myInviteCode',
    /** 点击复制提示 */
    clickToCopy: 'me.clickToCopy',
    /** 邀请码输入点位符 */
    inputInviteCodePlaceholder: 'me.inputInviteCodePlaceholder',
    /** 兑换按钮 */
    redeem: 'me.redeem',
    /** 关闭 */
    close: 'app.close',

    // --- 提示与反馈 ---
    /** 正在保存 */
    saving: 'me.saving',
    /** 保存成功 */
    saveSuccess: 'me.nicknameSuccess',
    /** 授权失败 */
    authFailed: 'me.phoneAuthFailed',
    /** 会员已到期 */
    memberExpired: 'me.memberExpiredDate',
    /** 点数不足提示 */
    pointsInsufficient: 'me.pointsInsufficient',
    /** 上传失败 */
    uploadFailed: 'me.uploadFailed',
    /** 未设置手机号 */
    phoneNotBound: 'me.notBound',
    /** 登录过期提示 */
    sessionExpired: 'me.authRequiredTitle',
    /** 无网络提示 */
    noNetwork: 'me.noNetwork',

    // --- 个人资料 ---
    /** 用户资料标题 */
    userProfileTitle: 'me.userProfileTitle',
    /** 上传头像 */
    uploadAvatar: 'me.uploadAvatar',
    /** 用户名 */
    editNickname: 'me.editNickname',
    /** 手机号 */
    phoneNumber: 'me.phoneNumber',
    /** 未设置 */
    notSet: 'me.notSet',

    // --- 支付相关 ---
    /** 订单创建中 */
    orderCreating: 'me.orderCreating',
    /** 合计标签 */
    totalLabel: 'me.totalLabel',
    /** 立即支付 */
    payNow: 'me.payNow',
    /** 调起支付失败 */
    paymentLaunchFailed: 'me.payError',
    /** 支付取消 */
    paymentCancelled: 'me.payCancelled',
    /** 支付前绑定手机号提示 */
    paymentPhoneRequired: 'me.paymentPhoneRequired',

    // --- 跨模块功能性文案 ---
    /** 统一确认/完成按钮 */
    confirm: 'jobs.doneLabel',
    /** 统一保存按钮 */
    save: 'resume.save',
    /** 统一取消按钮 */
    cancel: 'resume.cancel',
    /** 统一支付跳转 */
    toPay: 'me.toPay',
    /** AI 解锁弹窗标题 */
    aiUnlockTitle: 'me.aiUnlockTitle',
    /** AI 解锁弹窗内容 */
    aiUnlockContent: 'me.aiUnlockContent',

    // --- Payment Flow (Added Dynamically) ---
    creatingOrder: 'me.creatingOrder',
    orderCreateFailed: 'me.orderCreateFailed',
    payParamMissing: 'me.payParamMissing',
    activatingMember: 'me.activatingMember',
    paymentProcessing: 'me.paymentProcessing',
    paySuccessTitle: 'me.paySuccessTitle',
    paySuccessContent: 'me.paySuccessContent',
    payPrompt: 'me.payPrompt',
    payError: 'me.payError',
    payCancelledToast: 'me.payCancelledToast',
    payFailed: 'me.payFailed',
    mchIdMissing: 'me.mchIdMissing',
    activateMemberFailed: 'me.activateMemberFailed',
    
    // --- 解析选择 ---
    /** 解析成功标题 */
    parsed_choice_title: 'me.parsed_choice_title',
    /** 解析成功描述 */
    parsed_choice_desc: 'me.parsed_choice_desc',
    /** 更新双语按钮 */
    update_all: 'me.update_all',
    /** 更新单语言按钮 */
    update_detected: 'me.update_detected',
} as const

/**
 * 构造页面所需的完整 UI 对象
 * @param lang 界面语言 (AppLanguage)
 * @param data 页面当前的 Data，用于填充动态占位符（如金额、徽章名等）
 */
export function buildPageUI(lang: AppLanguage | undefined, data: any) {
    const ui: Record<string, string> = {}

    // 1. 自动执行全量静态 Key 映射
    Object.keys(UI_MAP).forEach((key) => {
        const i18nPath = UI_MAP[key as keyof typeof UI_MAP]
        ui[key] = t(i18nPath as any, lang)
    })

    // 注入主题色
    ui.cursorColor = themeManager.getPrimaryColor()

    // 2. 特殊动态逻辑处理：补差价升级引导
    const rawUpgradeGuide = t('me.upgradeGuide', lang) as string
    const displayAmount = typeof data.upgradeAmount === 'number' ? (data.upgradeAmount / 100).toFixed(1) : '0'
    ui.upgradeGuide = (rawUpgradeGuide || '').replace('{amount}', displayAmount)

    // 3. 特殊动态逻辑处理：会员续费文案
    if (data.memberBadgeText) {
        const rawRenewContent = t('me.memberRenewContent', lang) as string
        ui.memberRenewContent = (rawRenewContent || '').replace('{badge}', data.memberBadgeText)
    }

    return ui
}
