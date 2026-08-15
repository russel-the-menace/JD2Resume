import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { PuppetResumePipeline } from './server/puppet-resume/pipeline';
import { fromPuppetResume, toPuppetRequest } from './server/puppet-resume/adapter';
import { extractTextJob } from './server/puppet-resume/jobExtraction';
import { bulletProjection, hasCompleteResponsibilities, promoteStructurePromptToSinglePass, structureProjection } from './server/puppet-resume/singlePass';
import { renderPdfFromPagePlan } from './server/puppet-resume/exportPdf';
import { ExportSessionStore } from './server/puppet-resume/exportSession';
import { canonicalize } from './src/resume-renderer/canonicalJson';
import { RENDERER_VERSION } from './src/resume-renderer/constants';
import type { PagePlanV2, RendererResumeDocument } from './src/resume-renderer/types';
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
  kind: 'gemini' | 'chat' | 'gateway';
  apiKey: string;
  endpoint: string;
  model: string;
  pdfModel?: string;
  supportsDirectFileInput: boolean;
  gatewayAudience?: 'chinese' | 'english';
  gatewayOptions?: Record<string, unknown>;
  gatewayResponseShape?: 'chat' | 'gemini';
  timeoutMs?: number;
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

function sendProviderFailure(response: ServerResponse, error: unknown, fallback: string, traceId = '') {
  const trace = traceId ? { traceId } : {};
  if (error instanceof Error && error.message === 'PROFILE_DATE_INTEGRITY_FAILED') {
    const errorDetails = (error as Error & { details?: unknown }).details;
    const details = isRecord(errorDetails) ? errorDetails : {};
    sendJson(response, 500, {
      error: 'Profile import stopped because locally detected dates were lost during structuring.',
      code: 'PROFILE_DATE_INTEGRITY_FAILED',
      traceId: stringValue(details.traceId),
    });
    return;
  }
  if (error instanceof Error && error.message === 'DIRECT_FILE_PROVIDER_UNAVAILABLE') {
    sendJson(response, 503, { error: 'File imports require a configured ChatGPT-compatible provider.', ...trace });
    return;
  }
  if (error instanceof Error && error.message === 'PROVIDER_AUTH_FAILED') {
    sendJson(response, 401, { error: 'The configured ChatGPT provider rejected its API key. Update CLOUD_BRIDGE_API_KEY.', ...trace });
    return;
  }
  if (error instanceof Error && error.message === 'PROVIDER_TIMEOUT') {
    sendJson(response, 504, { error: 'The file recognition provider took too long to respond. Please try again.', ...trace });
    return;
  }
  sendJson(response, 502, { error: fallback, ...trace });
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

function geminiRequestContent(userPrompt: string, attachment: SourceAttachment | null) {
  const parts: Record<string, any>[] = [{ text: userPrompt }];
  if (attachment) {
    parts.push({
      inline_data: {
        mime_type: attachment.mimeType,
        data: attachment.data,
      },
    });
  }
  return [{ role: 'user', parts }];
}

function generationProvidersForLanguage(providers: Provider[], language: 'chinese' | 'english') {
  return [...providers].sort((first, second) => {
    const rank = (provider: Provider) => provider.kind !== 'gateway'
      ? 1
      : provider.gatewayAudience === language
        ? 0
        : 2;
    const firstRank = rank(first);
    const secondRank = rank(second);
    return firstRank - secondRank;
  });
}

function localGatewayRoutes(value: string): Array<{ audience: 'chinese' | 'english'; options: Record<string, unknown>; responseShape: 'chat' | 'gemini' }> {
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((route) => {
      if (!isRecord(route) || !['chinese', 'english'].includes(route.audience) || !isRecord(route.options)) return [];
      return [{
        audience: route.audience as 'chinese' | 'english',
        options: route.options,
        responseShape: route.responseShape === 'gemini' ? 'gemini' : 'chat',
      }];
    });
  } catch {
    return [];
  }
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
  const isGemini = provider.kind === 'gemini';
  const isGateway = provider.kind === 'gateway';
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
      const endpoint = isGemini
        ? `${provider.endpoint.replace(/\/+$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`
        : isGateway
          ? chatCompletionsEndpoint(provider.endpoint)
          : provider.endpoint;
      const body = isGemini
        ? JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: geminiRequestContent(userPrompt, attachment),
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              maxOutputTokens: maxTokens,
            },
          })
        : isGateway
          ? JSON.stringify({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: modelMessageContent(userPrompt, null) },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.2,
              max_tokens: maxTokens,
              ...provider.gatewayOptions,
            })
          : requestBody;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...(isGemini ? {} : { Authorization: `Bearer ${provider.apiKey}` }),
          'Content-Type': 'application/json',
        },
        body,
        signal,
      });
      if (!upstream.ok) {
        const errorBody = await upstream.text().catch(() => '');
        if (upstream.status === 429 || /quota|resource_exhausted|rate.?limit/i.test(errorBody)) {
          throw new Error('PROVIDER_QUOTA_EXHAUSTED');
        }
        if (upstream.status === 401 || upstream.status === 403) {
          throw new Error('PROVIDER_AUTH_FAILED');
        }
        throw new Error(upstream.status === 408 || upstream.status === 425 || upstream.status === 429 || upstream.status >= 500
          ? 'UPSTREAM_RETRYABLE'
          : 'UPSTREAM_ERROR');
      }
      const providerData = await upstream.json();
      const usesGeminiResponse = isGemini || (isGateway && provider.gatewayResponseShape === 'gemini');
      const finishReason = stringValue(usesGeminiResponse
        ? providerData?.candidates?.[0]?.finishReason
        : providerData?.choices?.[0]?.finish_reason).toLowerCase();
      if (['length', 'max_tokens'].includes(finishReason)) throw new Error('OUTPUT_TRUNCATED');
      if (usesGeminiResponse && finishReason === 'max_tokens') throw new Error('OUTPUT_TRUNCATED');
      const content = usesGeminiResponse
        ? providerData?.candidates?.[0]?.content?.parts?.map((part: any) => stringValue(part.text)).filter(Boolean).join('')
        : providerData?.choices?.[0]?.message?.content;
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
  const googleProviders = providers.filter((provider) => provider.kind === 'gemini');
  const cloudFallback = providers.find((provider) => provider.kind === 'chat');
  const candidates = [...googleProviders, ...(cloudFallback ? [cloudFallback] : [])]
    .map((provider) => ({ ...provider, model: request.model, pdfModel: undefined }));
  let lastError: unknown = null;
  for (const provider of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const result = await requestJsonCompletion(
        provider,
        'Return valid JSON only. Do not use markdown or add commentary.',
        request.prompt,
        controller.signal,
        request.attachment || null,
        request.maxTokens,
        1,
      );
      console.log('[Profile Import] Module completed', { task: request.task, model: request.model, provider: provider.kind });
      return result;
    } catch (error) {
      lastError = error;
      console.warn('[Profile Import] Provider exhausted for module', {
        task: request.task,
        model: request.model,
        provider: provider.kind,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('PROFILE_PROVIDER_UNAVAILABLE');
}

async function requestFromProviders(
  providers: Provider[],
  systemPrompt: string,
  userPrompt: string,
  validate: (value: any) => boolean | Promise<boolean>,
  attachment: SourceAttachment | null = null,
  maxTokens = 4_000,
  timeoutMs = PROVIDER_TIMEOUT_MS,
  diagnostics: { traceId: string; stage: string; attempt?: number } | null = null,
) {
  const eligibleProviders = attachment
    ? providers.filter((provider) => provider.supportsDirectFileInput)
    : providers;
  if (!eligibleProviders.length) throw new Error('DIRECT_FILE_PROVIDER_UNAVAILABLE');
  let lastError: unknown = null;
  const unavailableEndpoints = new Set<string>();
  for (const provider of eligibleProviders) {
    const controller = new AbortController();
    const providerTimeout = setTimeout(() => controller.abort(), provider.timeoutMs || timeoutMs);
    try {
      const endpointKey = `${provider.kind}:${provider.endpoint}`;
      if (unavailableEndpoints.has(endpointKey)) {
        if (diagnostics) console.warn('[Resume Generation] Provider skipped', {
          ...diagnostics,
          provider: provider.kind,
          model: provider.model,
          reason: 'ENDPOINT_UNAVAILABLE',
        });
        continue;
      }
      const startedAt = Date.now();
      const result = await requestJsonCompletion(provider, systemPrompt, userPrompt, controller.signal, attachment, maxTokens);
      if (await validate(result)) {
        if (diagnostics) console.info('[Resume Generation] Provider completed', {
          ...diagnostics,
          provider: provider.kind,
          model: provider.model,
          durationMs: Date.now() - startedAt,
        });
        return result;
      }
    } catch (error) {
      lastError = error;
      if (error instanceof TypeError || (error instanceof Error && error.message === 'fetch failed')) {
        unavailableEndpoints.add(`${provider.kind}:${provider.endpoint}`);
      }
      if (diagnostics) console.warn('[Resume Generation] Provider failed', {
        ...diagnostics,
        provider: provider.kind,
        model: provider.model,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      });
    } finally {
      clearTimeout(providerTimeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('UPSTREAM_UNAVAILABLE');
}

async function extractPuppetJob(
  providers: Provider[],
  input: Record<string, any>,
  source: { text: string; attachment: SourceAttachment | null },
  traceId = '',
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
    PROVIDER_TIMEOUT_MS,
    traceId ? { traceId, stage: 'jd-extraction' } : null,
  ) as Promise<{ title: string; experience: string; description: string }>;
}

function createPuppetTextGenerator(providers: Provider[], traceId: string) {
  let singlePassResult: Record<string, any> | null = null;
  return async (prompt: string, validator: (text: string) => boolean | Promise<boolean>) => {
    const stage = /Phase 2/i.test(prompt) ? 'job-bullets' : 'resume-structure';
    if (stage === 'job-bullets' && singlePassResult) {
      const cached = JSON.stringify(bulletProjection(singlePassResult));
      try {
        if (await validator(cached)) return cached;
      } catch (error) {
        console.warn('[Resume Generation] Single-pass responsibilities require fallback', {
          traceId,
          error: error instanceof Error ? error.message : 'VALIDATION_FAILED',
        });
      }
      singlePassResult = null;
    }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const singlePass = stage === 'resume-structure';
        const generated = await requestFromProviders(
          providers,
          'Return valid JSON only. Do not use markdown or add commentary.',
          singlePass ? promoteStructurePromptToSinglePass(prompt) : prompt,
          async (value) => {
            if (!singlePass) return validator(JSON.stringify(value));
            if (!isRecord(value) || !hasCompleteResponsibilities(value)) return false;
            const valid = await validator(JSON.stringify(structureProjection(value)));
            if (valid) singlePassResult = value;
            return valid;
          },
          null,
          16_000,
          PROVIDER_TIMEOUT_MS,
          { traceId, stage, attempt },
        );
        return JSON.stringify(generated);
      } catch (error) {
        console.warn('[Resume Generation] Stage attempt failed', {
          traceId,
          stage,
          attempt,
          error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        });
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
    throw new Error('Puppet Resume generation exhausted all retries');
  };
}

function rendererDocumentFromStored(document: Record<string, any>): RendererResumeDocument {
  return {
    id: stringValue(document.id), documentName: stringValue(document.documentName),
    language: document.language === 'chinese' ? 'chinese' : 'english', data: document.data,
    template: 'profile', accent: stringValue(document.accent) || '#167c65',
    customSections: Array.isArray(document.customSections) ? document.customSections.map(stringValue) : [],
    customContent: isRecord(document.customContent) ? document.customContent : {},
    sectionOrder: Array.isArray(document.sectionOrder) ? document.sectionOrder.map(stringValue) : [],
    sectionOrderCustomized: document.sectionOrderCustomized === true,
  };
}
function serverSnapshotHash(document: RendererResumeDocument) { return `sha256:${createHash('sha256').update(canonicalize(document)).digest('hex')}`; }
function validPagePlan(value: unknown): value is PagePlanV2 { return isRecord(value) && Number(value.schemaVersion) === 2 && Array.isArray(value.pages) && Array.isArray(value.blockOrder) && typeof value.snapshotHash === 'string' && typeof value.rendererVersion === 'string'; }
function preservesLayoutLocks(original: Record<string, any>, candidate: Record<string, any>) {
  const originalBasics = isRecord(original.basics) ? original.basics : {}; const candidateBasics = isRecord(candidate.basics) ? candidate.basics : {};
  for (const key of ['fullName', 'firstName', 'lastName', 'email', 'phone', 'gender', 'website', 'wechat', 'linkedin', 'whatsapp', 'telegram']) {
    if (stringValue(originalBasics[key]) && stringValue(originalBasics[key]) !== stringValue(candidateBasics[key])) return false;
  }
  const originalExperience = Array.isArray(original.experience) ? original.experience : []; const candidateExperience = Array.isArray(candidate.experience) ? candidate.experience : [];
  return originalExperience.every((entry, index) => {
    const refined = candidateExperience[index];
    return isRecord(refined) && stringValue(entry?.company) === stringValue(refined.company) && stringValue(entry?.start) === stringValue(refined.start) && stringValue(entry?.end) === stringValue(refined.end);
  });
}

function resumeGenerationPlugin(providers: Provider[], profileModels: ProfileImportModels): Plugin {
  const renderSessions = new ExportSessionStore();
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
    const traceId = randomUUID();
    const startedAt = Date.now();
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
      console.info('[Resume Generation] Request started', { traceId, language: input.language, sourceType: source.attachment?.sourceType || 'text' });
      const generationProviders = generationProvidersForLanguage(providers, input.language);
      const job = source.attachment
        ? await extractPuppetJob(generationProviders, input, source, traceId)
        : extractTextJob(source.text, input.language);
      const pipeline = new PuppetResumePipeline(createPuppetTextGenerator(generationProviders, traceId));
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
      // Pagination is intentionally deferred to the user's browser renderer. The API only creates content.
      console.info('[Resume Generation] Request completed', { traceId, durationMs: Date.now() - startedAt, renderer: 'client-authority' });
      sendJson(response, 200, {
        documentName,
        resume,
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
      console.error('[Resume Generation] Request failed', {
        traceId,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      });
      sendProviderFailure(response, error, 'The resume service is unavailable. Please try again.', traceId);
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
      console.error('[Profile Import] Request failed', {
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
        details: isRecord(error) && isRecord(error.details) ? error.details : undefined,
      });
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

  const refineLayoutHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const input = await parseInput(request, response, next);
    if (!input) return;
    if (!['english', 'chinese'].includes(input.language) || !isRecord(input.data)) { sendJson(response, 400, { error: 'Provide a generated resume to refine.' }); return; }
    const traceId = randomUUID();
    try {
      const result = await requestFromProviders(
        providers,
        'Return valid JSON only. Preserve locked facts exactly. Do not add markdown or commentary.',
        `Refine this generated resume only to improve page-density after five layout attempts failed. Return {"data": ResumeData}. Preserve all basic identity/contact fields exactly. Preserve every work experience company, start, and end exactly. You may expand or rewrite the summary, responsibilities, and skills. Do not remove work experiences. Add concrete responsibilities where necessary so each natural A4 page can be filled without reducing font size below the renderer floor. Layout report: ${JSON.stringify(input.layoutReport || {})}\nResume data: ${JSON.stringify(input.data)}`,
        (value) => isRecord(value) && isRecord(value.data) && preservesLayoutLocks(input.data, value.data),
        null,
        8_000,
        PROVIDER_TIMEOUT_MS,
        { traceId, stage: 'layout-refinement' },
      );
      sendJson(response, 200, { data: result.data });
    } catch (error) { sendProviderFailure(response, error, 'The resume layout could not be refined automatically.', traceId); }
  };

  const pdfExportHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    try {
      const input = await readJsonBody(request);
      if (!isRecord(input.document) || !isRecord(input.document.renderState) || !validPagePlan(input.document.renderState.pagePlan)) {
        sendJson(response, 400, { error: 'Provide a finalized resume document.' });
        return;
      }
      const forwardedProtocol = Array.isArray(request.headers['x-forwarded-proto'])
        ? request.headers['x-forwarded-proto'][0]
        : request.headers['x-forwarded-proto'];
      const origin = `${forwardedProtocol || 'http'}://${request.headers.host}`;
      const document = rendererDocumentFromStored(input.document);
      const pagePlan = input.document.renderState.pagePlan as PagePlanV2;
      const hash = serverSnapshotHash(document);
      const renderState = input.document.renderState as Record<string, unknown>;
      if (renderState.status !== 'valid' || renderState.currentSnapshotHash !== pagePlan.snapshotHash || hash !== pagePlan.snapshotHash || pagePlan.rendererVersion !== RENDERER_VERSION) {
        sendJson(response, 409, { error: 'The resume changed before layout was finalized.', code: 'SNAPSHOT_HASH_MISMATCH' });
        return;
      }
      const session = renderSessions.create({ document, pagePlan, snapshotHash: hash, rendererVersion: RENDERER_VERSION, expiresAt: Date.now() + 60_000 });
      let pdf: Buffer;
      try { pdf = await renderPdfFromPagePlan(origin, session.token, pagePlan, hash, RENDERER_VERSION); }
      finally { renderSessions.delete(session.token); }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
      response.end(pdf);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : 'PDF generation failed.' });
    }
  };

  const configureRoutes = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/render-sessions', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      if (request.method !== 'GET') { next(); return; }
      const token = request.url?.replace(/^\/?/, '').split('?')[0] || '';
      const session = renderSessions.consume(token);
      if (!session) { sendJson(response, 404, { error: 'Render session expired.' }); return; }
      sendJson(response, 200, { document: session.document, pagePlan: session.pagePlan, snapshotHash: session.snapshotHash, rendererVersion: session.rendererVersion });
    });
    server.middlewares.use('/api/generate-resume', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void resumeHandler(request, response, next);
    });
    server.middlewares.use('/api/import-profile', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void profileImportHandler(request, response, next);
    });
    server.middlewares.use('/api/refine-resume-layout', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void refineLayoutHandler(request, response, next);
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
  if (env.GATEWAY_BASE_URL && env.GATEWAY_API_KEY) {
    providers.push(...localGatewayRoutes(env.GATEWAY_ROUTES).map((route) => ({
      kind: 'gateway' as const,
      apiKey: env.GATEWAY_API_KEY,
      endpoint: env.GATEWAY_BASE_URL,
      model: '',
      gatewayAudience: route.audience,
      gatewayOptions: route.options,
      gatewayResponseShape: route.responseShape,
      timeoutMs: Number(env.GATEWAY_TIMEOUT_MS) || undefined,
      supportsDirectFileInput: false,
    })));
  }
  const cloudBridgeBaseUrl = env.CLOUD_BRIDGE_API_BASE_URL || 'https://www.yunqiaoai.top';
  if (env.CLOUD_BRIDGE_API_KEY) {
    const endpoint = chatCompletionsEndpoint(cloudBridgeBaseUrl);
    const models = [...new Set([
      env.CLOUD_BRIDGE_SECONDARY_MODEL || 'gemini-3.6-flash',
      env.CLOUD_BRIDGE_PRIMARY_MODEL || 'gemini-3.7-flash',
      env.CLOUD_BRIDGE_TERTIARY_MODEL || 'gemini-3.1-pro-preview',
    ])];
    providers.push(...models.map((model) => ({
      kind: 'chat' as const,
      apiKey: env.CLOUD_BRIDGE_API_KEY,
      endpoint,
      model,
      pdfModel: env.CLOUD_BRIDGE_VISION_MODEL || 'gemini-3.6-flash',
      supportsDirectFileInput: true,
    })));
  }
  // The bridge is the low-latency generation path. Direct Google endpoints remain
  // fallbacks because they can be unreachable for tens of seconds on this network.
  const geminiBaseUrl = env.GOOGLE_AI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const generationModel = env.GEMINI_GENERATION_MODEL || 'gemini-3.7-flash';
  const googleKeys = [env.GOOGLE_AI_STUDIO_PRIMARY_KEY, env.GOOGLE_AI_STUDIO_SECONDARY_KEY].filter(Boolean);
  providers.push(...googleKeys.map((apiKey) => ({
    kind: 'gemini' as const,
    apiKey,
    endpoint: geminiBaseUrl,
    model: generationModel,
    supportsDirectFileInput: true,
  })));
  const profileModels: ProfileImportModels = {
    lite: env.GEMINI_PROFILE_LITE_MODEL || 'gemini-3.5-flash-lite',
    mini: env.GEMINI_PROFILE_FLASH_MODEL || 'gemini-3.6-flash',
    standard: env.GEMINI_PROFILE_ADVANCED_MODEL || 'gemini-3.7-flash',
    vision: env.GEMINI_PROFILE_VISION_MODEL || 'gemini-3.6-flash',
    escalation: env.GEMINI_PROFILE_PRO_MODEL || 'gemini-3.1-pro-preview',
  };
  return {
    build: {
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'index.html'),
          renderer: resolve(__dirname, 'renderer.html'),
        },
      },
    },
    plugins: [
      statePersistencePlugin(env.DATABASE_URL || ''),
      resumeGenerationPlugin(providers, profileModels),
      profileDirectoryPlugin(env.DIRECTORY_API_BASE_URL || 'https://feiwan.online/api'),
    ],
    esbuild: { jsx: 'automatic' },
  };
});
