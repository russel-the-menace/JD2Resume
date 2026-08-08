import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_REQUEST_BYTES = 8_000_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
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
  })}`;
}

function buildProfileImportPrompt(resumeText: string) {
  const sourceInstruction = resumeText
    ? `Resume text:\n${resumeText}`
    : 'A resume file or image is attached. Read it directly, including the header contact line. Do not rely only on embedded PDF text.';
  return `You extract personal profile details from a resume. Return valid JSON only. Detect whether the resume is primarily Chinese or English, then provide both a Chinese and an English profile in the same response. Use only explicit resume facts. Never invent a name, gender, contact details, location, social account, website, or summary. Carefully read the phone number and email address even when the PDF text layer is malformed. Preserve exact factual values such as email addresses, phone numbers, websites, and account handles across both profiles. Translate human-readable fields such as names, locations, gender, and summaries when appropriate.\n\nReturn exactly this JSON shape:\n{\n  "language": "chinese or english",\n  "profiles": {\n    "chinese": {\n      "fullName": "string",\n      "gender": "string",\n      "phone": "string",\n      "email": "string",\n      "location": "string",\n      "wechat": "string",\n      "linkedin": "string",\n      "website": "string",\n      "summary": "string"\n    },\n    "english": {\n      "fullName": "string",\n      "gender": "string",\n      "phone": "string",\n      "email": "string",\n      "location": "string",\n      "wechat": "string",\n      "linkedin": "string",\n      "website": "string",\n      "summary": "string"\n    }\n  }\n}\n\nFor Chinese profiles use Chinese values when they are known, including gender values 男, 女, or 其他. For English profiles use English values, including Male, Female, Non-binary, or Prefer not to say only when explicit. Leave unknown fields empty. The summary may be a concise factual synthesis of the resume in its target language.\n\n${sourceInstruction}`;
}

function buildProfileTranslationPrompt(sourceLanguage: string, profile: Record<string, any>) {
  const targetLanguage = sourceLanguage === 'chinese' ? 'english' : 'chinese';
  return `You translate a personal profile from ${sourceLanguage} to ${targetLanguage}. Return valid JSON only. Preserve exact factual values such as names, email addresses, phones, websites, and account handles. Translate only human-readable fields such as location and summary when appropriate. Do not invent missing fields.\n\nReturn exactly this JSON shape:\n{\n  "language": "${targetLanguage}",\n  "profile": {\n    "fullName": "string",\n    "gender": "string",\n    "phone": "string",\n    "email": "string",\n    "location": "string",\n    "wechat": "string",\n    "linkedin": "string",\n    "website": "string",\n    "summary": "string"\n  }\n}\n\nSource profile:\n${JSON.stringify(profile)}`;
}

function sourceFromInput(input: Record<string, any>, textField: string) {
  const sourceType = stringValue(input.sourceType) || 'text';
  if (sourceType === 'text') {
    const sourceText = stringValue(input[textField]).trim();
    if (sourceText.length < MIN_TEXT_LENGTH) throw new Error('INVALID_TEXT');
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
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const eligibleProviders = attachment
      ? providers.filter((provider) => provider.supportsDirectFileInput)
      : providers;
    if (!eligibleProviders.length) throw new Error('DIRECT_FILE_PROVIDER_UNAVAILABLE');
    let lastError: unknown = null;
    for (const provider of eligibleProviders) {
      try {
        const result = await requestJsonCompletion(provider, systemPrompt, userPrompt, controller.signal, attachment);
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
        'Return a complete resume as valid JSON. Do not use markdown or add commentary.',
        buildResumePrompt({ ...input, jobDescription: source.text }),
        (value) => isRecord(value) && isRecord(value.resume),
        source.attachment,
      );
      sendJson(response, 200, generated);
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
      sendJson(response, 200, normalizeProfileImportResponse(imported));
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
    plugins: [resumeGenerationPlugin(providers)],
    esbuild: { jsx: 'automatic' },
  };
});
