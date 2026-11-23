// Headless-Chrome smoke test of Folio's UI flows. Instruments a temporary copy
// of index.html, drives each flow (load, open, drop, paste, image, export,
// save standalone, options, tabs, sample, clear, and .tex when present) and
// prints a JSON result. Compare the output of two revisions to spot regressions.
//   node browser-smoke.mjs <path/to/index.html> [--runs 5] [--chrome /usr/bin/google-chrome]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const indexHtml = path.resolve(args[0] ?? path.join(here, '..', 'index.html'));
const runs = Number(args[args.indexOf('--runs') + 1] || 0) || 5;
const chrome = args.includes('--chrome') ? args[args.indexOf('--chrome') + 1] : (process.env.CHROME || 'google-chrome');
const fx = name => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');

const fixtures = {
  md: fx('regression/chat-chatgpt.md'),
  md2: fx('regression/math-envs.md'),
  html: fx('regression/gemini.html'),
  tex: fx('tex/sample.tex'),
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg=='
};

const errorTrap = `<script>window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message)));
const __ce=console.error;console.error=(...a)=>{__errors.push(a.map(String).join(' '));__ce(...a)};
try{localStorage.clear()}catch{};window.__t0=performance.now();</script>`;

const driver = `(async () => {
  const FX = ${JSON.stringify(fixtures)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = id => document.getElementById(id);
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const blobs = [];
  const origCreate = URL.createObjectURL;
  URL.createObjectURL = b => { blobs.push(b); return origCreate.call(URL, b); };
  const blobTexts = [];
  const OrigBlob = window.Blob;
  window.Blob = class extends OrigBlob { constructor(parts, opts) { super(parts, opts); if (parts && parts.every(x => typeof x === 'string')) blobTexts.push(parts.join('')); } };
  const downloads = [];
  HTMLAnchorElement.prototype.click = function () { downloads.push(this.download || this.href); };
  window.confirm = () => true;
  const state = () => ({
    status: $('status').textContent,
    count: $('count').textContent,
    meta: $('preview-meta').textContent,
    previewHash: hash($('preview').textContent),
    previewBlocks: $('preview').children.length,
    headings: [...$('preview').querySelectorAll('h1,h2,h3,h4')].slice(0, 6).map(h => h.textContent.trim()),
    katex: $('preview').querySelectorAll('.katex').length,
    mathErrors: $('preview').querySelectorAll('.math-error').length,
    tables: $('preview').querySelectorAll('table').length,
    editorHash: hash($('editor').value),
    editorLen: $('editor').value.length,
    activeTab: document.querySelector('[aria-selected="true"]')?.id ?? null
  });
  const fileOf = (name, text, type) => new File([text], name, { type });
  const pngFile = () => { const b = atob(FX.png); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new File([u], 'dot.png', { type: 'image/png' }); };
  const waitChange = async (before, ms = 5000) => { const t = Date.now(); while ($('editor').value === before && Date.now() - t < ms) await sleep(25); await sleep(300); };
  const openFile = async file => { const before = $('editor').value; const dt = new DataTransfer(); dt.items.add(file); $('file').files = dt.files; $('file').dispatchEvent(new Event('change')); await waitChange(before); };
  const R = {};
  await sleep(800);
  R.load = { ...state(), readyMs: Math.round(window.__readyAt - window.__t0) };
  await openFile(fileOf('chat.md', FX.md, 'text/markdown'));
  R.openMarkdown = state();
  const dtDrop = new DataTransfer(); dtDrop.items.add(fileOf('math.md', FX.md2, 'text/markdown'));
  const dropEv = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dtDrop });
  const beforeDrop = $('editor').value; $('app').dispatchEvent(dropEv); await waitChange(beforeDrop);
  R.dropMarkdown = state();
  $('editor').value = ''; $('editor').dispatchEvent(new Event('input')); await sleep(400);
  const dtPaste = new DataTransfer(); dtPaste.setData('text/html', FX.html); dtPaste.setData('text/plain', 'Gemini answer');
  $('editor').focus();
  $('editor').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dtPaste })); await sleep(600);
  R.pasteHtml = state();
  await openFile(pngFile());
  await sleep(600);
  R.openImage = { ...state(), hasDataImage: $('editor').value.includes('data:image/png') };
  await openFile(fileOf('chat.md', FX.md, 'text/markdown'));
  blobs.length = 0; downloads.length = 0;
  $('export').click(); await sleep(1500);
  R.exportDocx = { downloads: [...downloads], blobs: blobs.map(b => ({ size: b.size, type: b.type })), status: $('status').textContent };
  blobs.length = 0; downloads.length = 0; blobTexts.length = 0;
  $('save').click(); await sleep(600);
  const saved = blobTexts.find(t => t.startsWith('<!DOCTYPE html>')) || '';
  R.saveStandalone = { downloads: [...downloads], size: saved.length, hasAppScript: saved.includes('initializeFolio'), hasLatexModule: saved.includes('id="folio-latex-module"') };
  $('opt-font').value = 'sans'; $('opt-font').dispatchEvent(new Event('change'));
  $('opt-page').value = $('opt-page').options[$('opt-page').options.length - 1].value; $('opt-page').dispatchEvent(new Event('change'));
  await sleep(400);
  R.options = state();
  $('tab-write').click(); await sleep(100); const w = state().activeTab; $('tab-read').click(); await sleep(100);
  R.tabs = { write: w, read: state().activeTab };
  $('sample').click(); await sleep(600);
  R.sampleButton = state();
  $('clear-btn').click(); await sleep(600);
  R.clearButton = state();
  if (($('file').getAttribute('accept') || '').includes('.tex')) {
    await openFile(fileOf('sample.tex', FX.tex, 'application/x-tex'));
    await sleep(600);
    R.openTex = { ...state(), unresolvedRefs: ($('preview').textContent.match(/\\?\\?/g) || []).length, editorStartsWithTex: $('editor').value.startsWith('\\\\documentclass') };
    await openFile(fileOf('frag.tex', 'Fragment with $x^2$ and \\\\textbf{bold}.', 'application/x-tex'));
    R.openTexFragment = { ...state(), text: $('preview').textContent.trim().slice(0, 80) };
  }
  R.accept = $('file').getAttribute('accept');
  R.errors = window.__errors;
  return JSON.stringify(R);
})()`;

function instrument(html) {
  let out = html.replace(/<head>/i, `<head>${errorTrap}`);
  // Ready time: right after initializeFolio() returns.
  out = out.replace(/\n(\s*)initializeFolio\(\);(\s*\n\s*\}\)\(\);\s*<\/script>)/, '\n$1initializeFolio(); window.__readyAt = performance.now();$2');
  return out;
}

async function runOnce(file) {
  // Drives headless Chrome over the DevTools protocol (real time, not virtual time).
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let version = null;
    for (let t = 0; t < 100 && !version; t++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    if (!version) throw new Error('Chrome DevTools endpoint did not come up');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg);
    };
    const send = (method, params = {}) => new Promise(res => { id += 1; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
    await send('Page.enable');
    await send('Page.navigate', { url: `file://${file}` });
    for (let t = 0; t < 200 && !events.some(e => e.method === 'Page.loadEventFired'); t++) await new Promise(r => setTimeout(r, 50));
    const r = await send('Runtime.evaluate', { expression: driver, awaitPromise: true, returnByValue: true, timeout: 120000 });
    ws.close();
    if (r.result?.exceptionDetails) throw new Error(`driver failed: ${JSON.stringify(r.result.exceptionDetails).slice(0, 500)}`);
    return JSON.parse(r.result.result.value);
  } finally {
    proc.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 300));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-smoke-'));
const testFile = path.join(tmp, 'index.html');
fs.writeFileSync(testFile, instrument(fs.readFileSync(indexHtml, 'utf8')));
const results = [];
for (let r = 0; r < runs; r++) results.push(await runOnce(testFile));
fs.rmSync(tmp, { recursive: true, force: true });
const ready = results.map(r => r.load.readyMs).sort((a, b) => a - b);
const first = results[0];
for (const r of results) delete r.load.readyMs;
const stable = results.every(r => JSON.stringify(r) === JSON.stringify(first));
console.log(JSON.stringify({ file: indexHtml, runs, stableAcrossRuns: stable, readyMsMedian: ready[Math.floor(ready.length / 2)], readyMs: ready, result: first }, null, 1));
