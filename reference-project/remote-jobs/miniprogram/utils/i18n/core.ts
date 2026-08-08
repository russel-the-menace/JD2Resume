import type { AppLanguage } from './types'

export function normalizeLanguage(input: any): AppLanguage {
    const v = typeof input === 'string' ? input.trim() : input
    if (typeof v === 'string') {
        const lower = v.toLowerCase()
        if (v === 'AIEnglish' || v === 'AI英文' || lower === 'aienglish') return 'AIEnglish'
        if (v === 'AIChinese' || v === 'AI全中文' || lower === 'aichinese') return 'AIChinese'
        if (v === 'English' || v === '英文' || v === 'en' || v === 'EN' || lower === 'english' || lower === 'en') return 'English'
        if (lower === 'chinese' || lower === 'zh' || lower === 'zh-cn' || lower === 'zh-hans') return 'Chinese'
    }
    return 'Chinese'
}
