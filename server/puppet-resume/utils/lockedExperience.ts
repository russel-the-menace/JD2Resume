interface LockedExperience {
  company: string;
  startDate: string;
  endDate: string;
}

function experienceKey(exp: LockedExperience): string {
  return [exp.company.trim(), exp.startDate.trim(), exp.endDate.trim()].join('\u0000');
}

/**
 * Every user-provided company/date tuple must survive generation exactly once.
 * Order is irrelevant, so repeated employment at the same company is safe.
 */
export function findMissingLockedExperiences(
  source: LockedExperience[],
  generated: LockedExperience[],
): LockedExperience[] {
  const generatedCounts = new Map<string, number>();
  for (const exp of generated) {
    const key = experienceKey(exp);
    generatedCounts.set(key, (generatedCounts.get(key) || 0) + 1);
  }

  const missing: LockedExperience[] = [];
  for (const exp of source) {
    const key = experienceKey(exp);
    const count = generatedCounts.get(key) || 0;
    if (count > 0) generatedCounts.set(key, count - 1);
    else missing.push(exp);
  }
  return missing;
}
