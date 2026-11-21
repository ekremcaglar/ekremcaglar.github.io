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
- `.nojekyll`

## How to build / run

No build. Open `index.html` locally, or push `main` to the GitHub `ekremcaglar/ekremcaglar.github.io` repo to publish. This Forgejo copy does not deploy by itself.

## Configuration

No environment variables. The GitHub user (`ekremcaglar`), the site repo name, the API URL, the fallback project list, and the `EXTRA` in-site pages are constants inside `index.html`. Cache key: `localStorage` key `ekremcaglar-pages-index-v1`.

## Status / known limitations

- The index is a client-side GitHub API reader; unauthenticated API calls can be rate-limited.
- The fallback list can go stale relative to GitHub.
- Folio is a single very large HTML file; this README does not document every Folio feature.

## Origin

Created 2026-11-12 (auto-updating index, then Folio). Imported to Forgejo during the 2026-11 migration.
