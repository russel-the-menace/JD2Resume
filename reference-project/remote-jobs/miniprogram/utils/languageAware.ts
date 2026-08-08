import { normalizeLanguage, t, type AppLanguage } from './i18n/index'

export type LanguageAwareOptions = {
  /** Called whenever language changes (including initial attach). */
  onLanguageRevive?: (lang: AppLanguage) => void
}

/**
 * Attach a page/component to app-level language events.
 *
 * - Calls onLanguageRevive immediately with current language
 * - Re-calls onLanguageRevive whenever app.emitLanguageChange fires
 * - Returns a cleanup function (call it in onUnload/detached)
 */
export function attachLanguageAware(ctx: any, options: LanguageAwareOptions = {}) {
  const app = getApp() as any

  const getLang = () => normalizeLanguage(app && app.globalData ? app.globalData.language : null)

  const revive = () => {
    const lang = getLang()
    // Nav title is managed centrally by app.applyLanguage()/app.setLanguage.
    if (options.onLanguageRevive) options.onLanguageRevive(lang)
  }

  const listener = () => revive()

  // store to ctx for debugging
  ctx.__langListener = listener

  try {
    if (app && typeof app.onLanguageChange === 'function') app.onLanguageChange(listener)
  } catch {
    // ignore
  }

  // run once immediately
  revive()

  return () => {
    try {
      if (app && typeof app.offLanguageChange === 'function') app.offLanguageChange(listener)
    } catch {
      // ignore
    }
  }
}
