// Loads the app script of a Folio index.html into a Node VM (no real DOM) and
// returns its pure functions (parser, converters, .docx builder).
// Works for any Folio revision: functions that do not exist come back as null.
import fs from 'node:fs';
import vm from 'node:vm';

const EXPORTS = [
  'parseMarkdownDocument', 'preprocessMarkdownSource', 'convertHtmlToMarkdown', 'isHtmlFragment',
  'shouldConvertClipboardHtml', 'collectMathFormulas', 'countMathFormulas', 'isFormulaConvertible',
  'determineDocumentTitle', 'generateDocxZipBlob', 'buildDocumentXml', 'buildSummaryStatistics',
  'looksLikeLatexDocument', 'getLatexImporter', 'normalizeOpenedSource', 'DEFAULT_SAMPLE_MARKDOWN'
];

export function loadFolio(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const start = html.lastIndexOf('<script>') + '<script>'.length;
  const end = html.lastIndexOf('</script>');
  let code = html.slice(start, end);
  const hook = `\nglobalThis.__folio = {${EXPORTS.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : null`).join(', ')}};\n})();`;
  const replaced = code.replace(/\n\s*initializeFolio\(\);\s*\n\s*\}\)\(\);\s*$/, hook);
  if (replaced === code) throw new Error('could not hook the Folio app script');
  // Inert <script type="text/plain"> blocks (lazy modules) are exposed through a tiny document stub.
  const inert = {};
  for (const m of html.matchAll(/<script type="text\/plain" id="([^"]+)">([\s\S]*?)<\/script>/g)) inert[m[1]] = m[2];
  const documentStub = { getElementById: id => (id in inert ? { textContent: inert[id] } : null) };
  const ctx = { console, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, atob, btoa, URL };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(replaced, ctx, { filename: htmlPath });
  // Added after load so bundled libraries still see a DOM-less environment.
  ctx.document = documentStub;
  return ctx.__folio;
}

export async function docxBytes(folio, doc) {
  const r = await folio.generateDocxZipBlob(doc, folio.determineDocumentTitle(doc, 'Document'));
  return r instanceof Uint8Array ? r : new Uint8Array(await r.arrayBuffer());
}
