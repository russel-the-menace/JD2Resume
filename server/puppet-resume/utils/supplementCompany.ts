interface CompanyExperience {
  company: string;
  startDate: string;
  endDate: string;
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
): string[] {
  const errors: string[] = [];
  const sourceNames = new Set(source.map((experience) => experience.company.trim().toLowerCase()));
  const usedNames = new Set<string>();

  supplementalExperiences(source, generated).forEach((experience, index) => {
    const company = experience.company.trim();
    const normalized = company.toLowerCase();
    const englishInc = /^[A-Za-z][A-Za-z0-9&'. -]{1,60}\sInc\.?$/.test(company);
    const cityStudio = /^(上海|深圳|广州)[\u3400-\u9FFFA-Za-z0-9·]{2,18}工作室$/u.test(company);

    if (!englishInc && !cityStudio) {
      errors.push(`补足公司 ${index + 1} 必须使用“English Name Inc”或“上海/深圳/广州+名称+工作室”格式`);
    }
    if (/有限(?:责任)?公司|股份有限公司|集团/u.test(company)) {
      errors.push(`补足公司 ${index + 1} 禁止使用有限公司、股份公司或集团后缀`);
    }
    if (isFamousCompanyName(company)) errors.push(`补足公司 ${index + 1} 不得与上市或知名公司重名`);
    if (sourceNames.has(normalized)) errors.push(`补足公司 ${index + 1} 不得复用候选人的真实公司名`);
    if (usedNames.has(normalized)) errors.push(`不同补足经历不得重复使用公司名: ${company}`);
    usedNames.add(normalized);
  });

  return [...new Set(errors)];
}
