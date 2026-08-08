// miniprogram/utils/phoneAuth.ts
// 手机号授权相关工具函数（仅使用 code 方式）
import { callApi } from './request'
import { ui } from './ui'
import { t } from './i18n/index'

interface PhoneAuthDetail {
    code?: string
    errMsg?: string
}

interface GetPhoneNumberResult {
    ok: boolean
    phone?: string
    error?: string
    errcode?: number
}

/**
 * 从授权数据中获取手机号（仅使用 code 方式）
 */
export async function getPhoneNumberFromAuth(detail: PhoneAuthDetail): Promise<string | undefined> {
    const code = detail?.code

    console.log('[PhoneAuth] Event detail:', {
        hasCode: !!code,
        codeLength: code?.length,
        errMsg: detail?.errMsg,
    })

    const hasCodeData = code && typeof code === 'string' && code.length > 0

    if (!hasCodeData) {
        console.warn('[PhoneAuth] Missing code')
        ui.showToast(t('resume.authCancel'))
        return undefined
    }

    console.log('[PhoneAuth] Using code authorization')
    return await getPhoneNumberByCode(code)
}

/**
 * 使用 code 方式获取手机号
 */
async function getPhoneNumberByCode(code: string): Promise<string | undefined> {
    console.log('[PhoneAuth] Calling backend with code')
    
    const res = await callApi('getPhoneNumber', { code })

    const responseData = res.result
    console.log('[PhoneAuth] API response:', responseData)

    if (!res.success || !responseData?.phone) {
        const errorMsg = res.message || '获取手机号失败'
        
        console.error('[PhoneAuth] Failed:', {
            error: errorMsg,
            fullResponse: res,
        })
        
        throw new Error(errorMsg)
    }

    if (responseData.token) {
        wx.setStorageSync('token', responseData.token)
    }

    console.log('[PhoneAuth] Success, phone:', responseData.phone)
    return responseData.phone
}

/**
 * 更新用户手机号
 */
export async function updatePhoneNumber(phone: string): Promise<void> {
    const updateRes = await callApi('updateUserProfile', { phone, isAuthed: true })

    if (!updateRes.success || !updateRes.result?.user) {
        console.error('[PhoneAuth] Update profile failed:', updateRes)
        throw new Error('更新用户信息失败')
    }

    const updatedUser = updateRes.result.user
    const app = getApp<IAppOption>() as any
    if (app?.globalData) app.globalData.user = updatedUser
}
