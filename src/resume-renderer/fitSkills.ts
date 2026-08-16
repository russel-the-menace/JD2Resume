import { blockId } from './blockIds';
import type { PagePlanV2, ResumeData } from './types';

export const MAX_SKILL_FIT_REMOVALS = 5;
const MIN_BULLETS_PER_EXPERIENCE = 3;

export function skillsStartOnNewPage(plan: PagePlanV2) {
  return plan.pages.findIndex((page) => page.blockIds[0] === blockId.section('skills')) > 0;
}

export function removeOneBulletForSkills(data: ResumeData, plan: PagePlanV2): ResumeData | null {
  const skillPageIndex = plan.pages.findIndex((page) => page.blockIds[0] === blockId.section('skills'));
  if (skillPageIndex <= 0) return null;

  const previousPageIds = new Set(plan.pages[skillPageIndex - 1].blockIds);
  const candidates = data.experience.flatMap((experience, experienceIndex) => {
    const bullets = experience.bullets || [];
    if (bullets.length <= MIN_BULLETS_PER_EXPERIENCE) return [];
    const visibleIndexes = bullets
      .map((_, bulletIndex) => bulletIndex)
      .filter((bulletIndex) => previousPageIds.has(blockId.experienceBullet(experience.id, experienceIndex, bulletIndex)));
    if (!visibleIndexes.length) return [];
    const removableIndex = [...visibleIndexes].reverse().find((bulletIndex) => !/<u>.*?<\/u>/i.test(bullets[bulletIndex]))
      ?? visibleIndexes[visibleIndexes.length - 1];
    return [{ experienceIndex, bulletIndex: removableIndex, bulletCount: bullets.length }];
  });
  if (!candidates.length) return null;

  candidates.sort((left, right) => right.bulletCount - left.bulletCount || right.experienceIndex - left.experienceIndex);
  const target = candidates[0];
  return {
    ...data,
    experience: data.experience.map((experience, experienceIndex) => experienceIndex === target.experienceIndex
      ? { ...experience, bullets: (experience.bullets || []).filter((_, bulletIndex) => bulletIndex !== target.bulletIndex) }
      : experience),
  };
}
