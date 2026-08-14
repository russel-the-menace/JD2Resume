import type { CSSProperties } from 'react';
import { buildRendererBlocks, type RendererBlock } from './blocks';
import type { LayoutTuningV2, PagePlanV2, RenderSnapshot } from './types';

type Props = { snapshot: RenderSnapshot; tuning: LayoutTuningV2; pagePlan?: PagePlanV2 };
function tuningStyle(tuning: LayoutTuningV2, accent: string) { return { '--resume-accent': accent, '--layout-section-gap-delta': `${tuning.sectionGapDelta}px`, '--layout-line-height-delta': `${tuning.lineHeightDelta}px`, '--layout-font-size-delta': `${tuning.fontSizeDelta}px` } as CSSProperties; }
function tunedGap(block: RendererBlock, gapBefore: number) {
  if (block.kind === 'section-heading') return `clamp(8px, calc(${gapBefore}px + var(--layout-section-gap-delta, 0px)), 46px)`;
  if (block.kind === 'summary-paragraph' || block.kind === 'education-entry' || block.kind === 'skill-item' || block.kind === 'certificate-item') {
    const maximum = block.kind === 'education-entry' && gapBefore > 18 ? 38 : 30;
    return `clamp(8px, calc(${gapBefore}px + var(--layout-section-gap-delta, 0px)), ${maximum}px)`;
  }
  if (block.kind === 'experience-heading') return `clamp(8px, calc(${gapBefore}px + var(--layout-section-gap-delta, 0px)), ${gapBefore > 18 ? 38 : 30}px)`;
  if (block.kind === 'experience-bullet') return `clamp(${gapBefore > 8 ? 5 : 4}px, calc(${gapBefore}px + var(--layout-section-gap-delta, 0px)), ${gapBefore > 8 ? 16 : 12}px)`;
  return gapBefore;
}
export function PuppetBlock({ block, gapBefore = 0, tuneGap = false }: { block: RendererBlock; gapBefore?: number; tuneGap?: boolean }) {
  return <div data-resume-block="true" data-block-id={block.id} data-block-kind={block.kind} data-source-path={block.sourcePath} className={`puppet-block puppet-${block.kind}`} style={{ marginTop: tuneGap ? tunedGap(block, gapBefore) : gapBefore }}>{block.content}</div>;
}
export function PuppetMeasurementDocument({ snapshot, tuning }: Props) {
  return <article className="puppet-measurement-document" style={tuningStyle(tuning, snapshot.document.accent)} lang={snapshot.document.language === 'chinese' ? 'zh-CN' : 'en'}>{buildRendererBlocks(snapshot.document).map((block) => <PuppetBlock key={block.id} block={block} gapBefore={Number(block.gapBeforeToken) || 0} tuneGap />)}</article>;
}
export function PuppetPaginatedDocument({ snapshot, tuning, pagePlan }: Required<Props>) {
  const blocks = new Map(buildRendererBlocks(snapshot.document).map((block) => [block.id, block]));
  return <main className="puppet-document" data-renderer-version={pagePlan.rendererVersion} data-snapshot-hash={pagePlan.snapshotHash} data-page-count={pagePlan.pages.length} style={tuningStyle(tuning, snapshot.document.accent)} lang={snapshot.document.language === 'chinese' ? 'zh-CN' : 'en'}>
    {pagePlan.pages.map((page) => <article className="puppet-page" data-page-number={page.pageNumber} key={page.pageNumber}><div className="puppet-page-content">
      {page.blocks.map(({ id, gapBefore }) => { const block = blocks.get(id); return block ? <PuppetBlock key={id} block={block} gapBefore={gapBefore} /> : null; })}
    </div></article>)}
  </main>;
}
