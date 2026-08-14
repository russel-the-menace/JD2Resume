import { MIN_PAGE_FILL_RATIO, MIN_PARAGRAPH_LINE_HEIGHT, MIN_RESPONSIBILITY_LINE_HEIGHT, MIN_SKILL_LINE_HEIGHT, PAGE_MARGIN_TOP_PX, PIXEL_EPSILON } from './constants';
import { isHeadingKind } from './blockGraph';
import { RendererError } from './errors';
import type { PagePlanV2, PageQuality } from './types';

export function validateRenderedDom(plan: PagePlanV2): { pages: PageQuality[]; fontFamily: string; imageCount: number } {
  const root = document.querySelector<HTMLElement>('.puppet-document'); if (!root) throw new RendererError('MEASUREMENT_ROOT_MISSING');
  const pages = Array.from(root.querySelectorAll<HTMLElement>('.puppet-page')); if (pages.length !== plan.pages.length) throw new RendererError('PAGE_COUNT_MISMATCH');
  const expected = plan.blockOrder; const actual: string[] = [];
  const quality = pages.map((page, pageIndex) => { const content = page.querySelector<HTMLElement>('.puppet-page-content'); if (!content) throw new RendererError('MEASUREMENT_ROOT_MISSING'); const contentRect = content.getBoundingClientRect(); const blocks = Array.from(content.querySelectorAll<HTMLElement>('[data-resume-block="true"]')); let usedHeight = 0; let overflowX = 0; let overflowY = 0; const orphanBlockIds: string[] = [];
    blocks.forEach((block, index) => { const id = block.dataset.blockId || ''; actual.push(id); const rect = block.getBoundingClientRect(); usedHeight = Math.max(usedHeight, rect.bottom - contentRect.top); overflowX = Math.max(overflowX, contentRect.left - rect.left, rect.right - contentRect.right, 0); overflowY = Math.max(overflowY, contentRect.top - rect.top, rect.bottom - contentRect.bottom, 0); if (isHeadingKind(block.dataset.blockKind || '') && !blocks[index + 1]) orphanBlockIds.push(id); });
    return { pageNumber: pageIndex + 1, fillRatio: Math.min(1, (PAGE_MARGIN_TOP_PX + usedHeight) / 1123), usedHeight, overflowX, overflowY, orphanBlockIds, duplicateBlockIds: [], missingBlockIds: [] }; });
  const duplicates = actual.filter((id, index) => actual.indexOf(id) !== index); const missing = expected.filter((id) => !actual.includes(id));
  if (duplicates.length) throw new RendererError('BLOCK_ID_DUPLICATE', { duplicates }); if (missing.length || actual.length !== expected.length) throw new RendererError('BLOCK_ID_MISSING', { missing, actual });
  if (quality.some((page) => page.overflowX > PIXEL_EPSILON)) throw new RendererError('PAGE_OVERFLOW_X'); if (quality.some((page) => page.overflowY > PIXEL_EPSILON)) throw new RendererError('PAGE_OVERFLOW_Y'); if (quality.some((page) => page.orphanBlockIds.length)) throw new RendererError('ORPHAN_HEADING');
  const paragraphLineHeight = parseFloat(getComputedStyle(root.querySelector('.puppet-summary-paragraph') || root).lineHeight) || 0; const responsibilityLineHeight = parseFloat(getComputedStyle(root.querySelector('.puppet-experience-bullet') || root).lineHeight) || 0; const skillLineHeight = parseFloat(getComputedStyle(root.querySelector('.puppet-skill-item') || root).lineHeight) || 0;
  if ((paragraphLineHeight && paragraphLineHeight < MIN_PARAGRAPH_LINE_HEIGHT) || (responsibilityLineHeight && responsibilityLineHeight < MIN_RESPONSIBILITY_LINE_HEIGHT) || (skillLineHeight && skillLineHeight < MIN_SKILL_LINE_HEIGHT)) throw new RendererError('LAYOUT_ATTEMPTS_EXHAUSTED');
  return { pages: quality, fontFamily: getComputedStyle(root).fontFamily, imageCount: root.querySelectorAll('img').length };
}
export function meetsFillThreshold(pages: PageQuality[]) { return pages.every((page) => page.fillRatio >= MIN_PAGE_FILL_RATIO); }
