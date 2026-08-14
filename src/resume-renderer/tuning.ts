import { CALIBRATION_STEPS, MAX_TUNING_INTENSITY } from './constants';
import type { LayoutPolicy, LayoutTuningV2 } from './types';
export function scaledTuning(strategy: { id: LayoutPolicy; sectionGapDelta: number; lineHeightDelta: number; fontSizeDelta: number }, direction: number, intensity: number): LayoutTuningV2 {
  return { policy: strategy.id, sectionGapDelta: strategy.sectionGapDelta * direction * intensity, lineHeightDelta: strategy.lineHeightDelta * direction * intensity, fontSizeDelta: strategy.fontSizeDelta * direction * intensity };
}
export async function calibrate<T>(strategy: { id: LayoutPolicy; sectionGapDelta: number; lineHeightDelta: number; fontSizeDelta: number }, direction: number, targetBottom: number, measure: (tuning: LayoutTuningV2) => Promise<T>, bottom: (value: T) => number): Promise<{ tuning: LayoutTuningV2; value: T }> {
  let lower = 0; let upper = MAX_TUNING_INTENSITY; let best: { tuning: LayoutTuningV2; value: T; distance: number } | null = null;
  for (let step = 0; step < CALIBRATION_STEPS; step += 1) {
    const intensity = step === 0 ? 1 : (lower + upper) / 2;
    const tuning = scaledTuning(strategy, direction, intensity); const value = await measure(tuning); const valueBottom = bottom(value);
    const distance = Math.abs(valueBottom - targetBottom); if (!best || distance < best.distance) best = { tuning, value, distance };
    if ((direction > 0 && valueBottom < targetBottom) || (direction < 0 && valueBottom > targetBottom)) lower = intensity; else upper = intensity;
  }
  if (!best) throw new Error(`Unable to calibrate ${strategy.id}`); return best;
}
