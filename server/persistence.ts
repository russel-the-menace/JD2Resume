import type { IncomingMessage, ServerResponse } from 'node:http';
import postgres, { type Sql } from 'postgres';
import type { Plugin } from 'vite';

const MAX_STATE_BYTES = 16_000_000;

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function validAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f/?#]/.test(value);
}

async function readJsonBody(request: IncomingMessage) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_STATE_BYTES) throw new Error('STATE_TOO_LARGE');
  }
  return JSON.parse(body || '{}');
}

function snapshotResponse(row: Record<string, any>) {
  return {
    accountId: row.account_id,
    revision: Number(row.revision),
    payload: row.payload,
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function statePersistencePlugin(databaseUrl: string): Plugin {
  let sql: Sql | null = null;
  const database = () => {
    if (!databaseUrl) return null;
    if (!sql) {
      sql = postgres(databaseUrl, {
        max: 2,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,
      });
    }
    return sql;
  };

  const stateHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const client = database();
    if (!client) {
      sendJson(response, 503, { error: 'Remote database persistence is not configured.' });
      return;
    }
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url || '/', 'http://localhost');
        const accountId = url.searchParams.get('accountId');
        if (!validAccountId(accountId)) {
          sendJson(response, 400, { error: 'Provide a valid account id.' });
          return;
        }
        const rows = await client`
          SELECT account_id, revision, payload, updated_at
          FROM account_snapshots
          WHERE account_id = ${accountId}
        `;
        if (!rows.length) {
          sendJson(response, 404, { error: 'No server snapshot exists for this account.' });
          return;
        }
        sendJson(response, 200, snapshotResponse(rows[0]));
        return;
      }

      if (request.method === 'PUT') {
        const input = await readJsonBody(request);
        const accountId = input?.accountId;
        const payload = input?.payload;
        const baseRevision = input?.baseRevision;
        if (!validAccountId(accountId) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
          sendJson(response, 400, { error: 'Provide a valid account snapshot.' });
          return;
        }

        const rows = baseRevision === null
          ? await client`
              INSERT INTO account_snapshots (account_id, revision, payload)
              VALUES (${accountId}, 1, ${client.json(payload)})
              ON CONFLICT (account_id) DO NOTHING
              RETURNING account_id, revision, payload, updated_at
            `
          : Number.isInteger(baseRevision) && baseRevision > 0
            ? await client`
                UPDATE account_snapshots
                SET payload = ${client.json(payload)}, revision = revision + 1, updated_at = NOW()
                WHERE account_id = ${accountId} AND revision = ${baseRevision}
                RETURNING account_id, revision, payload, updated_at
              `
            : [];

        if (!rows.length) {
          const current = await client`
            SELECT account_id, revision, payload, updated_at
            FROM account_snapshots
            WHERE account_id = ${accountId}
          `;
          sendJson(response, 409, {
            error: 'The server snapshot changed before this save completed.',
            current: current.length ? snapshotResponse(current[0]) : null,
          });
          return;
        }
        sendJson(response, 200, snapshotResponse(rows[0]));
        return;
      }

      next();
    } catch (error) {
      sendJson(response, error instanceof Error && error.message === 'STATE_TOO_LARGE' ? 413 : 503, {
        error: 'Server persistence is temporarily unavailable.',
      });
    }
  };

  const configureRoutes = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/account-state', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void stateHandler(request, response, next);
    });
  };

  return {
    name: 'account-state-persistence-api',
    configureServer: configureRoutes,
    configurePreviewServer: configureRoutes,
  };
}
