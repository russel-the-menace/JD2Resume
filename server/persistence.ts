import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import type { Plugin } from 'vite';

const MAX_STATE_BYTES = 16_000_000;
const SESSION_COOKIE = 'jd2resume_session';

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

function sessionToken(request: IncomingMessage) {
  const cookie = request.headers.cookie || '';
  return cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || '';
}

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }

async function authenticatedAccountId(client: Sql, request: IncomingMessage) {
  const token = sessionToken(request);
  if (!token) return '';
  const rows = await client`
    SELECT account_id
    FROM account_sessions
    WHERE token_hash = ${tokenHash(token)} AND expires_at > NOW()
  `;
  return rows.length ? String(rows[0].account_id) : '';
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
      const sessionAccountId = await authenticatedAccountId(client, request);
      if (!sessionAccountId) {
        sendJson(response, 401, { error: 'Sign in required.' });
        return;
      }
      if (request.method === 'GET') {
        const url = new URL(request.url || '/', 'http://localhost');
        const accountId = url.searchParams.get('accountId');
        if (!validAccountId(accountId)) {
          sendJson(response, 400, { error: 'Provide a valid account id.' });
          return;
        }
        if (accountId !== sessionAccountId) {
          sendJson(response, 403, { error: 'You can only access your own account data.' });
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
        if (accountId !== sessionAccountId) {
          sendJson(response, 403, { error: 'You can only save your own account data.' });
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

  const authHandler = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const client = database();
    if (!client) { sendJson(response, 503, { error: 'Remote database persistence is not configured.' }); return; }
    try {
      if (request.method === 'GET' && request.url === '/session') {
        const token = sessionToken(request); const rows = token ? await client`SELECT a.id, a.username FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW()` : [];
        sendJson(response, 200, { account: rows.length ? { id: rows[0].id, username: rows[0].username } : null }); return;
      }
      if (request.method === 'GET' && request.url === '/accounts') {
        const token = sessionToken(request); const rows = token ? await client`SELECT a.id, a.username FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > NOW()` : [];
        if (!rows.length) { sendJson(response, 401, { error: 'Sign in required.' }); return; }
        const accounts = await client`SELECT id, username FROM accounts ORDER BY username`;
        sendJson(response, 200, { accounts }); return;
      }
      if (request.method === 'POST' && request.url === '/login') {
        const input = await readJsonBody(request); const username = typeof input.username === 'string' ? input.username.trim() : ''; const password = typeof input.password === 'string' ? input.password : '';
        const rows = await client`SELECT id, username FROM accounts WHERE username = ${username} AND password_hash = crypt(${password}, password_hash)`;
        if (!rows.length) { sendJson(response, 401, { error: 'Invalid username or password.' }); return; }
        const token = randomBytes(32).toString('base64url'); await client`INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (${tokenHash(token)}, ${rows[0].id}, NOW() + INTERVAL '30 days')`;
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`); sendJson(response, 200, { account: { id: rows[0].id, username: rows[0].username } }); return;
      }
      if (request.method === 'POST' && request.url === '/register') {
        const input = await readJsonBody(request); const username = typeof input.username === 'string' ? input.username.trim() : ''; const password = typeof input.password === 'string' ? input.password : '';
        if (!/^[a-zA-Z0-9_.-]{2,64}$/.test(username) || password.length < 4) { sendJson(response, 400, { error: 'Invalid username or password.' }); return; }
        const id = username.toLowerCase();
        const rows = await client`INSERT INTO accounts (id, username, password_hash) VALUES (${id}, ${username}, crypt(${password}, gen_salt('bf'))) ON CONFLICT DO NOTHING RETURNING id, username`;
        if (!rows.length) { sendJson(response, 409, { error: 'Username is already in use.' }); return; }
        const token = randomBytes(32).toString('base64url'); await client`INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (${tokenHash(token)}, ${id}, NOW() + INTERVAL '30 days')`;
        response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`); sendJson(response, 201, { account: { id, username } }); return;
      }
      if (request.method === 'POST' && request.url === '/change-password') {
        const input = await readJsonBody(request); const token = sessionToken(request); const currentPassword = typeof input.currentPassword === 'string' ? input.currentPassword : ''; const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
        if (newPassword.length < 4) { sendJson(response, 400, { error: 'Invalid password.' }); return; }
        const rows = token ? await client`UPDATE accounts SET password_hash = crypt(${newPassword}, gen_salt('bf')) WHERE id = (SELECT account_id FROM account_sessions WHERE token_hash = ${tokenHash(token)} AND expires_at > NOW()) AND password_hash = crypt(${currentPassword}, password_hash) RETURNING id` : [];
        if (!rows.length) { sendJson(response, 401, { error: 'Current password is incorrect.' }); return; } sendJson(response, 200, {}); return;
      }
      if (request.method === 'POST' && request.url === '/logout') { const token = sessionToken(request); if (token) await client`DELETE FROM account_sessions WHERE token_hash = ${tokenHash(token)}`; response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); sendJson(response, 200, {}); return; }
      next();
    } catch { sendJson(response, 503, { error: 'Authentication is temporarily unavailable.' }); }
  };

  const configureRoutes = (server: { middlewares: { use: Function } }) => {
    server.middlewares.use('/api/account-state', (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      void stateHandler(request, response, next);
    });
    server.middlewares.use('/api/auth', (request: IncomingMessage, response: ServerResponse, next: () => void) => { void authHandler(request, response, next); });
  };

  return {
    name: 'account-state-persistence-api',
    configureServer: configureRoutes,
    configurePreviewServer: configureRoutes,
  };
}
