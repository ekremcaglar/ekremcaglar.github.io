// Produces a deterministic snapshot of Folio's non-LaTeX behavior for a given
// index.html: preprocessing, parsed AST, summary stats, formula convertibility,
// and every part of the exported .docx (hashed). Used for regression checks.
//   node snapshot.mjs <path/to/index.html> <out.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadFolio, docxBytes } from './lib/load-folio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// Minimal ZIP reader (stored + deflate) for the .docx parts.
function unzip(buf) {
  const parts = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString();
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const data = buf.slice(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize);
    parts[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return parts;
}

// Timestamps in docProps/core.xml change per run.
const normalizePart = (name, data) => (name === 'docProps/core.xml'
  ? Buffer.from(data.toString().replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, 'TIMESTAMP'))
  : data);

export async function snapshot(indexHtml) {
  const folio = loadFolio(indexHtml);
  const fixturesDir = path.join(here, 'fixtures', 'regression');
  const inputs = { 'DEFAULT_SAMPLE_MARKDOWN': folio.DEFAULT_SAMPLE_MARKDOWN };
  for (const f of fs.readdirSync(fixturesDir).sort()) {
    if (/\.(md|html|txt)$/.test(f)) inputs[f] = fs.readFileSync(path.join(fixturesDir, f), 'utf8');
  }
  const out = {};
  for (const [name, raw] of Object.entries(inputs)) {
    const entry = {};
    let text = raw;
    if (name.endsWith('.html')) {
      entry.shouldConvertClipboardHtml = folio.shouldConvertClipboardHtml(raw, '');
      text = folio.convertHtmlToMarkdown(raw);
      entry.htmlToMarkdown = text;
    }
    entry.preprocessed = folio.preprocessMarkdownSource(text);
    const doc = folio.parseMarkdownDocument(text);
    entry.ast = JSON.stringify(doc);
    entry.stats = folio.buildSummaryStatistics ? folio.buildSummaryStatistics(doc) : null;
    entry.formulas = folio.collectMathFormulas(doc).map(f => {
      const tex = typeof f === 'string' ? f : f.tex;
      return [tex, folio.isFormulaConvertible(tex)];
    });
    const parts = unzip(Buffer.from(await docxBytes(folio, doc)));
    entry.docx = Object.fromEntries(Object.keys(parts).sort().map(n => [n, sha(normalizePart(n, parts[n]))]));
    out[name] = entry;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [indexHtml, outFile] = process.argv.slice(2);
  const snap = await snapshot(path.resolve(indexHtml));
  fs.writeFileSync(outFile, JSON.stringify(snap, null, 1));
  console.log(`snapshot: ${Object.keys(snap).length} inputs -> ${outFile}`);
}
