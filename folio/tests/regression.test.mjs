// No-regression guard: every non-LaTeX input must produce exactly the same
// preprocessing, AST, stats, formula conversion and .docx parts as Folio main
// at 8abd108 (before LaTeX import existed).   Run: node --test folio/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshot } from './snapshot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('non-LaTeX behavior is byte-identical to the pre-LaTeX baseline', async () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(here, 'baseline', 'snapshot-main-8abd108.json'), 'utf8'));
  // JSON round-trip: values built inside the VM carry another realm's prototypes.
  const current = JSON.parse(JSON.stringify(await snapshot(path.join(here, '..', 'index.html'))));
  assert.deepEqual(Object.keys(current), Object.keys(baseline));
  for (const name of Object.keys(baseline)) assert.deepEqual(current[name], baseline[name], `regression in ${name}`);
});

test('embedded LaTeX module matches latex-import.js', () => {
  execFileSync(process.execPath, [path.join(here, '..', 'tools', 'embed-latex-module.mjs'), '--check'], { stdio: 'pipe' });
});
