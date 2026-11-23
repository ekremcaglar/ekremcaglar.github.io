// LaTeX (.tex) import tests. Run: node --test folio/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFolio } from './lib/load-folio.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const folio = loadFolio(path.join(here, '..', 'index.html'));
const sample = fs.readFileSync(path.join(here, 'fixtures', 'tex', 'sample.tex'), 'utf8');
const importer = () => folio.getLatexImporter();
const convert = (tex, date = new Date(2026, 10, 23)) => importer().convertLatexToMarkdown(tex, { date });

test('detection only fires when the source starts with \\documentclass or \\begin{document}', () => {
  assert.equal(folio.looksLikeLatexDocument(sample), true);
  assert.equal(folio.looksLikeLatexDocument('% comment\n\n\\documentclass{article}\n'), true);
  assert.equal(folio.looksLikeLatexDocument('\\begin{document}\nHi\n\\end{document}'), true);
  assert.equal(folio.looksLikeLatexDocument('Prose mentioning \\documentclass{article}.'), false);
  assert.equal(folio.looksLikeLatexDocument('```latex\n\\documentclass{article}\n```'), false);
  assert.equal(folio.looksLikeLatexDocument('# Title\n\\begin{document}'), false);
});

test('sample.tex converts to the reviewed Markdown', () => {
  assert.equal(convert(sample), fs.readFileSync(path.join(here, 'fixtures', 'tex', 'sample.expected.md'), 'utf8'));
});

test('sample.tex renders through the normal Folio pipeline', () => {
  const doc = folio.parseMarkdownDocument(sample);
  const kinds = {};
  for (const b of doc.blocks) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  assert.deepEqual(kinds, { heading: 18, paragraph: 33, quote: 2, list: 4, rule: 1, math: 5, table: 2, code: 1 });
  const formulas = folio.collectMathFormulas(doc).map(f => (typeof f === 'string' ? f : f.tex));
  assert.equal(formulas.length, 46);
  for (const tex of formulas) assert.ok(folio.isFormulaConvertible(tex), `not convertible to a Word equation: ${tex}`);
  const md = convert(sample);
  assert.ok(!md.includes('??'), 'unresolved \\ref');
  for (const needle of ['## 1\u2003Typography and Document Structure', '#### 1.1.1\u2003Paragraph-Level Headings',
    '\\tag{1}', '\\tag{5}', '**Theorem 4.2 (Uniqueness of Limits).**', '*Proof.*', '**Table 1:**', '<th colspan="3"',
    '**Listing 1:**', '```python', 'Equation\u00a0(4)', 'Knuth [1], Lamport [2], and Kopka and Daly [3]', '[^1]: Footnotes provide',
    '**Contents**', 'November 23, 2026', 'Jane Doe · John Smith']) {
    assert.ok(md.includes(needle), `missing: ${needle}`);
  }
});

test('the .docx export works for LaTeX input', async () => {
  const doc = folio.parseMarkdownDocument(sample);
  const bytes = await folio.generateDocxZipBlob(doc, folio.determineDocumentTitle(doc, 'Document'));
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
  assert.ok(buf.length > 5000);
  assert.equal(folio.determineDocumentTitle(doc, 'Document'), 'A Comprehensive Sample Document');
});

test('constructs beyond the sample', () => {
  const md = convert(String.raw`\documentclass{article}
\newcommand{\R}{\mathbb{R}}
\begin{document}
\section*{Intro}
Text with \href{https://example.com}{a link}, \url{https://x.org}, \textcolor{red}{red}, caf\'e, 50\% and \verb|a_b|.
\begin{itemize}
  \item[$\star$] custom marker
  \item plain
\end{itemize}
\begin{gather}
a = b \label{eq:a}\\
c = d
\end{gather}
See \eqref{eq:a} and \autoref{eq:a}. $x \in \R$
\begin{tabular}{|l|r|}
\hline
A & B \\ \hline
1 & 2 \\
\end{tabular}
\begin{verbatim}
raw \textbf{kept}
\end{verbatim}
\end{document}`);
  assert.match(md, /^## Intro$/m);
  assert.ok(md.includes('[a link](https://example.com)'));
  assert.ok(md.includes('<https://x.org>'));
  assert.ok(md.includes('café'));
  assert.ok(md.includes('50%'));
  assert.ok(md.includes('`a_b`'));
  assert.ok(md.includes('- $\\star$ custom marker'));
  assert.ok(md.includes('\\begin{gather*}'));
  assert.ok(md.includes('See (1) and Equation (1).'));
  assert.ok(md.includes('$x \\in \\mathbb{R}$'));
  assert.ok(md.includes('| A | B |'));
  assert.ok(md.includes('| :--- | ---: |'));
  assert.ok(md.includes('```\nraw \\textbf{kept}\n```'));
});

test('a .tex fragment is wrapped on open; other files are untouched', () => {
  const wrapped = folio.normalizeOpenedSource('notes.tex', 'Hello $x$.');
  assert.ok(folio.looksLikeLatexDocument(wrapped));
  assert.equal(folio.normalizeOpenedSource('notes.md', 'Hello $x$.'), 'Hello $x$.');
  assert.equal(folio.normalizeOpenedSource('paper.tex', sample), sample);
});
