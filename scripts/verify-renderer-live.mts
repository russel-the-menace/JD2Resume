import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const origin = process.env.DRAFTLINE_URL || 'http://127.0.0.1:4173';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome was not found. Set CHROME_PATH to run the live renderer check.');

const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
page.on('console', (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForSelector('button', { timeout: 15_000 });
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]');
    if (!button) throw new Error('Resume edit button was not found.');
    button.click();
  });
  await page.evaluate(() => {
    const template = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'Template');
    if (!template) throw new Error('Template control was not found.');
    template.click();
  });
  await page.evaluate(() => {
    const profile = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.replace(/\\s+/g, '') === 'ProfileEditorial');
    if (!profile) throw new Error('Profile template option was not found.');
    profile.click();
  });
  await page.waitForSelector('.canonical-preview', { timeout: 15_000 });
  await page.waitForFunction(() => ['ready', 'failed'].includes(document.querySelector('.canonical-preview')?.getAttribute('data-render-status') || ''), { timeout: 25_000 });
  const status = await page.$eval('.canonical-preview', (element) => element.getAttribute('data-render-status'));
  assert.equal(status, 'ready');
  const frame = page.frames().find((candidate) => candidate.url().includes('/renderer.html'));
  if (!frame) throw new Error('Canonical renderer iframe was not found.');
  const metrics = await frame.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.puppet-document');
    const pages = [...document.querySelectorAll<HTMLElement>('.puppet-page')];
    const blocks = [...document.querySelectorAll<HTMLElement>('[data-resume-block="true"]')];
    return {
      pageCount: pages.length,
      declaredPageCount: Number(root?.dataset.pageCount || 0),
      blockCount: blocks.length,
      pageGap: pages.length > 1 ? pages[1].getBoundingClientRect().top - pages[0].getBoundingClientRect().bottom : 0,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  assert.equal(metrics.pageCount, metrics.declaredPageCount);
  assert.equal(metrics.bodyOverflow, 'hidden');
  if (metrics.pageCount > 1) assert.equal(metrics.pageGap, 34);
  console.log(JSON.stringify(metrics));
} finally {
  await browser.close();
}
