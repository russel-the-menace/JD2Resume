import { randomUUID } from 'node:crypto';
import type { PagePlanV2, RendererResumeDocument } from '../../src/resume-renderer/types';

export interface ExportRenderSession { token: string; document: RendererResumeDocument; pagePlan: PagePlanV2; snapshotHash: string; rendererVersion: string; expiresAt: number; }
export class ExportSessionStore {
  private readonly sessions = new Map<string, ExportRenderSession>();
  create(input: Omit<ExportRenderSession, 'token'>) { this.sweep(); const session = { ...input, token: randomUUID() }; this.sessions.set(session.token, session); return session; }
  get(token: string) { this.sweep(); return this.sessions.get(token) || null; }
  consume(token: string) {
    this.sweep();
    const session = this.sessions.get(token) || null;
    if (session) this.sessions.delete(token);
    return session;
  }
  delete(token: string) { this.sessions.delete(token); }
  private sweep() { const now = Date.now(); for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(token); }
}
