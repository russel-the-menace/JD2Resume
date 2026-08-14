import { A4_HEIGHT_PX, PAGE_CONTENT_HEIGHT_PX, PAGE_CONTENT_WIDTH_PX, PAGE_MARGIN_TOP_PX, RENDERER_VERSION } from './constants';
import { buildConstrainedGroups } from './blockGraph';
import { RendererError } from './errors';
import type { MeasurementResult, PagePlanPage, PagePlanV2, RenderSnapshot } from './types';

type MutablePage = { blocks: Array<{ id: string; gapBefore: number }>; usedHeight: number };
function gapFor(block: MeasurementResult['blocks'][number], page: MutablePage) { return page.blocks.length ? Number.parseFloat(block.gapBeforeToken) || 0 : 0; }
function createPage(): MutablePage { return { blocks: [], usedHeight: 0 }; }
function assertSame(expected: string[], actual: string[]) {
  if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
    throw new RendererError('BLOCK_ID_MISSING', { expected, actual });
  }
}
export function paginateBlocks(snapshot: RenderSnapshot, measurement: MeasurementResult): PagePlanV2 {
  const ids = measurement.blocks.map((block) => block.id);
  if (new Set(ids).size !== ids.length) throw new RendererError('BLOCK_ID_DUPLICATE');
  assertSame(measurement.expectedBlockIds, ids);
  const pages: MutablePage[] = [createPage()];
  for (const group of buildConstrainedGroups(measurement.blocks)) {
    let page = pages[pages.length - 1];
    const heightFor = (target: MutablePage) => group.blocks.reduce((total, block) => total + gapFor(block, target) + block.height, 0);
    let required = heightFor(page);
    if (required > PAGE_CONTENT_HEIGHT_PX && page.blocks.length === 0) throw new RendererError('BLOCK_TOO_TALL', { blockIds: group.blocks.map((block) => block.id), requiredHeight: required });
    if (required > PAGE_CONTENT_HEIGHT_PX - page.usedHeight) { page = createPage(); pages.push(page); required = heightFor(page); }
    if (required > PAGE_CONTENT_HEIGHT_PX - page.usedHeight) throw new RendererError('BLOCK_TOO_TALL', { blockIds: group.blocks.map((block) => block.id), requiredHeight: required });
    group.blocks.forEach((block) => { const gapBefore = gapFor(block, page); page.blocks.push({ id: block.id, gapBefore }); page.usedHeight += gapBefore + block.height; });
  }
  const finalPages = pages.filter((page) => page.blocks.length > 0).map((page, index): PagePlanPage => ({
    pageNumber: index + 1, blockIds: page.blocks.map((block) => block.id), blocks: page.blocks,
    usedHeight: page.usedHeight, contentHeight: PAGE_CONTENT_HEIGHT_PX,
    contentFillRatio: page.usedHeight / PAGE_CONTENT_HEIGHT_PX,
    fillRatio: Math.min(1, (PAGE_MARGIN_TOP_PX + page.usedHeight) / A4_HEIGHT_PX),
  }));
  const blockOrder = finalPages.flatMap((page) => page.blockIds); assertSame(ids, blockOrder);
  return { schemaVersion: 2, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, rendererVersion: RENDERER_VERSION,
    pageWidth: 794, pageHeight: 1123, contentWidth: PAGE_CONTENT_WIDTH_PX, contentHeight: PAGE_CONTENT_HEIGHT_PX,
    tuning: measurement.tuning, pages: finalPages, blockOrder, createdAt: Date.now() };
}
