import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

const MAX_REQUEST_BYTES = 16_000_000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARS = 20_000;
const MIN_TEXT_LENGTH = 20;
const PROVIDER_TIMEOUT_MS = 120_000;
const PROVIDER_RETRY_DELAY_MS = 700;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Provider = {
  apiKey: string;
  endpoint: string;
  model: string;
  pdfModel?: string;
  supportsDirectFileInput: boolean;
};

type SourceAttachment = {
  sourceType: 'image' | 'pdf';
  name: string;
  mimeType: string;
  data: string;
};

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function sendProviderFailure(response: ServerResponse, error: unknown, fallback: string) {
  if (error instanceof Error && error.message === 'DIRECT_FILE_PROVIDER_UNAVAILABLE') {
    sendJson(response, 503, { error: 'File imports require a configured ChatGPT-compatible provider.' });
    return;
  }
  if (error instanceof Error && error.message === 'PROVIDER_AUTH_FAILED') {
    sendJson(response, 401, { error: 'The configured ChatGPT provider rejected its API key. Update CLOUD_BRIDGE_API_KEY.' });
    return;
  }
  if (error instanceof Error && error.message === 'PROVIDER_TIMEOUT') {
    sendJson(response, 504, { error: 'The file recognition provider took too long to respond. Please try again.' });
    return;
  }
  sendJson(response, 502, { error: fallback });
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function base64ByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

async function readJsonBody(request: IncomingMessage) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(body || '{}');
}

function cleanGeneratedJson(value: string) {
  return value.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
}

function chatCompletionsEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function buildResumePrompt(input: Record<string, any>) {
  const language = input.language === 'chinese' ? 'Chinese' : 'English';
  return `You are a precise resume editor. Return valid JSON only.\n\nCreate a ${language} resume tailored to the job description. Use only factual information from the supplied profile and base resume. Do not invent employers, job titles, dates, degrees, certifications, metrics, skills, contact data, or achievements. You may reorganize and rewrite the supplied facts for relevance and clarity. When a required factual field is absent, return an empty string or an empty array.\n\nReturn exactly this JSON shape:\n{\n  "documentName": "string",\n  "resume": {\n    "basics": { "fullName": "string", "firstName": "string", "lastName": "string", "role": "string", "email": "string", "phone": "string", "location": "string", "gender": "string", "website": "string", "photoUrl": "string" },\n    "summary": "string",\n    "experience": [{ "id": 1, "role": "string", "company": "string", "location": "string", "start": "string", "end": "string", "current": false, "bullets": ["string"] }],\n    "education": [{ "id": 1, "school": "string", "degree": "string", "location": "string", "start": "string", "end": "string" }],\n    "skills": { "expertise": "comma-separated string", "tools": "comma-separated string" }\n  }\n}\n\nInput JSON:\n${JSON.stringify({
    profile: input.profile || {},
    baseResume: input.baseResume || {},
    jobDescription: input.jobDescription || 'Read the attached job description source directly.',
  })}

Final generation rules: preserve every supplied company and employment date exactly, preserve fullName/gender/email/phone exactly, and keep all real experiences in newest-first order. When a gap is at least six months, add exactly one supplemental experience covering that gap and partially overlapping an adjacent real boundary. Do not duplicate or fully overlap a real interval. Skills may be filled from the target JD; positions, summaries, and responsibilities may be rewritten for relevance.`;
}

function buildProfileImportPrompt(resumeText: string) {
  const sourceInstruction = [
    resumeText
      ? `Resume text:\n${resumeText}`
      : 'A resume file or image is attached. Read it directly, including the header contact line. Do not rely only on embedded PDF text.',
    `SUMMARY EXTRACTION RULES (IMPORTANT):
- First look for an explicitly written personal introduction, profile, about, objective, or summary section. If one exists, preserve its meaning in summary and translate it for the other language without adding claims.
- If no such section exists, leave summary empty. A separate writing step will generate it later from the extracted facts.
- A summary is never a work-experience field. Do not turn responsibilities, bullet points, task sequences, platform lists, or project descriptions into an explicit summary.
- If no explicit introduction exists, both summary fields must be empty.
- Add a summarySource field to each profile with exactly "explicit" when an introduction section was found, or "missing" when it was not. This marker is required even though it is not included in the abbreviated schema above.`,
  ].join('\n\n');
  return `You extract personal profile details from a resume. Return valid JSON only. Detect whether the resume is primarily Chinese or English, then provide both a Chinese and an English profile in the same response. Use only explicit resume facts. Never invent a name, gender, contact details, location, social account, website, or summary. Carefully read the phone number and email address even when the PDF text layer is malformed. Preserve exact factual values such as email addresses, phone numbers, websites, and account handles across both profiles. Translate human-readable fields such as names, locations, gender, and summaries when appropriate.\n\nReturn exactly this JSON shape:\n{\n  "language": "chinese or english",\n  "profiles": {\n    "chinese": {\n      "fullName": "string",\n      "gender": "string",\n      "phone": "string",\n      "email": "string",\n      "location": "string",\n      "wechat": "string",\n      "linkedin": "string",\n      "website": "string",\n      "summary": "string"\n    },\n    "english": {\n      "fullName": "string",\n      "gender": "string",\n      "phone": "string",\n      "email": "string",\n      "location": "string",\n      "wechat": "string",\n      "linkedin": "string",\n      "website": "string",\n      "summary": "string"\n    }\n  }\n}\n\nFor Chinese profiles use Chinese values when they are known, including gender values 男, 女, or 其他. For English profiles use English values, including Male, Female, Non-binary, or Prefer not to say only when explicit. Leave unknown fields empty. The summary may be a concise factual synthesis of the resume in its target language.\n\n${sourceInstruction}`;
}

function buildProfileTranslationPrompt(sourceLanguage: string, profile: Record<string, any>) {
  const targetLanguage = sourceLanguage === 'chinese' ? 'english' : 'chinese';
  return `You translate a personal profile from ${sourceLanguage} to ${targetLanguage}. Return valid JSON only. Preserve exact factual values such as names, email addresses, phones, websites, and account handles. Translate only human-readable fields such as location and summary when appropriate. Do not invent missing fields.\n\nReturn exactly this JSON shape:\n{\n  "language": "${targetLanguage}",\n  "profile": {\n    "fullName": "string",\n    "gender": "string",\n    "phone": "string",\n    "email": "string",\n    "location": "string",\n    "wechat": "string",\n    "linkedin": "string",\n    "website": "string",\n    "summary": "string"\n  }\n}\n\nSource profile:\n${JSON.stringify(profile)}`;
}

function buildProfileSummaryPrompt(profiles: Record<string, any>, resumeText: string) {
  const sourceInstruction = resumeText
    ? `Resume text:\n${resumeText}`
    : 'The original resume file or image is attached. Read the full document for career facts, but do not invent anything that is not shown.';
  return `You are the professional summary writer from the puppet-resume workflow. Generate only the missing bilingual personal introductions from the supplied factual profile and resume source, then return valid JSON only.

Follow this exact generation logic:
- Write two separate paragraphs in each language, separated by a blank line.
- Paragraph 1 presents the professional identity, career direction, explicit years of experience when available, industry breadth, and core value proposition. Aim for 3-4 resume lines.
- Paragraph 2 presents high-level outcomes, working methodology, leadership or collaboration style, and transferable strengths. Aim for 2 resume lines.
- Use an implied first person / third-person-limited style: omit 我, 本人, 该候选人, I, and My. Start directly with phrases such as "拥有...经验" or "深耕...领域".
- Use only supplied facts. Never invent years, employers, titles, metrics, tools, platforms, or achievements. Do not use decimal years; round only an explicitly stated decimal to an integer.
- This is a professional About section, not work experience. Do not enumerate responsibilities, copy bullets, name a sequence of tasks, or describe one job in detail. Do not list social platforms or software tools.
- Chinese output must be Chinese; English output must be English. Keep both versions semantically equivalent.

Return exactly this JSON shape:
{
  "profiles": {
    "chinese": { "summary": "string" },
    "english": { "summary": "string" }
  }
}

Supplied factual profiles (their summaries are intentionally empty because no explicit personal introduction was found):
${JSON.stringify(profiles)}

${sourceInstruction}`;
}

function sourceFromInput(input: Record<string, any>, textField: string) {
  const sourceType = stringValue(input.sourceType) || 'text';
  if (sourceType === 'text') {
    const sourceText = stringValue(input[textField]).trim();
    if (sourceText.length < MIN_TEXT_LENGTH) throw new Error('INVALID_TEXT');
    if (sourceText.length > MAX_SOURCE_TEXT_CHARS) throw new Error('INVALID_TEXT');
    return { text: sourceText, attachment: null };
  }
  if (!['image', 'pdf'].includes(sourceType) || !isRecord(input.source)) {
    throw new Error('INVALID_SOURCE');
  }

  const mimeType = stringValue(input.source.mimeType).toLowerCase();
  const encoded = stringValue(input.source.data);
  if (!encoded || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) throw new Error('INVALID_SOURCE');
  if (base64ByteLength(encoded) > MAX_SOURCE_BYTES) throw new Error('INVALID_SOURCE');

  if (sourceType === 'pdf') {
    if (mimeType !== 'application/pdf') {
      throw new Error('INVALID_SOURCE');
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error('INVALID_SOURCE');
  }
  return {
    text: '',
    attachment: {
      sourceType: sourceType as SourceAttachment['sourceType'],
      name: stringValue(input.source.name).trim() || `source.${sourceType === 'pdf' ? 'pdf' : 'png'}`,
      mimeType,
      data: encoded,
    } satisfies SourceAttachment,
  };
}

function monthIndex(value: unknown): number | null {
  const text = stringValue(value).trim();
  if (text === '至今' || text.toLowerCase() === 'present') return 999999;
  const match = /^(\d{4})[-年](\d{1,2})/.exec(text);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? Number(match[1]) * 12 + month : null;
}

function experienceKey(experience: Record<string, any>) {
  return [stringValue(experience.company).trim(), stringValue(experience.start).trim(), stringValue(experience.end).trim()].join('\u0000');
}

function validateGeneratedResume(input: Record<string, any>, resume: Record<string, any>) {
  if (!isRecord(resume.basics) || !Array.isArray(resume.experience)) return false;
  const profile = isRecord(input.profile) ? input.profile : {};
  const realExperiences = Array.isArray(profile.workExperiences) ? profile.workExperiences : [];
  const generatedExperiences = resume.experience.filter(isRecord);
  if (generatedExperiences.length < realExperiences.length) return false;

  const generatedCounts = new Map<string, number>();
  generatedExperiences.forEach((experience) => {
    const key = experienceKey(experience);
    generatedCounts.set(key, (generatedCounts.get(key) || 0) + 1);
  });
  for (const real of realExperiences) {
    const normalized = {
      company: real.company,
      start: real.startDate,
      end: real.endDate,
    };
    const key = experienceKey(normalized);
    const count = generatedCounts.get(key) || 0;
    if (count === 0) return false;
    generatedCounts.set(key, count - 1);
  }

  const ordered = generatedExperiences
    .map((experience) => ({ experience, start: monthIndex(experience.start), end: monthIndex(experience.end) }))
    .filter(({ start, end }) => start !== null && end !== null && start <= end);
  if (ordered.length !== generatedExperiences.length) return false;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].start! < ordered[index].start!) return false;
  }

  const lockedBasics = ['fullName', 'gender', 'email', 'phone'];
  for (const field of lockedBasics) {
    const expected = stringValue(profile[field]).trim();
    if (expected && stringValue(resume.basics[field]).trim() !== expected) return false;
  }

  const realCounts = new Map<string, number>();
  realExperiences.forEach((real) => {
    const key = experienceKey({ company: real.company, start: real.startDate, end: real.endDate });
    realCounts.set(key, (realCounts.get(key) || 0) + 1);
  });
  const supplemental = generatedExperiences.filter((experience) => {
    const key = experienceKey(experience);
    const count = realCounts.get(key) || 0;
    if (count > 0) {
      realCounts.set(key, count - 1);
      return false;
    }
    return true;
  });
  if (!realExperiences.length) return true;

  const realRanges = realExperiences.map((experience) => ({
    start: monthIndex(experience.startDate),
    end: monthIndex(experience.endDate),
  }));
  const sortedRealRanges = [...realRanges]
    .filter((range) => range.start !== null && range.end !== null)
    .sort((first, second) => first.start! - second.start!);
  const gaps: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < sortedRealRanges.length; index += 1) {
    const start = sortedRealRanges[index - 1].end! + 1;
    const end = sortedRealRanges[index].start! - 1;
    if (end - start + 1 >= 6) gaps.push({ start, end });
  }
  const currentDate = new Date();
  const currentMonth = currentDate.getFullYear() * 12 + currentDate.getMonth() + 1;
  const lastReal = sortedRealRanges[sortedRealRanges.length - 1];
  if (lastReal && lastReal.end! < 999999 && currentMonth - lastReal.end! + 1 >= 6) {
    gaps.push({ start: lastReal.end! + 1, end: currentMonth });
  }
  for (const gap of gaps) {
    const matches = supplemental.filter((extra) => {
      const start = monthIndex(extra.start);
      const end = monthIndex(extra.end);
      return start !== null && end !== null && start <= gap.start && end >= gap.end;
    });
    if (matches.length !== 1) return false;
  }
  for (const extra of supplemental) {
    const start = monthIndex(extra.start);
    const end = monthIndex(extra.end);
    if (start === null || end === null) return false;
    let partialOverlap = false;
    for (const real of realRanges) {
      if (real.start === null || real.end === null) continue;
      const overlapStart = Math.max(start, real.start);
      const overlapEnd = Math.min(end, real.end);
      if (overlapStart > overlapEnd) continue;
      const coversExtra = overlapStart === start && overlapEnd === end;
      const coversReal = overlapStart === real.start && overlapEnd === real.end;
      if (coversExtra || coversReal) return false;
      partialOverlap = true;
    }
    if (!partialOverlap) return false;
  }
  return true;
}

function modelMessageContent(userPrompt: string, attachment: SourceAttachment | null) {
  if (!attachment) return userPrompt;
  const content: Record<string, any>[] = [{ type: 'text', text: userPrompt }];
  if (attachment.sourceType === 'image') {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${attachment.mimeType};base64,${attachment.data}`,
      },
    });
  } else {
    content.push({
      type: 'file',
      file: {
        filename: attachment.name,
        file_data: `data:application/pdf;base64,${attachment.data}`,
      },
    });
  }
  return content;
}

async function requestJsonCompletion(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
  attachment: SourceAttachment | null = null,
  maxTokens = 4_000,
) {
  const requestBody = JSON.stringify({
    model: attachment?.sourceType === 'pdf' && provider.pdfModel
      ? provider.pdfModel
      : provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: modelMessageContent(userPrompt, attachment) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: maxTokens,
  });
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const upstream = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal,
      });
      if (!upstream.ok) {
        if (upstream.status === 401 || upstream.status === 403) {
          throw new Error('PROVIDER_AUTH_FAILED');
        }
        throw new Error(upstream.status === 408 || upstream.status === 425 || upstream.status === 429 || upstream.status >= 500
          ? 'UPSTREAM_RETRYABLE'
          : 'UPSTREAM_ERROR');
      }
      const providerData = await upstream.json();
      const content = providerData?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('INVALID_UPSTREAM_RESPONSE');
      const generated = JSON.parse(cleanGeneratedJson(content));
      if (!generated || typeof generated !== 'object') throw new Error('INVALID_UPSTREAM_RESPONSE');
      return generated;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('PROVIDER_TIMEOUT');
      }
      const retryable = error instanceof TypeError ||
        (error instanceof Error && ['UPSTREAM_RETRYABLE', 'INVALID_UPSTREAM_RESPONSE'].includes(error.message));
      if (!retryable || attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, PROVIDER_RETRY_DELAY_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('UPSTREAM_UNAVAILABLE');
}

async function requestFromProviders(
  providers: Provider[],
  systemPrompt: string,
  userPrompt: string,
  validate: (value: any) => boolean,
  attachment: SourceAttachment | null = null,
  maxTokens = 4_000,
  timeoutMs = PROVIDER_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const eligibleProviders = attachment
      ? providers.filter((provider) => provider.supportsDirectFileInput)
      : providers;
    if (!eligibleProviders.length) throw new Error('DIRECT_FILE_PROVIDER_UNAVAILABLE');
    let lastError: unknown = null;
    for (const provider of eligibleProviders) {
      try {
        const result = await requestJsonCompletion(provider, systemPrompt, userPrompt, controller.signal, attachment, maxTokens);
        if (validate(result)) return result;
      } catch (error) {
        lastError = error;
        // A configured secondary provider can complete a transient primary-provider failure.
      }
    }
    throw lastError instanceof Error ? lastError : new Error('UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

function validProfileResponse(value: any) {
  return isRecord(value) && ['english', 'chinese'].includes(value.language) && isRecord(value.profile);
}

function validProfileImportResponse(value: any) {
  return isRecord(value) && ['english', 'chinese'].includes(value.language) &&
    ((isRecord(value.profiles) && isRecord(value.profiles.chinese) && isRecord(value.profiles.english)) ||
      isRecord(value.profile));
}

function validProfileSummaryResponse(value: any) {
  return isRecord(value) && isRecord(value.profiles) &&
    isRecord(value.profiles.chinese) && typeof value.profiles.chinese.summary === 'string' &&
    isRecord(value.profiles.english) && typeof value.profiles.english.summary === 'string';
}

function normalizeProfileImportResponse(value: Record<string, any>) {
  const sourceLanguage = value.language === 'chinese' ? 'chinese' : 'english';
  const profiles = isRecord(value.profiles) ? value.profiles : {
    [sourceLanguage]: isRecord(value.profile) ? value.profile : {},
  };
  return {
    language: sourceLanguage,
    profiles: {
      chinese: isRecord(profiles.chinese) ? profiles.chinese : {},
      english: isRecord(profiles.english) ? profiles.english : {},
    },
  };
}

function resumeGenerationPlugin(providers: Provider[]): Plugin {
  const parseInput = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return null;
    }
    if (!providers.length) {
      sendJson(response, 503, { error: 'Resume generation is not configured on this server.' });
      return null;
    }
    try {
      return await readJsonBody(request);
    } catch (error) {
      sendJson(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
        error: 'Provide valid text or a source file.',
      });
      return null;
    }
  };

  const resumeHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const input = await parseInput(request, response, next);
    if (!input) return;
    if (!['english', 'chinese'].includes(input.language)) {
      sendJson(response, 400, { error: 'Choose a valid resume language.' });
      return;
    }
    let source;
    try {
      source = sourceFromInput(input, 'jobDescription');
    } catch (error) {
      sendJson(response, 400, {
        error: 'Provide a valid job description or source file.',
      });
      return;
    }
    try {
      const generated = await requestFromProviders(
        providers,
        'Return a complete resume as valid JSON. Do not use markdown or add commentary. Preserve every real company name and employment date exactly, preserve basic contact facts exactly, and add at most one partially-overlapping supplemental entry per gap of at least six months. Do not fully overlap a real interval or output reverse chronological order.',
        buildResumePrompt({ ...input, jobDescription: source.text }),
        (value) => isRecord(value) && validateGeneratedResume(input, value.resume),
        source.attachment,
      );
      sendJson(response, 200, {
        ...generated,
        applicationId: stringValue(input.applicationId) || randomUUID(),
        jobId: stringValue(input.jobId),
        evidence: isRecord(input.evidence)
          ? {
              applicationId: stringValue(input.applicationId),
              jobId: stringValue(input.jobId),
              sourceType: stringValue(input.sourceType) || 'text',
              uploadedSource: isRecord(input.source)
                ? { name: stringValue(input.source.name), mimeType: stringValue(input.source.mimeType), evidenceId: stringValue(input.source.evidenceId) }
                : null,
            }
          : null,
      });
    } catch (error) {
      sendProviderFailure(response, error, 'The resume service is unavailable. Please try again.');
    }
  };

  const profileImportHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const input = await parseInput(request, response, next);
    if (!input) return;
    let source;
    try {
      source = sourceFromInput(input, 'resumeText');
    } catch (error) {
      sendJson(response, 400, {
        error: 'Provide valid resume content or a source file.',
      });
      return;
    }
    try {
      const imported = await requestFromProviders(
        providers,
        'Return extracted personal profile details as valid JSON. Do not use markdown or add commentary.',
        buildProfileImportPrompt(source.text),
        validProfileImportResponse,
        source.attachment,
      );
      const normalized = normalizeProfileImportResponse(imported);
      let result = normalized;
      const extractedProfiles = [normalized.profiles.chinese, normalized.profiles.english];
      const hasExplicitSummary = extractedProfiles
        .some((profile) => stringValue(profile.summarySource).trim() === 'explicit');
      if (!hasExplicitSummary) {
        try {
          const summarized = await requestFromProviders(
            providers,
            'Return concise bilingual professional summaries as valid JSON. Do not use markdown or add commentary.',
            buildProfileSummaryPrompt(normalized.profiles, source.text),
            validProfileSummaryResponse,
            source.attachment,
            1_200,
            45_000,
          );
          result = {
            ...normalized,
            profiles: {
              chinese: { ...normalized.profiles.chinese, summary: summarized.profiles.chinese.summary.trim() },
              english: { ...normalized.profiles.english, summary: summarized.profiles.english.summary.trim() },
            },
          };
        } catch {
          // Keep the extracted result available when summary generation is temporarily unavailable.
        }
      }
      sendJson(response, 200, result);
    } catch (error) {
      sendProviderFailure(response, error, 'The profile import service is unavailable. Please try again.');
    }
  };

  const profileTranslationHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const input = await parseInput(request, response, next);
    if (!input) return;
    if (!['english', 'chinese'].includes(input.language) || !isRecord(input.profile)) {
      sendJson(response, 400, { error: 'Provide a valid profile to translate.' });
      return;
    }
    try {
      const translated = await requestFromProviders(
        providers,
        'Return a translated personal profile as valid JSON. Do not use markdown or add commentary.',
        buildProfileTranslationPrompt(input.language, input.profile),
        (value) => validProfileResponse(value) && value.language !== input.language,
      );
      sendJson(response, 200, translated);
    } catch {
      sendJson(response, 502, { error: 'The profile translation service is unavailable. Please try again.' });
    }
  };

  const configureRoutes = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/generate-resume', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void resumeHandler(request, response, next);
    });
    server.middlewares.use('/api/import-profile', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void profileImportHandler(request, response, next);
    });
    server.middlewares.use('/api/translate-profile', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void profileTranslationHandler(request, response, next);
    });
  };

  return {
    name: 'resume-generation-api',
    configureServer: configureRoutes,
    configurePreviewServer: configureRoutes,
  };
}

function profileDirectoryPlugin(baseUrl: string): Plugin {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const searchHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void, endpoint: string) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    try {
      const body = await readJsonBody(request);
      const upstream = await fetch(`${normalizedBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await upstream.text();
      response.statusCode = upstream.status;
      response.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
      response.end(payload);
    } catch {
      sendJson(response, 502, { error: 'The profile directory is temporarily unavailable.' });
    }
  };

  const configureRoutes = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/searchUniversities', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void searchHandler(request, response, next, 'searchUniversities');
    });
    server.middlewares.use('/api/searchMajors', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void searchHandler(request, response, next, 'searchMajors');
    });
  };

  return {
    name: 'profile-directory-api',
    configureServer: configureRoutes,
    configurePreviewServer: configureRoutes,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const providers: Provider[] = [];
  const cloudBridgeBaseUrl = env.CLOUD_BRIDGE_API_BASE_URL || 'https://www.yunqiaoai.top';
  if (env.CLOUD_BRIDGE_API_KEY) {
    providers.push({
      apiKey: env.CLOUD_BRIDGE_API_KEY,
      endpoint: chatCompletionsEndpoint(cloudBridgeBaseUrl),
      model: env.CLOUD_BRIDGE_MODEL || 'gpt-5.6-terra',
      pdfModel: env.CLOUD_BRIDGE_PDF_MODEL || 'gemini-2.5-flash',
      supportsDirectFileInput: true,
    });
  }
  if (env.DEEPSEEK_API_KEY) {
    providers.push({
      apiKey: env.DEEPSEEK_API_KEY,
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      supportsDirectFileInput: false,
    });
  }
  return {
    plugins: [
      resumeGenerationPlugin(providers),
      profileDirectoryPlugin(env.DIRECTORY_API_BASE_URL || 'https://feiwan.online/api'),
    ],
    esbuild: { jsx: 'automatic' },
  };
});
