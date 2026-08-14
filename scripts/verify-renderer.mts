import assert from 'node:assert/strict';
import { canonicalize } from '../src/resume-renderer/canonicalJson';
import { paginateBlocks } from '../src/resume-renderer/paginate';
import type { MeasurementResult, RenderSnapshot } from '../src/resume-renderer/types';
import { RENDERER_VERSION } from '../src/resume-renderer/constants';

const snapshot: RenderSnapshot = {
  revision: 7, snapshotHash: 'sha256:test', rendererVersion: RENDERER_VERSION,
  document: { id: 'test', documentName: 'Test', language: 'english', template: 'profile', accent: '#167c65', customSections: [], customContent: {}, sectionOrder: ['summary'], sectionOrderCustomized: false, data: { basics: {}, summary: '', education: [], experience: [], skills: {}, certificates: [] } },
};
const descriptors = [
  ['header', 'header', 0, 100], ['summary.heading', 'section-heading', 1, 40], ['summary.paragraph.0', 'summary-paragraph', 0, 880], ['education.heading', 'section-heading', 1, 40], ['education.1', 'education-entry', 0, 180],
] as const;
const measurement: MeasurementResult = { tuning: { policy: 'spacing-fit', sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 }, expectedBlockIds: descriptors.map(([id]) => id), contentBottom: 1240, blocks: descriptors.map(([id, kind, keepWithNext, height], order) => ({ id, kind: kind as any, sourcePath: id, order, keepWithNext, atomic: true, gapBeforeToken: order ? '0' : '0', gapAfterToken: '0', width: 694, height, naturalTop: 0, naturalBottom: height, computedFontSize: 14, computedLineHeight: 22 })) };
const plan = paginateBlocks(snapshot, measurement);
assert.equal(plan.pages.length, 2);
assert.deepEqual(plan.blockOrder, measurement.expectedBlockIds);
assert.deepEqual(plan.pages[1].blockIds.slice(0, 2), ['education.heading', 'education.1']);
assert.equal(canonicalize({ z: 1, a: undefined, b: { y: 2, x: 1 } }), '{"b":{"x":1,"y":2},"z":1}');
