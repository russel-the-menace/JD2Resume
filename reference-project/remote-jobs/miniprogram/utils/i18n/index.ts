import { AppLanguage } from './types';
import { normalizeLanguage } from './core';
import { app } from './locales/app';
import { drawer } from './locales/drawer';
import { jobs } from './locales/jobs';
import { me } from './locales/me';
import { membership } from './locales/membership';
import { resume } from './locales/resume';
import { tab } from './locales/tab';

export { AppLanguage, TranslationItem } from './types';
export * from './core';

export const SUPPORTED_LANGUAGES: AppLanguage[] = ['Chinese', 'English', 'AIChinese', 'AIEnglish'];

// Combine all locales into the dictionary
const dict = {
  app,
  drawer,
  jobs,
  me,
  membership,
  resume,
  tab
};

// Helper type to generate keys like 'tab.jobs' | 'jobs.tabPublic'
type Join<K extends string, P extends string | number | symbol> = 
    P extends string ? `${K}.${P}` : never;

export type I18nKey = 
    | Join<'app', keyof typeof app>
    | Join<'drawer', keyof typeof drawer>
    | Join<'jobs', keyof typeof jobs>
    | Join<'me', keyof typeof me>
    | Join<'membership', keyof typeof membership>
    | Join<'resume', keyof typeof resume>
    | Join<'tab', keyof typeof tab>;

function getByPath(obj: any, path: string) {
    return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

/**
 * Get a localized string or object from the dictionary.
 */
export function t<T = string>(key: I18nKey, language?: AppLanguage): T {
    if (!language) {
        // Use global getApp if available
        try {
            // @ts-ignore
            const app = getApp();
            language = normalizeLanguage(app?.globalData?.language);
        } catch (e) {
            language = 'Chinese';
        }
    }
    
    // Ensure language is normalized (defaults to Chinese if invalid)
    language = normalizeLanguage(language);

    const item = getByPath(dict, key);
    const value = item?.[language];
    
    if (value !== undefined) return value as T;
    
    // Fallback logic
    let fallback: any;
    if (language === 'AIEnglish') {
        fallback = item?.['English'] || item?.['Chinese'];
    }
    else if (language === 'AIChinese') {
        fallback = item?.['Chinese'] || item?.['English'];
    }
    else {
        fallback = item?.['Chinese'] || item?.['English'];
    }
    
    return (fallback !== undefined ? fallback : key) as T;
}
