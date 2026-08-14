import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { documentFromText, extractPdfDocument, replaceCorruptedPageLines } from '../server/profile-import/document';
import {
  importProfileFacts,
  translateProfileFacts,
  type ProfileImportModels,
  type ProfileTaskRequest,
} from '../server/profile-import/pipeline';

const models: ProfileImportModels = {
  lite: 'gemini-3.5-flash-lite',
  mini: 'gemini-3.6-flash',
  standard: 'gemini-3.7-flash',
  vision: 'gemini-3.6-flash',
  escalation: 'gemini-3.1-pro-preview',
};

const calls: ProfileTaskRequest[] = [];
let educationAttempts = 0;
let basicFinished = false;
let parallelTaskStartedBeforeBasicFinished = false;
const caller = async (request: ProfileTaskRequest) => {
  calls.push(request);
  if (request.task === 'basic') {
    await new Promise((resolve) => setTimeout(resolve, 40));
    basicFinished = true;
    return {
      basic: { fullName: '田俊铃', gender: '', birthday: '', phone: '13800138000', email: 'junling@example.com' },
      sources: { fullName: ['p1-l1'], phone: ['p1-l2'], email: ['p1-l2'] },
    };
  }
  if (['education', 'work', 'certificates'].includes(request.task) && !basicFinished) {
    parallelTaskStartedBeforeBasicFinished = true;
  }
  if (request.task === 'education') {
    educationAttempts += 1;
    if (educationAttempts === 1) throw new Error('MODULE_SCHEMA_INVALID');
    return {
      educations: [{
        school: '复旦大学', degree: '本科', studyType: '本科', major: '视觉传达设计',
        startDate: '', endDate: '', sourceLines: ['p1-l4'], descriptionSourceLines: [],
      }],
    };
  }
  if (request.task === 'work') return { workExperiences: [{ company: '一 间客厅社交主题酒馆', jobTitle: '新媒体运营', businessDirection: '', startDate: '', endDate: '', sourceLines: ['p1-l5'], workContentSourceLines: [] }] };
  if (request.task === 'certificates') return { certificates: [] };
  if (request.task === 'translation') {
    return {
      language: 'english',
      profile: {
        fullName: 'Junling Tian', gender: '', birthday: '', phone: '13800138000', phoneEn: '13800138000',
        email: 'junling@example.com', location: '', wechat: '', whatsapp: '', telegram: '', linkedin: '', website: '',
        educations: [{ school: 'Fudan University', degree: 'Bachelor', studyType: '', major: 'Visual Communication Design', startDate: '2014-09', endDate: '2018-06', description: '' }],
        workExperiences: [{ company: 'One Living Room Social Bar', jobTitle: 'New Media Operations', businessDirection: '', workContent: '', startDate: '2020-01', endDate: '2021-02' }], certificates: [],
      },
    };
  }
  throw new Error(`Unexpected task ${request.task}`);
};

const imported = await importProfileFacts({
  sourceType: 'text',
  text: [
    '田俊铃',
    '13800138000 junling@example.com',
    '复旦大学 视觉传达设计 本科',
    '2014 . 09 - 2018 . 06',
    '一 间客厅社交主题酒馆 新媒体运营 2020.01 - 2021.02',
  ].join('\n'),
  attachment: null,
}, models, caller);

assert.equal(imported.language, 'chinese');
assert.equal(imported.profile.fullName, '田俊铃');
assert.equal(imported.profile.educations[0].school, '复旦大学');
assert.equal(imported.profile.educations[0].studyType, '全日制');
assert.equal(imported.profile.educations[0].startDate, '2014-09');
assert.equal(imported.profile.educations[0].endDate, '2018-06');
assert.equal(imported.profile.workExperiences[0].company, '一间客厅社交主题酒馆');
assert.equal(imported.profile.workExperiences[0].startDate, '2020-01');
assert.deepEqual(calls.filter((call) => call.task === 'education').map((call) => call.model), ['gemini-3.6-flash', 'gemini-3.7-flash']);
assert.equal(calls.filter((call) => call.task === 'basic').length, 1);
assert.equal(calls.filter((call) => call.task === 'work').length, 1);
assert.equal(calls.filter((call) => call.task === 'certificates').length, 1);
assert.equal(parallelTaskStartedBeforeBasicFinished, true);

const corruptedDocument = documentFromText('公司\n\u0000\u0000\u0000\u0000.\u0000\u0000-\u0000\u0000\u0000\u0000.\u0000\u0000\n职位');
const repairedDocument = replaceCorruptedPageLines(corruptedDocument, 1, ['2020.01-2021.02']);
assert.equal(repairedDocument.lines.length, corruptedDocument.lines.length);
assert.equal(repairedDocument.lines[1].text, '2020.01-2021.02');
assert.equal(repairedDocument.lines[0].text, '公司');

const translated = await translateProfileFacts('chinese', imported.profile, models, caller);
assert.equal(translated.profile.fullName, 'Junling Tian');
assert.equal(calls.find((call) => call.task === 'translation')?.model, 'gemini-3.6-flash');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
try {
  const page = await browser.newPage();
  await page.setContent('<h1>田俊铃</h1><p>复旦大学 视觉传达设计 本科 2014-09 - 2018-06</p><p>junling@example.com 13800138000</p><p>内容运营 用户增长 社交媒体 数据分析</p>');
  const textPdf = await page.pdf({ format: 'A4' });
  console.log('render test: text pdf generated');
  const textDocument = await extractPdfDocument(Buffer.from(textPdf).toString('base64'));
  console.log('render test: text pdf extracted');
  assert.equal(textDocument.pages.length, 1);
  assert.equal(textDocument.pages[0].needsOcr, false);
  assert.match(textDocument.lines.map((line) => line.text).join(' ').replace(/\s/g, ''), /复旦大学/);

  await page.setContent('<div style="height:1100px"></div>');
  const sparsePdf = await page.pdf({ format: 'A4' });
  const sparseDocument = await extractPdfDocument(Buffer.from(sparsePdf).toString('base64'));
  assert.equal(sparseDocument.pages[0].needsOcr, true);
} finally {
  await browser.close();
}

console.log('Profile import routing, scoped retry, translation, and PDF quality checks verified.');
