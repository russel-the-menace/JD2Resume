// remote-jobs/miniprogram/typings/types/api.d.ts

/**
 * 会员方案定义
 */
export interface IMemberScheme {
  scheme_id: number;
  type: 'plan' | 'topup';
  level: number;
  name_chinese: string;
  name_english: string;
  price: number;
  points: number;
  days: number;
  description_chinese?: string;
  description_english?: string;
  features_chinese?: string[];
  features_english?: string[];
  features_is_dash?: boolean[];
}

/**
 * 用户会员信息
 */
export interface IMemberInfo {
  level: number;
  expire_at?: string;
  points?: number;
}

/**
 * 用户对象
 */
export interface IUser {
  _id: string;
  phone?: string;
  phoneNumber?: string;
  openids?: string[];
  language?: string;
  nickname?: string;
  avatar?: string;
  membership: IMemberInfo;
  inviteCode?: string;
  profile?: any;
  isAuthed?: boolean;
}

/**
 * getMemberSchemes 接口返回结果
 */
export interface IGetMemberSchemesResult {
  schemes: IMemberScheme[];
  userScheme?: IMemberScheme;
}

/**
 * calculatePrice 接口返回结果
 */
export interface ICalculatePriceResult {
  originalPrice: number;
  finalPrice: number;
  isUpgrade: boolean;
  discountAmount: number;
}

/**
 * login 接口返回结果 (微信小程序 native login)
 */
export interface ILoginResult {
  openid: string;
  user: IUser;
}

/**
 * loginByOpenid 接口返回结果
 */
export interface ILoginByOpenidResult {
  token: string;
  user: IUser;
}
