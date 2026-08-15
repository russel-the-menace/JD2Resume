import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';

const origin = process.env.DRAFTLINE_URL || 'http://127.0.0.1:4173';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('Chrome was not found. Set CHROME_PATH to run persistence checks.');
const libraryKey = 'draftline-account-data-v1:yeatom:draftline-resume-library-v2';
const profileKey = 'draftline-account-data-v1:yeatom:draftline-user-profile-v1';
const fixture = {
  version: 3,
  resumes: [{
    id: 'persisted-resume', documentName: 'Persisted Resume', language: 'english',
    data: { basics: { firstName: 'Persisted', lastName: 'Candidate', role: 'Engineer', email: 'persisted@example.com' }, summary: 'Database recovery fixture.', experience: [], education: [], skills: { expertise: '', tools: '' }, certificates: [] },
    template: 'profile', accent: '#167c65', customSections: [], customContent: {},
    sectionOrder: ['basics', 'summary', 'education', 'experience', 'skills'], sectionOrderCustomized: false,
    generationEvidence: {}, legacyLayoutManifest: {}, renderState: {}, updatedAt: Date.now(),
  }],
};
const profile = { chinese: { fullName: '持久化测试' }, english: { fullName: 'Persistence Candidate', email: 'persisted@example.com' } };
const browser = await puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.evaluateOnNewDocument(({ libraryKey, profileKey, fixture, profile }) => {
    localStorage.setItem(libraryKey, JSON.stringify(fixture));
    localStorage.setItem(profileKey, JSON.stringify(profile));
  }, { libraryKey, profileKey, fixture, profile });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label^="Edit "]', { timeout: 10_000 });
  assert.equal(await page.$eval('.resume-library-card', (card) => card.textContent?.includes('Persisted Resume')), true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label^="Edit "]', { timeout: 10_000 });
  const restored = await page.$eval('.resume-library-card', (card) => card.textContent || '');
  assert.match(restored, /Persisted Resume/);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), libraryKey);
  assert.equal(stored.version, 3);
  assert.equal(stored.resumes[0].documentName, 'Persisted Resume');
  console.log(JSON.stringify({ restoredDocument: stored.resumes[0].documentName, libraryVersion: stored.version }));
} finally {
  await browser.close();
}
