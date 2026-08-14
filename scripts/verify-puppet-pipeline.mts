import assert from 'node:assert/strict';
import { PuppetResumePipeline } from '../server/puppet-resume/pipeline';
import { fromPuppetResume, toPuppetRequest } from '../server/puppet-resume/adapter';
import { ExperienceCalculator } from '../server/puppet-resume/utils/experienceCalculator';
import { validateSupplementCompanyNames } from '../server/puppet-resume/utils/supplementCompany';
import { extractTextJob } from '../server/puppet-resume/jobExtraction';

assert.deepEqual(extractTextJob('岗位名称：高级招聘专员\n要求 3-5 年招聘经验。', 'chinese'), {
  title: '高级招聘专员', experience: '3-5 年', description: '岗位名称：高级招聘专员\n要求 3-5 年招聘经验。',
});

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

const prompts: string[] = [];
const responses = [phaseOne, phaseTwo];
const pipeline = new PuppetResumePipeline(async (prompt, validator) => {
  prompts.push(prompt);
  const responseIndex = prompts.length - 1;
  if (responseIndex === 0) {
    await assert.rejects(
      async () => validator(JSON.stringify({ ...phaseOne, personalIntroduction: 'Introduction without emphasis.\n\nSecond paragraph.' })),
      /个人介绍必须仅有 1-2 处加深内容/,
    );
  } else {
    const invalidBulletPhase = {
      workExperience: phaseTwo.workExperience.map((experience) => ({
        ...experience,
        responsibilities: experience.responsibilities.map((item) => item.replace(/<\/?u>/g, '')),
      })),
    };
    await assert.rejects(
      async () => validator(JSON.stringify(invalidBulletPhase)),
      /每段工作经历必须仅有 1-2 条职责包含下划线/,
    );
  }
  const response = JSON.stringify(responses[responseIndex]);
  assert.equal(await validator(response), true);
  return response;
});
const request = toPuppetRequest(input, {
  title: 'Software Engineer',
  experience: '经验不限',
  description: 'Build reliable remote cloud services.',
});
const puppetResume = await pipeline.enhance(request);
const mainResume = fromPuppetResume(puppetResume);

assert.equal(prompts.length, 2);
assert.match(prompts[0], /Phase 1 \(Non-Job Bullet\)/);
assert.match(prompts[1], /Phase 2 \(Job Bullet\)/);
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
