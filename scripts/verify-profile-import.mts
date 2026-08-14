import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { extractPdfDocument } from '../server/profile-import/document';
import {
  importProfileFacts,
  translateProfileFacts,
  type ProfileImportModels,
  type ProfileTaskRequest,
} from '../server/profile-import/pipeline';

const models: ProfileImportModels = {
  lite: 'gemini-3.1-flash-lite',
  mini: 'gpt-5-mini',
  standard: 'gpt-5.1',
  vision: 'gemini-3.6-flash',
  escalation: 'gpt-5.6-terra',
};

const calls: ProfileTaskRequest[] = [];
let educationAttempts = 0;
const caller = async (request: ProfileTaskRequest) => {
  calls.push(request);
  if (request.task === 'basic') {
    return {
      basic: { fullName: '田俊铃', gender: '', birthday: '', phone: '13800138000', email: 'junling@example.com' },
      sources: { fullName: ['p1-l1'], phone: ['p1-l2'], email: ['p1-l2'] },
    };
  }
  if (request.task === 'education') {
    educationAttempts += 1;
    if (educationAttempts === 1) throw new Error('MODULE_SCHEMA_INVALID');
    return {
      educations: [{
        school: '复旦大学', degree: '本科', studyType: '', major: '视觉传达设计',
        startDate: '2014-09', endDate: '2018-06', sourceLines: ['p1-l3', 'p1-l4'], descriptionSourceLines: [],
      }],
    };
  }
  if (request.task === 'work') return { workExperiences: [] };
  if (request.task === 'skills') {
    return { skills: [{ value: '内容运营', sourceLines: ['p1-l5'] }], certificates: [] };
  }
  if (request.task === 'translation') {
    return {
      language: 'english',
      profile: {
        fullName: 'Junling Tian', gender: '', birthday: '', phone: '13800138000', phoneEn: '13800138000',
        email: 'junling@example.com', location: '', wechat: '', whatsapp: '', telegram: '', linkedin: '', website: '',
        educations: [{ school: 'Fudan University', degree: 'Bachelor', studyType: '', major: 'Visual Communication Design', startDate: '2014-09', endDate: '2018-06', description: '' }],
        workExperiences: [], skills: ['Content Operations'], certificates: [],
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
    '2014-09 - 2018-06',
    '专业技能 内容运营',
  ].join('\n'),
  attachment: null,
}, models, caller);

assert.equal(imported.language, 'chinese');
assert.equal(imported.profile.fullName, '田俊铃');
assert.equal(imported.profile.educations[0].school, '复旦大学');
assert.deepEqual(imported.profile.skills, ['内容运营']);
assert.deepEqual(calls.filter((call) => call.task === 'education').map((call) => call.model), ['gpt-5-mini', 'gpt-5.1']);
assert.equal(calls.filter((call) => call.task === 'basic').length, 1);
assert.equal(calls.filter((call) => call.task === 'work').length, 1);
assert.equal(calls.filter((call) => call.task === 'skills').length, 1);

const translated = await translateProfileFacts('chinese', imported.profile, models, caller);
assert.equal(translated.profile.fullName, 'Junling Tian');
assert.equal(calls.find((call) => call.task === 'translation')?.model, 'gpt-5-mini');

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
