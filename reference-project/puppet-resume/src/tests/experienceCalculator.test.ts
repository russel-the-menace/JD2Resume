import { ExperienceCalculator } from '../utils/experienceCalculator';

const job = (experience: string) => ({ experience } as any);
const profile = (workExperiences: any[]) => ({
  birthday: '1990-01',
  educations: [],
  workExperiences,
} as any);

describe('ExperienceCalculator supplement boundaries', () => {
  test('does not split a long empty timeline into two-year chunks', () => {
    const result = ExperienceCalculator.calculate(profile([]), job('5年以上'));
    expect(result.supplementSegments).toHaveLength(1);
    expect(result.supplementSegments[0].years).toBeGreaterThanOrEqual(5);
  });

  test('fills an exact six-calendar-month intermediate gap', () => {
    const result = ExperienceCalculator.calculate(profile([
      { company: 'A', startDate: '2020-01', endDate: '2021-01' },
      { company: 'B', startDate: '2021-08', endDate: '至今' },
    ]), job('经验不限'));

    expect(result.supplementSegments).toContainEqual(expect.objectContaining({
      startDate: '2021-01',
      endDate: '2021-08',
    }));
  });

  test('does not fill an intermediate gap shorter than six calendar months', () => {
    const result = ExperienceCalculator.calculate(profile([
      { company: 'A', startDate: '2020-01', endDate: '2021-01' },
      { company: 'B', startDate: '2021-07', endDate: '至今' },
    ]), job('经验不限'));

    expect(result.supplementSegments).not.toContainEqual(expect.objectContaining({
      startDate: '2021-01',
    }));
  });
});
