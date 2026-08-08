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
report.checks.libraryHomeVisible =
  (await desktopPage.getByRole('heading', { name: 'My resumes' }).isVisible()) &&
  (await desktopPage.locator('.resume-library-card').count()) === 3;
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-library-desktop.png') });

await desktopPage.getByRole('button', { name: 'New resume' }).click();
const newResumeDialog = desktopPage.getByRole('dialog', { name: 'New resume' });
report.checks.newResumeDialog =
  (await newResumeDialog.isVisible()) &&
  (await newResumeDialog.getByRole('button', { name: 'Save' }).isDisabled());
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-new-resume-dialog.png') });
await newResumeDialog.getByRole('button', { name: '中文' }).click();
await newResumeDialog.getByLabel('Resume name').fill('Wei Zhang - Product Designer');
report.checks.newResumeNameRequired = !(await newResumeDialog.getByRole('button', { name: 'Save' }).isDisabled());
await newResumeDialog.getByRole('button', { name: 'Save' }).click();
report.checks.newResumeCreated =
  (await desktopPage.getByLabel('Resume name').inputValue()) === 'Wei Zhang - Product Designer' &&
  (await desktopPage.evaluate(() =>
    JSON.parse(localStorage.getItem('draftline-resume-library-v2')).resumes.some(
      (resume) => resume.documentName === 'Wei Zhang - Product Designer' && resume.language === 'chinese',
    ),
  ));
await desktopPage.getByRole('button', { name: 'Back to resumes' }).click();

await desktopPage.getByLabel('Search resumes').fill('Android');
report.checks.librarySearch =
  (await desktopPage.locator('.resume-library-card').count()) === 1 &&
  (await desktopPage.getByText('Jordan Lee - Android Developer', { exact: true }).isVisible());
await desktopPage.getByLabel('Clear search').click();
await desktopPage.getByRole('button', { name: 'Edit Jordan Lee - Product Designer' }).click();
report.checks.librarySelection = await desktopPage.locator('.editor-panel').isVisible();
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-desktop.png') });
report.checks.modernTypography = await desktopPage.locator('.resume-page.template-modern').evaluate(
  (element) => {
    const style = window.getComputedStyle(element);
    return style.fontFamily === 'Arial, Helvetica, sans-serif' && style.fontSize === '9.3px';
  },
);

const editorPanel = desktopPage.locator('.editor-panel');
const previewPanel = desktopPage.locator('.preview-panel');
const columnResizer = desktopPage.getByRole('separator', {
  name: 'Resize editor and preview panels',
});
const editorBeforeResize = await editorPanel.boundingBox();
const previewBeforeResize = await previewPanel.boundingBox();
const resizerBox = await columnResizer.boundingBox();
if (resizerBox) {
  await desktopPage.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 300);
  await desktopPage.mouse.down();
  await desktopPage.mouse.move(resizerBox.x - 110, resizerBox.y + 300, { steps: 8 });
  await desktopPage.mouse.up();
}
const editorAfterResize = await editorPanel.boundingBox();
const previewAfterResize = await previewPanel.boundingBox();
report.checks.desktopColumnResize = Boolean(
  editorBeforeResize &&
  previewBeforeResize &&
  editorAfterResize &&
  previewAfterResize &&
  editorAfterResize.width < editorBeforeResize.width - 80 &&
  previewAfterResize.width > previewBeforeResize.width + 80,
);
const savedWorkspaceAfterResize = await desktopPage.evaluate(() =>
  JSON.parse(localStorage.getItem('draftline-workspace-preferences-v1')),
);
const savedEditorWidth = Number(savedWorkspaceAfterResize?.editorWidth);
await desktopPage.reload({ waitUntil: 'networkidle' });
const editorAfterReload = await desktopPage.locator('.editor-panel').boundingBox();
report.checks.columnWidthSaved = Boolean(
  editorAfterResize &&
  editorAfterReload &&
  savedEditorWidth > 0 &&
  Math.abs(editorAfterReload.width - editorAfterResize.width) < 2,
);
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-desktop-resized.png') });

const firstExperience = desktopPage.locator('.experience-card').first();
await firstExperience.getByRole('button', { name: /Collapse Senior Product Designer/ }).click();
report.checks.experienceCollapse =
  (await firstExperience.locator('.experience-card-body').count()) === 0 &&
  (await firstExperience.getByRole('button').getAttribute('aria-expanded')) === 'false';
await firstExperience.getByRole('button', { name: /Expand Senior Product Designer/ }).click();
report.checks.experienceExpand = await firstExperience.locator('.experience-card-body').isVisible();

await desktopPage.getByLabel('Job title').first().fill('Lead Product Designer');
report.checks.livePreview = await desktopPage
  .locator('.resume-page')
  .getByText('Lead Product Designer', { exact: true })
  .isVisible();

await desktopPage.getByRole('button', { name: /Template/ }).click();
await desktopPage.getByRole('button', { name: /Profile/ }).click();
await desktopPage.waitForTimeout(100);
const profileHeadings = await desktopPage.locator('.resume-page.template-profile .resume-section h3').allTextContents();
report.checks.profileTemplateSwitch =
  (await desktopPage.locator('.resume-page.template-profile').isVisible()) &&
  (await desktopPage.locator('.resume-profile-avatar').isVisible());
report.checks.profileReferenceFont = await desktopPage.locator('.resume-page.template-profile').evaluate(
  (element) => {
    const fontFamily = window.getComputedStyle(element).fontFamily;
    return fontFamily.includes('PingFang SC') && fontFamily.includes('Microsoft YaHei');
  },
);
report.checks.profileReferenceStructure =
  JSON.stringify(profileHeadings) === JSON.stringify([
    'Personal Introduction',
    'Education',
    'Work Experience',
    'Professional Skills',
  ]) &&
  (await desktopPage.locator('.profile-work-entry').first().getByText(
    'Northwind Labs - Lead Product Designer',
    { exact: true },
  ).isVisible());
report.checks.profileContentFits = await desktopPage.locator('.resume-page.template-profile').evaluate((element) =>
  element.clientHeight === element.scrollHeight,
);

await desktopPage.getByRole('button', { name: 'Personal details' }).click();
report.checks.personalWebsiteField =
  (await desktopPage.getByLabel('Personal website').getAttribute('placeholder')) === '[Website name]https://...';
await desktopPage.getByLabel('Upload profile photo').setInputFiles({
  name: 'avatar.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLQKgAAAABJRU5ErkJggg==',
    'base64',
  ),
});
await desktopPage.locator('.details-avatar img').waitFor({ state: 'visible' });
await desktopPage.locator('.resume-profile-avatar img').waitFor({ state: 'visible' });
report.checks.profilePhotoUpload =
  (await desktopPage.locator('.details-avatar img').isVisible()) &&
  (await desktopPage.locator('.resume-profile-avatar img').isVisible()) &&
  !(await desktopPage.locator('.resume-profile-avatar .profile-avatar-initials').isVisible());

await desktopPage.getByLabel('Phone').fill('');
report.checks.emptyPhoneHidden =
  (await desktopPage.locator('.resume-page .resume-contact svg.lucide-phone').count()) === 0;

await desktopPage.getByRole('button', { name: /Template/ }).click();
await desktopPage.getByRole('button', { name: /Classic/ }).click();
report.checks.templateSwitch = await desktopPage.locator('.resume-page.template-classic').isVisible();
report.checks.classicTypography = await desktopPage.locator('.resume-page.template-classic').evaluate(
  (element) => {
    const style = window.getComputedStyle(element);
    return style.fontFamily === 'Georgia, "Times New Roman", serif' && style.fontSize === '9.3px';
  },
);

await desktopPage.getByRole('button', { name: 'Choose accent color' }).click();
await desktopPage.getByRole('button', { name: 'Use color #2e5aac' }).click();
report.checks.accentSwitch =
  (await desktopPage.locator('.resume-page').evaluate((element) =>
    element.style.getPropertyValue('--resume-accent'),
  )) === '#2e5aac';

await desktopPage.getByRole('button', { name: 'Choose accent color' }).click();
await desktopPage.getByRole('button', { name: 'Use color #3498db' }).click();
report.checks.referenceBlueAccent =
  (await desktopPage.locator('.resume-page').evaluate((element) =>
    element.style.getPropertyValue('--resume-accent'),
  )) === '#3498db';

await desktopPage.getByRole('button', { name: 'Choose accent color' }).click();
await desktopPage.getByLabel('Choose a custom accent color').evaluate((input) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '#d45b2c');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
report.checks.customAccent =
  (await desktopPage.locator('.resume-page').evaluate((element) =>
    element.style.getPropertyValue('--resume-accent'),
  )) === '#d45b2c';

await desktopPage.getByRole('button', { name: /Improve with AI/ }).click();
report.checks.aiDialog = await desktopPage.getByRole('dialog').isVisible();
await desktopPage.getByRole('button', { name: 'Use suggestion' }).click();
report.checks.aiApply = await desktopPage
  .locator('.resume-page')
  .getByText(/Strategic product designer with 7\+ years/)
  .isVisible();

await desktopPage.getByLabel('Resume name').fill('Avery Chen - Product Designer');
await desktopPage.getByRole('button', { name: 'Add section', exact: true }).click();
await desktopPage.getByRole('button', { name: /Projects/ }).click();
await desktopPage.getByLabel('Entry title').fill('Persistent portfolio case study');

const zoomIn = desktopPage.getByRole('button', { name: 'Zoom in' });
for (let step = 0; step < 5; step += 1) await zoomIn.click();
const scaleSamplesAt150 = await desktopPage.locator('.resume-stage').evaluate(async (element) => {
  const wrapper = element.querySelector('.resume-scale-wrap');
  const samples = [];
  for (let sample = 0; sample < 24; sample += 1) {
    samples.push(wrapper.getBoundingClientRect().width.toFixed(2));
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  return samples;
});
report.checks.previewStableAt150 =
  (await desktopPage.locator('.zoom-value').textContent())?.trim() === '150%' &&
  new Set(scaleSamplesAt150).size === 1;

for (let step = 0; step < 10; step += 1) await zoomIn.click();
report.checks.zoomMaximum =
  (await desktopPage.locator('.zoom-value').textContent())?.trim() === '250%' &&
  (await zoomIn.isDisabled());

const previewStage = desktopPage.locator('.resume-stage');
await previewStage.evaluate((element) => element.scrollTo(0, 0));
const stageBox = await previewStage.boundingBox();
if (stageBox) {
  const startX = stageBox.x + stageBox.width * 0.65;
  const startY = stageBox.y + stageBox.height * 0.65;
  await desktopPage.mouse.move(startX, startY);
  await desktopPage.mouse.down();
  await desktopPage.mouse.move(startX - 120, startY - 90, { steps: 6 });
  await desktopPage.mouse.up();
}
const panPosition = await previewStage.evaluate((element) => ({
  left: element.scrollLeft,
  top: element.scrollTop,
}));
report.checks.previewMousePan = panPosition.left > 50 && panPosition.top > 50;
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-desktop-pan.png') });

await desktopPage.waitForTimeout(300);
const savedWorkspaceBeforeReload = await desktopPage.evaluate(() =>
  JSON.parse(localStorage.getItem('draftline-workspace-preferences-v1')),
);
await desktopPage.reload({ waitUntil: 'networkidle' });
await desktopPage.waitForTimeout(300);
const restoredPanPosition = await desktopPage.locator('.resume-stage').evaluate((element) => ({
  left: element.scrollLeft,
  top: element.scrollTop,
}));
report.checks.resumeContentPersisted = await desktopPage
  .locator('.resume-page')
  .getByText('Lead Product Designer', { exact: true })
  .isVisible();
report.checks.documentNamePersisted =
  (await desktopPage.getByLabel('Resume name').inputValue()) === 'Avery Chen - Product Designer';
report.checks.templatePersisted = await desktopPage.locator('.resume-page.template-classic').isVisible();
report.checks.accentPersisted =
  (await desktopPage.locator('.resume-page').evaluate((element) =>
    element.style.getPropertyValue('--resume-accent'),
  )) === '#d45b2c';
report.checks.customSectionPersisted =
  (await desktopPage.getByLabel('Entry title').inputValue()) === 'Persistent portfolio case study';
report.checks.zoomPersisted =
  (await desktopPage.locator('.zoom-value').textContent())?.trim() === '250%';
report.checks.previewPositionPersisted = Boolean(
  savedWorkspaceBeforeReload?.byResume?.['product-designer']?.previewPosition?.left > 50 &&
  savedWorkspaceBeforeReload?.byResume?.['product-designer']?.previewPosition?.top > 50 &&
  Math.abs(
    restoredPanPosition.left -
    savedWorkspaceBeforeReload.byResume['product-designer'].previewPosition.left,
  ) < 2 &&
  Math.abs(
    restoredPanPosition.top -
    savedWorkspaceBeforeReload.byResume['product-designer'].previewPosition.top,
  ) < 2,
);

await desktopPage.getByRole('button', { name: 'Back to resumes' }).click();
report.checks.editorBackToLibrary =
  (await desktopPage.getByRole('heading', { name: 'My resumes' }).isVisible()) &&
  (await desktopPage.getByText('Avery Chen - Product Designer', { exact: true }).isVisible());
const resumeCountBeforeDuplicate = await desktopPage.locator('.resume-library-card').count();
await desktopPage.getByRole('button', {
  name: 'More actions for Avery Chen - Product Designer',
}).click();
await desktopPage.getByRole('button', { name: 'Duplicate' }).click();
report.checks.resumeDuplicate =
  (await desktopPage.locator('.resume-library-card').count()) === resumeCountBeforeDuplicate + 1 &&
  (await desktopPage.getByText('Avery Chen - Product Designer Copy', { exact: true }).isVisible());
await desktopPage.getByRole('button', {
  name: 'More actions for Avery Chen - Product Designer Copy',
}).click();
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-resume-actions-menu.png') });
await desktopPage.getByRole('button', { name: 'Delete' }).click();
const deleteResumeDialog = desktopPage.getByRole('dialog', { name: 'Delete resume?' });
report.checks.resumeDeleteDialog = await deleteResumeDialog.isVisible();
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-delete-resume-dialog.png') });
await deleteResumeDialog.getByRole('button', { name: 'Delete' }).click();
report.checks.resumeDelete =
  (await desktopPage.locator('.resume-library-card').count()) === resumeCountBeforeDuplicate &&
  !(await desktopPage.getByText('Avery Chen - Product Designer Copy', { exact: true }).isVisible());

await desktopPage.getByRole('button', { name: 'Edit Jordan Lee - Android Developer' }).click();
report.checks.resumeIsolation =
  (await desktopPage.locator('.resume-name-block p').getByText('Senior Android Developer', { exact: true }).isVisible()) &&
  (await desktopPage.locator('.resume-page.template-compact').isVisible()) &&
  (await desktopPage.locator('.zoom-value').textContent())?.trim() === '100%';
report.checks.compactTypography = await desktopPage.locator('.resume-page.template-compact').evaluate(
  (element) => {
    const style = window.getComputedStyle(element);
    return style.fontFamily === 'Arial, Helvetica, sans-serif' && style.fontSize === '9.3px';
  },
);
await desktopPage.getByRole('button', { name: 'Back to resumes' }).click();
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
report.checks.mobileLibraryVisible = await mobilePage
  .getByRole('heading', { name: 'My resumes' })
  .isVisible();
await mobilePage.screenshot({ path: join(tmpdir(), 'draftline-playwright-library-mobile.png') });
await mobilePage.getByRole('button', { name: 'New resume' }).click();
const mobileNewResumeDialog = mobilePage.getByRole('dialog', { name: 'New resume' });
report.checks.mobileNewResumeDialog =
  (await mobileNewResumeDialog.isVisible()) &&
  (await mobileNewResumeDialog.getByRole('button', { name: 'Save' }).isDisabled());
await mobileNewResumeDialog.getByRole('button', { name: 'Cancel' }).click();
await mobilePage.getByRole('button', { name: 'Edit Jordan Lee - Product Designer' }).click();
report.checks.mobileMetrics = await pageMetrics(mobilePage);
report.checks.mobileEditVisible = await mobilePage.locator('.editor-panel').isVisible();
report.checks.mobileResizerHidden = !(await mobilePage.locator('.column-resizer').isVisible());
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

const recovery = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await recovery.addInitScript(() => {
  localStorage.setItem('draftline-resume-library-v2', '{invalid-json');
  localStorage.setItem('draftline-resume-state-v1', '{invalid-json');
  localStorage.setItem('draftline-workspace-preferences-v1', '{invalid-json');
});
const recoveryPage = await recovery.newPage();
await attachDiagnostics(recoveryPage);
await recoveryPage.goto(baseUrl, { waitUntil: 'networkidle' });
await recoveryPage.getByRole('button', { name: 'Edit Jordan Lee - Product Designer' }).click();
report.checks.corruptStorageRecovery =
  (await recoveryPage.getByLabel('Resume name').inputValue()) === 'Jordan Lee - Product Designer' &&
  (await recoveryPage.locator('.resume-page').getByText('Jordan Lee', { exact: true }).isVisible());
await recovery.close();

const reorder = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const reorderPage = await reorder.newPage();
await attachDiagnostics(reorderPage);
await reorderPage.goto(baseUrl, { waitUntil: 'networkidle' });
await reorderPage.getByRole('button', { name: 'Edit Jordan Lee - Product Designer' }).click();
await reorderPage.locator('.section-nav-item').filter({ hasText: 'Skills' }).dragTo(
  reorderPage.locator('.section-nav-item').filter({ hasText: 'Experience' }),
);
const reorderedLabels = await reorderPage.locator('.section-nav-item .section-label').allTextContents();
const reorderedPreview = await reorderPage.locator('.resume-section h3').allTextContents();
report.checks.sectionReorder =
  JSON.stringify(reorderedLabels) === JSON.stringify([
    'Personal details',
    'Professional summary',
    'Skills',
    'Experience',
    'Education',
  ]) &&
  JSON.stringify(reorderedPreview) === JSON.stringify(['Profile', 'Skills', 'Experience', 'Education']);
await reorderPage.reload({ waitUntil: 'networkidle' });
report.checks.sectionOrderPersisted = JSON.stringify(
  await reorderPage.locator('.section-nav-item .section-label').allTextContents(),
) === JSON.stringify(reorderedLabels);
await reorder.close();

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
