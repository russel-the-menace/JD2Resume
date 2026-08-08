import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_REQUEST_BYTES = 100_000;

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
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

function buildResumePrompt(input: Record<string, any>) {
  const language = input.language === 'chinese' ? 'Chinese' : 'English';
  return `You are a precise resume editor. Return valid JSON only.\n\nCreate a ${language} resume tailored to the job description. Use only factual information from the supplied profile and base resume. Do not invent employers, job titles, dates, degrees, certifications, metrics, skills, contact data, or achievements. You may reorganize and rewrite the supplied facts for relevance and clarity. When a required factual field is absent, return an empty string or an empty array.\n\nReturn exactly this JSON shape:\n{\n  "documentName": "string",\n  "resume": {\n    "basics": { "fullName": "string", "firstName": "string", "lastName": "string", "role": "string", "email": "string", "phone": "string", "location": "string", "gender": "string", "website": "string", "photoUrl": "string" },\n    "summary": "string",\n    "experience": [{ "id": 1, "role": "string", "company": "string", "location": "string", "start": "string", "end": "string", "current": false, "bullets": ["string"] }],\n    "education": [{ "id": 1, "school": "string", "degree": "string", "location": "string", "start": "string", "end": "string" }],\n    "skills": { "expertise": "comma-separated string", "tools": "comma-separated string" }\n  }\n}\n\nInput JSON:\n${JSON.stringify({
    profile: input.profile || {},
    baseResume: input.baseResume || {},
    jobDescription: input.jobDescription,
  })}`;
}

function resumeGenerationPlugin(apiKey: string, model: string): Plugin {
  const handler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    if (!apiKey) {
      sendJson(response, 503, { error: 'Resume generation is not configured on this server.' });
      return;
    }

    let input: Record<string, any>;
    try {
      input = await readJsonBody(request);
    } catch (error) {
      sendJson(response, error instanceof Error && error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, {
        error: 'Enter a valid job description.',
      });
      return;
    }

    if (
      typeof input.jobDescription !== 'string' ||
      input.jobDescription.trim().length < 20 ||
      !['english', 'chinese'].includes(input.language)
    ) {
      sendJson(response, 400, { error: 'Enter a job description with at least 20 characters.' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
        signal: controller.signal,
      });
      if (!upstream.ok) {
        sendJson(response, 502, { error: 'The resume service could not complete this request. Please try again.' });
        return;
      }
      const providerData = await upstream.json();
      const content = providerData?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        sendJson(response, 502, { error: 'The resume service returned an incomplete response. Please try again.' });
        return;
      }
      const generated = JSON.parse(cleanGeneratedJson(content));
      if (!generated || typeof generated !== 'object' || !generated.resume || typeof generated.resume !== 'object') {
        sendJson(response, 502, { error: 'The resume service returned an invalid response. Please try again.' });
        return;
      }
      sendJson(response, 200, generated);
    } catch {
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
  return {
    plugins: [resumeGenerationPlugin(env.DEEPSEEK_API_KEY || '', env.DEEPSEEK_MODEL || 'deepseek-v4-flash')],
    esbuild: {
      jsx: 'automatic',
    },
  };
});
