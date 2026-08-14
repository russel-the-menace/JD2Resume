import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PuppetResumePipeline } from './server/puppet-resume/pipeline';
import { fromPuppetResume, toPuppetRequest } from './server/puppet-resume/adapter';
import { renderPuppetPdf, resolvePuppetLayout } from './server/puppet-resume/layout';
import { statePersistencePlugin } from './server/persistence';
import {
  importProfileFacts,
  translateProfileFacts,
  type ProfileImportModels,
  type ProfileTaskRequest,
} from './server/profile-import/pipeline';

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
  maxAttempts = 2,
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
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
      const finishReason = stringValue(providerData?.choices?.[0]?.finish_reason).toLowerCase();
      if (['length', 'max_tokens'].includes(finishReason)) throw new Error('OUTPUT_TRUNCATED');
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
      if (!retryable || attempt === maxAttempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, PROVIDER_RETRY_DELAY_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('UPSTREAM_UNAVAILABLE');
}

async function requestProfileTask(
  providers: Provider[],
  request: ProfileTaskRequest,
) {
  const baseProvider = providers[0];
  if (!baseProvider) throw new Error('PROFILE_PROVIDER_UNAVAILABLE');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const result = await requestJsonCompletion(
      { ...baseProvider, model: request.model, pdfModel: undefined },
      'Return valid JSON only. Do not use markdown or add commentary.',
      request.prompt,
      controller.signal,
      request.attachment || null,
      request.maxTokens,
      1,
    );
    console.log('[Profile Import] Module completed', { task: request.task, model: request.model });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestFromProviders(
  providers: Provider[],
  systemPrompt: string,
  userPrompt: string,
  validate: (value: any) => boolean | Promise<boolean>,
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
        if (await validate(result)) return result;
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

async function extractPuppetJob(
  providers: Provider[],
  input: Record<string, any>,
  source: { text: string; attachment: SourceAttachment | null },
) {
  const prompt = `Extract the target job from the supplied JD and return JSON only.
{
  "title": "concise target title",
  "experience": "original experience requirement, for example 3-5年 or 5+ years",
  "description": "complete normalized JD text"
}
Do not add requirements that are absent. Preserve all responsibilities, skills, and qualification requirements.

JD text:
${source.text || 'Read the attached JD directly.'}`;
  return requestFromProviders(
    providers,
    'Return structured job data as valid JSON. Do not return markdown.',
    prompt,
    (value) => isRecord(value) && typeof value.title === 'string' && typeof value.experience === 'string' && typeof value.description === 'string',
    source.attachment,
    6_000,
  ) as Promise<{ title: string; experience: string; description: string }>;
}

function createPuppetTextGenerator(providers: Provider[]) {
  return async (prompt: string, validator: (text: string) => boolean | Promise<boolean>) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const generated = await requestFromProviders(
          providers,
          'Return valid JSON only. Do not use markdown or add commentary.',
          prompt,
          async (value) => validator(JSON.stringify(value)),
          null,
          16_000,
        );
        return JSON.stringify(generated);
      } catch (error) {
        if (attempt === 3) throw error;
        const minWait = attempt === 1 ? 10 : 20;
        const maxWait = attempt === 1 ? 30 : 40;
        const waitSeconds = Math.floor(Math.random() * (maxWait - minWait + 1)) + minWait;
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1_000));
      }
    }
    throw new Error('Puppet Resume generation exhausted all retries');
  };
}

function resumeGenerationPlugin(providers: Provider[], profileModels: ProfileImportModels): Plugin {
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
      const job = await extractPuppetJob(providers, input, source);
      const pipeline = new PuppetResumePipeline(createPuppetTextGenerator(providers));
      const puppetData = await pipeline.enhance(toPuppetRequest(input, job));
      const applicationId = stringValue(input.applicationId) || randomUUID();
      const resume = fromPuppetResume(puppetData);
      const customSections = resume.certificates.length ? ['certifications'] : [];
      const documentName = `${puppetData.name} - ${puppetData.position}`;
      const renderDocument = {
        id: `${applicationId}-${input.language}`,
        documentName,
        language: input.language,
        data: resume,
        template: 'profile',
        accent: '#167c65',
        customSections,
        customContent: {},
        sectionOrder: ['basics', 'summary', 'education', 'experience', 'skills', ...customSections],
        sectionOrderCustomized: false,
        generationEvidence: input.evidence || {},
        updatedAt: Date.now(),
      };
      const forwardedProtocol = Array.isArray(request.headers['x-forwarded-proto'])
        ? request.headers['x-forwarded-proto'][0]
        : request.headers['x-forwarded-proto'];
      const origin = `${forwardedProtocol || 'http'}://${request.headers.host}`;
      const layoutManifest = await resolvePuppetLayout(origin, renderDocument);
      sendJson(response, 200, {
        documentName,
        resume,
        layoutManifest,
        applicationId,
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
      const imported = await importProfileFacts({
        sourceType: source.attachment?.sourceType || 'text',
        text: source.text,
        attachment: source.attachment
          ? { name: source.attachment.name, mimeType: source.attachment.mimeType, data: source.attachment.data }
          : null,
      }, profileModels, (task) => requestProfileTask(providers, task));
      sendJson(response, 200, imported);
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
      const translated = await translateProfileFacts(
        input.language,
        input.profile,
        profileModels,
        (task) => requestProfileTask(providers, task),
      );
      sendJson(response, 200, translated);
    } catch {
      sendJson(response, 502, { error: 'The profile translation service is unavailable. Please try again.' });
    }
  };

  const pdfExportHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    try {
      const input = await readJsonBody(request);
      if (!isRecord(input.document) || !isRecord(input.document.layoutManifest)) {
        sendJson(response, 400, { error: 'Provide a finalized resume document.' });
        return;
      }
      const forwardedProtocol = Array.isArray(request.headers['x-forwarded-proto'])
        ? request.headers['x-forwarded-proto'][0]
        : request.headers['x-forwarded-proto'];
      const origin = `${forwardedProtocol || 'http'}://${request.headers.host}`;
      const providedManifest = input.document.layoutManifest as Record<string, any>;
      const manifest = stringValue(providedManifest.policy)
        ? providedManifest
        : await resolvePuppetLayout(origin, input.document);
      const pdf = await renderPuppetPdf(origin, { ...input.document, layoutManifest: manifest }, manifest as any);
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
      response.end(pdf);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'PDF generation failed.' });
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
    server.middlewares.use('/api/export-pdf', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void pdfExportHandler(request, response, next);
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
    const endpoint = chatCompletionsEndpoint(cloudBridgeBaseUrl);
    const models = [
      env.CLOUD_BRIDGE_PRIMARY_MODEL || 'gemini-3.6-flash',
      env.CLOUD_BRIDGE_SECONDARY_MODEL || 'gemini-3.1-pro-preview',
      env.CLOUD_BRIDGE_TERTIARY_MODEL || 'gpt-5.4',
    ];
    providers.push(...models.map((model) => ({
      apiKey: env.CLOUD_BRIDGE_API_KEY,
      endpoint,
      model,
      pdfModel: env.CLOUD_BRIDGE_VISION_MODEL || 'gemini-3.6-flash',
      supportsDirectFileInput: true,
    })));
  }
  const profileModels: ProfileImportModels = {
    lite: env.CLOUD_BRIDGE_PROFILE_LITE_MODEL || 'gemini-3.1-flash-lite',
    mini: env.CLOUD_BRIDGE_PROFILE_MINI_MODEL || 'gpt-5-mini',
    standard: env.CLOUD_BRIDGE_PROFILE_STANDARD_MODEL || 'gpt-5.1',
    vision: env.CLOUD_BRIDGE_PROFILE_VISION_MODEL || 'gemini-3.6-flash',
    escalation: env.CLOUD_BRIDGE_PROFILE_ESCALATION_MODEL || 'gpt-5.6-terra',
  };
  return {
    plugins: [
      statePersistencePlugin(env.DATABASE_URL || ''),
      resumeGenerationPlugin(providers, profileModels),
      profileDirectoryPlugin(env.DIRECTORY_API_BASE_URL || 'https://feiwan.online/api'),
    ],
    esbuild: { jsx: 'automatic' },
  };
});
