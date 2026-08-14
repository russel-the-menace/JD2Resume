import { GenerateFromFrontendRequest, JobData, ResumeData, UserResumeProfile } from './types';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function puppetEndDate(value: unknown): string {
  const result = text(value);
  return result.toLowerCase() === 'present' ? '至今' : result;
}

export function toPuppetRequest(
  input: Record<string, any>,
  job: { title: string; experience: string; description: string },
): GenerateFromFrontendRequest {
  const source = input.profile || {};
  const profile: UserResumeProfile = {
    name: text(source.fullName || source.name),
    photo: text(source.photoUrl || source.photo),
    gender: text(source.gender),
    birthday: text(source.birthday),
    wechat: text(source.wechat),
    email: text(source.email),
    phone: text(source.phone),
    phone_en: text(source.phoneEn || source.phone_en || source.phone),
    website: text(source.website),
    linkedin: text(source.linkedin),
    telegram: text(source.telegram),
    location: text(source.location),
    educations: Array.isArray(source.educations) ? source.educations.map((education: any) => ({
      school: text(education.school),
      degree: text(education.degree),
      major: text(education.major),
      startDate: text(education.startDate || education.start),
      endDate: puppetEndDate(education.endDate || education.end),
      description: text(education.description),
    })) : [],
    workExperiences: Array.isArray(source.workExperiences) ? source.workExperiences.map((experience: any) => ({
      company: text(experience.company),
      jobTitle: text(experience.jobTitle || experience.role),
      businessDirection: text(experience.businessDirection),
      workContent: text(experience.workContent || experience.description),
      startDate: text(experience.startDate || experience.start),
      endDate: puppetEndDate(experience.endDate || experience.end),
    })) : [],
    certificates: Array.isArray(source.certificates) ? source.certificates.map(text).filter(Boolean) : [],
    skills: Array.isArray(source.skills) ? source.skills.map(text).filter(Boolean) : [],
    aiMessage: text(source.aiMessage),
  };
  const language = input.language === 'english' ? 'english' : 'chinese';
  const jobData: JobData = {
    _id: text(input.jobId),
    title: job.title,
    title_chinese: job.title,
    title_english: job.title,
    team: '',
    summary: job.description,
    summary_chinese: [],
    summary_english: [],
    salary: '',
    salary_english: '',
    createdAt: new Date().toISOString(),
    source_name: '',
    source_name_english: '',
    source_url: '',
    type: 'remote',
    description: job.description,
    description_chinese: job.description,
    description_english: job.description,
    city: '',
    experience: job.experience,
  };
  return {
    jobId: text(input.jobId),
    openid: text(input.applicationId),
    language,
    resume_profile: profile,
    job_data: jobData,
  };
}

export function fromPuppetResume(data: ResumeData) {
  const englishNameParts = data.languages === 'english' ? data.name.trim().split(/\s+/).filter(Boolean) : [];
  const categories = (data.professionalSkills || []).map((category) => ({
    title: category.title,
    items: [...category.items],
  }));
  return {
    basics: {
      fullName: data.languages === 'english' ? '' : data.name,
      firstName: data.languages === 'english' ? englishNameParts.slice(0, -1).join(' ') || englishNameParts[0] || '' : '',
      lastName: data.languages === 'english' && englishNameParts.length > 1 ? englishNameParts[englishNameParts.length - 1] : '',
      role: data.position,
      email: data.contact.email || '',
      phone: data.contact.phone || '',
      location: data.contact.location || '',
      gender: data.gender || '',
      website: data.contact.website || data.contact.linkedin || '',
      photoUrl: data.avatar || '',
    },
    yearsOfExperience: data.yearsOfExperience,
    summary: data.personalIntroduction,
    experience: data.workExperience.map((experience, index) => ({
      id: index + 1,
      role: experience.position,
      company: experience.company,
      location: '',
      start: experience.startDate,
      end: data.languages === 'english' && experience.endDate === '至今' ? 'Present' : experience.endDate,
      current: ['至今', 'present'].includes(experience.endDate.toLowerCase()),
      bullets: [...(experience.responsibilities || [])],
    })),
    education: data.education.map((education, index) => ({
      id: index + 1,
      school: education.school,
      degree: education.degree || '',
      location: '',
      start: education.graduationDate.split(' - ')[0] || '',
      end: education.graduationDate.split(' - ')[1] || education.graduationDate,
    })),
    skills: {
      categories,
      expertise: categories.map((category) => `${category.title}: ${category.items.join(', ')}`).join(' | '),
      tools: '',
    },
    certificates: (data.certificates || []).map((certificate) => ({ ...certificate })),
  };
}
