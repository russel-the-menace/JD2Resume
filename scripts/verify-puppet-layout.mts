import assert from 'node:assert/strict';
import { renderPuppetPdf, resolvePuppetLayout } from '../server/puppet-resume/layout';

const longBullet = 'Engineered remote platform capabilities with measurable delivery, reliability, observability, security, and cross-team operational improvements. '.repeat(3);
const data = {
  basics: {
    fullName: 'Layout Test', firstName: 'Layout', lastName: 'Test', role: 'Software Engineer',
    email: 'layout@example.com', phone: '555-0100', location: 'Remote', gender: 'Male', website: '', photoUrl: '',
  },
  yearsOfExperience: 8,
  summary: `${longBullet} ${longBullet}\n\n${longBullet}`,
  experience: Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    role: 'Software Engineer',
    company: `Real Company ${index + 1}`,
    location: '',
    start: `${2025 - index}-01`,
    end: index === 0 ? 'Present' : `${2025 - index}-12`,
    current: index === 0,
    bullets: Array.from({ length: 8 }, (__, bullet) => `${longBullet} Result ${bullet + 1}.`),
  })),
  education: [{ id: 1, school: 'Test University', degree: 'Computer Science', location: '', start: '2014', end: '2018' }],
  skills: {
    expertise: '', tools: '',
    categories: Array.from({ length: 4 }, (_, index) => ({
      title: `Category ${index + 1}`,
      items: Array.from({ length: 4 }, (__, item) => `Skill ${index + 1}.${item + 1}`),
    })),
  },
  certificates: [],
};
const document = {
  id: 'layout-test',
  documentName: 'Layout Test',
  language: 'english',
  data,
  template: 'profile',
  accent: '#167c65',
  customSections: [],
  customContent: {},
  sectionOrder: ['basics', 'summary', 'education', 'experience', 'skills'],
  sectionOrderCustomized: false,
  generationEvidence: {},
  updatedAt: Date.now(),
};

const origin = process.env.DRAFTLINE_URL || 'http://127.0.0.1:4173';
const manifest = await resolvePuppetLayout(origin, document);
assert.ok(manifest.pageCount > 1);
assert.ok(['compact-gaps', 'compact-lines', 'compact-balanced', 'expand-gaps', 'expand-lines'].includes(manifest.policy));
const pdf = await renderPuppetPdf(origin, { ...document, layoutManifest: manifest }, manifest);
assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
assert.ok(pdf.length > 10_000);
console.log(`Puppet layout verified: ${manifest.pageCount} pages, policy=${manifest.policy}, PDF=${pdf.length} bytes.`);
