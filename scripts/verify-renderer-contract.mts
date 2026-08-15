import assert from 'node:assert/strict';
import { canonicalize } from '../src/resume-renderer/canonicalJson';
import { snapshotHash } from '../src/resume-renderer/snapshotHash';
import { ExportSessionStore } from '../server/puppet-resume/exportSession';
import { assertReplayMatchesPlan, type ReplayResult } from '../server/puppet-resume/replayValidation';
import type { PagePlanV2, RendererResumeDocument } from '../src/resume-renderer/types';
import { RENDERER_VERSION } from '../src/resume-renderer/constants';
import { buildRendererBlocks } from '../src/resume-renderer/blocks';

const document: RendererResumeDocument = {
  id: 'contract', documentName: 'Contract', language: 'english', template: 'profile', accent: '#167c65',
  customSections: [], customContent: {}, sectionOrder: ['summary'], sectionOrderCustomized: false,
  data: { basics: { fullName: 'Contract' }, summary: 'One paragraph', education: [], experience: [], skills: {}, certificates: [] },
};
assert.equal(canonicalize({ z: 1, a: undefined, nested: { b: 2, a: 1 } }), '{"nested":{"a":1,"b":2},"z":1}');
const hash = await snapshotHash(document);
assert.match(hash, /^sha256:[0-9a-f]{64}$/);
const skillBlocks = buildRendererBlocks({
  ...document,
  data: {
    ...document.data,
    skills: { categories: [{ title: '招聘实操', items: ['候选人评估', '渠道运营'] }] },
  },
});
assert.equal(skillBlocks.some((block) => block.kind === 'section-heading' && block.sourcePath === 'data.skills'), true);
assert.equal(skillBlocks.some((block) => block.kind === 'skill-item' && block.sourcePath === 'data.skills'), true);
const plan = {
  schemaVersion: 2, revision: 4, snapshotHash: hash, rendererVersion: RENDERER_VERSION,
  pageWidth: 794, pageHeight: 1123, contentWidth: 694, contentHeight: 1043,
  tuning: { policy: 'spacing-fit', sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 },
  pages: [{ pageNumber: 1, blockIds: ['header'], blocks: [{ id: 'header', gapBefore: 0 }], fillRatio: 0.95, contentFillRatio: 0.9, usedHeight: 950, contentHeight: 1043 }],
  blockOrder: ['header'], createdAt: 1,
} satisfies PagePlanV2;
const replay: ReplayResult = { rendererVersion: RENDERER_VERSION, snapshotHash: hash, pageCount: 1, blockOrder: ['header'], pages: [{ pageNumber: 1, blockIds: ['header'], overflowX: 0, overflowY: 0 }] };
assert.doesNotThrow(() => assertReplayMatchesPlan(replay, plan, hash, RENDERER_VERSION));
assert.throws(() => assertReplayMatchesPlan({ ...replay, pages: [{ ...replay.pages![0], blockIds: [] }] }, plan, hash, RENDERER_VERSION), /page-1/);
const sessions = new ExportSessionStore();
const session = sessions.create({ document, pagePlan: plan, snapshotHash: hash, rendererVersion: RENDERER_VERSION, expiresAt: Date.now() + 60_000 });
assert.equal(sessions.consume(session.token)?.token, session.token);
assert.equal(sessions.consume(session.token), null);
console.log('Renderer contracts verified.');
