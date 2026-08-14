import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { SourceEvidence, SourceEvidenceFile } from '../types';

export const MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SOURCE_TEXT_CHARS = 20_000;

export interface StoredSourceEvidence {
  text?: string;
  files: Array<{
    kind: 'photo' | 'pdf';
    filename: string;
    mimeType: string;
    sizeBytes: number;
    path: string;
  }>;
}

function safeFilename(filename: string, fallback: string): string {
  const base = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return base || fallback;
}

function decodeFile(file: SourceEvidenceFile, kind: 'photo' | 'pdf'): Buffer {
  if (!file.data || !file.mimeType || !file.filename) throw new Error(`${kind} evidence is incomplete`);
  const buffer = Buffer.from(file.data, 'base64');
  if (!buffer.length || buffer.length > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`${kind} evidence must be no larger than 10MB`);
  }
  if (kind === 'pdf' && file.mimeType !== 'application/pdf') throw new Error('pdf evidence must use application/pdf');
  if (kind === 'photo' && !file.mimeType.startsWith('image/')) throw new Error('photo evidence must use an image mime type');
  return buffer;
}

export async function persistSourceEvidence(
  evidence: SourceEvidence | undefined,
  applicationId: string,
  rootDir = join(process.cwd(), 'public', 'evidence'),
): Promise<StoredSourceEvidence | undefined> {
  if (!evidence) return undefined;
  if (evidence.text && evidence.text.length > MAX_SOURCE_TEXT_CHARS) {
    throw new Error('text evidence must be no longer than 20,000 characters');
  }

  const files: StoredSourceEvidence['files'] = [];
  const folder = join(rootDir, applicationId);
  for (const [kind, file] of [['photo', evidence.photo], ['pdf', evidence.pdf]] as const) {
    if (!file) continue;
    const buffer = decodeFile(file, kind);
    await mkdir(folder, { recursive: true });
    const filename = `${randomUUID()}-${safeFilename(file.filename, kind)}`;
    const relativePath = join('public', 'evidence', applicationId, filename);
    await writeFile(join(process.cwd(), relativePath), buffer, { flag: 'wx' });
    files.push({ kind, filename: file.filename, mimeType: file.mimeType, sizeBytes: buffer.length, path: relativePath });
  }

  return { text: evidence.text, files };
}
