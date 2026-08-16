import './resume-renderer/puppet.css';
import { RENDERER_PROTOCOL, RENDERER_VERSION } from './resume-renderer/constants';
import { RendererError, rendererFailureCode } from './resume-renderer/errors';
import { replayCanonicalLayout, runCanonicalLayout } from './resume-renderer/layout';
import { isRenderMessage, type RendererToEditorMessage } from './resume-renderer/protocol';

let activeController: AbortController | null = null; let activeRequestId = '';
function post(message: RendererToEditorMessage) { window.parent.postMessage(message, window.location.origin); }
function failureReport(revision: number, snapshotHash: string, failureCode: string, error: unknown) { return { schemaVersion: 2 as const, revision, snapshotHash, rendererVersion: RENDERER_VERSION, durationMs: 0, fontFamily: '', fontReady: false, imageCount: 0, attempts: error instanceof RendererError && Array.isArray(error.details.attempts) ? error.details.attempts as any[] : [], acceptedAttempt: null, failureCode }; }
window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent || !isRenderMessage(event.data)) return;
  if (event.data.kind === 'CANCEL') { if (event.data.requestId === activeRequestId) activeController?.abort(); return; }
  activeController?.abort(); const controller = new AbortController(); activeController = controller; activeRequestId = event.data.requestId; const { requestId, snapshot } = event.data;
  document.documentElement.dataset.layoutMode = event.data.autoFit ? 'generation-fit' : 'fixed-layout';
  post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_STARTED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash });
  try { const result = await runCanonicalLayout(snapshot, controller.signal, { autoFit: event.data.autoFit, tuning: event.data.tuning }); if (controller.signal.aborted || activeRequestId !== requestId) return; document.documentElement.dataset.layoutAttempts = String(result.report.attempts.length); post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_SUCCEEDED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, ...result }); }
  catch (error) { if (controller.signal.aborted || activeRequestId !== requestId) return; const failureCode = rendererFailureCode(error); const report = failureReport(snapshot.revision, snapshot.snapshotHash, failureCode, error); console.warn(`[Renderer] Layout failed ${JSON.stringify({ failureCode, attempts: report.attempts })}`); post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_FAILED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, failureCode, report }); }
});
async function runExportReplay() {
  const params = new URLSearchParams(window.location.search); const token = params.get('session');
  if (!token) return;
  try {
    const response = await fetch(`/api/render-sessions/${encodeURIComponent(token)}`); if (!response.ok) throw new Error('session');
    const payload = await response.json(); const snapshot = { revision: payload.pagePlan.revision, snapshotHash: payload.snapshotHash, rendererVersion: payload.rendererVersion, document: payload.document };
    const result = await replayCanonicalLayout(snapshot, payload.pagePlan, new AbortController().signal);
    document.documentElement.dataset.replayResult = JSON.stringify({ rendererVersion: snapshot.rendererVersion, snapshotHash: snapshot.snapshotHash, pageCount: result.pagePlan.pages.length, blockOrder: result.pagePlan.blockOrder, pages: result.pages.map((page) => ({ pageNumber: page.pageNumber, blockIds: result.pagePlan.pages[page.pageNumber - 1].blockIds, overflowX: page.overflowX, overflowY: page.overflowY })) }); document.documentElement.dataset.renderStatus = 'ready';
  } catch (error) { const failureCode = rendererFailureCode(error); document.documentElement.dataset.replayResult = JSON.stringify({ rendererVersion: RENDERER_VERSION, snapshotHash: '', pageCount: 0, blockOrder: [], failureCode }); document.documentElement.dataset.renderStatus = 'failed'; }
}
if (new URLSearchParams(window.location.search).get('mode') === 'export') void runExportReplay();
else post({ protocol: RENDERER_PROTOCOL, kind: 'READY', rendererVersion: RENDERER_VERSION });
