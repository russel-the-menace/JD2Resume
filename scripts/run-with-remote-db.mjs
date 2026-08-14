import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnv(content) {
  return Object.fromEntries(content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

const root = process.cwd();
const configPath = resolve(root, '.server.env');
if (!existsSync(configPath)) {
  throw new Error('Create .server.env from .server.env.example before starting remote persistence.');
}

const config = { ...parseEnv(readFileSync(configPath, 'utf8')), ...process.env };
const host = config.SERVER_HOST;
const user = config.SERVER_SSH_USER || 'root';
const keyPath = resolve(root, config.SERVER_SSH_KEY || './yeatom-key.pem');
const localPort = config.JD2RESUME_DB_LOCAL_PORT || '55432';
if (!host || !existsSync(keyPath)) throw new Error('The remote database SSH configuration is incomplete.');

const sshBase = ['-i', keyPath, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes'];
const remoteEnv = parseEnv(execFileSync('ssh', [
  ...sshBase,
  `${user}@${host}`,
  'cat /opt/jd2resume/database/.env',
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));

const databaseUrl = `postgresql://${encodeURIComponent(remoteEnv.POSTGRES_USER)}:${encodeURIComponent(remoteEnv.POSTGRES_PASSWORD)}@127.0.0.1:${localPort}/${encodeURIComponent(remoteEnv.POSTGRES_DB)}`;
const tunnel = spawn('ssh', [
  ...sshBase,
  '-o', 'ExitOnForwardFailure=yes',
  '-N',
  '-L', `${localPort}:127.0.0.1:${remoteEnv.JD2RESUME_DB_PORT || '55432'}`,
  `${user}@${host}`,
], { stdio: 'inherit' });

await new Promise((resolveReady, reject) => {
  const timer = setTimeout(resolveReady, 600);
  tunnel.once('exit', (code) => {
    clearTimeout(timer);
    reject(new Error(`SSH database tunnel exited with code ${code}.`));
  });
});

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';
const viteArguments = mode === 'preview'
  ? ['preview', '--host', '127.0.0.1']
  : ['--host', '127.0.0.1'];
const vite = spawn(resolve(root, 'node_modules/.bin/vite'), viteArguments, {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});

const stop = (signal) => {
  if (!vite.killed) vite.kill(signal);
  if (!tunnel.killed) tunnel.kill(signal);
};
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));

const exitCode = await new Promise((resolveExit) => vite.once('exit', (code) => resolveExit(code || 0)));
if (!tunnel.killed) tunnel.kill('SIGTERM');
process.exitCode = exitCode;
