import { useRef } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useResumeRenderer } from './useResumeRenderer';
import type { LayoutReportV2, PagePlanV2, RendererResumeDocument } from '../../resume-renderer/types';

export function ResumePreviewFrame({ document, revision, lastPlan, onValidPlan, allowContentRefinement = false, onLayoutFailure }: { document: RendererResumeDocument; revision: number; lastPlan: PagePlanV2 | null; onValidPlan: (pagePlan: PagePlanV2, report: LayoutReportV2) => void; allowContentRefinement?: boolean; onLayoutFailure?: (report: LayoutReportV2) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRefinedRef = useRef(false);
  const renderer = useResumeRenderer({ document, revision, iframeRef, onValidPlan, onLayoutFailure: (_hash, report) => { if (!allowContentRefinement || contentRefinedRef.current) return; contentRefinedRef.current = true; onLayoutFailure?.(report); } }); const visiblePlan = renderer.status === 'ready' ? lastPlan : null; const pages = visiblePlan?.pages.length || 1;
  return <div className="canonical-preview" data-render-status={renderer.status}>
    <iframe ref={iframeRef} title="Canonical resume preview" className="canonical-preview-frame" src="/renderer.html" style={{ height: `${pages * 1157 - 34}px` }} />
    {renderer.isCovered && <div className="canonical-preview-cover" role="status"><LoaderCircle size={22} /><span>{renderer.status === 'failed' ? 'Layout needs another pass' : 'Adjusting resume layout'}</span>{renderer.status === 'failed' && <button type="button" className="canonical-preview-retry" onClick={renderer.retry} title="Retry layout"><RefreshCw size={16} /></button>}</div>}
  </div>;
}
