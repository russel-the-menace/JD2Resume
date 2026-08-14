import { canonicalize } from './canonicalJson';
import type { RendererResumeDocument } from './types';
export async function snapshotHash(document: RendererResumeDocument): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(document)));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
