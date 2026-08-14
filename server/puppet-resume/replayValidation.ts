import type { PagePlanV2 } from '../../src/resume-renderer/types';

export interface ReplayPage { pageNumber: number; blockIds: string[]; overflowX: number; overflowY: number; }
export interface ReplayResult { rendererVersion: string; snapshotHash: string; pageCount: number; blockOrder: string[]; pages?: ReplayPage[]; failureCode?: string; }
export function assertReplayMatchesPlan(replay: ReplayResult, plan: PagePlanV2, snapshotHash: string, rendererVersion: string) {
  if (replay.failureCode) throw new Error(`EXPORT_REPLAY_MISMATCH:${replay.failureCode}`);
  if (replay.rendererVersion !== rendererVersion || replay.snapshotHash !== snapshotHash) throw new Error('EXPORT_REPLAY_MISMATCH:metadata');
  if (replay.pageCount !== plan.pages.length) throw new Error('EXPORT_REPLAY_MISMATCH:page-count');
  if (replay.blockOrder.length !== plan.blockOrder.length || replay.blockOrder.some((id, index) => id !== plan.blockOrder[index])) throw new Error('EXPORT_REPLAY_MISMATCH:block-order');
  if (!replay.pages || replay.pages.length !== plan.pages.length) throw new Error('EXPORT_REPLAY_MISMATCH:pages');
  replay.pages.forEach((page, index) => {
    const expected = plan.pages[index];
    if (page.pageNumber !== expected.pageNumber || page.blockIds.length !== expected.blockIds.length || page.blockIds.some((id, blockIndex) => id !== expected.blockIds[blockIndex])) throw new Error(`EXPORT_REPLAY_MISMATCH:page-${expected.pageNumber}`);
    if (page.overflowX > 1 || page.overflowY > 1) throw new Error(`EXPORT_REPLAY_MISMATCH:overflow-${expected.pageNumber}`);
  });
}
