import { createRoot, type Root } from 'react-dom/client';
import { A4_HEIGHT_PX, MIN_PAGE_FILL_RATIO, NATURAL_TUNING, PUPPET_TUNING_STRATEGIES, RENDERER_VERSION, TARGET_BOTTOM_MARGIN_PX } from './constants';
import { RendererError, assertNotAborted } from './errors';
import { measureSnapshot, afterTwoAnimationFrames, ensureCanonicalFont, waitForImages } from './measurement';
import { paginateBlocks } from './paginate';
import { validateRenderedDom } from './quality';
import { PuppetPaginatedDocument } from './PuppetDocument';
import { snapshotHash } from './snapshotHash';
import { calibrate } from './tuning';
import type { LayoutAttemptReport, LayoutReportV2, LayoutTuningV2, PagePlanV2, RenderSnapshot } from './types';

let finalRoot: Root | null = null;
function renderHost() { let host = document.querySelector<HTMLElement>('#renderer-root'); if (!host) throw new RendererError('MEASUREMENT_ROOT_MISSING'); if (!finalRoot) finalRoot = createRoot(host); return { host, root: finalRoot }; }
async function renderAndValidate(snapshot: RenderSnapshot, plan: PagePlanV2, tuning: LayoutTuningV2, signal: AbortSignal) {
  const { host, root } = renderHost(); root.render(<PuppetPaginatedDocument snapshot={snapshot} pagePlan={plan} tuning={tuning} />); await afterTwoAnimationFrames(); assertNotAborted(signal); await ensureCanonicalFont(); const imageCount = await waitForImages(host); await afterTwoAnimationFrames(); assertNotAborted(signal); return { ...validateRenderedDom(plan), imageCount };
}
function asFailure(error: unknown) { return error instanceof RendererError ? error.code : 'LAYOUT_ATTEMPTS_EXHAUSTED'; }
export async function runCanonicalLayout(snapshot: RenderSnapshot, signal: AbortSignal): Promise<{ pagePlan: PagePlanV2; report: LayoutReportV2 }> {
  const startedAt = performance.now(); assertNotAborted(signal);
  if (snapshot.rendererVersion !== RENDERER_VERSION || snapshot.document.template !== 'profile') throw new RendererError('PROTOCOL_MISMATCH');
  if (await snapshotHash(snapshot.document) !== snapshot.snapshotHash) throw new RendererError('SNAPSHOT_HASH_MISMATCH');
  assertNotAborted(signal); await ensureCanonicalFont(); assertNotAborted(signal);
  const natural = await measureSnapshot(snapshot, { ...NATURAL_TUNING, policy: 'spacing-fit' }, signal);
  const targetPageCount = Math.max(1, Math.round(natural.contentBottom / A4_HEIGHT_PX)); const targetBottom = targetPageCount * A4_HEIGHT_PX - TARGET_BOTTOM_MARGIN_PX; const direction = natural.contentBottom <= targetBottom ? 1 : -1;
  const attempts: LayoutAttemptReport[] = []; const policies = new Set<string>();
  for (const [index, strategy] of PUPPET_TUNING_STRATEGIES.entries()) {
    if (policies.has(strategy.id)) throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { duplicatePolicy: strategy.id }); policies.add(strategy.id); assertNotAborted(signal);
    let candidate: { tuning: LayoutTuningV2; plan: PagePlanV2; measurement: typeof natural } | null = null;
    try {
      const calibrated = await calibrate(strategy, direction, targetBottom, async (tuning) => { assertNotAborted(signal); const measurement = await measureSnapshot(snapshot, tuning, signal); return { measurement, plan: paginateBlocks(snapshot, measurement) }; }, (value) => value.measurement.contentBottom);
      candidate = { tuning: calibrated.tuning, ...calibrated.value }; const validation = await renderAndValidate(snapshot, candidate.plan, candidate.tuning, signal);
      const failureCodes: string[] = []; if (candidate.plan.pages.length !== targetPageCount) failureCodes.push('PAGE_COUNT_MISMATCH'); if (!validation.pages.every((page) => page.fillRatio >= MIN_PAGE_FILL_RATIO)) failureCodes.push('PAGE_FILL_TOO_LOW');
      const valid = failureCodes.length === 0;
      attempts.push({ attempt: index + 1, policy: strategy.id, tuning: candidate.tuning, pageCount: candidate.plan.pages.length, targetPageCount, valid, pages: validation.pages, failureCodes });
      if (valid) return { pagePlan: candidate.plan, report: { schemaVersion: 2, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, rendererVersion: RENDERER_VERSION, durationMs: performance.now() - startedAt, fontFamily: validation.fontFamily, fontReady: true, imageCount: validation.imageCount, attempts, acceptedAttempt: index + 1, failureCode: null } };
    } catch (error) {
      if (signal.aborted) throw error; attempts.push({ attempt: index + 1, policy: strategy.id, tuning: candidate?.tuning || { policy: strategy.id, sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 }, pageCount: candidate?.plan.pages.length || 0, targetPageCount, valid: false, pages: [], failureCodes: [asFailure(error)] });
    }
  }
  throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED', { attempts });
}
