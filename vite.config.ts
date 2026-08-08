import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const MAX_REQUEST_BYTES = 8_000_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MIN_JOB_DESCRIPTION_LENGTH = 20;
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
    if (body.length > MAX_REQUEST_BYTES) {
      throw new Error('REQUEST_TOO_LARGE');
    }
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

async function extractJobDescription(input: Record<string, any>) {
  const sourceType = stringValue(input.sourceType) || 'text';
  if (sourceType === 'text') {
    const jobDescription = stringValue(input.jobDescription).trim();
    if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
      throw new Error('INVALID_JOB_DESCRIPTION');
    }
    return jobDescription;
  }

  if (!['image', 'pdf'].includes(sourceType) || !isRecord(input.source)) {
    throw new Error('INVALID_SOURCE');
  }

  const mimeType = stringValue(input.source.mimeType).toLowerCase();
  const encoded = stringValue(input.source.data);
  if (!encoded || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) {
    throw new Error('INVALID_SOURCE');
  }
  const sourceBuffer = Buffer.from(encoded, 'base64');
  if (!sourceBuffer.length || sourceBuffer.length > MAX_SOURCE_BYTES) {
    throw new Error('INVALID_SOURCE');
  }

  let extracted = '';
  if (sourceType === 'pdf') {
    if (mimeType !== 'application/pdf' || !sourceBuffer.subarray(0, 4).equals(Buffer.from('%PDF'))) {
      throw new Error('INVALID_SOURCE');
    }
    const document = await pdfParse(sourceBuffer);
    extracted = stringValue(document.text);
  } else {
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      throw new Error('INVALID_SOURCE');
    }
    const { recognize } = await import('tesseract.js');
    const language = input.language === 'chinese' ? 'chi_sim+eng' : 'eng';
    const result = await recognize(sourceBuffer, language);
    extracted = stringValue(result.data.text);
  }

  const jobDescription = extracted.replace(/\u0000/g, '').trim();
  if (jobDescription.length < MIN_JOB_DESCRIPTION_LENGTH) {
    throw new Error('EMPTY_SOURCE');
  }
  return jobDescription;
}

async function requestGeneration(provider: Provider, input: Record<string, any>, signal: AbortSignal) {
  const upstream = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: 'Return a complete resume as valid JSON. Do not use markdown or add commentary.',
        },
        { role: 'user', content: buildResumePrompt(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 4_000,
    }),
    signal,
  });
  if (!upstream.ok) {
    throw new Error('UPSTREAM_ERROR');
  }
  const providerData = await upstream.json();
  const content = providerData?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('INVALID_UPSTREAM_RESPONSE');
  }
  const generated = JSON.parse(cleanGeneratedJson(content));
  if (!generated || typeof generated !== 'object' || !generated.resume || typeof generated.resume !== 'object') {
    throw new Error('INVALID_UPSTREAM_RESPONSE');
  }
  return generated;
}

function resumeGenerationPlugin(providers: Provider[]): Plugin {
  const handler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    if (!providers.length) {
      sendJson(response, 503, { error: 'Resume generation is not configured on this server.' });
      return;
    }

    let input: Record<string, any>;
    try {
      input = await readJsonBody(request);
    } catch (error) {
      sendJson(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
        error: 'Provide a valid job description or source file.',
      });
      return;
    }

    if (!['english', 'chinese'].includes(input.language)) {
      sendJson(response, 400, { error: 'Choose a valid resume language.' });
      return;
    }

    try {
      input.jobDescription = await extractJobDescription(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const clientError = message === 'EMPTY_SOURCE'
        ? 'No readable job description was found in that file.'
        : 'Provide a valid job description or source file.';
      sendJson(response, 400, { error: clientError });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      for (const provider of providers) {
        try {
          const generated = await requestGeneration(provider, input, controller.signal);
          sendJson(response, 200, generated);
          return;
        } catch {
          // A configured secondary provider can complete a transient primary-provider failure.
        }
      }
      sendJson(response, 502, { error: 'The resume service is unavailable. Please try again.' });
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    name: 'resume-generation-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-resume', (request, response, next) => {
        void handler(request, response, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/generate-resume', (request, response, next) => {
        void handler(request, response, next);
      });
    },
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
    esbuild: {
      jsx: 'automatic',
    },
  };
});
