import { useRef } from 'react';
import { useResumeRenderer } from './useResumeRenderer';
import type { LayoutReportV2, LayoutTuningV2, PagePlanV2, RendererResumeDocument } from '../../resume-renderer/types';

export function ResumePreviewFrame({ document, revision, autoFit, tuning, onValidPlan, onLayoutFailure }: { document: RendererResumeDocument; revision: number; autoFit: boolean; tuning: LayoutTuningV2; onValidPlan: (pagePlan: PagePlanV2, report: LayoutReportV2) => void; onLayoutFailure?: (report: LayoutReportV2) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRefinedRef = useRef(false);
  const renderer = useResumeRenderer({ document, revision, autoFit, tuning, iframeRef, onValidPlan, onLayoutFailure: (_hash, report) => { if (!autoFit || contentRefinedRef.current) return; contentRefinedRef.current = true; onLayoutFailure?.(report); } }); const pages = renderer.pagePlan?.pages.length || 1;
  return <div className="canonical-preview" data-render-status={renderer.status}>
    <iframe ref={iframeRef} title="Canonical resume preview" className="canonical-preview-frame" src="/renderer.html" scrolling="no" tabIndex={-1} style={{ height: `${pages * 1157 - 34}px` }} />
  </div>;
}
