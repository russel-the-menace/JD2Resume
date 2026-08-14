import puppeteer from 'puppeteer';
import type { PagePlanV2 } from '../../src/resume-renderer/types';
import { assertReplayMatchesPlan, type ReplayResult } from './replayValidation';

export async function renderPdfFromPagePlan(origin: string, sessionToken: string, plan: PagePlanV2, snapshotHash: string, rendererVersion: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }); const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.goto(`${origin}/renderer.html?mode=export&session=${encodeURIComponent(sessionToken)}`, { waitUntil: 'networkidle0', timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.dataset.renderStatus === 'ready' || document.documentElement.dataset.renderStatus === 'failed', { timeout: 20_000 });
    const replay = await page.evaluate(() => JSON.parse(document.documentElement.dataset.replayResult || '{}')) as ReplayResult;
    assertReplayMatchesPlan(replay, plan, snapshotHash, rendererVersion);
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally { await page.close(); await browser.close(); }
}
