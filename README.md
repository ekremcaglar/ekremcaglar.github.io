# ekremcaglar-github-io

Personal GitHub Pages site: an auto-updating index of public Pages projects, plus a self-contained Folio tool in a subfolder.

## What it does

`index.html` loads the GitHub API list of `ekremcaglar` repositories, keeps a short fallback list for when the API is rate-limited or unreachable, and always adds in-site pages from the `EXTRA` array (currently Folio). It presents cards for projects that have GitHub Pages enabled. The listing is cached in `localStorage`.

`folio/index.html` is a large, standalone page: an offline converter for Gemini, Grok, Claude, and ChatGPT material. It is described on the page as keeping tables, color, code, and footnotes, and turning formulas into editable Word equations, as well as converting Markdown to Word.

Live site: https://ekremcaglar.github.io/

## Hardware / platform

Static hosting on GitHub Pages. Any modern browser. The index calls `api.github.com` (optional; fallback data is built in). Folio is intended to work offline once the page is loaded.

## Tech stack

HTML, CSS, and JavaScript. No build step. `.nojekyll` so Pages serves the tree as-is.

## Project structure

- `index.html` — project index
- `folio/index.html` — Folio (offline LLM/Markdown-to-Word tool)
- `folio/latex-import.js` — Folio's LaTeX (.tex) import module (canonical source; embedded into `index.html`)
- `folio/tools/embed-latex-module.mjs` — copies the module into `index.html`
- `folio/tests/` — Node and headless-Chrome tests (regression baseline, .tex import, UI smoke)
- `.nojekyll`

## How to build / run

No build. Open `index.html` locally, or push `main` to the GitHub `ekremcaglar/ekremcaglar.github.io` repo to publish. This Forgejo copy does not deploy by itself.

## Folio: LaTeX (.tex) import

Folio opens `.tex` files (file picker or drag and drop) and also converts a pasted or typed source that starts with `\documentclass` or `\begin{document}`. The LaTeX is converted to Folio Markdown, so the existing preview, KaTeX math, and Word export (editable equations) apply unchanged. A `.tex` file without a preamble is wrapped in `\begin{document}` on open.

Supported: title block (`\title`, `\author` with `\and`, `\date`/`\today`), abstract, `\tableofcontents`, numbered `\section`..`\subsubsection` (and starred), run-in `\paragraph`, itemize/enumerate/description (nested), quote/quotation, `equation`/`align`/`gather`/`multline` with equation numbers (`\nonumber`, `\tag`), `\[ \]`, `$ $`, amsthm theorems from `\newtheorem` (shared and per-section counters, plain/definition/remark styles) and `proof`, booktabs/tabular/tabularx tables (including `\multicolumn` and multi-row headers), table/figure captions, `lstlisting` (language, caption, label), verbatim, `\verb`, footnotes, `\label`/`\ref`/`\eqref`/`\autoref`/`\pageref`, `\cite` with `thebibliography`, `\href`, `\url`, `\textcolor` with `\definecolor`, accents, dashes and quotes, and argument-free `\newcommand` macros.

Not a TeX engine: no page layout (so `\pageref` becomes the section), no small caps, no fancyhdr headers, no BibTeX `.bib` files, no `\input`/`\include`, no TikZ, no images (shown as placeholders), and macros with arguments are not expanded.

Isolation: `folio/latex-import.js` is embedded in an inert `<script type="text/plain" id="folio-latex-module">` block and only evaluated the first time LaTeX input appears. Markdown, HTML-paste, and image flows never run it, and "Save standalone" keeps it (still offline). After editing the module, run `node folio/tools/embed-latex-module.mjs`.

## Tests

```bash
node --test folio/tests/*.test.mjs                 # regression baseline + .tex import
node folio/tests/browser-smoke.mjs folio/index.html  # headless Chrome UI flows (JSON)
```

`regression.test.mjs` checks that every non-LaTeX fixture (and the built-in sample) gives the same preprocessing, AST, stats, and `.docx` parts as `main` at `8abd108`, before LaTeX import existed (`folio/tests/baseline/`). `browser-smoke.mjs` drives load, open, drop, HTML paste, image, export, save standalone, options, tabs, sample, clear, and `.tex` open. Run it on two revisions and compare the output. It needs Node 22+ and Google Chrome.

## Configuration

No environment variables. The GitHub user (`ekremcaglar`), the site repo name, the API URL, the fallback project list, and the `EXTRA` in-site pages are constants inside `index.html`. Cache key: `localStorage` key `ekremcaglar-pages-index-v1`.

## Status / known limitations

- The index is a client-side GitHub API reader; unauthenticated API calls can be rate-limited.
- The fallback list can go stale relative to GitHub.
- Folio is a single very large HTML file; this README does not document every Folio feature.
- LaTeX import is a converter, not a TeX engine (see above).

## Origin

Created 2026-11-12 (auto-updating index, then Folio). Imported to Forgejo during the 2026-11 migration.
