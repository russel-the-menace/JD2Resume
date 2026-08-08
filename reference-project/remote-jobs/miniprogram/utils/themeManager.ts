/**
 * ThemeManager.ts
 * 
 * Enterprise-grade theme orchestration for WeChat Mini Programs.
 * Handles system theme synchronization, user preference overrides, and event dispatching.
 */

export type ThemeMode = 'light' | 'dark';

type ThemeListener = (theme: ThemeMode) => void;

class ThemeManager {
  private static instance: ThemeManager;
  
  private currentTheme: ThemeMode = 'light';
  private listeners: Set<ThemeListener> = new Set();
  private isInitialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance of ThemeManager
   */
  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  /**
   * Initialize the theme manager.
   * Should be called early in the App lifecycle (e.g., onLaunch).
   */
  public init(): void {
    if (this.isInitialized) return;

    // 1. Snapshot initial system state
    try {
      const sysInfo = wx.getSystemInfoSync();
      // 'theme' property is available since base lib 2.11.0
      this.currentTheme = (sysInfo.theme as ThemeMode) || 'light';
      
      const app = getApp() as any;
      if (app && app.globalData) {
        app.globalData.theme = this.currentTheme;
      }
    } catch (e) {
      console.warn('[ThemeManager] Failed to get system theme info, defaulting to light.');
    }

    console.log(`[ThemeManager] Initialized. Current theme: ${this.currentTheme}`);

    // 2. Register system change listener
    wx.onThemeChange((res) => {
        this.handleThemeChange(res.theme as ThemeMode);
    });

    this.isInitialized = true;
  }

  /**
   * Handle internal processing of theme change
   */
  private handleThemeChange(newTheme: ThemeMode): void {
    const app = getApp() as any;
    if (app && app.globalData) {
      app.globalData.theme = newTheme;
    }

    // Determine effective theme (handle 'system' logic here if we add that later)
    if (newTheme !== this.currentTheme) {
      console.log(`[ThemeManager] Theme Changed: ${this.currentTheme} -> ${newTheme}`);
      this.currentTheme = newTheme;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to theme changes
   * @returns Unsubscribe function
   */
  public onThemeChange(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    return () => {
        this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
        try {
            listener(this.currentTheme);
        } catch (e) {
            console.error('[ThemeManager] Listener error:', e);
        }
    });
  }

  /**
   * Get current active theme
   */
  public getTheme(): ThemeMode {
      return this.currentTheme;
  }

  /**
   * Get the primary theme color (typically for cursors, actions)
   */
  public getPrimaryColor(): string {
    return this.currentTheme === 'dark' ? '#8AB4F8' : '#2E5FE9';
  }
}

export const themeManager = ThemeManager.getInstance();
