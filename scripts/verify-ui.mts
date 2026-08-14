import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

type PageMetrics = {
  innerWidth: number;
  scrollWidth: number;
  innerHeight: number;
  scrollHeight: number;
};

type UiCheck = boolean | PageMetrics;
type UiReport = {
  consoleErrors: string[];
  pageErrors: string[];
  checks: Record<string, UiCheck>;
};

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
const report: UiReport = { consoleErrors: [], pageErrors: [], checks: {} };

async function attachDiagnostics(page: Page) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
}

async function pageMetrics(page: Page): Promise<PageMetrics> {
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
  (await desktopPage.getByLabel('Search resumes').isVisible()) &&
  (await desktopPage.getByRole('heading', { name: 'My resumes' }).count()) === 0 &&
  (await desktopPage.getByText('Resume workspace', { exact: true }).count()) === 0 &&
  (await desktopPage.locator('.resume-library-card').count()) === 3;
report.checks.resumeCardEditButtonRemoved = (await desktopPage.locator('.resume-card-edit').count()) === 0;
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-library-desktop.png') });

await desktopPage.getByRole('button', { name: 'Account menu' }).click();
report.checks.accountMenu =
  (await desktopPage.getByRole('button', { name: 'Edit personal profile' }).isVisible()) &&
  (await desktopPage.getByRole('button', { name: 'Switch account' }).isVisible()) &&
  (await desktopPage.getByRole('button', { name: 'Change password' }).isVisible());
await desktopPage.getByRole('button', { name: 'Switch account' }).click();
const accountSwitcher = desktopPage.getByRole('dialog', { name: 'Switch account' });
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-account-switcher.png') });
report.checks.accountSwitcher =
  (await accountSwitcher.isVisible()) &&
  (await accountSwitcher.locator('.account-list-item').first().getByText('yeatom', { exact: true }).isVisible()) &&
  (await accountSwitcher.locator('.account-list-avatar').first().textContent()) === 'Y' &&
  (await accountSwitcher.getByRole('button', { name: 'Sign in' }).isVisible()) &&
  (await accountSwitcher.getByRole('button', { name: 'Sign up' }).isVisible());
await accountSwitcher.getByRole('button', { name: 'Sign up' }).click();
const registerDialog = desktopPage.getByRole('dialog', { name: 'Sign up' });
await registerDialog.getByLabel('Username').fill('qa-local-account');
await registerDialog.getByLabel('Password').fill('local-password');
await registerDialog.getByRole('button', { name: 'Sign up', exact: true }).click();
report.checks.localAccountRegistered =
  !(await desktopPage.getByRole('dialog', { name: 'Sign up' }).isVisible()) &&
  (await desktopPage.getByText('No resumes found', { exact: true }).isVisible());
report.checks.emptyProfileUsesUsername =
  (await desktopPage.getByRole('button', { name: 'Account menu' }).textContent()) === 'Q';
await desktopPage.getByRole('button', { name: 'Account menu' }).click();
await desktopPage.getByRole('button', { name: 'Switch account' }).click();
await desktopPage.getByRole('dialog', { name: 'Switch account' }).getByRole('button', { name: 'Sign in' }).click();
const loginDialog = desktopPage.getByRole('dialog', { name: 'Sign in' });
await loginDialog.getByLabel('Username').fill('yeatom');
await loginDialog.getByLabel('Password').fill('yeatom');
await loginDialog.getByRole('button', { name: 'Sign in', exact: true }).click();
report.checks.localAccountLogin =
  !(await desktopPage.getByRole('dialog', { name: 'Sign in' }).isVisible()) &&
  (await desktopPage.locator('.resume-library-card').count()) === 3;
await desktopPage.getByRole('button', { name: 'Account menu' }).click();
await desktopPage.getByRole('button', { name: 'Change password' }).click();
const changePasswordDialog = desktopPage.getByRole('dialog', { name: 'Change password' });
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-change-password-dialog.png') });
await changePasswordDialog.getByLabel('Current password').fill('yeatom');
await changePasswordDialog.getByLabel('New password', { exact: true }).fill('updated-yeatom');
await changePasswordDialog.getByLabel('Confirm new password').fill('updated-yeatom');
await changePasswordDialog.getByRole('button', { name: 'Change password', exact: true }).click();
report.checks.localPasswordChanged = await desktopPage.evaluate(() =>
  JSON.parse(localStorage.getItem('draftline-user-database-v1')).accounts.find((account) => account.id === 'yeatom').password === 'updated-yeatom',
);
await desktopPage.getByRole('button', { name: 'Account menu' }).click();
await desktopPage.getByRole('button', { name: 'Switch account' }).click();
await desktopPage.getByRole('dialog', { name: 'Switch account' }).getByRole('button', { name: 'Sign up' }).click();
const duplicateRegisterDialog = desktopPage.getByRole('dialog', { name: 'Sign up' });
await duplicateRegisterDialog.getByLabel('Username').fill('yeatom');
report.checks.duplicateUsernameWarning = await duplicateRegisterDialog
  .getByText('This username is already in use.', { exact: true })
  .isVisible();
await duplicateRegisterDialog.getByRole('button', { name: 'Close' }).click();
await desktopPage.getByRole('button', { name: 'Account menu' }).click();
await desktopPage.getByRole('button', { name: 'Edit personal profile' }).click();
const profileDialog = desktopPage.getByRole('dialog', { name: 'Edit personal profile' });
await desktopPage.route('**/api/import-profile', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 120));
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      language: 'chinese',
      profiles: {
        chinese: {
          fullName: '张三',
          phone: '13800138000',
          email: 'zhangsan@example.com',
          location: '上海',
          wechat: 'zhangsan',
          linkedin: '',
          website: 'zhangsan.design',
          summary: 'This legacy field must be discarded.',
          educations: [{
            school: '复旦大学',
            degree: '本科',
            studyType: '本科',
            major: '视觉传达设计',
            startDate: '2014-09',
            endDate: '2018-06',
            description: '',
          }],
          workExperiences: [{ company: '一 间客厅社交主题酒馆', jobTitle: '副店长', businessDirection: '', workContent: '', startDate: '2020-01', endDate: '2021-02' }, { company: '第二公司', jobTitle: '运营', businessDirection: '', workContent: '', startDate: '2021-03', endDate: '2022-04' }],
          certificates: [],
        },
      },
    }),
  });
});
let profileTranslationCalls = 0;
let profileDatabaseSaves = 0;
let translatedSourceProfile: Record<string, any> | null = null;
await desktopPage.route('**/api/account-state', async (route) => {
  if (route.request().method() !== 'PUT') return route.continue();
  profileDatabaseSaves += 1;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accountId: 'yeatom', revision: 100 + profileDatabaseSaves, payload: {} }),
  });
});
await desktopPage.route('**/api/translate-profile', async (route) => {
  profileTranslationCalls += 1;
  translatedSourceProfile = route.request().postDataJSON()?.profile || null;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      language: 'english',
      profile: {
        fullName: 'Zhang San',
        gender: 'Male',
        phone: '13800138000',
        email: 'zhangsan@example.com',
        location: 'Shanghai',
        wechat: 'zhangsan',
        linkedin: '',
        website: 'zhangsan.design',
        educations: [{
          school: 'Fudan University',
          degree: 'Bachelor',
          studyType: 'Full-time',
          major: 'Visual Communication Design',
          startDate: '2014-09',
          endDate: '2018-06',
          description: '',
        }],
        workExperiences: [{ company: 'One Living Room Social Bar', jobTitle: 'Assistant Manager', businessDirection: '', workContent: '', startDate: '2020-01', endDate: '2021-02' }, { company: 'Second Company', jobTitle: 'Operations', businessDirection: '', workContent: '', startDate: '2021-03', endDate: '2022-04' }],
        certificates: [],
      },
    }),
  });
});
await profileDialog.getByLabel('姓名').fill('');
await profileDialog.getByLabel('手机号码').fill('');
await profileDialog.getByLabel('Email').fill('');
await profileDialog.getByLabel('微信号').fill('');
await profileDialog.getByRole('button', { name: '保存资料' }).click();
const profileSaveError = profileDialog.getByRole('alert');
report.checks.profileSaveUsesGenerationValidation =
  (await profileSaveError.textContent()) === '请填写姓名。 请至少填写手机号码、邮箱或微信号中的一项。 请至少添加一条教育经历。';
await profileDialog.getByLabel('性别').selectOption('女');
await profileDialog.getByRole('button', { name: 'Import from resume' }).click();
const profileImportDialog = desktopPage.getByRole('dialog', { name: 'Import from resume' });
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-profile-import-dialog.png') });
report.checks.profileImportDialog =
  (await profileImportDialog.getByRole('button', { name: 'Paste text' }).isVisible()) &&
  (await profileImportDialog.getByRole('button', { name: 'Upload image' }).isVisible()) &&
  (await profileImportDialog.getByRole('button', { name: 'Upload PDF' }).isVisible());
await profileImportDialog.getByLabel('Resume content').fill('张三是一名产品设计师，居住在上海。邮箱 zhangsan@example.com，电话 13800138000。');
await profileImportDialog.getByRole('button', { name: 'Import details' }).click();
await desktopPage.locator('.profile-import-loading').waitFor({ state: 'visible' });
report.checks.profileImportLoadingKeepsCursor = await desktopPage.locator('.profile-import-loading').evaluate(
  (element) => getComputedStyle(element).cursor !== 'wait',
);
const profileSyncDialog = desktopPage.getByRole('dialog', { name: 'Create English profile too?' });
await profileSyncDialog.waitFor({ state: 'visible' });
await profileSyncDialog.getByRole('button', { name: 'Create English profile' }).click();
await profileDialog.getByLabel('Full name').waitFor({ state: 'visible' });
report.checks.profileImportDualLanguage =
  (await profileDialog.getByLabel('Full name').inputValue()) === 'Zhang San';
report.checks.profileTranslationRunsOnDemand = profileTranslationCalls === 1;
report.checks.profileImportSavedToDatabase = profileDatabaseSaves >= 2;
report.checks.profileTranslationUsesSavedProfile =
  translatedSourceProfile?.gender === '女' &&
  translatedSourceProfile?.educations?.[0]?.startDate === '2014-09' &&
  translatedSourceProfile?.workExperiences?.[0]?.startDate === '2020-01';
await profileDialog.getByRole('button', { name: '中文', exact: true }).click();
report.checks.profileImportIncludesEducation = await profileDialog.getByText('复旦大学', { exact: true }).isVisible();
report.checks.profileImportPreservesMissingFields =
  (await profileDialog.getByLabel('性别').inputValue()) === '女';
report.checks.profileSkillsRemoved =
  (await profileDialog.getByRole('heading', { name: '专业技能', exact: true }).count()) === 0;
report.checks.profileEducationDisplayNormalized =
  (await profileDialog.getByText('本科 · 视觉传达设计', { exact: true }).isVisible()) &&
  (await profileDialog.getByText(/\(本科\)|\(全日制\)/).count()) === 0;
report.checks.profileChineseSpacingNormalized =
  await profileDialog.getByText('一间客厅社交主题酒馆', { exact: true }).isVisible();
const importedWorkSection = profileDialog.locator('.profile-section-block').filter({ hasText: '工作经历' }).first();
await importedWorkSection.getByRole('button', { name: '编辑工作经历 1' }).click();
const importedWorkStacks = importedWorkSection.locator('.profile-entry-stack');
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-profile-inline-work-editor.png') });
report.checks.profileEditorFollowsEditedEntry =
  (await importedWorkStacks.nth(0).locator('.profile-entry-editor').count()) === 1 &&
  (await importedWorkStacks.nth(1).locator('.profile-entry-editor').count()) === 0;
await importedWorkStacks.nth(0).getByRole('button', { name: 'Close' }).click();
report.checks.personalProfileSummaryRemoved =
  (await profileDialog.getByLabel('个人简介').count()) === 0;
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-personal-profile-dialog.png') });
await profileDialog.getByLabel('姓名').fill('张三');
await profileDialog.getByLabel('性别').selectOption('男');
await profileDialog.getByLabel('手机号码').fill('13800138000');
await profileDialog.getByLabel('Email').fill('zhangsan@example.com');
await profileDialog.getByLabel('所在地').fill('上海');
await profileDialog.getByRole('button', { name: 'English', exact: true }).click();
report.checks.personalProfileSummaryRemoved = Boolean(report.checks.personalProfileSummaryRemoved) &&
  (await profileDialog.getByLabel('Professional profile').count()) === 0;
await profileDialog.getByLabel('Full name').fill('Alex Zhang');
await profileDialog.getByLabel('Gender').selectOption('Male');
await profileDialog.getByLabel('Phone').fill('555-0100');
await profileDialog.getByLabel('Email').fill('alex@example.com');
await profileDialog.getByLabel('Location').fill('New York, NY');
await profileDialog.getByRole('button', { name: 'Save profile' }).click();
await desktopPage.unroute('**/api/import-profile');
await desktopPage.unroute('**/api/translate-profile');
await desktopPage.unroute('**/api/account-state');
report.checks.bilingualProfileSaved = await desktopPage.evaluate(() => {
  const profile = JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-user-profile-v1'));
  return profile?.chinese?.fullName === '张三' && profile?.chinese?.gender === '男' &&
    profile?.english?.fullName === 'Alex Zhang' && profile?.english?.gender === 'Male' &&
    !('summary' in profile.chinese) && !('summary' in profile.english);
});
report.checks.accountAvatarUsesUsername =
  (await desktopPage.getByRole('button', { name: 'Account menu' }).textContent()) === 'Y';
await desktopPage.getByRole('button', { name: 'Generate from JD' }).click();
const generatorDialog = desktopPage.getByRole('dialog', { name: 'Generate from job description' });
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-job-description-dialog.png') });
report.checks.jobDescriptionDialog =
  (await generatorDialog.isVisible()) &&
  (await generatorDialog.getByRole('button', { name: 'Paste text' }).isVisible()) &&
  (await generatorDialog.getByRole('button', { name: 'Upload image' }).isVisible()) &&
  (await generatorDialog.getByRole('button', { name: 'Upload PDF' }).isVisible()) &&
  (await generatorDialog.getByRole('button', { name: '中英文' }).isVisible()) &&
  (await generatorDialog.getByRole('button', { name: 'Generate resume' }).isDisabled());
await desktopPage.route('**/api/generate-resume', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      documentName: 'Alex Zhang - Product Designer',
      resume: {
        basics: {
          fullName: 'Alex Zhang',
          firstName: 'Alex',
          lastName: 'Zhang',
          role: 'Lead Product Designer',
          email: 'alex@example.com',
          phone: '555-0100',
          location: 'New York, NY',
          gender: 'Male',
          website: 'alex.design',
          linkedin: 'https://linkedin.com/in/alex-zhang',
          whatsapp: '+1 555 0100',
          telegram: '@alexzhang',
        },
        summary: 'Product designer focused on high-impact workflows.',
        experience: [],
        education: [],
        skills: { expertise: 'Product strategy, Interaction design', tools: 'Figma' },
      },
    }),
  });
});
await generatorDialog.getByRole('button', { name: 'English', exact: true }).click();
await generatorDialog.getByRole('button', { name: 'Upload image' }).click();
await generatorDialog.getByLabel('Upload image').setInputFiles({
  name: 'job-description.png',
  mimeType: 'image/png',
  buffer: Buffer.from('test-image'),
});
const imageReady = await generatorDialog.getByRole('button', { name: 'Generate resume' }).isEnabled();
await generatorDialog.getByRole('button', { name: 'Upload PDF' }).click();
await generatorDialog.getByLabel('Upload PDF').setInputFiles({
  name: 'job-description.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4 test'),
});
const pdfReady = await generatorDialog.getByRole('button', { name: 'Generate resume' }).isEnabled();
await generatorDialog.getByRole('button', { name: 'Paste text' }).click();
await generatorDialog.getByRole('textbox', { name: 'Job description' }).fill('Lead product designer for a workflow platform. Build clear tools for enterprise teams and partner with engineering.');
report.checks.generatorSourceModes = imageReady && pdfReady;
await generatorDialog.getByRole('button', { name: 'Generate resume' }).click();
await desktopPage.waitForURL(/resume=/);
report.checks.jobDescriptionGenerated =
  (await desktopPage.getByLabel('Resume name').inputValue()) === 'Alex Zhang - Product Designer' &&
  (await desktopPage.locator('.resume-page').getByText('Lead Product Designer', { exact: true }).isVisible());
report.checks.englishSocialContactIcons =
  (await desktopPage.locator('[data-contact="linkedin"] svg').count()) === 1 &&
  (await desktopPage.locator('[data-contact="whatsapp"] svg').count()) === 1 &&
  (await desktopPage.locator('[data-contact="telegram"] svg').count()) === 1;
await desktopPage.unroute('**/api/generate-resume');
await desktopPage.getByRole('button', { name: 'Back to resumes' }).click();

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
    JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-resume-library-v2')).resumes.some(
      (resume) => resume.documentName === 'Wei Zhang - Product Designer' && resume.language === 'chinese',
    ),
  ));
await desktopPage.locator('.section-nav-item').filter({ hasText: '个人信息' }).click();
report.checks.chineseNameUsesSingleField =
  (await desktopPage.getByLabel('姓名').count()) === 1 &&
  (await desktopPage.getByLabel('First name').count()) === 0 &&
  (await desktopPage.getByLabel('Last name').count()) === 0;
report.checks.chineseGender =
  (await desktopPage.getByLabel('性别').inputValue()) === '男' &&
  (await desktopPage.locator('.resume-page .resume-contact [data-contact="gender"]').getByText('男', { exact: true }).isVisible());
await desktopPage.getByRole('button', { name: /Template/ }).click();
await desktopPage.getByRole('button', { name: /Profile/ }).click();
await desktopPage.getByRole('button', { name: '添加模块', exact: true }).click();
await desktopPage.getByRole('button', { name: /证书/ }).click();
report.checks.chineseResumeSections =
  JSON.stringify(await desktopPage.locator('.section-nav-item .section-label').allTextContents()) === JSON.stringify([
    '个人信息',
    '个人介绍',
    '工作经历',
    '教育经历',
    '专业经历',
    '证书',
  ]) &&
  JSON.stringify(await desktopPage.locator('.resume-page.template-profile .resume-section h3').allTextContents()) === JSON.stringify([
    '个人介绍',
    '教育经历',
    '工作经历',
    '专业经历',
    '证书',
  ]) &&
  (await desktopPage.locator('.resume-page.template-profile .resume-name-block h2').textContent()) === '张晓明' &&
  (await desktopPage.locator('.resume-page.template-profile').getByText('产品设计师', { exact: true }).isVisible());
report.checks.profileNameDividerStaysWithName = await desktopPage.locator('.resume-page.template-profile').evaluate((element) => {
  const name = element.querySelector('.resume-name-block h2');
  const role = element.querySelector('.resume-name-block p');
  return Boolean(name && role) &&
    window.getComputedStyle(name, '::after').content === '" - "' &&
    window.getComputedStyle(role, '::before').content === 'none';
});
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-chinese-profile-template.png') });
await desktopPage.getByRole('button', { name: 'Back to resumes' }).click();

await desktopPage.getByLabel('Search resumes').fill('Android');
report.checks.librarySearch =
  (await desktopPage.locator('.resume-library-card').count()) === 1 &&
  (await desktopPage.getByText('Jordan Lee - Android Developer', { exact: true }).isVisible());
await desktopPage.getByLabel('Clear search').click();
await desktopPage.locator('.resume-library-card').filter({ hasText: 'Jordan Lee - Product Designer' }).click();
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
const collapseEditor = desktopPage.getByRole('button', { name: 'Collapse editor' });
await collapseEditor.click();
report.checks.editorCollapseAnimation = await desktopPage.locator('.workspace').evaluate(
  (element) => window.getComputedStyle(element).transitionDuration === '0.24s',
);
await desktopPage.waitForTimeout(280);
const collapsedEditorBox = await editorPanel.boundingBox();
const expandedPreviewBox = await previewPanel.boundingBox();
report.checks.editorColumnCollapse = Boolean(
  collapsedEditorBox && collapsedEditorBox.width < 2 &&
  expandedPreviewBox && previewAfterResize && expandedPreviewBox.width > previewAfterResize.width + 80,
);
report.checks.editorCollapsePersisted = await desktopPage.evaluate(() =>
  JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-workspace-preferences-v1'))?.byResume?.['product-designer']?.editorCollapsed === true,
);
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-desktop-editor-collapsed.png') });
await desktopPage.reload({ waitUntil: 'networkidle' });
report.checks.editorCollapseRestored = await desktopPage.locator('.workspace.editor-collapsed').isVisible();
await desktopPage.getByRole('button', { name: 'Expand editor' }).click();
await desktopPage.waitForTimeout(280);
const savedWorkspaceAfterResize = await desktopPage.evaluate(() =>
  JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-workspace-preferences-v1')),
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
const firstExperienceBullets = firstExperience.locator('.bullet-editor textarea');
await firstExperienceBullets.nth(0).fill('<b>Led</b> analytics workflows for <u>18K weekly users</u>.');
await firstExperienceBullets.nth(1).fill('Built a <u>shared design system</u> across three teams.');
await firstExperienceBullets.nth(2).fill('Improved <u>activation by 16%</u> through onboarding redesign.');

await desktopPage.getByRole('button', { name: 'Professional summary', exact: true }).click();
await desktopPage.locator('.summary-textarea').fill(
  '<b>Product designer</b> focused on high-impact workflows.\n\n\nBuilds durable systems through clear cross-functional collaboration.',
);

await desktopPage.getByRole('button', { name: /Template/ }).click();
await desktopPage.getByRole('button', { name: /Profile/ }).click();
await desktopPage.waitForTimeout(100);
const profileHeadings = await desktopPage.locator('.resume-page.template-profile .resume-section h3').allTextContents();
report.checks.profileTemplateSwitch =
  await desktopPage.locator('.resume-page.template-profile').isVisible();
report.checks.profileAvatarHiddenWithoutUpload =
  (await desktopPage.locator('.resume-profile-avatar').count()) === 0 &&
  (await desktopPage.locator('.profile-avatar-slot').count()) === 0 &&
  (await desktopPage.locator('.resume-page.template-profile .resume-header').evaluate(
    (element) => window.getComputedStyle(element).paddingRight,
  )) === '54px';
report.checks.profileContactSeparatorSpacing = await desktopPage.locator('.contact-separator').first().evaluate(
  (element) => {
    const style = window.getComputedStyle(element);
    return style.marginLeft === '6px' && style.marginRight === '6px';
  },
);
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-profile-template.png') });
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
report.checks.profileSummaryCollapsesParagraphBreaks =
  (await desktopPage.locator('.profile-section .resume-paragraph-break').count()) === 1 &&
  (await desktopPage.locator('.profile-section p > strong').count()) === 1 &&
  (await desktopPage.locator('.profile-section .resume-paragraph-break').evaluate(
    (element) => window.getComputedStyle(element).height,
  )) === '9px';
report.checks.profileWorkHighlightLimits =
  (await desktopPage.locator('.profile-work-entry').first().locator('li strong').count()) === 0 &&
  (await desktopPage.locator('.profile-work-entry').first().locator('li u').count()) === 2;
report.checks.profileEducationStaysOnOneLine = await desktopPage
  .locator('.profile-education-entry .resume-entry-heading > div')
  .first()
  .evaluate((element) => {
    const school = element.querySelector('strong')?.getBoundingClientRect();
    const degree = element.querySelector('span')?.getBoundingClientRect();
    return window.getComputedStyle(element).flexDirection === 'row' &&
      Boolean(school && degree && Math.abs(school.top - degree.top) < 4);
  });
report.checks.profileContentFits = await desktopPage.locator('.resume-page.template-profile').evaluate((element) =>
  element.clientHeight === element.scrollHeight,
);

await desktopPage.getByRole('button', { name: 'Personal details' }).click();
report.checks.personalWebsiteField =
  (await desktopPage.getByLabel('Personal website').getAttribute('placeholder')) === '[Website name]https://...';
await desktopPage.getByLabel('Personal website').fill('[Github]https://github.com/theo-the-menace');
const websiteLink = desktopPage.locator('.resume-website-link');
report.checks.markdownWebsiteLink =
  (await websiteLink.textContent()) === 'Github' &&
  (await websiteLink.getAttribute('href')) === 'https://github.com/theo-the-menace' &&
  (await websiteLink.evaluate((element) => window.getComputedStyle(element).textDecorationLine.includes('underline')));
report.checks.englishGender =
  (await desktopPage.getByLabel('Gender').inputValue()) === 'Male' &&
  (await desktopPage.locator('.resume-page .resume-contact [data-contact="gender"]').getByText('Male', { exact: true }).isVisible());
report.checks.genderChevronOffset = await desktopPage.locator('.select-chevron').evaluate(
  (element) => window.getComputedStyle(element).right === '14px',
);
report.checks.profileAvatarInline = await desktopPage.locator('.basics-identity-row').evaluate((element) => {
  const avatar = element.querySelector('.details-avatar');
  const input = element.querySelector('.field input');
  if (!avatar || !input) return false;
  const avatarBox = avatar.getBoundingClientRect();
  const inputBox = input.getBoundingClientRect();
  return Math.abs(avatarBox.height - inputBox.height) < 1 &&
    Math.abs(avatarBox.bottom - inputBox.bottom) < 1 &&
    Boolean(element.querySelector('.avatar-upload .details-avatar'));
});
await desktopPage.screenshot({ path: join(tmpdir(), 'draftline-playwright-markdown-website-link.png') });
await desktopPage.emulateMedia({ media: 'print' });
report.checks.printWebsiteLink = await websiteLink.isVisible();
const exportedPdfPath = join(tmpdir(), 'draftline-playwright-markdown-website-link.pdf');
await desktopPage.pdf({ path: exportedPdfPath, printBackground: true });
report.checks.exportedPdfWebsiteLink = (await readFile(exportedPdfPath)).includes(
  'https://github.com/theo-the-menace',
);
await desktopPage.emulateMedia({ media: 'screen' });
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
  !(await desktopPage.locator('.resume-profile-avatar .profile-avatar-initials').isVisible()) &&
  (await desktopPage.locator('.resume-page.template-profile.has-profile-photo').isVisible()) &&
  (await desktopPage.locator('.resume-page.template-profile .resume-header').evaluate(
    (element) => window.getComputedStyle(element).paddingRight,
  )) === '178px';

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
  JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-workspace-preferences-v1')),
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
  (await desktopPage.getByLabel('Search resumes').isVisible()) &&
  (await desktopPage.getByRole('heading', { name: 'My resumes' }).count()) === 0 &&
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
const resumeActionsMenu = desktopPage.locator('.resume-card-menu');
const resumeActionColors = await resumeActionsMenu.locator('button').evaluateAll((buttons) =>
  buttons.map((button) => window.getComputedStyle(button).color),
);
await desktopPage.locator('.library-toolbar').click();
report.checks.resumeActionsCloseOnOutsideClick =
  !(await resumeActionsMenu.isVisible()) &&
  resumeActionColors[0] === resumeActionColors[1];
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

await desktopPage.locator('.resume-library-card').filter({ hasText: 'Jordan Lee - Android Developer' }).click();
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
  .getByLabel('Search resumes')
  .isVisible();
await mobilePage.screenshot({ path: join(tmpdir(), 'draftline-playwright-library-mobile.png') });
await mobilePage.getByRole('button', { name: 'New resume' }).click();
const mobileNewResumeDialog = mobilePage.getByRole('dialog', { name: 'New resume' });
report.checks.mobileNewResumeDialog =
  (await mobileNewResumeDialog.isVisible()) &&
  (await mobileNewResumeDialog.getByRole('button', { name: 'Save' }).isDisabled());
await mobileNewResumeDialog.getByRole('button', { name: 'Cancel' }).click();
await mobilePage.locator('.resume-library-card').filter({ hasText: 'Jordan Lee - Product Designer' }).click();
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

const legacyAccountRecovery = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await legacyAccountRecovery.addInitScript(() => {
  localStorage.setItem('draftline-user-database-v1', JSON.stringify({
    version: 1,
    accounts: [{ id: 'yeatom', username: 'yeatom', password: 'yeatom', createdAt: 0 }],
  }));
  localStorage.setItem('draftline-current-account-v1', 'yeatom');
  localStorage.setItem('draftline-resume-library-v2', JSON.stringify({
    version: 2,
    resumes: [{
      id: 'legacy-resume',
      documentName: 'Legacy resume',
      language: 'english',
      data: {
        basics: {
          firstName: 'Legacy',
          lastName: 'User',
          role: 'Designer',
          email: 'legacy@example.com',
        },
      },
    }],
  }));
  localStorage.setItem('draftline-user-profile-v1', JSON.stringify({
    chinese: { fullName: '张三', gender: '男', phone: '13800138000', email: 'zhangsan@example.com' },
    english: {},
  }));
  localStorage.setItem('draftline-account-data-v1:yeatom:draftline-resume-library-v2', JSON.stringify({ version: 2, resumes: [] }));
  localStorage.setItem('draftline-account-data-v1:yeatom:draftline-user-profile-v1', JSON.stringify({
    chinese: { fullName: 'yeatom' },
    english: { fullName: 'yeatom' },
  }));
});
const legacyAccountRecoveryPage = await legacyAccountRecovery.newPage();
await attachDiagnostics(legacyAccountRecoveryPage);
await legacyAccountRecoveryPage.goto(baseUrl, { waitUntil: 'networkidle' });
report.checks.legacyAccountDataRecovered =
  (await legacyAccountRecoveryPage.locator('.resume-library-card').count()) === 1 &&
  (await legacyAccountRecoveryPage.getByText('Legacy resume', { exact: true }).isVisible()) &&
  (await legacyAccountRecoveryPage.getByRole('button', { name: 'Account menu' }).textContent()) === 'Y';
report.checks.legacyAccountDataScoped = await legacyAccountRecoveryPage.evaluate(() => {
  const library = JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-resume-library-v2'));
  const profile = JSON.parse(localStorage.getItem('draftline-account-data-v1:yeatom:draftline-user-profile-v1'));
  return library.resumes.length === 1 &&
    profile.chinese.fullName === '张三' &&
    localStorage.getItem('draftline-account-migration-v1') !== null &&
    localStorage.getItem('draftline-resume-library-v2') === null &&
    localStorage.getItem('draftline-user-profile-v1') === null &&
    localStorage.getItem('draftline-workspace-preferences-v1') === null &&
    localStorage.getItem('draftline-editor-width') === null &&
    localStorage.getItem('draftline-resume-state-v1') === null;
});
await legacyAccountRecovery.close();

const recovery = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await recovery.addInitScript(() => {
  localStorage.setItem('draftline-resume-library-v2', '{invalid-json');
  localStorage.setItem('draftline-resume-state-v1', '{invalid-json');
  localStorage.setItem('draftline-workspace-preferences-v1', '{invalid-json');
});
const recoveryPage = await recovery.newPage();
await attachDiagnostics(recoveryPage);
await recoveryPage.goto(baseUrl, { waitUntil: 'networkidle' });
await recoveryPage.locator('.resume-library-card').filter({ hasText: 'Jordan Lee - Product Designer' }).click();
report.checks.corruptStorageRecovery =
  (await recoveryPage.getByLabel('Resume name').inputValue()) === 'Jordan Lee - Product Designer' &&
  (await recoveryPage.locator('.resume-page').getByText('Jordan Lee', { exact: true }).isVisible());
await recovery.close();

const reorder = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const reorderPage = await reorder.newPage();
await attachDiagnostics(reorderPage);
await reorderPage.goto(baseUrl, { waitUntil: 'networkidle' });
await reorderPage.locator('.resume-library-card').filter({ hasText: 'Jordan Lee - Product Designer' }).click();
const personalDetailsSection = reorderPage.locator('.section-nav-item').filter({ hasText: 'Personal details' });
const sectionOrderBeforeFixedDrop = await reorderPage.locator('.section-nav-item .section-label').allTextContents();
await reorderPage.locator('.section-nav-item').filter({ hasText: 'Skills' }).dragTo(personalDetailsSection);
report.checks.personalDetailsFixed =
  (await personalDetailsSection.evaluate((element) => (element as HTMLButtonElement).draggable)) === false &&
  JSON.stringify(await reorderPage.locator('.section-nav-item .section-label').allTextContents()) === JSON.stringify(sectionOrderBeforeFixedDrop);
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
const mobileMetrics = report.checks.mobileMetrics as PageMetrics;
if (mobileMetrics.scrollWidth > mobileMetrics.innerWidth) {
  failedChecks.push('mobileHorizontalOverflow');
}
if (report.consoleErrors.length || report.pageErrors.length) {
  failedChecks.push('browserErrors');
}

console.log(JSON.stringify({ ...report, failedChecks }, null, 2));
if (failedChecks.length) process.exitCode = 1;
