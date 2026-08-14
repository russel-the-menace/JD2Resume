import assert from 'node:assert/strict';
import { assertReplayMatchesPlan } from '../server/puppet-resume/replayValidation';

const plan = { pages: [{ pageNumber: 1, blockIds: ['header'] }], blockOrder: ['header'] } as any;
assert.throws(() => assertReplayMatchesPlan({ rendererVersion: 'wrong', snapshotHash: 'wrong', pageCount: 1, blockOrder: ['header'], pages: [] }, plan, 'hash', 'version'), /EXPORT_REPLAY_MISMATCH/);
console.log('PDF replay parity guard verified.');
