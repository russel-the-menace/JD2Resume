export const RENDERER_FAILURE_CODES = [
  'RENDERER_NOT_READY', 'PROTOCOL_MISMATCH', 'STALE_REVISION', 'SNAPSHOT_HASH_MISMATCH',
  'FONT_LOAD_FAILED', 'IMAGE_DECODE_FAILED', 'MEASUREMENT_ROOT_MISSING', 'BLOCK_ID_DUPLICATE',
  'BLOCK_ID_MISSING', 'BLOCK_TOO_TALL', 'PAGE_OVERFLOW_X', 'PAGE_OVERFLOW_Y', 'ORPHAN_HEADING',
  'PAGE_FILL_TOO_LOW', 'PAGE_COUNT_MISMATCH', 'LAYOUT_DID_NOT_STABILIZE',
  'LAYOUT_ATTEMPTS_EXHAUSTED', 'EXPORT_REPLAY_MISMATCH', 'RENDER_TIMEOUT',
] as const;
export type RendererFailureCode = typeof RENDERER_FAILURE_CODES[number];
export class RendererError extends Error {
  constructor(public readonly code: RendererFailureCode, public readonly details: Record<string, unknown> = {}) { super(code); }
}
export function rendererFailureCode(error: unknown): RendererFailureCode {
  return error instanceof RendererError ? error.code : 'LAYOUT_ATTEMPTS_EXHAUSTED';
}
export function assertNotAborted(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Renderer request cancelled', 'AbortError'); }
