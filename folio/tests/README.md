# Folio tests

- `regression.test.mjs`: non-LaTeX behavior must match `baseline/snapshot-main-8abd108.json`, a snapshot of Folio before LaTeX import. It covers the built-in sample and `fixtures/regression/*`. The test also checks that the embedded module is in sync.
- `tex-import.test.mjs`: `.tex` detection and conversion of `fixtures/tex/sample.tex`, which must equal `sample.expected.md`. It also checks that every formula converts to a Word equation, export works, and other constructs convert.
- `browser-smoke.mjs`: drives every UI flow in headless Chrome over the DevTools protocol and prints JSON. Compare two revisions with: `node browser-smoke.mjs <old>/folio/index.html > a.json; node browser-smoke.mjs folio/index.html > b.json`.
- `snapshot.mjs <index.html> <out.json>`: regenerates a snapshot, for example a new baseline taken from a future `main`.

`fixtures/tex/sample-expected.pdf` is the LuaLaTeX output of `sample.tex`, for visual comparison.
