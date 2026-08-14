import {
  documentFromText,
  extractSinglePdfPage,
  extractPdfDocument,
  indexedDocumentText,
  replacePageWithOcr,
  type CanonicalDocument,
  type CanonicalLine,
} from './document';

export type ProfileImportTask = 'ocr' | 'basic' | 'education' | 'work' | 'skills' | 'translation';

export type ProfileImportModels = {
  lite: string;
  mini: string;
  standard: string;
  vision: string;
  escalation: string;
};

export type ProfileTaskRequest = {
  task: ProfileImportTask;
  model: string;
  prompt: string;
  maxTokens: number;
  attachment?: { sourceType: 'image' | 'pdf'; name: string; mimeType: string; data: string };
};

export type ProfileTaskCaller = (request: ProfileTaskRequest) => Promise<Record<string, any>>;

type ImportSource = {
  sourceType: 'text' | 'image' | 'pdf';
  text: string;
  attachment: null | { name: string; mimeType: string; data: string };
};

type ModuleResult = { value: Record<string, any>; model: string; attempts: number };

const basicFields = [
  'fullName', 'gender', 'birthday', 'phone', 'phoneEn', 'email', 'location',
  'wechat', 'whatsapp', 'telegram', 'linkedin', 'website',
];

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function uniqueModels(models: string[]) {
  return [...new Set(models.map(text).filter(Boolean))];
}

async function runModule(
  task: ProfileImportTask,
  models: string[],
  prompt: string,
  maxTokens: number,
  caller: ProfileTaskCaller,
  validate: (value: Record<string, any>) => boolean,
  attachment?: ProfileTaskRequest['attachment'],
): Promise<ModuleResult> {
  let lastError: unknown = null;
  const candidates = uniqueModels(models);
  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index];
    try {
      const value = await caller({ task, model, prompt, maxTokens, attachment });
      if (!validate(value)) throw new Error('MODULE_SCHEMA_INVALID');
      return { value, model, attempts: index + 1 };
    } catch (error) {
      lastError = error;
      console.warn('[Profile Import] Module attempt failed', {
        task,
        model,
        attempt: index + 1,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${task.toUpperCase()}_MODULE_FAILED`);
}

function detectLanguage(document: CanonicalDocument): 'chinese' | 'english' {
  const sample = document.lines.map((line) => line.text).join('').slice(0, 12_000);
  const chineseCount = (sample.match(/[\u3400-\u9FFF]/gu) || []).length;
  const latinCount = (sample.match(/[A-Za-z]/g) || []).length;
  return chineseCount >= Math.max(8, latinCount * 0.15) ? 'chinese' : 'english';
}

function referencedLines(document: CanonicalDocument, ids: unknown): CanonicalLine[] {
  const requested = new Set(stringArray(ids));
  return document.lines.filter((line) => requested.has(line.id));
}

function sourceText(document: CanonicalDocument, ids: unknown) {
  return referencedLines(document, ids).map((line) => line.text).join('\n');
}

function normalizedComparable(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s.,，。:：;；()（）/_-]/g, '');
}

function supportedBySource(document: CanonicalDocument, value: string, ids: unknown) {
  if (!value) return true;
  const cited = sourceText(document, ids);
  if (!cited) return false;
  const normalizedValue = normalizedComparable(value);
  const normalizedSource = normalizedComparable(cited);
  if (!normalizedValue) return true;
  if (normalizedSource.includes(normalizedValue)) return true;
  return /^\d{4}[-./年]\d{1,2}/.test(value) && normalizedSource.includes(value.slice(0, 4));
}

function cleanBasic(document: CanonicalDocument, value: Record<string, any>) {
  const source = isRecord(value.basic) ? value.basic : {};
  const sources = isRecord(value.sources) ? value.sources : {};
  return Object.fromEntries(basicFields.map((field) => {
    const fieldValue = text(source[field]);
    return [field, supportedBySource(document, fieldValue, sources[field]) ? fieldValue : ''];
  }));
}

function cleanEducation(document: CanonicalDocument, value: Record<string, any>) {
  if (!Array.isArray(value.educations)) return [];
  return value.educations.flatMap((entry: any) => {
    if (!isRecord(entry)) return [];
    const lines = stringArray(entry.sourceLines);
    const school = text(entry.school);
    if (!school || !supportedBySource(document, school, lines)) return [];
    return [{
      school,
      degree: text(entry.degree),
      studyType: text(entry.studyType),
      major: text(entry.major),
      startDate: text(entry.startDate),
      endDate: text(entry.endDate),
      description: sourceText(document, entry.descriptionSourceLines),
    }];
  });
}

function cleanWork(document: CanonicalDocument, value: Record<string, any>) {
  if (!Array.isArray(value.workExperiences)) return [];
  return value.workExperiences.flatMap((entry: any) => {
    if (!isRecord(entry)) return [];
    const lines = stringArray(entry.sourceLines);
    const company = text(entry.company);
    if (!company || !supportedBySource(document, company, lines)) return [];
    return [{
      company,
      jobTitle: text(entry.jobTitle),
      businessDirection: text(entry.businessDirection),
      workContent: sourceText(document, entry.workContentSourceLines),
      startDate: text(entry.startDate),
      endDate: text(entry.endDate),
    }];
  });
}

function cleanSkills(document: CanonicalDocument, value: Record<string, any>) {
  const cleanList = (items: unknown) => Array.isArray(items)
    ? items.flatMap((entry: any) => {
      if (typeof entry === 'string') return [];
      const itemValue = text(entry?.value);
      return itemValue && supportedBySource(document, itemValue, entry?.sourceLines) ? [itemValue] : [];
    })
    : [];
  return { skills: cleanList(value.skills), certificates: cleanList(value.certificates) };
}

function basicPrompt(language: string, indexedText: string) {
  return `Extract only explicit basic personal details from this ${language} resume. Return JSON only. Never infer gender, location, birthday, or contact details. Every non-empty field must cite one or more source line IDs. Do not return a personal introduction or summary.\n{\n  "basic": {\n    "fullName": "", "gender": "", "birthday": "", "phone": "", "phoneEn": "",\n    "email": "", "location": "", "wechat": "", "whatsapp": "", "telegram": "",\n    "linkedin": "", "website": ""\n  },\n  "sources": { "fieldName": ["p1-l1"] }\n}\n\nResume lines:\n${indexedText}`;
}

function educationPrompt(language: string, indexedText: string) {
  return `Extract every explicit education entry from this ${language} resume. Return JSON only in the source language. Preserve dates exactly and do not invent missing values. sourceLines must cite the school, degree, major, and dates. descriptionSourceLines must contain only education details such as GPA, coursework, research, or honors.\n{\n  "educations": [{\n    "school": "", "degree": "", "studyType": "", "major": "",\n    "startDate": "", "endDate": "",\n    "sourceLines": ["p1-l1"], "descriptionSourceLines": ["p1-l2"]\n  }]\n}\n\nResume lines:\n${indexedText}`;
}

function workPrompt(language: string, indexedText: string) {
  return `Extract every explicit work or internship entry from this ${language} resume. Return JSON only in the source language. Preserve company names, job titles, and dates exactly. Do not rewrite responsibilities and do not copy them into the JSON. Instead cite their original line IDs in workContentSourceLines. sourceLines must cite the company, role, and dates. businessDirection must be empty unless explicitly stated.\n{\n  "workExperiences": [{\n    "company": "", "jobTitle": "", "businessDirection": "",\n    "startDate": "", "endDate": "",\n    "sourceLines": ["p1-l1"], "workContentSourceLines": ["p1-l2", "p1-l3"]\n  }]\n}\n\nResume lines:\n${indexedText}`;
}

function skillsPrompt(language: string, indexedText: string) {
  return `Extract only explicitly listed professional skills and certificates from this ${language} resume. Return JSON only in the source language. Do not infer skills from work responsibilities. Every item must cite its source line IDs.\n{\n  "skills": [{ "value": "", "sourceLines": ["p1-l1"] }],\n  "certificates": [{ "value": "", "sourceLines": ["p1-l2"] }]\n}\n\nResume lines:\n${indexedText}`;
}

function ocrPrompt(pageNumber: number) {
  return `Perform OCR on resume page ${pageNumber}. Return JSON only as {"lines":["first visual line","second visual line"]}. Preserve the visual reading order, exact names, dates, email addresses, phone numbers, schools, employers, and punctuation. Do not summarize, translate, infer, or restructure the content.`;
}

async function canonicalDocumentFromSource(
  source: ImportSource,
  models: ProfileImportModels,
  caller: ProfileTaskCaller,
) {
  if (source.sourceType === 'text') return documentFromText(source.text);
  if (source.sourceType === 'image' && source.attachment) {
    const ocr = await runModule(
      'ocr', [models.vision, models.escalation], ocrPrompt(1), 6_000, caller,
      (value) => Array.isArray(value.lines) && value.lines.some((line: unknown) => text(line)),
      { sourceType: 'image', name: source.attachment.name, mimeType: source.attachment.mimeType, data: source.attachment.data },
    );
    return documentFromText(stringArray(ocr.value.lines).join('\n'));
  }
  if (source.sourceType !== 'pdf' || !source.attachment) throw new Error('PROFILE_SOURCE_INVALID');
  let document = await extractPdfDocument(source.attachment.data);
  for (const page of document.pages.filter((candidate) => candidate.needsOcr)) {
    const pagePdf = await extractSinglePdfPage(source.attachment.data, page.page);
    const ocr = await runModule(
      'ocr', [models.vision, models.escalation], ocrPrompt(page.page), 6_000, caller,
      (value) => Array.isArray(value.lines) && value.lines.some((line: unknown) => text(line)),
      { sourceType: 'pdf', name: `${source.attachment.name}-page-${page.page}.pdf`, mimeType: 'application/pdf', data: pagePdf },
    );
    document = replacePageWithOcr(document, page.page, stringArray(ocr.value.lines));
  }
  return document;
}

export async function importProfileFacts(
  source: ImportSource,
  models: ProfileImportModels,
  caller: ProfileTaskCaller,
) {
  const document = await canonicalDocumentFromSource(source, models, caller);
  if (!document.lines.length) throw new Error('PROFILE_TEXT_EMPTY');
  const language = detectLanguage(document);
  const indexedText = indexedDocumentText(document);
  const basic = await runModule(
    'basic', [models.lite, models.mini, models.escalation], basicPrompt(language, indexedText), 1_200, caller,
    (value) => isRecord(value.basic) && isRecord(value.sources),
  );
  const moduleRequests = {
    education: runModule(
      'education', [models.mini, models.standard, models.escalation], educationPrompt(language, indexedText), 2_500, caller,
      (value) => Array.isArray(value.educations),
    ),
    work: runModule(
      'work', [models.standard, models.vision, models.escalation], workPrompt(language, indexedText), 4_500, caller,
      (value) => Array.isArray(value.workExperiences),
    ),
    skills: runModule(
      'skills', [models.lite, models.mini, models.escalation], skillsPrompt(language, indexedText), 1_500, caller,
      (value) => Array.isArray(value.skills) && Array.isArray(value.certificates),
    ),
  };
  const entries = await Promise.all(Object.entries(moduleRequests).map(async ([name, request]) => {
    try {
      return [name, await request] as const;
    } catch (error) {
      return [name, { error: error instanceof Error ? error.message : 'MODULE_FAILED' }] as const;
    }
  }));
  const modules = Object.fromEntries(entries) as Record<string, ModuleResult | { error: string }>;
  const educationValue = 'value' in modules.education ? cleanEducation(document, modules.education.value) : [];
  const workValue = 'value' in modules.work ? cleanWork(document, modules.work.value) : [];
  const skillValue = 'value' in modules.skills ? cleanSkills(document, modules.skills.value) : { skills: [], certificates: [] };
  const profile: Record<string, any> = {
    ...cleanBasic(document, basic.value),
    educations: educationValue,
    workExperiences: workValue,
    ...skillValue,
  };
  return {
    language,
    profile,
    parseReport: {
      pages: document.pages.length,
      lines: document.lines.length,
      modules: {
        basic: { model: basic.model, attempts: basic.attempts, status: 'completed' },
        ...Object.fromEntries(Object.entries(modules).map(([name, result]) => [name,
          'value' in result
            ? { model: result.model, attempts: result.attempts, status: 'completed' }
            : { status: 'failed', error: result.error },
        ])),
      },
    },
  };
}

export async function translateProfileFacts(
  sourceLanguage: 'chinese' | 'english',
  profile: Record<string, any>,
  models: ProfileImportModels,
  caller: ProfileTaskCaller,
) {
  const targetLanguage = sourceLanguage === 'chinese' ? 'english' : 'chinese';
  const prompt = `Translate this complete personal profile from ${sourceLanguage} to ${targetLanguage}. Return JSON only. Preserve every education, work experience, skill, and certificate in its original order. Preserve exact dates, emails, phones, websites, account handles, and factual meaning. Translate human-readable fields only. Do not invent missing fields and do not add a personal introduction or summary. When translating a Chinese name into English, use Western resume order: given name followed by family name. For example, 田俊铃 must be Junling Tian, not Tian Junling.\n{\n  "language": "${targetLanguage}",\n  "profile": {\n    "fullName": "", "gender": "", "birthday": "", "phone": "", "phoneEn": "",\n    "email": "", "location": "", "wechat": "", "whatsapp": "", "telegram": "",\n    "linkedin": "", "website": "",\n    "educations": [{ "school": "", "degree": "", "studyType": "", "major": "", "startDate": "", "endDate": "", "description": "" }],\n    "workExperiences": [{ "company": "", "jobTitle": "", "businessDirection": "", "workContent": "", "startDate": "", "endDate": "" }],\n    "skills": [""], "certificates": [""]\n  }\n}\n\nSource profile:\n${JSON.stringify(profile)}`;
  const translated = await runModule(
    'translation', [models.mini, models.standard, models.escalation], prompt, 6_000, caller,
    (value) => {
      if (value.language !== targetLanguage || !isRecord(value.profile)) return false;
      return ['educations', 'workExperiences', 'skills', 'certificates'].every((field) =>
        Array.isArray(value.profile[field]) && value.profile[field].length === (Array.isArray(profile[field]) ? profile[field].length : 0),
      );
    },
  );
  return {
    language: targetLanguage,
    profile: translated.value.profile,
    translationReport: { model: translated.model, attempts: translated.attempts },
  };
}
