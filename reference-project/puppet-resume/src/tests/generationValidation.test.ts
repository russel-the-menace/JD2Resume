import { validateGenerationInput } from '../utils/generationValidation';

const baseProfile = {
  name: 'Jordan Lee',
  photo: '',
  gender: '',
  birthday: '',
  wechat: '',
  email: 'jordan@example.com',
  phone: '',
  educations: [],
  workExperiences: [],
  certificates: [],
  skills: [],
  aiMessage: '',
};

const baseJob = {
  _id: 'job-1',
  title: 'Product Designer',
  title_chinese: '',
  title_english: 'Product Designer',
  team: 'Acme',
  summary: '',
  summary_chinese: [],
  summary_english: [],
  salary: '',
  salary_english: '',
  createdAt: '',
  source_name: '',
  source_name_english: '',
  source_url: '',
  type: 'remote',
  description: 'Design products for remote teams.',
  description_chinese: '',
  description_english: '',
  city: '',
  experience: '',
};

describe('validateGenerationInput', () => {
  it('accepts a complete job-specific generation input', () => {
    expect(validateGenerationInput({
      jobId: 'job-1',
      language: 'english',
      resume_profile: baseProfile,
      job_data: baseJob,
    })).toEqual({ valid: true, errors: [] });
  });

  it('rejects a mismatched job identity before generation', () => {
    const result = validateGenerationInput({
      jobId: 'job-2',
      language: 'english',
      resume_profile: baseProfile,
      job_data: baseJob,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('jobId must match job_data._id');
  });
});
