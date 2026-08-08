import { themeManager, type ThemeMode } from './themeManager'

export type ThemeAwareOptions = {
  /** Called whenever theme changes (including initial attach). */
  onThemeChange?: (theme: ThemeMode) => void
}

/**
 * Attach a page/component instance to app-level theme events.
 * 
 * - Injects `theme` into instance data.
 * - Re-renders when theme changes.
 * - Returns a cleanup function.
 */
export function attachThemeAware(ctx: any, options: ThemeAwareOptions = {}) {
  const updateTheme = (theme: ThemeMode) => {
    ctx.setData({ theme });
    if (options.onThemeChange) {
      options.onThemeChange(theme);
    }
  };

  // Initial set
  const currentTheme = themeManager.getTheme();
  updateTheme(currentTheme);

  // Subscribe to changes
  const unsubscribe = themeManager.onThemeChange((newTheme) => {
    updateTheme(newTheme);
  });

  return unsubscribe;
}
