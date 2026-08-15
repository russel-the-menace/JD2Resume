import { GenerateFromFrontendRequest, ResumeData, mapFrontendRequestToResumeData } from './types';
import { generateChineseJobBulletPrompt, generateChineseNonJobPrompt } from './prompts/ChinesePrompt';
import { generateEnglishJobBulletPrompt, generateEnglishNonJobPrompt } from './prompts/EnglishPrompt';
import { BulletPhaseWorkExperience } from './prompts/types';
import { ExperienceCalculator } from './utils/experienceCalculator';
import { findMissingLockedExperiences } from './utils/lockedExperience';
import { validateSupplementTimeline } from './utils/supplementTimeline';
import { validateSupplementCompanyNames } from './utils/supplementCompany';

export type GenerationStage = 'structure' | 'role-bullets' | 'layout-refinement';

export type GenerationOptions = {
  stage: GenerationStage;
  experienceIndex?: number;
  maxTokens: number;
  timeoutMs: number;
};

export type PuppetTextGenerator = (
  prompt: string,
  validator: (text: string) => boolean | Promise<boolean>,
  options: GenerationOptions,
) => Promise<string>;

function parseAIJson(text: string): any {
  return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
}

function isIllegal(value: any): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0 || value.some(isIllegal);
  if (typeof value === 'object') return Object.values(value).some(isIllegal);

  const text = String(value).trim().toLowerCase();
  if (['', 'undefined', 'null', 'nan', '暂无', 'none'].includes(text)) return true;
  if (text.includes('\uFFFD') || text.includes('_placeholder_') || text.includes('placeholder_bold')) return true;
  if (/\[(.*?名字|.*?公司|.*?时间|.*?名称|.*?经验|.*?Name|.*?Company|.*?Time|.*?Project)\]/i.test(text)) return true;
  return ['as an ai', 'large language model', 'sorry', 'cannot fulfill', '对不起', '抱歉', '无法生成']
    .some((marker) => text.includes(marker));
}

function assertNoIllegalOutput(text: string): void {
  const lowerText = text.toLowerCase();
  const illegalPatterns = [
    '_placeholder_',
    'placeholder_bold',
    '_PLACEHOLDER_BOLD_',
    'as an ai language model',
    'cannot fulfill',
    'my programming',
    '对不起，我无法',
    '抱歉，我不能',
    '---',
    '...',
  ];
  if (illegalPatterns.some((pattern) => text.includes(pattern) || lowerText.includes(pattern))) {
    throw new Error('检测到 AI 输出包含非法占位符或拒绝性话术');
  }
  if (text.includes('\uFFFD')) throw new Error('检测到 AI 输出包含 Unicode 替换字符');
}

function plainText(value: string) {
  return value.replace(/<\/?(?:b|u)>/gi, '').replace(/\s+/g, ' ').trim();
}

function responsibilityLength(value: string, isEnglish: boolean) {
  const content = plainText(value);
  if (isEnglish) return content.length;
  return [...content].reduce((total, character) => total + (/[^\x00-\xff]/.test(character) ? 1 : 0.5), 0);
}

function validateResponsibilityLength(value: string, isEnglish: boolean, maxCharPerLine: number) {
  const length = responsibilityLength(value, isEnglish);
  // Layout prompts target a fuller two-line bullet, while this gate only rejects
  // content that is clearly too short to render or long enough to create a third line.
  const minimum = maxCharPerLine * 0.7;
  const maximum = maxCharPerLine * 2.25;
  return { valid: length >= minimum && length <= maximum, length, minimum, maximum };
}

export function normalizeChineseResponsibilitySpacing(value: string): string {
  return value
    .replace(/\s+(?=\d)/g, '')
    .replace(/(\d+(?:\.\d+)?(?:[%％+]|\/\d+(?:\.\d+)?)?)\s+(?=[\u3400-\u9fff])/g, '$1');
}

export function validateChineseResponsibilityMetrics(responsibilities: string[]): void {
  if (responsibilities.every((item) => /\d/.test(plainText(item)))) {
    throw new Error('不得为了量化而让每条职责都包含数字');
  }
  const subjectiveScore = /(?:满意度|主观评分|评价得分|评分)[^。；;]{0,16}\d+(?:\.\d+)?(?:\s*[%％]|\s*\/\s*(?:5|10|100))?/;
  if (responsibilities.some((item) => subjectiveScore.test(plainText(item)))) {
    throw new Error('职责包含无法由外部读者判断价值的主观评分指标');
  }
}

export function isIsolatedChineseMetricPhrase(value: string): boolean {
  return /^(?:约|超过|近|累计)?\d+(?:\.\d+)?(?:\+|[%％]|\/\d+(?:\.\d+)?)?(?:个?月|年|天|余?人|份|场|大?类|项|次|家|所|个)?(?:内|以上|以内)?$/.test(value.trim());
}

function tagSegments(value: string, tag: 'b' | 'u'): string[] {
  const expression = new RegExp(`<${tag}>(.*?)<\\/${tag}>`, 'gi');
  return [...String(value).matchAll(expression)].map((match) => match[1]);
}

function assertValidTagPairs(value: string, tag: 'b' | 'u'): void {
  const openings = String(value).match(new RegExp(`<${tag}>`, 'gi'))?.length || 0;
  const closings = String(value).match(new RegExp(`<\\/${tag}>`, 'gi'))?.length || 0;
  if (openings !== closings || openings !== tagSegments(value, tag).length) {
    throw new Error(`<${tag}> 标记必须成对且不可嵌套`);
  }
}

function validateResponsibilityHighlights(
  responsibilities: string[],
  isEnglish: boolean,
  maxCharPerLine: number,
  experienceIndex: number,
): void {
  if (responsibilities.some((item) => /<\/?b>/i.test(item))) {
    throw new Error(`工作职责禁止使用加深标记 index=${experienceIndex}`);
  }

  const highlighted = responsibilities.filter((item) => /<\/?u>/i.test(item));
  if (highlighted.length < 1 || highlighted.length > 2) {
    throw new Error(`每段工作经历必须仅有 1-2 条职责包含下划线 index=${experienceIndex}`);
  }

  highlighted.forEach((item) => {
    assertValidTagPairs(item, 'u');
    const segments = tagSegments(item, 'u');
    if (segments.length !== 1) throw new Error(`单条职责只允许一处下划线 index=${experienceIndex}`);
    const segmentText = plainText(segments[0]);
    if (!isEnglish && isIsolatedChineseMetricPhrase(segmentText)) {
      throw new Error(`下划线必须包含指标及其动作或结果，不能只标记数字或单位 index=${experienceIndex}`);
    }
    const segmentLength = responsibilityLength(segments[0], isEnglish);
    const fullLength = responsibilityLength(item, isEnglish);
    if (segmentLength <= 0 || segmentLength >= fullLength || segmentLength > maxCharPerLine * 0.6) {
      throw new Error(`下划线必须只标记简短的重要数据或关键短语 index=${experienceIndex}`);
    }
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

function validateRoleBulletResponse(
  text: string,
  locked: BulletPhaseWorkExperience,
  isEnglish: boolean,
  maxCharPerLine: number,
  experienceIndex: number,
) {
  assertNoIllegalOutput(text);
  try {
    const data = parseAIJson(text);
    if (!Array.isArray(data.workExperience) || data.workExperience.length !== 1) {
      throw new Error('单段职责响应必须只包含 1 段经历');
    }
    const experience = data.workExperience[0];
    if (experience.company !== locked.company) throw new Error(`职责阶段非法修改公司名 index=${experienceIndex}`);
    if (experience.startDate !== locked.startDate || experience.endDate !== locked.endDate) {
      throw new Error(`职责阶段非法修改工作时间 index=${experienceIndex}`);
    }
    if (!Array.isArray(experience.responsibilities) || experience.responsibilities.length !== 8) {
      throw new Error(`职责数量不足 8 条 index=${experienceIndex}`);
    }
    if (experience.responsibilities.some(isIllegal)) throw new Error(`职责内容存在非法值 index=${experienceIndex}`);
    experience.responsibilities.forEach((item: string, itemIndex: number) => {
      const length = validateResponsibilityLength(item, isEnglish, maxCharPerLine);
      if (!length.valid) {
        throw new Error(
          `职责长度不适合双行排版 index=${experienceIndex}, item=${itemIndex}, length=${Math.round(length.length)}, expected=${Math.round(length.minimum)}-${Math.round(length.maximum)}`,
        );
      }
    });
    if (!isEnglish) validateChineseResponsibilityMetrics(experience.responsibilities);
    validateResponsibilityHighlights(experience.responsibilities, isEnglish, maxCharPerLine, experienceIndex);
    return true;
  } catch (error: any) {
    throw new Error(`职责阶段校验未通过: ${error.message}`);
  }
}

/** Puppet Resume's two-phase content generation pipeline. */
export class PuppetResumePipeline {
  constructor(private readonly generateText: PuppetTextGenerator) {}

  async enhance(payload: GenerateFromFrontendRequest): Promise<ResumeData> {
    const baseData = mapFrontendRequestToResumeData(payload);
    const { resume_profile: profile, job_data: job, language } = payload;
    const isEnglish = language === 'english';
    const targetTitle = isEnglish
      ? (job.title_english || job.title_chinese)
      : job.title_chinese;
    const calcResult = ExperienceCalculator.calculate(profile, job);
    const maxCharPerLine = isEnglish ? 90 : 42;
    const {
      actualYears,
      actualExperienceText,
      requiredExp,
      needsSupplement,
      supplementYears,
      finalTotalYears,
      supplementSegments,
      allWorkExperiences,
      earliestWorkDate,
      seniorityThresholdDate,
    } = calcResult;
    const promptContext = {
      targetTitle,
      job,
      requiredExp,
      profile,
      earliestWorkDate,
      actualExperienceText,
      totalMonths: calcResult.totalMonths,
      needsSupplement,
      actualYears,
      supplementYears,
      finalTotalYears,
      supplementSegments,
      allWorkExperiences,
      seniorityThresholdDate,
      maxCharPerLine,
    };

    const nonJobPrompt = isEnglish
      ? generateEnglishNonJobPrompt(promptContext)
      : generateChineseNonJobPrompt(promptContext);
    const nonJobResponse = await this.generateText(nonJobPrompt, (text) => {
      assertNoIllegalOutput(text);
      try {
        const data = parseAIJson(text);
        for (const field of ['position', 'yearsOfExperience', 'personalIntroduction', 'professionalSkills']) {
          if (isIllegal(data[field])) throw new Error(`关键字段 "${field}" 内容非法、缺失或包含无效嵌套内容`);
        }
        assertValidTagPairs(data.personalIntroduction, 'b');
        const introductionBoldCount = tagSegments(data.personalIntroduction, 'b').length;
        if (introductionBoldCount < 1 || introductionBoldCount > 2) {
          throw new Error('个人介绍必须仅有 1-2 处加深内容');
        }
        if (/<\/?u>/i.test(data.personalIntroduction)) throw new Error('个人介绍禁止使用下划线');
        const nonIntroductionText = JSON.stringify({
          position: data.position,
          professionalSkills: data.professionalSkills,
          workExperience: data.workExperience,
        });
        if (/<\/?(?:b|u)>/i.test(nonIntroductionText)) {
          throw new Error('非职责阶段仅允许在个人介绍中使用加深标记');
        }
        if (!Array.isArray(data.workExperience) || data.workExperience.length === 0) {
          throw new Error('workExperience 不能为空');
        }
        if (data.workExperience.length < 2) throw new Error('workExperience 至少需要 2 段');
        if (data.workExperience.some((experience: any) => isIllegal(experience.company))) {
          throw new Error('workExperience 骨架字段不完整');
        }
        if (!needsSupplement && data.workExperience.length !== (profile.workExperiences || []).length) {
          throw new Error(`无需补充经历，但生成岗位数不一致（existing=${(profile.workExperiences || []).length}, generated=${data.workExperience.length}）`);
        }

        const missingLocked = findMissingLockedExperiences(profile.workExperiences || [], data.workExperience);
        if (missingLocked.length) {
          throw new Error(`已有公司或工作时间被删除/修改: ${missingLocked.map((experience) => `${experience.company} (${experience.startDate}-${experience.endDate})`).join(', ')}`);
        }
        const timelineErrors = validateSupplementTimeline(
          profile.workExperiences || [],
          data.workExperience,
          supplementSegments,
        );
        if (timelineErrors.length) throw new Error(`补足经历时间线无效: ${timelineErrors.join('; ')}`);
        const companyErrors = validateSupplementCompanyNames(
          profile.workExperiences || [],
          data.workExperience,
          supplementSegments,
          { educations: profile.educations || [], location: profile.location },
        );
        if (companyErrors.length) throw new Error(`补足经历公司名无效: ${companyErrors.join('; ')}`);

        if (!isEnglish) {
          if (data.professionalSkills.length !== 4) throw new Error('技能分类数量必须为 4 组');
          if (data.professionalSkills.some((category: any) => !category.items || category.items.length !== 4)) {
            throw new Error('每组技能点数量必须为 4 条');
          }
        }
        return true;
      } catch (error: any) {
        throw new Error(`非职责阶段校验未通过: ${error.message}`);
      }
    }, {
      stage: 'structure',
      maxTokens: isEnglish ? 4_000 : 3_000,
      timeoutMs: 22_000,
    });

    const nonJobData = parseAIJson(nonJobResponse);
    const workSkeleton: BulletPhaseWorkExperience[] = (nonJobData.workExperience || []).map((experience: any) => ({
      company: experience.company,
      position: experience.position,
      startDate: experience.startDate,
      endDate: experience.endDate,
    }));
    const generatedRoles = await mapWithConcurrency(workSkeleton, 3, async (experience, index) => {
      const rolePrompt = isEnglish
        ? generateEnglishJobBulletPrompt(promptContext, [experience])
        : generateChineseJobBulletPrompt(promptContext, [experience]);
      const response = await this.generateText(
        rolePrompt,
        (text) => validateRoleBulletResponse(text, experience, isEnglish, maxCharPerLine, index),
        {
          stage: 'role-bullets',
          experienceIndex: index,
          maxTokens: isEnglish ? 2_200 : 1_600,
          timeoutMs: 32_000,
        },
      );
      return parseAIJson(response).workExperience[0];
    });
    const workExperience = workSkeleton.map((experience, index) => ({
      ...experience,
      responsibilities: generatedRoles[index].responsibilities.map((item: string) =>
        isEnglish ? item : normalizeChineseResponsibilitySpacing(item)),
    }));
    return {
      ...baseData,
      position: nonJobData.position || targetTitle,
      yearsOfExperience: Math.floor(nonJobData.yearsOfExperience || baseData.yearsOfExperience || 0),
      personalIntroduction: nonJobData.personalIntroduction,
      professionalSkills: nonJobData.professionalSkills,
      workExperience,
    };
  }
}
