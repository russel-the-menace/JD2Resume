import { ResumeGenerator } from '../resumeGenerator';
import { ResumeData } from '../types';

const pdfParse = require('pdf-parse');

function fixture(jobCount: number, verbose: boolean): ResumeData {
  const longText = '负责远程协作平台的核心模块设计与交付，结合岗位要求完成需求拆解、质量校验、性能优化和跨团队上线，并通过可观测指标持续验证业务结果。';
  return {
    name: '布局测试用户',
    position: '高级软件工程师',
    contact: { email: 'layout@example.com', phone: '13800000000' },
    yearsOfExperience: 6,
    education: [{ school: '测试大学', degree: '计算机科学学士', graduationDate: '2020-06' }],
    personalIntroduction: verbose ? longText.repeat(3) : '具备软件研发与远程协作经验。',
    professionalSkills: Array.from({ length: 4 }, (_, category) => ({
      title: `技能分类 ${category + 1}`,
      items: Array.from({ length: 4 }, (_, item) => verbose ? `${longText} 技能 ${item + 1}` : `技能 ${item + 1}`),
    })),
    workExperience: Array.from({ length: jobCount }, (_, job) => ({
      company: `测试公司 ${job + 1}`,
      position: '软件工程师',
      startDate: `${2025 - job}-01`,
      endDate: job === 0 ? '至今' : `${2025 - job}-12`,
      responsibilities: Array.from({ length: 8 }, (_, bullet) => verbose ? `${longText} 成果 ${bullet + 1}` : `完成核心功能 ${bullet + 1}`),
    })),
  };
}

describe('ResumeGenerator natural pagination', () => {
  jest.setTimeout(60_000);

  test('short content produces at least one page and long content grows naturally', async () => {
    const generator = new ResumeGenerator();
    try {
      const minimalResume = fixture(0, false);
      minimalResume.professionalSkills = [];
      const shortPdf = await generator.generatePDFToBuffer(minimalResume);
      const longPdf = await generator.generatePDFToBuffer(fixture(4, true));
      const [shortInfo, longInfo] = await Promise.all([pdfParse(shortPdf), pdfParse(longPdf)]);

      expect(shortInfo.numpages).toBe(1);
      expect(longInfo.numpages).toBeGreaterThan(shortInfo.numpages);
      expect(longInfo.text).toContain('测试公司 4');
      expect(longInfo.text).toContain('成果 8');
    } finally {
      await generator.close();
    }
  });

  test('uses five distinct non-baseline adjustment policies', () => {
    const policies = (new ResumeGenerator() as any).layoutPolicies as Array<{
      id: string;
      sectionGapDelta: number;
      lineHeightDelta: number;
    }>;
    const signatures = policies.map((policy) => `${policy.sectionGapDelta}:${policy.lineHeightDelta}`);

    expect(policies).toHaveLength(5);
    expect(new Set(policies.map((policy) => policy.id)).size).toBe(5);
    expect(new Set(signatures).size).toBe(5);
    expect(signatures).not.toContain('0:0');
  });
});
