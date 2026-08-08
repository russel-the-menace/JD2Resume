import { TIMINGS, SuccessMode, InternalPhase } from './constants';

export interface CeremonyResult {
  mode: SuccessMode;
  phase: InternalPhase;
  stayTime: number;
}

/**
 * 获取基于参与路径的仪式配置
 * 统一“带登录墙”与“不带登录墙”的物理逻辑
 */
export function getCeremonyConfig(isManual: boolean): CeremonyResult {
  if (isManual) {
    // 场景 A: 只要调用了登录墙，无论新老用户，均展示 30vw + 透明背景仪式
    return {
      mode: 'new', // 对应带有 30vw 缩放逻辑的 WXSS
      phase: 'success',
      stayTime: TIMINGS.STAY_TIME_NEW
    };
  }

  // 场景 B: 没拉起登录墙 (静默登录)，展示 40vw + 纯白转透明仪式
  return {
    mode: 'old', // 对应锁定 40vw 的 WXSS
    phase: 'login-success',
    stayTime: TIMINGS.STAY_TIME_OLD
  };
}

/**
 * 封装淡出逻辑
 */
export function executeFadeOut(component: any, callback: Function) {
  // 1. 触发最终物理淡出
  component.setData({ internalPhase: 'hidden' });
  
  // 2. 彻底释放占位 (对应 CSS transition)
  setTimeout(() => {
    component.setData({ 
      _flowStarted: false, 
      _shouldShow: false 
    });
    callback();
  }, TIMINGS.FADE_OUT_DURATION);
}
