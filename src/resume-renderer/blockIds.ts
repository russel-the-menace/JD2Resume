const stable = (value: string | number | undefined, fallback: string) => String(value ?? fallback).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
export const blockId = {
  header: () => 'header',
  section: (section: string) => `${section}.heading`,
  summary: (index: number) => `summary.paragraph.${index}`,
  education: (id: string | number | undefined, index: number) => `education.${stable(id, String(index))}`,
  experienceHeading: (id: string | number | undefined, index: number) => `experience.${stable(id, String(index))}.heading`,
  experienceBullet: (id: string | number | undefined, entryIndex: number, bulletIndex: number) => `experience.${stable(id, String(entryIndex))}.bullet.${bulletIndex}`,
  skillHeading: (category: string, index: number) => `skills.${stable(category.toLowerCase(), String(index))}.heading`,
  skillItem: (category: string, categoryIndex: number, itemIndex: number) => `skills.${stable(category.toLowerCase(), String(categoryIndex))}.item.${itemIndex}`,
  certificate: (id: string | number | undefined, index: number) => `certificate.${stable(id, String(index))}`,
};
