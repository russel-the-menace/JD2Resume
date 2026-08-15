export interface ExtractedTextJob { title: string; experience: string; description: string; }

const GENERIC_JOB_HEADINGS = new Set([
  '岗位职责', '工作职责', '职位职责', '职位描述', '岗位描述', '工作内容',
  '任职要求', '职位要求', '岗位要求', '招聘要求', '职位信息', '招聘信息',
  'job description', 'responsibilities', 'requirements', 'qualifications',
  'about the role', 'role overview',
]);

export function isGenericJobTitle(title: string): boolean {
  const normalized = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[：:\s]+$/g, '');
  return !normalized || GENERIC_JOB_HEADINGS.has(normalized);
}

export function extractTextJob(description: string, language: 'chinese' | 'english'): ExtractedTextJob {
  const normalized = description.trim();
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const labeledTitle = lines.map((line) => /^(?:岗位名称|职位名称|招聘岗位|job title|position)\s*[:：]\s*(.+)$/i.exec(line)?.[1]).find(Boolean);
  const heading = lines.find((line) => line.length <= 80 && !/[。.!?；;]/.test(line));
  const title = (labeledTitle || heading || (language === 'chinese' ? '目标职位' : 'Target Role')).trim();
  const experience = normalized.match(/(?:\d+\s*[-–~至]\s*\d+|\d+\s*\+|至少\s*\d+)\s*(?:年|years?)/i)?.[0]
    || (language === 'chinese' ? '经验不限' : 'Experience not specified');
  return { title, experience, description: normalized };
}
