import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.DRAFTLINE_URL || 'http://127.0.0.1:4173/';
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find(existsSync);

if (!executablePath) {
  throw new Error('Chrome was not found. Set CHROME_PATH to run UI checks.');
}

const browser = await chromium.launch({ headless: true, executablePath });
const report = { consoleErrors: [], pageErrors: [], checks: {} };

async function attachDiagnostics(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
}

async function pageMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const desktopPage = await desktop.newPage();
await attachDiagnostics(desktopPage);
await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' });
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-desktop.png') });

await desktopPage.getByLabel('Job title').first().fill('Lead Product Designer');
report.checks.livePreview = await desktopPage
  .locator('.resume-page')
  .getByText('Lead Product Designer', { exact: true })
  .isVisible();

await desktopPage.getByRole('button', { name: /Template/ }).click();
await desktopPage.getByRole('button', { name: /Classic/ }).click();
report.checks.templateSwitch = await desktopPage.locator('.resume-page.template-classic').isVisible();

await desktopPage.getByRole('button', { name: /Improve with AI/ }).click();
report.checks.aiDialog = await desktopPage.getByRole('dialog').isVisible();
await desktopPage.getByRole('button', { name: 'Use suggestion' }).click();
report.checks.aiApply = await desktopPage
  .locator('.resume-page')
  .getByText(/Strategic product designer with 7\+ years/)
  .isVisible();
report.checks.desktopMetrics = await pageMetrics(desktopPage);
await desktop.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const mobilePage = await mobile.newPage();
await attachDiagnostics(mobilePage);
await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
report.checks.mobileMetrics = await pageMetrics(mobilePage);
report.checks.mobileEditVisible = await mobilePage.locator('.editor-panel').isVisible();
await mobilePage.screenshot({ path: join(tmpdir(), 'draftline-playwright-mobile-edit.png') });

await mobilePage.getByRole('button', { name: 'Preview', exact: true }).click();
report.checks.mobilePreviewVisible = await mobilePage.locator('.preview-panel').isVisible();
await mobilePage.screenshot({ path: join(tmpdir(), 'draftline-playwright-mobile-preview.png') });

await mobilePage.getByRole('button', { name: 'Outline', exact: true }).click();
report.checks.mobileOutlineVisible = await mobilePage.locator('.outline-sidebar').isVisible();
await mobilePage.getByRole('button', { name: 'Add section' }).click();
report.checks.addSectionMenu = await mobilePage.getByText('Add to resume').isVisible();
await mobilePage.screenshot({ path: join(tmpdir(), 'draftline-playwright-mobile-outline.png') });
await mobile.close();

await browser.close();

const failedChecks = Object.entries(report.checks)
  .filter(([, value]) => value === false)
  .map(([key]) => key);
const mobileMetrics = report.checks.mobileMetrics;
if (mobileMetrics.scrollWidth > mobileMetrics.innerWidth) {
  failedChecks.push('mobileHorizontalOverflow');
}
if (report.consoleErrors.length || report.pageErrors.length) {
  failedChecks.push('browserErrors');
}

console.log(JSON.stringify({ ...report, failedChecks }, null, 2));
if (failedChecks.length) process.exitCode = 1;
