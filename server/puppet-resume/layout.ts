import puppeteer, { Browser, Page } from 'puppeteer';
import { existsSync } from 'node:fs';

export interface LayoutManifest {
  policy: string;
  sectionGapDelta: number;
  lineHeightDelta: number;
  pageCount: number;
  fillRatio: number;
}

interface LayoutPolicy {
  id: string;
  sectionGapDelta: number;
  lineHeightDelta: number;
}

const PAGE_HEIGHT = 1123;
const ORPHAN_THRESHOLD = 80;
const policies = [
  { id: 'compact-gaps', sectionGapDelta: -1, lineHeightDelta: 0 },
  { id: 'compact-lines', sectionGapDelta: 0, lineHeightDelta: -1 },
  { id: 'compact-balanced', sectionGapDelta: -1, lineHeightDelta: -1 },
  { id: 'expand-gaps', sectionGapDelta: 1, lineHeightDelta: 0 },
  { id: 'expand-lines', sectionGapDelta: 0, lineHeightDelta: 1 },
] as const;

function executablePath() {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].find(existsSync);
}

async function openBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

async function seedResume(page: Page, document: Record<string, any>) {
  await page.evaluateOnNewDocument((resumeDocument) => {
    const account = { id: 'yeatom', username: 'yeatom', password: 'yeatom', createdAt: 0 };
    localStorage.setItem('draftline-user-database-v1', JSON.stringify({ version: 1, accounts: [account] }));
    localStorage.setItem('draftline-current-account-v1', account.id);
    localStorage.setItem(
      'draftline-account-data-v1:yeatom:draftline-resume-library-v2',
      JSON.stringify({ version: 2, resumes: [resumeDocument] }),
    );
  }, document);
}

async function applyPolicy(page: Page, policy: LayoutPolicy) {
  await page.evaluate(`(() => {
    const policy = ${JSON.stringify(policy)};
    const spacing = document.querySelectorAll('.resume-section, .resume-entry, .profile-skill-category');
    for (const element of spacing) {
      const styles = getComputedStyle(element);
      const marginTop = Number.parseFloat(styles.marginTop) || 0;
      const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
      element.style.marginTop = Math.max(0, marginTop + policy.sectionGapDelta) + 'px';
      element.style.marginBottom = Math.max(0, marginBottom + policy.sectionGapDelta) + 'px';
    }
    if (policy.lineHeightDelta !== 0) {
      const lines = document.querySelectorAll('.resume-section p, .resume-entry li, .profile-skill-category li, .certificate-list span');
      for (const element of lines) {
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
        if (Number.isFinite(lineHeight)) element.style.lineHeight = Math.max(12, lineHeight + policy.lineHeightDelta) + 'px';
      }
    }
  })()`);
}

async function assess(page: Page) {
  return page.evaluate(({ pageHeight, orphanThreshold }) => {
    const root = document.querySelector('.resume-page');
    if (!root) return { pageCount: 0, fillRatio: 0, hasOrphans: true, details: 'resume root missing' };
    const totalHeight = Math.max((root as HTMLElement).scrollHeight, root.getBoundingClientRect().height);
    const pageCount = Math.max(1, Math.ceil(totalHeight / pageHeight));
    const remainder = totalHeight % pageHeight;
    const fillRatio = remainder === 0 ? 1 : remainder / pageHeight;
    let hasOrphans = false;
    const details: string[] = [];
    root.querySelectorAll('.resume-section > h3, .resume-entry-heading').forEach((heading) => {
      const top = heading.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const next = heading.nextElementSibling || heading.parentElement?.nextElementSibling;
      const nextTop = next
        ? next.getBoundingClientRect().top - root.getBoundingClientRect().top
        : top;
      if (top % pageHeight > pageHeight - orphanThreshold || Math.floor(top / pageHeight) !== Math.floor(nextTop / pageHeight)) {
        hasOrphans = true;
        details.push(`orphan heading at ${Math.round(top)}px`);
      }
    });
    return { pageCount, fillRatio, hasOrphans, details: details.join('; '), totalHeight, entryCount: root.querySelectorAll('.resume-entry').length };
  }, { pageHeight: PAGE_HEIGHT, orphanThreshold: ORPHAN_THRESHOLD });
}

export async function resolvePuppetLayout(origin: string, document: Record<string, any>): Promise<LayoutManifest> {
  const browser = await openBrowser();
  const page = await browser.newPage();
  const report: Array<Record<string, unknown>> = [];
  try {
    await seedResume(page, document);
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
    for (const [index, policy] of policies.entries()) {
      await page.goto(`${origin}/?resume=${encodeURIComponent(String(document.id))}&render=1`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.resume-page');
      await applyPolicy(page, policy);
      const quality = await assess(page);
      const valid = quality.pageCount >= 1 && quality.totalHeight > 0 && !quality.hasOrphans && !(quality.pageCount > 1 && quality.fillRatio < 0.15);
      report.push({ attempt: index + 1, policy: policy.id, valid, ...quality });
      if (valid) {
        console.log(`[Puppet Layout] Accepted ${policy.id}: ${JSON.stringify(quality)}`);
        return { ...policy, policy: policy.id, pageCount: quality.pageCount, fillRatio: quality.fillRatio };
      }
    }
    throw new Error(`Layout validation failed after 5 unique adjustments. Report: ${JSON.stringify(report)}`);
  } finally {
    await page.close();
    await browser.close();
  }
}

export async function renderPuppetPdf(
  origin: string,
  document: Record<string, any>,
  manifest: LayoutManifest,
): Promise<Buffer> {
  const browser = await openBrowser();
  const page = await browser.newPage();
  try {
    await seedResume(page, document);
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
    await page.goto(`${origin}/?resume=${encodeURIComponent(String(document.id))}&render=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.resume-page');
    await applyPolicy(page, {
      id: manifest.policy,
      sectionGapDelta: manifest.sectionGapDelta,
      lineHeightDelta: manifest.lineHeightDelta,
    });
    await page.emulateMediaType('print');
    const printQuality = await assess(page);
    if (printQuality.totalHeight <= 0 || printQuality.hasOrphans || (printQuality.pageCount > 1 && printQuality.fillRatio < 0.15)) {
      throw new Error(`Final print layout is invalid: ${JSON.stringify(printQuality)}`);
    }
    const output = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(output);
  } finally {
    await page.close();
    await browser.close();
  }
}
