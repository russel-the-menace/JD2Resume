import assert from 'node:assert/strict';
import {
  isIsolatedChineseMetricPhrase,
  normalizeChineseResponsibilitySpacing,
  PuppetResumePipeline,
  validateChineseResponsibilityMetrics,
} from '../server/puppet-resume/pipeline';
import { fromPuppetResume, toPuppetRequest } from '../server/puppet-resume/adapter';
import { ExperienceCalculator } from '../server/puppet-resume/utils/experienceCalculator';
import { validateSupplementCompanyNames } from '../server/puppet-resume/utils/supplementCompany';
import { extractTextJob, isGenericJobTitle } from '../server/puppet-resume/jobExtraction';
import { bulletProjection, hasCompleteResponsibilities, structureProjection } from '../server/puppet-resume/singlePass';
import { generateChineseJobBulletPrompt, generateChineseNonJobPrompt } from '../server/puppet-resume/prompts/ChinesePrompt';

assert.deepEqual(extractTextJob('岗位名称：高级招聘专员\n要求 3-5 年招聘经验。', 'chinese'), {
  title: '高级招聘专员', experience: '3-5 年', description: '岗位名称：高级招聘专员\n要求 3-5 年招聘经验。',
});
const unlabeledRecruitingJob = extractTextJob(
  '岗位职责\n1. 负责技术岗、市场运营岗和销售岗的全流程招聘。\n任职要求\n1-2 年专职招聘经验。',
  'chinese',
);
assert.equal(unlabeledRecruitingJob.title, '岗位职责');
assert.equal(unlabeledRecruitingJob.experience, '1-2 年');
assert.equal(isGenericJobTitle(unlabeledRecruitingJob.title), true);
assert.equal(isGenericJobTitle('招聘专员'), false);
assert.equal(isGenericJobTitle('Job Description'), true);
assert.equal(isIsolatedChineseMetricPhrase('3个月'), true);
assert.equal(isIsolatedChineseMetricPhrase('3个月内完成6大类'), false);
assert.equal(isIsolatedChineseMetricPhrase('提升35%'), false);
assert.equal(
  normalizeChineseResponsibilitySpacing('参与执行 2 场宣讲，单场到场学生 90 余人，收获简历 75 份，入职 9 人'),
  '参与执行2场宣讲，单场到场学生90余人，收获简历75份，入职9人',
);
assert.doesNotThrow(() => validateChineseResponsibilityMetrics([
  '按岗位胜任力模型筛选简历，每周处理400+份，初筛通过率控制在18%以内，节省面试官时间约35%',
  '维护招聘渠道并根据岗位特性优化职位文案与刷新策略',
]));
assert.throws(() => validateChineseResponsibilityMetrics([
  '建立岗位常见问题FAQ，候选人满意度评分提升至4.6/5',
  '维护招聘渠道并根据岗位特性优化职位文案与刷新策略',
]), /主观评分指标/);
assert.throws(() => validateChineseResponsibilityMetrics(
  Array.from({ length: 8 }, (_, index) => `完成第${index + 1}项量化工作`),
), /每条职责都包含数字/);
assert.equal(hasCompleteResponsibilities({ workExperience: [{ responsibilities: Array(8).fill('result') }] }), true);
assert.deepEqual(structureProjection({ workExperience: [{ company: 'Locked', responsibilities: ['result'] }] }).workExperience[0].responsibilities, []);
assert.deepEqual(bulletProjection({ workExperience: [{ responsibilities: ['result'] }] }), { workExperience: [{ responsibilities: ['result'] }] });

const input = {
  applicationId: 'application-test',
  jobId: null,
  language: 'english',
  profile: {
    fullName: 'Alex Zhang',
    gender: 'Male',
    birthday: '1990-01',
    phone: '555-0100',
    email: 'alex@example.com',
    location: 'Remote',
    workExperiences: [{
      company: 'Real Company',
      jobTitle: 'Software Engineer',
      businessDirection: 'Cloud software',
      workContent: 'Built distributed services',
      startDate: '2020-01',
      endDate: 'Present',
    }, {
      company: 'Earlier Company',
      jobTitle: 'Junior Software Engineer',
      businessDirection: 'Developer tools',
      workContent: 'Built internal automation',
      startDate: '2017-01',
      endDate: '2019-12',
    }],
    educations: [{
      school: 'Test University',
      degree: 'Bachelor',
      major: 'Computer Science',
      startDate: '2015-09',
      endDate: '2019-06',
      description: '',
    }],
    certificates: [],
    skills: ['TypeScript'],
    aiMessage: '',
  },
};

const phaseOne = {
  position: 'Software Engineer',
  yearsOfExperience: 6,
  personalIntroduction: '<b>Software engineer</b> with cloud platform experience.\n\nDelivers reliable systems through measurable engineering practices.',
  professionalSkills: [
    { title: 'Languages', items: ['TypeScript', 'JavaScript', 'SQL', 'Python'] },
    { title: 'Backend', items: ['Node.js', 'APIs', 'Services', 'Testing'] },
    { title: 'Cloud', items: ['Containers', 'Monitoring', 'Delivery', 'Security'] },
    { title: 'Methods', items: ['Architecture', 'Review', 'Planning', 'Collaboration'] },
  ],
  workExperience: [{
    company: 'Real Company',
    position: 'Software Engineer',
    startDate: '2020-01',
    endDate: '至今',
    responsibilities: [],
  }, {
    company: 'Earlier Company',
    position: 'Junior Software Engineer',
    startDate: '2017-01',
    endDate: '2019-12',
    responsibilities: [],
  }],
};
const responsibilities = Array.from({ length: 8 }, (_, index) =>
  index === 0
    ? 'Engineered core services with <u>measurable reliability gains</u> across distributed workloads, improving delivery confidence, observability, and incident response for product teams.'
    : `Delivered measurable platform result ${index + 1} by improving service reliability, automated validation, operational monitoring, and release quality across remote product teams.`
);
const phaseTwo = {
  workExperience: phaseOne.workExperience.map((experience) => ({ ...experience, responsibilities })),
};
const roleResponses = phaseTwo.workExperience.map((experience) => ({ workExperience: [experience] }));

const prompts: string[] = [];
const stageOptions: Array<{ stage: string; maxTokens: number; timeoutMs: number }> = [];
let activeRoleCalls = 0;
let maxActiveRoleCalls = 0;
const pipeline = new PuppetResumePipeline(async (prompt, validator, options) => {
  prompts.push(prompt);
  stageOptions.push(options);
  const responseIndex = prompts.length - 1;
  if (responseIndex === 0) {
    await assert.rejects(
      async () => validator(JSON.stringify({ ...phaseOne, personalIntroduction: 'Introduction without emphasis.\n\nSecond paragraph.' })),
      /个人介绍必须仅有 1-2 处加深内容/,
    );
  } else {
    activeRoleCalls += 1;
    maxActiveRoleCalls = Math.max(maxActiveRoleCalls, activeRoleCalls);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const roleResponse = roleResponses[responseIndex - 1];
    const invalidBulletPhase = {
      workExperience: roleResponse.workExperience.map((experience) => ({
        ...experience,
        responsibilities: experience.responsibilities.map((item) => item.replace(/<\/?u>/g, '')),
      })),
    };
    await assert.rejects(
      async () => validator(JSON.stringify(invalidBulletPhase)),
      /每段工作经历必须仅有 1-2 条职责包含下划线/,
    );
    activeRoleCalls -= 1;
  }
  const response = JSON.stringify(responseIndex === 0 ? phaseOne : roleResponses[responseIndex - 1]);
  assert.equal(await validator(response), true);
  return response;
});
const request = toPuppetRequest(input, {
  title: 'Software Engineer',
  experience: '经验不限',
  description: 'Build reliable remote cloud services.',
});
const chineseCalculation = ExperienceCalculator.calculate(request.resume_profile, request.job_data);
const chineseStructurePrompt = generateChineseNonJobPrompt({
  targetTitle: request.job_data.title_chinese,
  job: request.job_data,
  requiredExp: chineseCalculation.requiredExp,
  profile: request.resume_profile,
  earliestWorkDate: chineseCalculation.earliestWorkDate,
  actualExperienceText: chineseCalculation.actualExperienceText,
  totalMonths: chineseCalculation.totalMonths,
  needsSupplement: chineseCalculation.needsSupplement,
  actualYears: chineseCalculation.actualYears,
  supplementYears: chineseCalculation.supplementYears,
  finalTotalYears: chineseCalculation.finalTotalYears,
  supplementSegments: chineseCalculation.supplementSegments,
  allWorkExperiences: chineseCalculation.allWorkExperiences,
  seniorityThresholdDate: chineseCalculation.seniorityThresholdDate,
  maxCharPerLine: 42,
});
for (const requiredDetail of [
  /responsibilities 必须为 \[\]/,
  /position 控制在 9 字以内/,
  /9 字限制仅适用于补充经历或跨职能改写后的经历/,
  /Tech Lead\/技术负责人\/研发负责人/,
  /LOCK=必须原样保留/,
  /\.NET开发工程师.*Java Developer\/Java工程师/,
  /后端开发.*Golang工程师\/Python后端开发/,
  /后端开发.*产品经理.*跨赛道/,
  /第一段 \d+-\d+，第二段 \d+-\d+/,
  /仅选择 1-2 个最重要的短语.*<b>\.\.\.<\/b>/,
  /恰好 4 组，每组恰好 4 项/,
  /18-42 个视觉点/,
  /BOSS直聘.*结构化面试.*人才测评.*招聘数据分析.*PowerPoint/,
  /候选人经历和目标 JD.*不得凭空捏造具体业绩数字/,
  /所有其他字段禁止出现 <b>、<u> 或 Markdown 强调标记/,
]) {
  assert.match(chineseStructurePrompt, requiredDetail);
}
const chineseRolePrompt = generateChineseJobBulletPrompt({
  targetTitle: request.job_data.title_chinese,
  job: request.job_data,
  requiredExp: chineseCalculation.requiredExp,
  profile: request.resume_profile,
  earliestWorkDate: chineseCalculation.earliestWorkDate,
  actualExperienceText: chineseCalculation.actualExperienceText,
  totalMonths: chineseCalculation.totalMonths,
  needsSupplement: chineseCalculation.needsSupplement,
  actualYears: chineseCalculation.actualYears,
  supplementYears: chineseCalculation.supplementYears,
  finalTotalYears: chineseCalculation.finalTotalYears,
  supplementSegments: chineseCalculation.supplementSegments,
  allWorkExperiences: chineseCalculation.allWorkExperiences,
  seniorityThresholdDate: chineseCalculation.seniorityThresholdDate,
  maxCharPerLine: 42,
}, [{ company: 'Real Company', position: '招聘专员', startDate: '2020-01', endDate: '至今' }]);
assert.match(chineseRolePrompt, /不要求每条都包含数字.*禁止 8 条全部堆叠数字/);
assert.match(chineseRolePrompt, /每周筛选400\+份.*初筛通过率18%.*节省面试官时间35%/);
assert.match(chineseRolePrompt, /候选人满意度4\.6\/5/);
const puppetResume = await pipeline.enhance(request);
const mainResume = fromPuppetResume(puppetResume);

assert.equal(prompts.length, 3);
assert.equal(stageOptions[0].stage, 'structure');
assert.equal(stageOptions[0].maxTokens, 4_000);
assert.equal(stageOptions[0].timeoutMs, 22_000);
assert.equal(stageOptions[1].stage, 'role-bullets');
assert.equal(stageOptions[1].maxTokens, 2_200);
assert.equal(stageOptions[1].timeoutMs, 32_000);
assert.equal(maxActiveRoleCalls, 2);
assert.match(prompts[0], /Phase 1 \(Non-Job Bullet\)/);
assert.match(prompts[1], /Phase 2 \(Job Bullet\)/);
assert.match(prompts[2], /Phase 2 \(Job Bullet\)/);
assert.equal(puppetResume.workExperience.length, 2);
assert.equal(puppetResume.workExperience[0].responsibilities?.length, 8);
assert.equal(mainResume.experience[0].company, 'Real Company');
assert.equal(mainResume.experience[0].end, 'Present');
assert.equal(mainResume.skills.categories.length, 4);
assert.doesNotMatch(prompts[1], /first bullet must contain exactly one <b>/i);
console.log('Puppet Resume two-phase pipeline verified.');

const minimumExperienceCalculation = ExperienceCalculator.calculate({
  ...request.resume_profile,
  workExperiences: [],
  educations: [{
    school: 'Test University',
    degree: 'Bachelor',
    major: 'Computer Science',
    startDate: '2022-09',
    endDate: '2026-06',
    description: '',
  }],
}, request.job_data);
assert.equal(minimumExperienceCalculation.earliestWorkDate, '2023-02');
assert.equal(minimumExperienceCalculation.allWorkExperiences.length, 2);
assert.ok(minimumExperienceCalculation.allWorkExperiences.every((experience) => experience.startDate >= '2023-02'));

const singleExperienceCalculation = ExperienceCalculator.calculate({
  ...request.resume_profile,
  workExperiences: request.resume_profile.workExperiences.slice(0, 1),
}, request.job_data);
assert.equal(singleExperienceCalculation.allWorkExperiences.length, 2);
assert.equal(singleExperienceCalculation.supplementSegments.length, 1);
assert.ok(singleExperienceCalculation.supplementSegments[0].startDate >= singleExperienceCalculation.earliestWorkDate);

const lockedCompany = { company: 'Real Company', startDate: '2020-01', endDate: '至今' };
assert.deepEqual(validateSupplementCompanyNames([lockedCompany], [
  lockedCompany,
  { company: '上海微澜内容工作室', startDate: '2017-01', endDate: '2020-01' },
]), []);
assert.deepEqual(validateSupplementCompanyNames([], [
  { company: '深圳微澜内容工作室', startDate: '2024-01', endDate: '2025-01' },
]), []);
assert.deepEqual(validateSupplementCompanyNames([], [
  { company: 'Quiet Harbor Inc', startDate: '2025-02', endDate: '2026-08' },
  { company: '成都微澜设计工作室', startDate: '2023-02', endDate: '2025-01' },
], [
  { startDate: '2023-02', endDate: '2025-01' },
  { startDate: '2025-02', endDate: '2026-08' },
], {
  educations: [{ school: '四川大学', startDate: '2022-09', endDate: '2026-06' }],
}), []);
assert.match(validateSupplementCompanyNames([], [
  { company: '成都微澜设计工作室', startDate: '2025-09', endDate: '2026-08' },
], [{ startDate: '2025-09', endDate: '2026-08' }], {
  educations: [{ school: '四川大学', startDate: '2022-09', endDate: '2026-06' }],
}).join('; '), /北京\/上海\/广州\/深圳\/杭州/);
assert.match(validateSupplementCompanyNames([], [
  { company: '深圳微澜内容工作室', startDate: '2023-02', endDate: '2024-01' },
  { company: '杭州远岫产品工作室', startDate: '2024-02', endDate: '2025-01' },
], [
  { startDate: '2023-02', endDate: '2024-01' },
  { startDate: '2024-02', endDate: '2025-01' },
]).join('; '), /第 2 段补足经历必须使用英文 Inc 名称/);
assert.match(
  validateSupplementCompanyNames([], [
    { company: 'Apple Inc', startDate: '2024-01', endDate: '2025-01' },
    { company: '上海星河有限公司', startDate: '2023-01', endDate: '2024-01' },
  ]).join('; '),
  /知名公司重名.*必须使用.*格式|必须使用.*格式.*知名公司重名/,
);

const chineseNameRequest = toPuppetRequest({
  ...input,
  profile: { ...input.profile, fullName: 'Junling Tian' },
}, {
  title: 'Software Engineer',
  experience: '经验不限',
  description: 'Build reliable remote cloud services.',
});
assert.equal(chineseNameRequest.resume_profile.name, 'Junling Tian');
