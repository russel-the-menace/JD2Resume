interface CompanyExperience {
  company: string;
  startDate: string;
  endDate: string;
}

interface EducationTiming {
  school?: string;
  startDate?: string;
  endDate?: string;
}

interface SupplementCompanyContext {
  educations?: EducationTiming[];
  location?: string;
}

export interface SupplementCompanyPlanItem {
  sequence: number;
  startDate: string;
  endDate: string;
  format: 'studio' | 'inc';
  stage: 'in-school' | 'senior-or-graduated' | 'later-supplement';
  preferredLocation: string;
}

const famousEnglishNames = [
  'adobe', 'airbnb', 'alphabet', 'amazon', 'apple', 'atlassian', 'bytedance', 'canva',
  'cisco', 'coinbase', 'cursor', 'datadog', 'dell', 'discord', 'dropbox', 'facebook',
  'figma', 'github', 'gitlab', 'google', 'ibm', 'intel', 'linkedin', 'mastercard',
  'meta', 'microsoft', 'netflix', 'nvidia', 'openai', 'oracle', 'paypal', 'reddit',
  'salesforce', 'samsung', 'sap', 'shein', 'shopify', 'slack', 'snap', 'spotify',
  'stripe', 'tesla', 'uber', 'vercel', 'visa', 'walmart', 'zoom',
];
const famousChineseNames = [
  '阿里巴巴', '蚂蚁集团', '百度', '哔哩哔哩', '比亚迪', '字节跳动', '滴滴',
  '华为', '京东', '快手', '理想汽车', '美团', '蔚来', '拼多多', '腾讯',
  '网易', '小红书', '小米',
];
const preferredCareerCities = ['北京', '上海', '广州', '深圳', '杭州'];
const knownCityNames = [
  ...preferredCareerCities, '成都', '武汉', '南京', '西安', '重庆', '天津', '苏州',
  '长沙', '郑州', '厦门', '青岛', '济南', '合肥', '福州', '南昌', '昆明', '沈阳',
  '大连', '长春', '哈尔滨', '石家庄', '太原', '贵阳', '南宁', '海口', '兰州',
  '乌鲁木齐', '呼和浩特', '银川', '西宁', '拉萨', '香港', '澳门',
];
const schoolCityAliases: Array<[RegExp, string]> = [
  [/清华|北京大学|北大|人民大学|北京理工|北京航空航天/u, '北京'],
  [/复旦|同济|上海交通|华东师范/u, '上海'],
  [/浙江大学|浙大/u, '杭州'],
  [/中山大学|华南理工/u, '广州'],
  [/深圳大学|南方科技/u, '深圳'],
  [/南京大学|东南大学/u, '南京'],
  [/武汉大学|华中科技/u, '武汉'],
  [/四川大学|电子科技/u, '成都'],
  [/西安交通|西北工业/u, '西安'],
  [/哈尔滨工业|哈工大/u, '哈尔滨'],
];

function experienceKey(experience: CompanyExperience): string {
  return [experience.company.trim(), experience.startDate.trim(), experience.endDate.trim()].join('\u0000');
}

function supplementalExperiences(
  source: CompanyExperience[],
  generated: CompanyExperience[],
): CompanyExperience[] {
  const sourceCounts = new Map<string, number>();
  source.forEach((experience) => {
    const key = experienceKey(experience);
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  });
  return generated.filter((experience) => {
    const key = experienceKey(experience);
    const count = sourceCounts.get(key) || 0;
    if (!count) return true;
    sourceCounts.set(key, count - 1);
    return false;
  });
}

function monthIndex(value = ''): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value.trim());
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function primaryEducation(context: SupplementCompanyContext): EducationTiming | undefined {
  const educations = context.educations || [];
  return [...educations]
    .filter((education) => monthIndex(education.startDate) !== null)
    .sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)))[0]
    || educations[0];
}

function inferSchoolCity(context: SupplementCompanyContext): string {
  const education = primaryEducation(context);
  const school = String(education?.school || '');
  const directCity = knownCityNames.find((city) => school.includes(city));
  if (directCity) return directCity;
  const alias = schoolCityAliases.find(([pattern]) => pattern.test(school));
  if (alias) return alias[1];
  return knownCityNames.find((city) => String(context.location || '').includes(city)) || '';
}

export function buildSupplementCompanyPlan(
  segments: Array<{ startDate: string; endDate: string }>,
  context: SupplementCompanyContext = {},
): SupplementCompanyPlanItem[] {
  const education = primaryEducation(context);
  const educationStart = monthIndex(education?.startDate);
  const seniorYearStart = educationStart === null ? null : educationStart + 36;
  const graduation = monthIndex(education?.endDate);
  const advancedThreshold = seniorYearStart === null
    ? graduation
    : graduation === null ? seniorYearStart : Math.min(seniorYearStart, graduation);
  const schoolCity = inferSchoolCity(context);

  return [...segments]
    .sort((left, right) => left.startDate.localeCompare(right.startDate))
    .map((segment, index) => {
      if (index > 0) {
        return {
          sequence: index + 1,
          ...segment,
          format: 'inc' as const,
          stage: 'later-supplement' as const,
          preferredLocation: '',
        };
      }
      const segmentStart = monthIndex(segment.startDate);
      const inSchool = segmentStart !== null && advancedThreshold !== null && segmentStart < advancedThreshold;
      return {
        sequence: 1,
        ...segment,
        format: 'studio' as const,
        stage: inSchool ? 'in-school' as const : 'senior-or-graduated' as const,
        preferredLocation: inSchool
          ? schoolCity || '学校所在地'
          : preferredCareerCities.join('/'),
      };
    });
}

function isFamousCompanyName(company: string): boolean {
  const lower = company.toLowerCase();
  const englishMatch = famousEnglishNames.some((name) =>
    new RegExp(`(?:^|[^a-z])${name}(?:[^a-z]|$)`, 'i').test(lower));
  return englishMatch || famousChineseNames.some((name) => company.includes(name));
}

/** Only supplemental companies use synthetic naming rules; user companies stay locked. */
export function validateSupplementCompanyNames(
  source: CompanyExperience[],
  generated: CompanyExperience[],
  segments: Array<{ startDate: string; endDate: string }> = [],
  context: SupplementCompanyContext = {},
): string[] {
  const errors: string[] = [];
  const sourceNames = new Set(source.map((experience) => experience.company.trim().toLowerCase()));
  const usedNames = new Set<string>();

  const supplemental = supplementalExperiences(source, generated);
  const plan = buildSupplementCompanyPlan(
    segments.length ? segments : supplemental.map(({ startDate, endDate }) => ({ startDate, endDate })),
    context,
  );
  const planByPeriod = new Map(plan.map((item) => [`${item.startDate}\u0000${item.endDate}`, item]));

  supplemental.forEach((experience, index) => {
    const company = experience.company.trim();
    const normalized = company.toLowerCase();
    const englishInc = /^[A-Za-z][A-Za-z0-9&'. -]{1,60}\sInc\.?$/.test(company);
    const cityStudio = /^[\u3400-\u9FFF]{2,8}[\u3400-\u9FFFA-Za-z0-9·]{2,18}工作室$/u.test(company);
    const planned = planByPeriod.get(`${experience.startDate}\u0000${experience.endDate}`);

    if (!englishInc && !cityStudio) {
      errors.push(`补足公司 ${index + 1} 必须使用“English Name Inc”或“地名+名称+工作室”格式`);
    }
    if (/有限(?:责任)?公司|股份有限公司|集团/u.test(company)) {
      errors.push(`补足公司 ${index + 1} 禁止使用有限公司、股份公司或集团后缀`);
    }
    if (isFamousCompanyName(company)) errors.push(`补足公司 ${index + 1} 不得与上市或知名公司重名`);
    if (sourceNames.has(normalized)) errors.push(`补足公司 ${index + 1} 不得复用候选人的真实公司名`);
    if (usedNames.has(normalized)) errors.push(`不同补足经历不得重复使用公司名: ${company}`);
    if (planned?.format === 'studio' && !cityStudio) {
      errors.push('按时间从早到晚的第 1 段补足经历必须使用工作室名称');
    }
    if (planned?.format === 'inc' && !englishInc) {
      errors.push(`按时间从早到晚的第 ${planned.sequence} 段补足经历必须使用英文 Inc 名称`);
    }
    if (planned?.stage === 'senior-or-graduated' && cityStudio &&
      !preferredCareerCities.some((city) => company.startsWith(city))) {
      errors.push('大四或毕业后的首段补足经历应优先使用北京/上海/广州/深圳/杭州工作室');
    }
    if (planned?.stage === 'in-school' && planned.preferredLocation !== '学校所在地' && cityStudio &&
      !company.startsWith(planned.preferredLocation)) {
      errors.push(`在校阶段首段补足经历应优先使用学校所在地“${planned.preferredLocation}”的工作室`);
    }
    usedNames.add(normalized);
  });

  return [...new Set(errors)];
}
