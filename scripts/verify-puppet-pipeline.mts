import assert from 'node:assert/strict';
import { PuppetResumePipeline } from '../server/puppet-resume/pipeline';
import { fromPuppetResume, toPuppetRequest } from '../server/puppet-resume/adapter';

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
  }],
};
const responsibilities = Array.from({ length: 8 }, (_, index) =>
  index === 0
    ? 'Engineered <b>core services</b> with measurable reliability gains across distributed workloads, improving delivery confidence, observability, and incident response for product teams.'
    : `Delivered measurable platform result ${index + 1} by improving service reliability, automated validation, operational monitoring, and release quality across remote product teams.`
);
const phaseTwo = {
  workExperience: [{
    company: 'Real Company',
    position: 'Software Engineer',
    startDate: '2020-01',
    endDate: '至今',
    responsibilities,
  }],
};

const prompts: string[] = [];
const responses = [phaseOne, phaseTwo];
const pipeline = new PuppetResumePipeline(async (prompt, validator) => {
  prompts.push(prompt);
  const response = JSON.stringify(responses[prompts.length - 1]);
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
assert.equal(puppetResume.workExperience[0].responsibilities?.length, 8);
assert.equal(mainResume.experience[0].company, 'Real Company');
assert.equal(mainResume.experience[0].end, 'Present');
assert.equal(mainResume.skills.categories.length, 4);
console.log('Puppet Resume two-phase pipeline verified.');

const chineseNameRequest = toPuppetRequest({
  ...input,
  profile: { ...input.profile, fullName: 'Junling Tian' },
}, {
  title: 'Software Engineer',
  experience: '经验不限',
  description: 'Build reliable remote cloud services.',
});
assert.equal(chineseNameRequest.resume_profile.name, 'Junling Tian');
