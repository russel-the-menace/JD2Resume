import { useCallback, useEffect, useRef, useState } from 'react';
import { INPUT_LAYOUT_DEBOUNCE_MS, MIN_LOADING_VISIBILITY_MS, RENDERER_PROTOCOL, RENDERER_VERSION, RENDER_TIMEOUT_MS } from '../../resume-renderer/constants';
import { snapshotHash } from '../../resume-renderer/snapshotHash';
import type { EditorToRendererMessage, RendererToEditorMessage } from '../../resume-renderer/protocol';
import type { LayoutReportV2, PagePlanV2, RendererResumeDocument } from '../../resume-renderer/types';

type Status = 'booting' | 'idle' | 'rendering' | 'ready' | 'failed';
export function useResumeRenderer({ document, revision, iframeRef, onValidPlan, onLayoutFailure }: { document: RendererResumeDocument; revision: number; iframeRef: React.RefObject<HTMLIFrameElement | null>; onValidPlan: (pagePlan: PagePlanV2, report: LayoutReportV2) => void; onLayoutFailure?: (snapshotHash: string, report: LayoutReportV2) => void }) {
  const [status, setStatus] = useState<Status>('booting'); const [failureCode, setFailureCode] = useState<string | null>(null);
  const readyRef = useRef(false); const latestRef = useRef<{ requestId: string; revision: number; hash: string } | null>(null); const timerRef = useRef<number | null>(null); const loadingStartedAtRef = useRef(0);
  const postRender = useCallback(async () => {
    const target = iframeRef.current?.contentWindow; if (!target || !readyRef.current) return;
    const immutableDocument = structuredClone(document); const hash = await snapshotHash(immutableDocument); const requestId = crypto.randomUUID();
    const previous = latestRef.current; if (previous) target.postMessage({ protocol: RENDERER_PROTOCOL, kind: 'CANCEL', requestId: previous.requestId, revision: previous.revision } satisfies EditorToRendererMessage, window.location.origin);
    latestRef.current = { requestId, revision, hash }; loadingStartedAtRef.current = performance.now(); setStatus('rendering'); setFailureCode(null);
    target.postMessage({ protocol: RENDERER_PROTOCOL, kind: 'RENDER', requestId, snapshot: { revision, snapshotHash: hash, rendererVersion: RENDERER_VERSION, document: immutableDocument } } satisfies EditorToRendererMessage, window.location.origin);
  }, [document, iframeRef, revision]);
  const schedule = useCallback((delay = INPUT_LAYOUT_DEBOUNCE_MS) => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); setStatus((current) => current === 'booting' ? current : 'rendering'); timerRef.current = window.setTimeout(() => void postRender(), delay); }, [postRender]);
  useEffect(() => { schedule(); return () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }; }, [schedule]);
  useEffect(() => {
    const timeout = window.setTimeout(() => { if (latestRef.current && status === 'rendering') { setStatus('failed'); setFailureCode('RENDER_TIMEOUT'); } }, RENDER_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [status, revision]);
  useEffect(() => {
    const receive = async (event: MessageEvent<RendererToEditorMessage>) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow || event.data?.protocol !== RENDERER_PROTOCOL) return;
      if (event.data.kind === 'READY') { if (event.data.rendererVersion !== RENDERER_VERSION) { setStatus('failed'); setFailureCode('PROTOCOL_MISMATCH'); return; } readyRef.current = true; setStatus('idle'); void postRender(); return; }
      const latest = latestRef.current; if (!latest || !('requestId' in event.data) || event.data.requestId !== latest.requestId || event.data.revision !== latest.revision || event.data.snapshotHash !== latest.hash) return;
      if (event.data.kind === 'RENDER_FAILED') { console.warn('[Resume Preview] Layout failed', { failureCode: event.data.failureCode, report: event.data.report }); setStatus('failed'); setFailureCode(event.data.failureCode); onLayoutFailure?.(event.data.snapshotHash, event.data.report); return; }
      if (event.data.kind !== 'RENDER_SUCCEEDED') return;
      const remaining = Math.max(0, MIN_LOADING_VISIBILITY_MS - (performance.now() - loadingStartedAtRef.current)); if (remaining) await new Promise((resolve) => window.setTimeout(resolve, remaining));
      if (latestRef.current?.requestId !== latest.requestId) return; onValidPlan(event.data.pagePlan, event.data.report); setStatus('ready');
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [iframeRef, onLayoutFailure, onValidPlan, postRender]);
  useEffect(() => () => { const latest = latestRef.current; if (latest) iframeRef.current?.contentWindow?.postMessage({ protocol: RENDERER_PROTOCOL, kind: 'CANCEL', requestId: latest.requestId, revision: latest.revision } satisfies EditorToRendererMessage, window.location.origin); }, [iframeRef]);
  return { status, isCovered: status !== 'ready', failureCode, retry: () => void postRender() };
}
