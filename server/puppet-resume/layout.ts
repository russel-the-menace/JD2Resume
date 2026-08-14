import puppeteer, { Browser, Page } from 'puppeteer';
import { existsSync } from 'node:fs';

export interface LayoutManifest {
  policy: string;
  sectionGapDelta: number;
  lineHeightDelta: number;
  fontSizeDelta: number;
  pageCount: number;
  fillRatio: number;
  pageFillRatios: number[];
}

interface LayoutTuning {
  id: string;
  sectionGapDelta: number;
  lineHeightDelta: number;
  fontSizeDelta: number;
}

interface LayoutQuality {
  pageCount: number;
  fillRatio: number;
  pageFillRatios: number[];
  hasOrphans: boolean;
  details: string;
  contentBottom: number;
  entryCount: number;
  paragraphLineHeight: number;
  responsibilityLineHeight: number;
  skillLineHeight: number;
}

const PAGE_HEIGHT = 1123;
const ORPHAN_THRESHOLD = 80;
const MIN_PAGE_FILL_RATIO = 0.92;
const TARGET_BOTTOM_MARGIN = 42;
const CALIBRATION_STEPS = 8;
const MAX_TUNING_INTENSITY = 3;
const MIN_PARAGRAPH_LINE_HEIGHT = 20;
const MIN_RESPONSIBILITY_LINE_HEIGHT = 20;
const MIN_SKILL_LINE_HEIGHT = 19;
const strategies = [
  { id: 'spacing-fit', sectionGapDelta: 14, lineHeightDelta: 0, fontSizeDelta: 0 },
  { id: 'balanced-fit', sectionGapDelta: 8, lineHeightDelta: 4, fontSizeDelta: 0 },
  { id: 'typography-fit', sectionGapDelta: 2, lineHeightDelta: 2, fontSizeDelta: 1 },
  { id: 'combined-fit', sectionGapDelta: 10, lineHeightDelta: 5, fontSizeDelta: 0.8 },
  { id: 'line-fit', sectionGapDelta: 0, lineHeightDelta: 6, fontSizeDelta: 0 },
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
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let pathname = '';
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      // Non-HTTP browser requests continue normally.
    }
    if (pathname === '/api/account-state') {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: false }),
      });
      return;
    }
    void request.continue();
  });
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

async function applyTuning(page: Page, tuning: LayoutTuning) {
  await page.evaluate(`(() => {
    const tuning = ${JSON.stringify(tuning)};
    const root = document.querySelector('.resume-page');
    if (!root) return;
    root.style.setProperty('--layout-section-gap-delta', tuning.sectionGapDelta + 'px');
    root.style.setProperty('--layout-line-height-delta', tuning.lineHeightDelta + 'px');
    root.style.setProperty('--layout-font-size-delta', tuning.fontSizeDelta + 'px');
  })()`);
}

async function assess(page: Page): Promise<LayoutQuality> {
  return page.evaluate(({ pageHeight, orphanThreshold }) => {
    const root = document.querySelector('.resume-page');
    if (!root) {
      return {
        pageCount: 0,
        fillRatio: 0,
        pageFillRatios: [],
        hasOrphans: true,
        details: 'resume root missing',
        contentBottom: 0,
        entryCount: 0,
        paragraphLineHeight: 0,
        responsibilityLineHeight: 0,
        skillLineHeight: 0,
      };
    }
    const rootRect = root.getBoundingClientRect();
    const renderScale = rootRect.width > 0 && (root as HTMLElement).clientWidth > 0
      ? rootRect.width / (root as HTMLElement).clientWidth
      : 1;
    const selectors = [
      '.resume-header',
      '.resume-section > h3',
      '.resume-section > p',
      '.resume-entry-heading',
      '.resume-entry li',
      '.profile-skill-category > strong',
      '.profile-skill-category li',
      '.certificate-list > span',
    ].join(',');
    const boxes = Array.from(root.querySelectorAll(selectors))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: (rect.top - rootRect.top) / renderScale, bottom: (rect.bottom - rootRect.top) / renderScale };
      })
      .filter((box) => box.bottom > box.top && box.bottom > 0);
    const contentBottom = boxes.reduce((maximum, box) => Math.max(maximum, box.bottom), 0);
    const pageCount = Math.max(1, Math.ceil(contentBottom / pageHeight));
    const pageFillRatios = Array.from({ length: pageCount }, () => 0);
    for (const box of boxes) {
      const firstPage = Math.max(0, Math.floor(box.top / pageHeight));
      const lastPage = Math.min(pageCount - 1, Math.floor(Math.max(box.top, box.bottom - 0.01) / pageHeight));
      for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex += 1) {
        const localBottom = pageIndex < lastPage ? pageHeight : box.bottom - pageIndex * pageHeight;
        pageFillRatios[pageIndex] = Math.max(pageFillRatios[pageIndex], Math.min(1, localBottom / pageHeight));
      }
    }
    let hasOrphans = false;
    const details: string[] = [];
    root.querySelectorAll('.resume-section > h3, .resume-entry-heading').forEach((heading) => {
      const top = (heading.getBoundingClientRect().top - rootRect.top) / renderScale;
      const next = heading.nextElementSibling || heading.parentElement?.nextElementSibling;
      const nextTop = next ? (next.getBoundingClientRect().top - rootRect.top) / renderScale : top;
      if (top % pageHeight > pageHeight - orphanThreshold || Math.floor(top / pageHeight) !== Math.floor(nextTop / pageHeight)) {
        hasOrphans = true;
        details.push(`orphan heading at ${Math.round(top)}px`);
      }
    });
    return {
      pageCount,
      fillRatio: Math.min(...pageFillRatios),
      pageFillRatios,
      hasOrphans,
      details: details.join('; '),
      contentBottom,
      entryCount: root.querySelectorAll('.resume-entry').length,
      paragraphLineHeight: Number.parseFloat(getComputedStyle(root.querySelector('.resume-section > p') || root).lineHeight) || 0,
      responsibilityLineHeight: Number.parseFloat(getComputedStyle(root.querySelector('.resume-entry li') || root).lineHeight) || 0,
      skillLineHeight: Number.parseFloat(getComputedStyle(root.querySelector('.profile-skill-category li') || root).lineHeight) || 0,
    };
  }, { pageHeight: PAGE_HEIGHT, orphanThreshold: ORPHAN_THRESHOLD });
}

function scaledTuning(strategy: typeof strategies[number], direction: number, intensity: number): LayoutTuning {
  const multiplier = direction * intensity;
  return {
    id: strategy.id,
    sectionGapDelta: strategy.sectionGapDelta * multiplier,
    lineHeightDelta: strategy.lineHeightDelta * multiplier,
    fontSizeDelta: strategy.fontSizeDelta * multiplier,
  };
}

function isValid(quality: LayoutQuality, targetPageCount: number) {
  return quality.pageCount === targetPageCount && quality.contentBottom > 0 && !quality.hasOrphans &&
    quality.pageFillRatios.length === targetPageCount && quality.pageFillRatios.every((ratio) => ratio >= MIN_PAGE_FILL_RATIO) &&
    (quality.paragraphLineHeight === 0 || quality.paragraphLineHeight >= MIN_PARAGRAPH_LINE_HEIGHT) &&
    (quality.responsibilityLineHeight === 0 || quality.responsibilityLineHeight >= MIN_RESPONSIBILITY_LINE_HEIGHT) &&
    (quality.skillLineHeight === 0 || quality.skillLineHeight >= MIN_SKILL_LINE_HEIGHT);
}

async function calibrateStrategy(
  page: Page,
  strategy: typeof strategies[number],
  direction: number,
  targetBottom: number,
  targetPageCount: number,
) {
  let lower = 0;
  let upper = MAX_TUNING_INTENSITY;
  let best: { tuning: LayoutTuning; quality: LayoutQuality; distance: number } | null = null;
  for (let step = 0; step < CALIBRATION_STEPS; step += 1) {
    const intensity = step === 0 ? 1 : (lower + upper) / 2;
    const tuning = scaledTuning(strategy, direction, intensity);
    await applyTuning(page, tuning);
    const quality = await assess(page);
    const distance = Math.abs(quality.contentBottom - targetBottom) + Math.abs(quality.pageCount - targetPageCount) * PAGE_HEIGHT;
    if (!best || distance < best.distance) best = { tuning, quality, distance };
    const needsMore = direction > 0 ? quality.contentBottom < targetBottom : quality.contentBottom > targetBottom;
    if (needsMore) lower = intensity;
    else upper = intensity;
  }
  if (!best) throw new Error(`Unable to calibrate ${strategy.id}`);
  await applyTuning(page, best.tuning);
  return { tuning: best.tuning, quality: await assess(page) };
}

async function loadResume(page: Page, origin: string, documentId: unknown) {
  const renderUrl = `${origin}/?resume=${encodeURIComponent(String(documentId))}&render=1`;
  await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  try {
    await page.waitForSelector('.resume-page', { timeout: 10_000 });
  } catch {
    const state = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      hasLibrary: Boolean(document.querySelector('.resume-library')),
      bodyText: document.body?.innerText.slice(0, 200) || '',
    }));
    throw new Error(`Resume render entry failed: ${JSON.stringify(state)}`);
  }
}

export async function resolvePuppetLayout(origin: string, document: Record<string, any>): Promise<LayoutManifest> {
  const browser = await openBrowser();
  const page = await browser.newPage();
  const report: Array<Record<string, unknown>> = [];
  try {
    await seedResume(page, document);
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
    await loadResume(page, origin, document.id);
    await applyTuning(page, { id: 'natural', sectionGapDelta: 0, lineHeightDelta: 0, fontSizeDelta: 0 });
    const natural = await assess(page);
    const targetPageCount = Math.max(1, Math.round(natural.contentBottom / PAGE_HEIGHT));
    const targetBottom = targetPageCount * PAGE_HEIGHT - TARGET_BOTTOM_MARGIN;
    const direction = natural.contentBottom <= targetBottom ? 1 : -1;
    console.log(`[Puppet Layout] Natural: ${JSON.stringify(natural)}`);

    for (const [index, strategy] of strategies.entries()) {
      const candidate = await calibrateStrategy(page, strategy, direction, targetBottom, targetPageCount);
      const valid = isValid(candidate.quality, targetPageCount);
      report.push({ attempt: index + 1, policy: strategy.id, valid, ...candidate.quality, ...candidate.tuning });
      if (valid) {
        console.log(`[Puppet Layout] Accepted ${strategy.id}: ${JSON.stringify(candidate.quality)}`);
        return {
          ...candidate.tuning,
          policy: strategy.id,
          pageCount: candidate.quality.pageCount,
          fillRatio: candidate.quality.fillRatio,
          pageFillRatios: candidate.quality.pageFillRatios,
        };
      }
    }
    throw new Error(`Layout validation failed after 5 unique adjustments. Report: ${JSON.stringify({ natural, targetPageCount, report })}`);
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
    await loadResume(page, origin, document.id);
    await applyTuning(page, {
      id: manifest.policy,
      sectionGapDelta: manifest.sectionGapDelta,
      lineHeightDelta: manifest.lineHeightDelta,
      fontSizeDelta: Number(manifest.fontSizeDelta) || 0,
    });
    await page.emulateMediaType('print');
    const printQuality = await assess(page);
    if (!isValid(printQuality, manifest.pageCount)) {
      throw new Error(`Final print layout is invalid: ${JSON.stringify(printQuality)}`);
    }
    const output = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(output);
  } finally {
    await page.close();
    await browser.close();
  }
}
