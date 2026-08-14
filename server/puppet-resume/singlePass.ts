export function promoteStructurePromptToSinglePass(prompt: string) {
  return `${prompt}

### FINAL SINGLE-PASS OVERRIDE (HIGHEST PRIORITY)
This request replaces the former two network phases. Return the complete resume now.
- Ignore every earlier instruction that says responsibilities must be empty or forbidden in this phase.
- Every workExperience item must contain exactly 8 responsibilities.
- Responsibilities must follow the target job, length, metrics, locked facts, no-bold, and 1-2 underline rules already stated by this prompt.
- Keep company, position, startDate, and endDate in the same workExperience objects.
- Output one valid JSON object only; do not mention this override.`;
}

export function structureProjection(value: Record<string, any>) {
  return {
    ...value,
    workExperience: Array.isArray(value.workExperience)
      ? value.workExperience.map((experience) => ({ ...experience, responsibilities: [] }))
      : value.workExperience,
  };
}

export function bulletProjection(value: Record<string, any>) {
  return { workExperience: value.workExperience };
}

export function hasCompleteResponsibilities(value: Record<string, any>) {
  return Array.isArray(value.workExperience) && value.workExperience.length > 0
    && value.workExperience.every((experience) => Array.isArray(experience?.responsibilities) && experience.responsibilities.length === 8);
}
