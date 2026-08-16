import { createRoot, type Root } from 'react-dom/client';
import { RENDERER_VERSION } from './constants';
import { RendererError, assertNotAborted } from './errors';
import { runGenerationLayout } from './generationLayout';
import { measureSnapshot, afterTwoAnimationFrames, ensureCanonicalFont, waitForImages } from './measurement';
import { paginateBlocks } from './paginate';
import { validateRenderedDom } from './quality';
import { PuppetPaginatedDocument } from './PuppetDocument';
import { snapshotHash } from './snapshotHash';
import type { LayoutReportV2, LayoutTuningV2, PagePlanV2, RenderSnapshot } from './types';

let finalRoot: Root | null = null;
function renderHost() { let host = document.querySelector<HTMLElement>('#renderer-root'); if (!host) throw new RendererError('MEASUREMENT_ROOT_MISSING'); if (!finalRoot) finalRoot = createRoot(host); return { host, root: finalRoot }; }
async function renderAndValidate(snapshot: RenderSnapshot, plan: PagePlanV2, tuning: LayoutTuningV2, signal: AbortSignal) {
  const { host, root } = renderHost(); root.render(<PuppetPaginatedDocument snapshot={snapshot} pagePlan={plan} tuning={tuning} />); await afterTwoAnimationFrames(); assertNotAborted(signal); await ensureCanonicalFont(); const imageCount = await waitForImages(host); await afterTwoAnimationFrames(); assertNotAborted(signal); return { ...validateRenderedDom(plan), imageCount };
}
export async function replayCanonicalLayout(snapshot: RenderSnapshot, plan: PagePlanV2, signal: AbortSignal) {
  if (snapshot.rendererVersion !== RENDERER_VERSION || plan.rendererVersion !== RENDERER_VERSION || plan.snapshotHash !== snapshot.snapshotHash) throw new RendererError('EXPORT_REPLAY_MISMATCH');
  if (await snapshotHash(snapshot.document) !== snapshot.snapshotHash) throw new RendererError('SNAPSHOT_HASH_MISMATCH');
  const validation = await renderAndValidate(snapshot, plan, plan.tuning, signal);
  return { ...validation, pagePlan: plan };
}
async function runFixedLayout(snapshot: RenderSnapshot, tuning: LayoutTuningV2, signal: AbortSignal, startedAt: number): Promise<{ pagePlan: PagePlanV2; report: LayoutReportV2 }> {
  const measurement = await measureSnapshot(snapshot, tuning, signal);
  const pagePlan = paginateBlocks(snapshot, measurement);
  const validation = await renderAndValidate(snapshot, pagePlan, tuning, signal);
  return {
    pagePlan,
    report: {
      schemaVersion: 2, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, rendererVersion: RENDERER_VERSION,
      durationMs: performance.now() - startedAt, fontFamily: validation.fontFamily, fontReady: true, imageCount: validation.imageCount,
      attempts: [{ attempt: 1, policy: tuning.policy, tuning, pageCount: pagePlan.pages.length, targetPageCount: pagePlan.pages.length, valid: true, pages: validation.pages, failureCodes: [] }],
      acceptedAttempt: 1, failureCode: null,
    },
  };
}
export async function runCanonicalLayout(snapshot: RenderSnapshot, signal: AbortSignal, options: { autoFit: boolean; tuning: LayoutTuningV2 }): Promise<{ pagePlan: PagePlanV2; report: LayoutReportV2 }> {
  const startedAt = performance.now(); assertNotAborted(signal);
  if (snapshot.rendererVersion !== RENDERER_VERSION || snapshot.document.template !== 'profile') throw new RendererError('PROTOCOL_MISMATCH');
  if (await snapshotHash(snapshot.document) !== snapshot.snapshotHash) throw new RendererError('SNAPSHOT_HASH_MISMATCH');
  assertNotAborted(signal); await ensureCanonicalFont(); assertNotAborted(signal);
  if (!options.autoFit) return runFixedLayout(snapshot, options.tuning, signal, startedAt);
  return runGenerationLayout(snapshot, signal, startedAt, renderAndValidate);
}
