import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const baseUrl = process.env.DRAFTLINE_URL || 'http://127.0.0.1:5174/';
const account = { id: 'persistence-integration', username: 'persistence-integration', password: 'test-only', createdAt: 1 };
const accountDatabase = { version: 1, accounts: [account] };
const libraryKey = 'draftline-account-data-v1:persistence-integration:draftline-resume-library-v2';
const profileKey = 'draftline-account-data-v1:persistence-integration:draftline-user-profile-v1';
const dirtyKey = 'draftline-account-data-v1:persistence-integration:draftline-remote-sync-dirty-v1';
const library = {
  version: 2,
  resumes: [{
    id: 'persisted-resume',
    documentName: 'Persisted Resume',
    language: 'english',
    data: {
      basics: { firstName: 'Persisted', lastName: 'Candidate', role: 'Engineer', email: 'persisted@example.com' },
      summary: 'Database recovery fixture.',
      experience: [], education: [], skills: { expertise: '', tools: '', categories: [] }, certificates: [],
    },
    template: 'profile', accent: '#167c65', customSections: [], customContent: {},
    sectionOrder: ['basics', 'summary', 'education', 'experience', 'skills'], sectionOrderCustomized: false,
    generationEvidence: {}, layoutManifest: {}, updatedAt: Date.now(),
  }],
};
const profile = {
  chinese: { fullName: '持久化测试' },
  english: { fullName: 'Persistence Candidate', email: 'persisted@example.com' },
};
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find(existsSync);
if (!executablePath) throw new Error('Chrome was not found. Set CHROME_PATH to run persistence checks.');

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const sourceContext = await browser.newContext();
  await sourceContext.addInitScript(({ accountDatabase, account, libraryKey, profileKey, dirtyKey, library, profile }) => {
    localStorage.setItem('draftline-user-database-v1', JSON.stringify(accountDatabase));
    localStorage.setItem('draftline-current-account-v1', account.id);
    localStorage.setItem(libraryKey, JSON.stringify(library));
    localStorage.setItem(profileKey, JSON.stringify(profile));
    localStorage.setItem(dirtyKey, JSON.stringify({ changedAt: Date.now() }));
  }, { accountDatabase, account, libraryKey, profileKey, dirtyKey, library, profile });
  const sourcePage = await sourceContext.newPage();
  await sourcePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await sourcePage.getByText('Persisted Resume', { exact: true }).waitFor({ state: 'visible' });
  await sourcePage.waitForFunction(async () => {
    const response = await fetch('/api/account-state?accountId=persistence-integration');
    if (!response.ok) return false;
    const snapshot = await response.json();
    return snapshot?.payload?.library?.resumes?.[0]?.documentName === 'Persisted Resume';
  }, undefined, { timeout: 15_000 });
  await sourceContext.close();

  const recoveryContext = await browser.newContext();
  await recoveryContext.addInitScript(({ accountDatabase, account }) => {
    localStorage.setItem('draftline-user-database-v1', JSON.stringify(accountDatabase));
    localStorage.setItem('draftline-current-account-v1', account.id);
  }, { accountDatabase, account });
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await recoveryPage.getByText('Persisted Resume', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  const restoredProfile = await recoveryPage.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), profileKey);
  assert.equal(restoredProfile.english.fullName, 'Persistence Candidate');
  await recoveryContext.close();
  console.log('Remote persistence verified: local state saved, cleared, and restored from PostgreSQL.');
} finally {
  await browser.close();
}
