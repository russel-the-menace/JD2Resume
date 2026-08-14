import { GenerateFromFrontendRequest } from '../types';

export interface GenerationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate the immutable inputs for one job-specific resume generation before
 * quota consumption or an AI call. The generated record stores these same
 * inputs as the application evidence for that resume.
 */
export function validateGenerationInput(
  payload: Partial<GenerateFromFrontendRequest>,
): GenerationValidationResult {
  const errors: string[] = [];
  const profile = payload.resume_profile;
  const job = payload.job_data;

  if (!payload.jobId?.trim()) errors.push('jobId is required');
  if (!payload.language || !['chinese', 'english'].includes(payload.language)) {
    errors.push('language must be chinese or english');
  }
  if (!profile) {
    errors.push('resume_profile is required');
  } else {
    if (!profile.name?.trim()) errors.push('resume_profile.name is required');
    if (!profile.email?.trim() && !profile.phone?.trim() && !profile.wechat?.trim()) {
      errors.push('at least one contact field is required');
    }
    if (!Array.isArray(profile.educations)) errors.push('resume_profile.educations must be an array');
    if (!Array.isArray(profile.workExperiences)) errors.push('resume_profile.workExperiences must be an array');
    if (!Array.isArray(profile.skills)) errors.push('resume_profile.skills must be an array');
  }

  if (!job) {
    errors.push('job_data is required');
  } else {
    if (!job._id?.trim()) errors.push('job_data._id is required');
    if (payload.jobId && job._id !== payload.jobId) {
      errors.push('jobId must match job_data._id');
    }
    if (!job.title?.trim() && !job.title_chinese?.trim() && !job.title_english?.trim()) {
      errors.push('job_data must include a title');
    }
    if (!job.description?.trim() && !job.description_chinese?.trim() && !job.description_english?.trim()) {
      errors.push('job_data must include a description');
    }
  }

  return { valid: errors.length === 0, errors };
}
