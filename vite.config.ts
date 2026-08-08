import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_REQUEST_BYTES = 8_000_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MIN_SOURCE_TEXT_LENGTH = 20;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Provider = {
  apiKey: string;
  endpoint: string;
  model: string;
};

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
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
    jobDescription: input.jobDescription,
  })}`;
}

function buildProfileImportPrompt(resumeText: string) {
  return `You extract personal profile details from a resume. Return valid JSON only. Detect whether the resume is primarily Chinese or English. Use only explicit resume facts. Never invent a name, gender, contact details, location, social account, website, or summary.\n\nReturn exactly this JSON shape:\n{\n  "language": "chinese or english",\n  "profile": {\n    "fullName": "string",\n    "gender": "string",\n    "phone": "string",\n    "email": "string",\n    "location": "string",\n    "wechat": "string",\n    "linkedin": "string",\n    "website": "string",\n    "summary": "string"\n  }\n}\n\nFor Chinese profiles use Chinese values when they are known, including gender values 男, 女, or 其他. For English profiles use English values, including Male, Female, Non-binary, or Prefer not to say only when explicit. Leave unknown fields empty. The summary may be a concise factual synthesis of the resume in its detected language.\n\nResume text:\n${resumeText}`;
}

function buildProfileTranslationPrompt(sourceLanguage: string, profile: Record<string, any>) {
  const targetLanguage = sourceLanguage === 'chinese' ? 'english' : 'chinese';
  return `You translate a personal profile from ${sourceLanguage} to ${targetLanguage}. Return valid JSON only. Preserve exact factual values such as names, email addresses, phones, websites, and account handles. Translate only human-readable fields such as location and summary when appropriate. Do not invent missing fields.\n\nReturn exactly this JSON shape:\n{\n  "language": "${targetLanguage}",\n  "profile": {\n    "fullName": "string",\n    "gender": "string",\n    "phone": "string",\n    "email": "string",\n    "location": "string",\n    "wechat": "string",\n    "linkedin": "string",\n    "website": "string",\n    "summary": "string"\n  }\n}\n\nSource profile:\n${JSON.stringify(profile)}`;
}

async function extractSourceText(input: Record<string, any>, textField: string, ocrLanguage = 'eng') {
  const sourceType = stringValue(input.sourceType) || 'text';
  if (sourceType === 'text') {
    const sourceText = stringValue(input[textField]).trim();
    if (sourceText.length < MIN_SOURCE_TEXT_LENGTH) throw new Error('INVALID_TEXT');
    return sourceText;
  }
  if (!['image', 'pdf'].includes(sourceType) || !isRecord(input.source)) {
    throw new Error('INVALID_SOURCE');
  }

  const mimeType = stringValue(input.source.mimeType).toLowerCase();
  const encoded = stringValue(input.source.data);
  if (!encoded || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) throw new Error('INVALID_SOURCE');
  const sourceBuffer = Buffer.from(encoded, 'base64');
  if (!sourceBuffer.length || sourceBuffer.length > MAX_SOURCE_BYTES) throw new Error('INVALID_SOURCE');

  let extracted = '';
  if (sourceType === 'pdf') {
    if (mimeType !== 'application/pdf' || !sourceBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      throw new Error('INVALID_SOURCE');
    }
    const document = await pdfParse(sourceBuffer);
    extracted = stringValue(document.text);
  } else {
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error('INVALID_SOURCE');
    const { recognize } = await import('tesseract.js');
    const result = await recognize(sourceBuffer, ocrLanguage);
    extracted = stringValue(result.data.text);
  }

  const sourceText = extracted.replace(/\u0000/g, '').trim();
  if (sourceText.length < MIN_SOURCE_TEXT_LENGTH) throw new Error('EMPTY_SOURCE');
  return sourceText;
}

async function requestJsonCompletion(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal,
  maxTokens = 4_000,
) {
  const upstream = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
    signal,
  });
  if (!upstream.ok) throw new Error('UPSTREAM_ERROR');
  const providerData = await upstream.json();
  const content = providerData?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('INVALID_UPSTREAM_RESPONSE');
  const generated = JSON.parse(cleanGeneratedJson(content));
  if (!generated || typeof generated !== 'object') throw new Error('INVALID_UPSTREAM_RESPONSE');
  return generated;
}

async function requestFromProviders(
  providers: Provider[],
  systemPrompt: string,
  userPrompt: string,
  validate: (value: any) => boolean,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    for (const provider of providers) {
      try {
        const result = await requestJsonCompletion(provider, systemPrompt, userPrompt, controller.signal);
        if (validate(result)) return result;
      } catch {
        // A configured secondary provider can complete a transient primary-provider failure.
      }
    }
    throw new Error('UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

function validProfileResponse(value: any) {
  return isRecord(value) && ['english', 'chinese'].includes(value.language) && isRecord(value.profile);
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
    try {
      input.jobDescription = await extractSourceText(
        input,
        'jobDescription',
        input.language === 'chinese' ? 'chi_sim+eng' : 'eng',
      );
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error && error.message === 'EMPTY_SOURCE'
          ? 'No readable job description was found in that file.'
          : 'Provide a valid job description or source file.',
      });
      return;
    }
    try {
      const generated = await requestFromProviders(
        providers,
        'Return a complete resume as valid JSON. Do not use markdown or add commentary.',
        buildResumePrompt(input),
        (value) => isRecord(value) && isRecord(value.resume),
      );
      sendJson(response, 200, generated);
    } catch {
      sendJson(response, 502, { error: 'The resume service is unavailable. Please try again.' });
    }
  };

  const profileImportHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const input = await parseInput(request, response, next);
    if (!input) return;
    let resumeText = '';
    try {
      resumeText = await extractSourceText(input, 'resumeText', 'chi_sim+eng');
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error && error.message === 'EMPTY_SOURCE'
          ? 'No readable resume content was found in that file.'
          : 'Provide valid resume content or a source file.',
      });
      return;
    }
    try {
      const imported = await requestFromProviders(
        providers,
        'Return extracted personal profile details as valid JSON. Do not use markdown or add commentary.',
        buildProfileImportPrompt(resumeText),
        validProfileResponse,
      );
      sendJson(response, 200, imported);
    } catch {
      sendJson(response, 502, { error: 'The profile import service is unavailable. Please try again.' });
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
  if (env.CLOUD_BRIDGE_API_KEY && env.CLOUD_BRIDGE_API_BASE_URL) {
    providers.push({
      apiKey: env.CLOUD_BRIDGE_API_KEY,
      endpoint: chatCompletionsEndpoint(env.CLOUD_BRIDGE_API_BASE_URL),
      model: env.CLOUD_BRIDGE_MODEL || 'gpt-4.1-mini',
    });
  }
  if (env.DEEPSEEK_API_KEY) {
    providers.push({
      apiKey: env.DEEPSEEK_API_KEY,
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    });
  }
  return {
    plugins: [resumeGenerationPlugin(providers)],
    esbuild: { jsx: 'automatic' },
  };
});
