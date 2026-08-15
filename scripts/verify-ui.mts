import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const origin = process.env.DRAFTLINE_URL || 'http://127.0.0.1:4173';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome was not found. Set CHROME_PATH to run UI checks.');
const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 960 });
  await desktop.goto(origin, { waitUntil: 'domcontentloaded' });
  await desktop.waitForSelector('.resume-library-card', { timeout: 10_000 });
  assert.equal(await desktop.$$('.resume-library-card').then((cards) => cards.length), 3);
  await desktop.click('button[aria-label^="Edit "]');
  await desktop.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Template')?.click());
  await desktop.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.replace(/\s+/g, '') === 'ProfileEditorial')?.click());
  await desktop.waitForSelector('.canonical-preview', { timeout: 10_000 });
  await desktop.waitForFunction(() => document.querySelector('.canonical-preview')?.getAttribute('data-render-status') === 'ready', { timeout: 25_000 });
  const desktopContract = await desktop.$eval('.resume-stage', (stage) => ({
    cursor: getComputedStyle(stage).cursor,
    framePointerEvents: getComputedStyle(stage.querySelector('.canonical-preview-frame')).pointerEvents,
  }));
  assert.equal(desktopContract.cursor, 'grab');
  assert.equal(desktopContract.framePointerEvents, 'none');

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844 });
  await mobile.goto(origin, { waitUntil: 'domcontentloaded' });
  await mobile.waitForSelector('.resume-library-card', { timeout: 10_000 });
  await mobile.click('button[aria-label^="Edit "]');
  await mobile.click('.mobile-tabs button:nth-child(3)');
  assert.equal(await mobile.$eval('.preview-panel', (element) => getComputedStyle(element).display !== 'none'), true);
  await mobile.click('.mobile-tabs button:nth-child(1)');
  assert.equal(await mobile.$eval('.outline-sidebar', (element) => getComputedStyle(element).display !== 'none'), true);
  console.log(JSON.stringify({ libraryCards: 3, desktopContract, mobilePreviewAndOutline: true }));
} finally {
  await browser.close();
}
