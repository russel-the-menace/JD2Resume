import { A4_HEIGHT_PX, MIN_PAGE_FILL_RATIO, NATURAL_TUNING, PUPPET_TUNING_STRATEGIES, RENDERER_VERSION, TARGET_BOTTOM_MARGIN_PX } from './constants';
import { RendererError } from './errors';
import { measureSnapshot } from './measurement';
import { paginateBlocks } from './paginate';
import { calibrate } from './tuning';
import type { LayoutAttemptReport, LayoutReportV2, LayoutTuningV2, PagePlanV2, PageQuality, RenderSnapshot } from './types';

type Validation = { pages: PageQuality[]; fontFamily: string; imageCount: number };
type RenderAndValidate = (snapshot: RenderSnapshot, plan: PagePlanV2, tuning: LayoutTuningV2, signal: AbortSignal) => Promise<Validation>;

function asFailure(error: unknown) { return error instanceof RendererError ? error.code : 'LAYOUT_ATTEMPTS_EXHAUSTED'; }

export async function runGenerationLayout(snapshot: RenderSnapshot, signal: AbortSignal, startedAt: number, renderAndValidate: RenderAndValidate): Promise<{ pagePlan: PagePlanV2; report: LayoutReportV2 }> {
  const natural = await measureSnapshot(snapshot, { ...NATURAL_TUNING, policy: 'spacing-fit' }, signal);
  const targetPageCount = Math.max(1, Math.round(natural.contentBottom / A4_HEIGHT_PX));
  const targetBottom = targetPageCount * A4_HEIGHT_PX - TARGET_BOTTOM_MARGIN_PX;
  const direction = natural.contentBottom <= targetBottom ? 1 : -1;
  const attempts: LayoutAttemptReport[] = [];
  const policies = new Set<string>();
  let bestUsable: { pagePlan: PagePlanV2; attempt: number; score: number; failureCode: string } | null = null;

  for (const [index, strategy] of PUPPET_TUNING_STRATEGIES.entries()) {
    if (policies.has(strategy.id)) throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { duplicatePolicy: strategy.id });
    policies.add(strategy.id);
    let candidate: { tuning: LayoutTuningV2; plan: PagePlanV2; measurement: typeof natural } | null = null;
    try {
      const calibrated = await calibrate(strategy, direction, targetBottom, async (tuning) => {
        const measurement = await measureSnapshot(snapshot, tuning, signal);
        return { measurement, plan: paginateBlocks(snapshot, measurement) };
      }, (value) => value.measurement.contentBottom);
      candidate = { tuning: calibrated.tuning, ...calibrated.value };
      const validation = await renderAndValidate(snapshot, candidate.plan, candidate.tuning, signal);
      const failureCodes: string[] = [];
      if (candidate.plan.pages.length !== targetPageCount) failureCodes.push('PAGE_COUNT_MISMATCH');
      if (!validation.pages.every((page) => page.fillRatio >= MIN_PAGE_FILL_RATIO)) failureCodes.push('PAGE_FILL_TOO_LOW');
      const valid = failureCodes.length === 0;
      attempts.push({ attempt: index + 1, policy: strategy.id, tuning: candidate.tuning, pageCount: candidate.plan.pages.length, targetPageCount, valid, pages: validation.pages, failureCodes });
      if (valid) return { pagePlan: candidate.plan, report: { schemaVersion: 2, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, rendererVersion: RENDERER_VERSION, durationMs: performance.now() - startedAt, fontFamily: validation.fontFamily, fontReady: true, imageCount: validation.imageCount, attempts, acceptedAttempt: index + 1, failureCode: null } };
      const minimumFill = Math.min(...validation.pages.map((page) => page.fillRatio));
      const score = Math.abs(candidate.plan.pages.length - targetPageCount) * 10 + (1 - minimumFill);
      if (!bestUsable || score < bestUsable.score) bestUsable = { pagePlan: candidate.plan, attempt: index + 1, score, failureCode: failureCodes[0] };
    } catch (error) {
      if (signal.aborted) throw error;
      attempts.push({ attempt: index + 1, policy: strategy.id, tuning: candidate?.tuning || { policy: strategy.id, sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 }, pageCount: candidate?.plan.pages.length || 0, targetPageCount, valid: false, pages: [], failureCodes: [asFailure(error)] });
    }
  }

  if (!bestUsable) throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { attempts });
  const validation = await renderAndValidate(snapshot, bestUsable.pagePlan, bestUsable.pagePlan.tuning, signal);
  return { pagePlan: bestUsable.pagePlan, report: { schemaVersion: 2, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, rendererVersion: RENDERER_VERSION, durationMs: performance.now() - startedAt, fontFamily: validation.fontFamily, fontReady: true, imageCount: validation.imageCount, attempts, acceptedAttempt: bestUsable.attempt, failureCode: bestUsable.failureCode } };
}
