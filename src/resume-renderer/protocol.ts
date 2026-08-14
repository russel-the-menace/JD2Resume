import type { LayoutReportV2, PagePlanV2, RenderSnapshot } from './types';
import { RENDERER_PROTOCOL } from './constants';
export type EditorToRendererMessage =
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'RENDER'; requestId: string; snapshot: RenderSnapshot }
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'CANCEL'; requestId: string; revision: number };
export type RendererToEditorMessage =
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'READY'; rendererVersion: string }
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'RENDER_STARTED'; requestId: string; revision: number; snapshotHash: string }
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'RENDER_SUCCEEDED'; requestId: string; revision: number; snapshotHash: string; pagePlan: PagePlanV2; report: LayoutReportV2 }
  | { protocol: typeof RENDERER_PROTOCOL; kind: 'RENDER_FAILED'; requestId: string; revision: number; snapshotHash: string; failureCode: string; report: LayoutReportV2 };
export function isRenderMessage(value: unknown): value is EditorToRendererMessage { return Boolean(value && typeof value === 'object' && (value as EditorToRendererMessage).protocol === RENDERER_PROTOCOL && ['RENDER', 'CANCEL'].includes((value as EditorToRendererMessage).kind)); }
