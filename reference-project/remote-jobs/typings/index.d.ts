/// <reference path="./types/index.d.ts" />

type AppUser = {
  openid?: string
  isAuthed?: boolean
  phone?: string | null
  nickname?: string | null
  avatar?: string | null
  language?: string
  membership?: {
    level: number
    expire_at: Date | string | null
    total_ai_usage: {
      used: number
      limit: number
    }
    pts_quota: {
      used: number
      limit: number
    }
    job_details: Record<string, {
      tweak_count: number
      email_count: number
      applied: boolean
      job_title: string
      createdAt: any
    }>
  }
  resume_profile?: {
    name: string
    photo: string
    gender: string
    birthday: string
    identity: string
    wechat: string
    email: string
    phone: string
    educations: Array<{
      school: string
      graduationDate: string
      major?: string
      degree?: string
      description?: string
      startDate?: string
      endDate?: string
    }>
    certificates: string[]
    workExperiences: Array<{
      company: string
      jobTitle: string
      businessDirection: string
      startDate: string
      endDate: string
    }>
    aiMessage: string
  }
  inviteCode?: string
  _id?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

type MemberScheme = {
  scheme_id: number
  name: string
  name_english?: string
  displayName?: string // 根据语言返回的显示名称
  price: number
  duration_days: number
  max_jobs?: number // 最大岗位数（-1表示不限制）
  max_resume_edits_per_job?: number // 每个岗位最大微调次数（-1表示不限制）
  total_resume_limit?: number // 总简历限制（-1表示按岗位数限制，300表示高级会员总额度）
  max_email_sends_per_job?: number // 每个岗位最大投递次数（-1表示不限制）
  max_email_communications_per_job?: number // 每个岗位最大沟通次数（0表示无沟通权，-1表示不限制）
  total_email_limit?: number // 总邮件限制（-1表示按岗位数限制，300表示高级会员总额度）
  _id?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

type UserJobUsage = {
  _id?: string
  user_id: string
  job_id: string
  job_title?: string
  resume_edits_count?: number
  last_resume_edit_at?: Date | string | null
  email_sends_count?: number
  email_communications_count?: number
  last_email_at?: Date | string | null
  createdAt?: Date | string
  updatedAt?: Date | string
}

type Order = {
  order_id: string
  user_id: string
  scheme_id: number
  amount: number
  status: '待支付' | '已支付' | '已退款' | '已关闭'
  pay_time?: Date | string | null
  _id?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}

interface IAppOption {
  globalData: {
    user: AppUser | null,
    userPromise: Promise<any> | null,
    bootStatus: import('../miniprogram/utils/bootManager').BootStatus,
    theme: 'light' | 'dark',
    language: import('../miniprogram/utils/i18n').AppLanguage,
    _langListeners: Set<(lang: import('../miniprogram/utils/i18n').AppLanguage) => void>,
    _userListeners: Set<(user: any) => void>,
    _splashAnimated: boolean,
    tabSelected: number,
    openMemberHubOnShow?: boolean,
    _pageData: {
      jobData: any,
      filterValue: any,
      filterTabIndex: number,
      filterResult: any,
      filterAction: string | null,
    },
    systemConfig: {
      isBeta: boolean,
      isMaintenance: boolean,
      maintenanceMessage?: string,
    },
    prefetchedData: {
      publicJobs: any,
      featuredJobs: any,
      memberSchemes: any,
      timestamp: number,
    },
    _prefilledJob: any,
  }
  refreshUser: () => Promise<any>,
  refreshSystemConfig: () => Promise<void>,
  preFetchJobs: () => Promise<void>,
  setLanguage: (lang: import('../miniprogram/utils/i18n').AppLanguage) => Promise<void>,
  applyLanguage: () => void,
  notifyLanguageListeners: (lang: import('../miniprogram/utils/i18n').AppLanguage) => void,
  notifyUserListeners: (user: any) => void,
  onLanguageChange: (cb: (lang: import('../miniprogram/utils/i18n').AppLanguage) => void) => void,
  offLanguageChange: (cb: (lang: import('../miniprogram/utils/i18n').AppLanguage) => void) => void,
  onUserChange: (cb: (user: any) => void) => void,
  offUserChange: (cb: (user: any) => void) => void,
  bootstrap: () => Promise<void>,
  initNetworkListener: () => void,
}
