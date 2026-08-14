import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const constants = await readFile(new URL('../src/resume-renderer/constants.ts', import.meta.url), 'utf8');
assert.match(app, /const LIBRARY_VERSION = 3/);
assert.match(app, /legacyLayoutManifest/);
assert.doesNotMatch(app, /RESUME_PAGE_HEIGHT|RESUME_PAGE_GAP/);
assert.match(constants, /PREVIEW_PAGE_GAP_PX/);
console.log('Renderer migration invariants verified.');
