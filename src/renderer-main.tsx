import { createRoot } from 'react-dom/client';
import './resume-renderer/puppet.css';
import { RENDERER_PROTOCOL, RENDERER_VERSION } from './resume-renderer/constants';
import { rendererFailureCode } from './resume-renderer/errors';
import { runCanonicalLayout } from './resume-renderer/layout';
import { isRenderMessage, type RendererToEditorMessage } from './resume-renderer/protocol';

let activeController: AbortController | null = null; let activeRequestId = '';
function post(message: RendererToEditorMessage) { window.parent.postMessage(message, window.location.origin); }
function emptyReport(revision: number, snapshotHash: string, failureCode: string) { return { schemaVersion: 2 as const, revision, snapshotHash, rendererVersion: RENDERER_VERSION, durationMs: 0, fontFamily: '', fontReady: false, imageCount: 0, attempts: [], acceptedAttempt: null, failureCode }; }
window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent || !isRenderMessage(event.data)) return;
  if (event.data.kind === 'CANCEL') { if (event.data.requestId === activeRequestId) activeController?.abort(); return; }
  activeController?.abort(); const controller = new AbortController(); activeController = controller; activeRequestId = event.data.requestId; const { requestId, snapshot } = event.data;
  post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_STARTED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash });
  try { const result = await runCanonicalLayout(snapshot, controller.signal); if (controller.signal.aborted || activeRequestId !== requestId) return; post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_SUCCEEDED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, ...result }); }
  catch (error) { if (controller.signal.aborted || activeRequestId !== requestId) return; const failureCode = rendererFailureCode(error); post({ protocol: RENDERER_PROTOCOL, kind: 'RENDER_FAILED', requestId, revision: snapshot.revision, snapshotHash: snapshot.snapshotHash, failureCode, report: emptyReport(snapshot.revision, snapshot.snapshotHash, failureCode) }); }
});
createRoot(document.querySelector('#renderer-root')!).render(<div className="renderer-boot" aria-hidden="true" />);
post({ protocol: RENDERER_PROTOCOL, kind: 'READY', rendererVersion: RENDERER_VERSION });
