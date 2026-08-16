import assert from 'node:assert/strict';
import { canonicalize } from '../src/resume-renderer/canonicalJson';
import { snapshotHash } from '../src/resume-renderer/snapshotHash';
import { ExportSessionStore } from '../server/puppet-resume/exportSession';
import { assertReplayMatchesPlan, type ReplayResult } from '../server/puppet-resume/replayValidation';
import type { PagePlanV2, RendererResumeDocument } from '../src/resume-renderer/types';
import { RENDERER_VERSION } from '../src/resume-renderer/constants';
import { buildRendererBlocks } from '../src/resume-renderer/blocks';
import { hideOneBulletForSkills, skillsStartOnNewPage } from '../src/resume-renderer/fitSkills';

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
const customSkillGap = buildRendererBlocks({
  ...document,
  data: { ...document.data, skills: { titleItemGap: 22, titleOffsetX: 7, categories: [{ title: 'Delivery', items: ['Release planning'] }] } },
}).find((block) => block.kind === 'skill-item')?.content as any;
assert.equal(customSkillGap.props.children[0].props.children[1].props.style.marginTop, 22);
assert.equal(customSkillGap.props.children[0].props.children[0].props.style.transform, 'translateX(7px)');
const customHeader = buildRendererBlocks({ ...document, data: { ...document.data, basics: { fullName: 'Contract', headerHeight: 180 } } })[0].content as any;
assert.equal(customHeader.props.style.height, 180);
assert.equal(customHeader.props.children[0].props.className, 'resume-header-content');
const skillFitData = {
  ...document.data,
  experience: [1, 2].map((id) => ({
    id,
    bullets: Array.from({ length: 8 }, (_, index) => id === 2 && index === 7 ? '<u>keep emphasized</u>' : `Experience ${id} bullet ${index}`),
  })),
};
const skillFitPlan = {
  schemaVersion: 2, revision: 1, snapshotHash: 'skill-fit', rendererVersion: RENDERER_VERSION,
  pageWidth: 794, pageHeight: 1123, contentWidth: 694, contentHeight: 1043,
  tuning: { policy: 'spacing-fit', sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 },
  pages: [
    { pageNumber: 1, blockIds: ['header'], blocks: [], fillRatio: 1, contentFillRatio: 1, usedHeight: 1043, contentHeight: 1043 },
    { pageNumber: 2, blockIds: ['experience.1.bullet.7', 'experience.2.heading', ...Array.from({ length: 8 }, (_, index) => `experience.2.bullet.${index}`)], blocks: [], fillRatio: 1, contentFillRatio: 1, usedHeight: 1043, contentHeight: 1043 },
    { pageNumber: 3, blockIds: ['skills.heading', 'skills.content.item.0'], blocks: [], fillRatio: 0.6, contentFillRatio: 0.6, usedHeight: 600, contentHeight: 1043 },
  ],
  blockOrder: [], createdAt: 1,
} satisfies PagePlanV2;
assert.equal(skillsStartOnNewPage(skillFitPlan), true);
const firstFit = hideOneBulletForSkills(skillFitData, skillFitPlan)!;
assert.equal(firstFit.experience[0].bullets?.length, 8);
assert.equal(firstFit.experience[1].bullets?.length, 8);
assert.equal(firstFit.experience[1].hiddenBullets?.filter(Boolean).length, 1);
assert.equal(firstFit.experience[1].bullets?.includes('<u>keep emphasized</u>'), true);
const secondFit = hideOneBulletForSkills(firstFit, skillFitPlan)!;
assert.equal(secondFit.experience[0].bullets?.length, 8);
assert.equal(secondFit.experience[0].hiddenBullets?.filter(Boolean).length, 1);
assert.equal(secondFit.experience[1].hiddenBullets?.filter(Boolean).length, 1);
assert.equal(hideOneBulletForSkills({ ...skillFitData, experience: skillFitData.experience.map((entry) => ({ ...entry, bullets: entry.bullets.slice(0, 3) })) }, skillFitPlan), null);
assert.equal(skillsStartOnNewPage({ ...skillFitPlan, pages: [skillFitPlan.pages[0], { ...skillFitPlan.pages[1], blockIds: [...skillFitPlan.pages[1].blockIds, 'skills.heading', 'skills.content.item.0'] }] }), false);
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
