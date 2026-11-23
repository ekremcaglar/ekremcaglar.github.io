// Copies folio/latex-import.js verbatim into the inert
// <script type="text/plain" id="folio-latex-module"> block of folio/index.html.
//   node tools/embed-latex-module.mjs          write
//   node tools/embed-latex-module.mjs --check  exit 1 if index.html is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(dir, 'index.html');
const modulePath = path.join(dir, 'latex-import.js');
const OPEN = '<script type="text/plain" id="folio-latex-module">';
const CLOSE = '</script>';

const html = fs.readFileSync(htmlPath, 'utf8');
const moduleSrc = fs.readFileSync(modulePath, 'utf8');
if (/<\/script/i.test(moduleSrc)) throw new Error('latex-import.js must not contain "</script"');
const start = html.indexOf(OPEN);
if (start === -1) throw new Error(`index.html has no ${OPEN} block`);
const end = html.indexOf(CLOSE, start + OPEN.length);
const current = html.slice(start + OPEN.length, end);
const wanted = `\n${moduleSrc}`;
if (process.argv.includes('--check')) {
  if (current !== wanted) { console.error('index.html: embedded LaTeX module is out of date; run node tools/embed-latex-module.mjs'); process.exit(1); }
  console.log('embedded LaTeX module is up to date');
} else {
  fs.writeFileSync(htmlPath, html.slice(0, start + OPEN.length) + wanted + html.slice(end));
  console.log(`embedded ${moduleSrc.length} bytes into index.html`);
}
