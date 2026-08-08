export type InternalPhase = 'splash' | 'login' | 'success' | 'login-success' | 'hidden';
export type AuthState = 'idle' | 'loading' | 'success' | 'fail';
export type SuccessMode = 'new' | 'old' | '';

export const TIMINGS = {
  STAY_TIME_NEW: 3000,
  STAY_TIME_OLD: 1800, 
  MIN_SPLASH_HOLD: 1500, // 强制开屏至少展示1.5秒，确保呼吸动画完整
  FADE_OUT_DURATION: 2000, // 恢复到2秒（1.5s动画 + 0.5s冗余）
  RETRIAL_CYCLE: 4000,
  MIN_CHECK_INTERVAL: 300
};
