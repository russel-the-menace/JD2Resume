#!/usr/bin/env node
import fs from 'node:fs';

const messageFile = process.argv[2];
if (!messageFile) {
  console.error('Usage: validate-commit-message <message-file>');
  process.exit(2);
}

const message = fs.readFileSync(messageFile, 'utf8').trim();
const firstLine = message.split(/\r?\n/u)[0].trim();
const conventional = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+/u;

// Git creates merge commits outside the Conventional Commits flow.
if (/^Merge /.test(firstLine) || conventional.test(firstLine)) process.exit(0);

console.error(`Invalid commit message: "${firstLine}"`);
console.error('Use: <type>(<optional-scope>): <description>');
console.error('Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert');
process.exit(1);
