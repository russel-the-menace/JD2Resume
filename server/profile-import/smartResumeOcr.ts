import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

type SmartResumePage = { page: number; lines: string[] };

export async function runSmartResumeOcr(source: { name: string; data: string }) {
  const extension = source.name.toLowerCase().endsWith('.pdf') ? '.pdf' : '.bin';
  const filePath = join(tmpdir(), `jd2resume-smartresume-${randomUUID()}${extension}`);
  await fs.writeFile(filePath, Buffer.from(source.data, 'base64'));
  try {
    const python = process.env.SMARTRESUME_PYTHON || 'python3';
    const { stdout } = await execFileAsync(python, ['scripts/smartresume-ocr.py', filePath], {
      cwd: process.cwd(),
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });
    const line = stdout.split(/\r?\n/).reverse().find((value) => value.startsWith('SMARTRESUME_RESULT:'));
    if (!line) throw new Error('SMARTRESUME_OCR_INVALID_OUTPUT');
    const payload = JSON.parse(line.slice('SMARTRESUME_RESULT:'.length)) as { pages?: SmartResumePage[] };
    const pages = Array.isArray(payload.pages)
      ? payload.pages.filter((page) => page && Number.isInteger(page.page) && Array.isArray(page.lines))
      : [];
    if (!pages.some((page) => page.lines.length)) throw new Error('SMARTRESUME_OCR_EMPTY');
    return { pages };
  } finally {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
  }
}
