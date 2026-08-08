export type AppLanguage = 'Chinese' | 'English' | 'AIChinese' | 'AIEnglish'

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['Chinese', 'English', 'AIChinese', 'AIEnglish']

export type TranslationItem = {
    Chinese: string
    English: string
    AIChinese?: string
    AIEnglish?: string
    [key: string]: string | undefined
}
