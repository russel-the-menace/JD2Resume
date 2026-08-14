import type { PagePlanV2 } from '../../src/resume-renderer/types';

export interface ReplayResult { rendererVersion: string; snapshotHash: string; pageCount: number; blockOrder: string[]; failureCode?: string; }
export function assertReplayMatchesPlan(replay: ReplayResult, plan: PagePlanV2, snapshotHash: string, rendererVersion: string) {
  if (replay.failureCode) throw new Error(`EXPORT_REPLAY_MISMATCH:${replay.failureCode}`);
  if (replay.rendererVersion !== rendererVersion || replay.snapshotHash !== snapshotHash) throw new Error('EXPORT_REPLAY_MISMATCH:metadata');
  if (replay.pageCount !== plan.pages.length) throw new Error('EXPORT_REPLAY_MISMATCH:page-count');
  if (replay.blockOrder.length !== plan.blockOrder.length || replay.blockOrder.some((id, index) => id !== plan.blockOrder[index])) throw new Error('EXPORT_REPLAY_MISMATCH:block-order');
}
