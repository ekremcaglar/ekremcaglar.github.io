/*
 * Folio LaTeX (.tex) import module.
 *
 * Converts an article-style LaTeX source into Folio Markdown (sections with
 * numbering, table of contents, title block, abstract, lists, amsmath displays
 * with equation numbers, amsthm theorems/proofs, booktabs/tabularx tables incl.
 * \multicolumn, listings, footnotes, \ref/\eqref/\autoref, \cite and
 * thebibliography). Math stays LaTeX so Folio's KaTeX preview and Word
 * equation export handle it. This is a converter, not a TeX engine.
 *
 * Isolation: this file is the canonical source. tools/embed-latex-module.mjs
 * copies it verbatim into an inert <script type="text/plain"
 * id="folio-latex-module"> block in index.html, which Folio only evaluates the
 * first time a LaTeX document is opened or pasted. Markdown/HTML flows never
 * parse or run this code, and "Save standalone" keeps it (still offline).
 *
 * API: FolioLatexModule.create(host) -> { isLatexDocument, convertLatexToMarkdown }
 *   host.parseColorToHex(name)        Folio's CSS color helper
 *   host.SUPPORTED_MATH_ENVIRONMENTS  Set of math environments Folio renders
 */
(function (root) {
  'use strict';

function createFolioLatexImporter(host) {
  // Same rule as the host's looksLikeLatexDocument(): the source must *start*
  // (after blank lines and % comments) with \documentclass or \begin{document}.
  function isLatexDocument(str) {
    return /^(?:[ \t]*(?:%[^\n]*)?\n)*[ \t]*\\(?:documentclass(?![a-zA-Z])|begin\{document\})/.test(str.replace(/^\uFEFF/, ''));
  }

  const LATEX_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  const LATEX_SYMBOLS = {
    '&': '&', '%': '%', '$': '\\$', '#': '#', '_': '\\_', '{': '{', '}': '}',
    ',': '\u2009', ';': '\u2005', ':': '\u2005', '!': '', ' ': ' ', '/': '', '-': '',
    '@': '', '\\': '<br>', "'": '', '`': '', '"': '', '^': '', '~': ''
  };

  const LATEX_WORD_SYMBOLS = {
    LaTeX: 'LaTeX', TeX: 'TeX', LaTeXe: 'LaTeX2e', ldots: '…', dots: '…', textellipsis: '…',
    textbackslash: '\\\\', textasciitilde: '~', textasciicircum: '^', textbar: '\\|',
    textless: '\\<', textgreater: '>', textendash: '–', textemdash: '—', textquoteleft: '‘',
    textquoteright: '’', textquotedblleft: '“', textquotedblright: '”', textbullet: '•',
    textdegree: '°', copyright: '©', textcopyright: '©', textregistered: '®', texttrademark: '™',
    S: '§', P: '¶', dag: '†', ddag: '‡', pounds: '£', euro: '€', quad: '\u2003', qquad: '\u2003\u2003',
    enspace: '\u2002', thinspace: '\u2009', nobreakspace: '\u00a0', newline: '\n', linebreak: '\n',
    ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł',
    i: 'ı', j: 'ȷ', checkmark: '✓', hfill: ' ', hfil: ' ', break: '', par: '\n\n'
  };

  const LATEX_ACCENTS = { '`': '\u0300', "'": '\u0301', '^': '\u0302', '"': '\u0308', '~': '\u0303',
    '=': '\u0304', '.': '\u0307', u: '\u0306', v: '\u030C', H: '\u030B', c: '\u0327', k: '\u0328', r: '\u030A' };

  // Declarations / layout commands whose arguments are dropped entirely.
  const LATEX_DROP_WITH_ARGS = {
    vspace: 1, hspace: 1, label: 1, setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2,
    pagestyle: 1, thispagestyle: 1, color: 1, pagenumbering: 1, addcontentsline: 3, bibliographystyle: 1,
    index: 1, glossary: 1, phantom: 1, hypersetup: 1, lstset: 1, definecolor: 3, renewcommand: 2,
    newcommand: 2, providecommand: 2, theoremstyle: 1, newtheorem: 2, usepackage: 1, documentclass: 1,
    fancyhead: 1, fancyfoot: 1, fancyhf: 0, graphicspath: 1, babelfont: 2, babelprovide: 1,
    include: 1, input: 1, bibliography: 1, nocite: 1, captionsetup: 1, linespread: 1, enlargethispage: 1
  };

  const LATEX_DROP_NO_ARGS = new Set([
    'centering', 'raggedright', 'raggedleft', 'noindent', 'indent', 'newpage', 'clearpage',
    'cleardoublepage', 'pagebreak', 'nopagebreak', 'bigskip', 'medskip', 'smallskip', 'maketitle',
    'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge',
    'Huge', 'normalfont', 'rmfamily', 'sffamily', 'ttfamily', 'bfseries', 'mdseries', 'itshape',
    'upshape', 'slshape', 'scshape', 'em', 'protect', 'relax', 'leavevmode', 'selectfont', 'hline',
    'toprule', 'midrule', 'bottomrule', 'appendix', 'frontmatter', 'mainmatter', 'backmatter',
    'tableofcontents', 'listoffigures', 'listoftables', 'printbibliography', 'onecolumn', 'twocolumn',
    'sloppy', 'fussy', 'strut', 'null', 'item', 'and', 'hrule', 'nonumber', 'notag', 'today'
  ]);

  const LATEX_VERBATIM_ENVS = new Set(['lstlisting', 'verbatim', 'verbatim*', 'minted', 'Verbatim', 'comment', 'filecontents']);
  const LATEX_LIST_ENVS = new Set(['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'inparaenum', 'asparaenum']);
  const LATEX_FLOAT_ENVS = new Set(['table', 'table*', 'figure', 'figure*', 'wraptable', 'wrapfigure', 'subfigure', 'minipage']);
  const LATEX_DISPLAY_MATH_ENVS = new Set(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
    'multline', 'multline*', 'flalign', 'flalign*', 'alignat', 'alignat*', 'eqnarray', 'eqnarray*', 'displaymath', 'math']);

  function latexReadGroup(src, i, open = '{', close = '}') {
    // src[i] must be `open`; returns { content, end } where end is the index after the closing char.
    let depth = 0;
    for (let k = i; k < src.length; k++) {
      const ch = src[k];
      if (ch === '\\') { k += 1; continue; }
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) return { content: src.slice(i + 1, k), end: k + 1 };
      }
    }
    return { content: src.slice(i + 1), end: src.length };
  }

  function latexSkipSpaces(src, i, allowNewline = true) {
    let k = i;
    let newlines = 0;
    while (k < src.length && /\s/.test(src[k])) {
      if (src[k] === '\n') { newlines += 1; if (!allowNewline || newlines > 1) break; }
      k += 1;
    }
    return k;
  }

  // Reads optional [..] args then n mandatory {..} args after a command.
  function latexReadArgs(src, i, nMandatory, maxOptional = 1) {
    const optional = [];
    const args = [];
    let k = i;
    for (let o = 0; o < maxOptional; o++) {
      const p = latexSkipSpaces(src, k);
      if (src[p] === '[') {
        const g = latexReadGroup(src, p, '[', ']');
        optional.push(g.content);
        k = g.end;
      } else break;
    }
    for (let n = 0; n < nMandatory; n++) {
      const p = latexSkipSpaces(src, k);
      if (src[p] === '{') {
        const g = latexReadGroup(src, p);
        args.push(g.content);
        k = g.end;
      } else if (p < src.length && src[p] === '\\') {
        const m = /^\\(?:[a-zA-Z@]+|.)/.exec(src.slice(p));
        args.push(m[0]);
        k = p + m[0].length;
      } else if (p < src.length) {
        args.push(src[p]);
        k = p + 1;
      } else {
        args.push('');
      }
    }
    return { optional, args, end: k };
  }

  function latexFindEnvEnd(src, name, from) {
    // Returns { bodyEnd, end } for the matching \end{name}, honoring nesting.
    const esc = name.replace(/[*]/g, '\\*');
    const re = new RegExp(`\\\\(begin|end)\\{${esc}\\}`, 'g');
    re.lastIndex = from;
    let depth = 1;
    let m;
    while ((m = re.exec(src))) {
      depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) return { bodyEnd: m.index, end: m.index + m[0].length };
    }
    return { bodyEnd: src.length, end: src.length };
  }

  function latexStripComments(src) {
    return src.split('\n').map(line => {
      for (let k = 0; k < line.length; k++) {
        if (line[k] === '\\') { k += 1; continue; }
        if (line[k] === '%') return line.slice(0, k) + '\u0000COMMENT';
      }
      return line;
    }).join('\n')
      // A comment eats the newline too (TeX semantics), but keep paragraph breaks.
      .replace(/\u0000COMMENT\n(?!\s*\n)/g, '')
      .replace(/\u0000COMMENT/g, '');
  }

  // Splits on a top-level separator (`\\` for rows, `&` for cells, `\item` for lists).
  function latexSplitTopLevel(src, kind) {
    const parts = [];
    let depth = 0;
    let envDepth = 0;
    let last = 0;
    for (let k = 0; k < src.length; k++) {
      const ch = src[k];
      if (ch === '\\') {
        const rest = src.slice(k);
        if (/^\\begin\{/.test(rest)) envDepth += 1;
        else if (/^\\end\{/.test(rest)) envDepth -= 1;
        if (depth === 0 && envDepth === 0) {
          if (kind === 'row' && rest.startsWith('\\\\')) {
            parts.push(src.slice(last, k));
            k += 1;
            // optional spacing argument: \\[2pt]
            const p = latexSkipSpaces(src, k + 1);
            if (src[p] === '[') k = latexReadGroup(src, p, '[', ']').end - 1;
            last = k + 1;
            continue;
          }
          if (kind === 'item' && /^\\item(?![a-zA-Z])/.test(rest)) {
            parts.push(src.slice(last, k));
            last = k + 5;
            k += 4;
            continue;
          }
        }
        k += 1;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '&' && kind === 'cell' && depth === 0 && envDepth === 0) {
        parts.push(src.slice(last, k));
        last = k + 1;
      }
    }
    parts.push(src.slice(last));
    return parts;
  }

  function latexFormatDate(d = new Date()) {
    return `${LATEX_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function latexParseColumnSpec(spec) {
    const aligns = [];
    let k = 0;
    while (k < spec.length) {
      const ch = spec[k];
      if (ch === 'l') aligns.push('left');
      else if (ch === 'c') aligns.push('center');
      else if (ch === 'r') aligns.push('right');
      else if (ch === 'X' || ch === 'L' || ch === 'J') aligns.push('left');
      else if (ch === 'C') aligns.push('center');
      else if (ch === 'R') aligns.push('right');
      else if (ch === 'S') aligns.push('center');
      else if (ch === 'p' || ch === 'm' || ch === 'b') {
        aligns.push('left');
        if (spec[k + 1] === '{') { k = latexReadGroup(spec, k + 1).end; continue; }
      } else if ((ch === '@' || ch === '!' || ch === '>' || ch === '<') && spec[k + 1] === '{') {
        k = latexReadGroup(spec, k + 1).end;
        continue;
      } else if (ch === '*' && spec[k + 1] === '{') {
        const count = latexReadGroup(spec, k + 1);
        const body = latexReadGroup(spec, count.end);
        const n = parseInt(count.content, 10) || 1;
        for (let r = 0; r < n; r++) aligns.push(...latexParseColumnSpec(body.content));
        k = body.end;
        continue;
      }
      k += 1;
    }
    return aligns;
  }

  function convertLatexToMarkdown(rawSource, options = {}) {
    const today = options.date instanceof Date ? options.date : new Date();
    let src = rawSource.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

    // --- Protect verbatim content before comment stripping --------------------
    const verbatims = [];
    src = src.replace(/\\begin\{(lstlisting|verbatim\*?|minted|Verbatim|comment)\}((?:\[[^\]\n]*\])?(?:\{[^}\n]*\})?)([\s\S]*?)\\end\{\1\}/g,
      (_, env, opts, body) => {
        verbatims.push({ env, opts, body });
        return `\\begin{folioverbatim}{${verbatims.length - 1}}\\end{folioverbatim}`;
      });
    src = src.replace(/\\(?:verb|lstinline)\*?([^a-zA-Z\s{])([^\n]*?)\1/g, (_, d, body) => {
      verbatims.push({ env: 'inline', body });
      return `\\folioinlineverb{${verbatims.length - 1}}`;
    });
    src = latexStripComments(src);

    // --- Preamble -------------------------------------------------------------
    const docStart = src.indexOf('\\begin{document}');
    const preamble = docStart === -1 ? '' : src.slice(0, docStart);
    let body = docStart === -1 ? src : src.slice(docStart + '\\begin{document}'.length);
    const docEnd = body.indexOf('\\end{document}');
    if (docEnd !== -1) body = body.slice(0, docEnd);

    const meta = { title: '', author: '', date: null };
    const findPreambleCmd = (text, name) => {
      const re = new RegExp(`\\\\${name}(?![a-zA-Z])`, 'g');
      let m;
      let found = null;
      while ((m = re.exec(text))) {
        const a = latexReadArgs(text, m.index + m[0].length, 1, 1);
        found = a.args[0];
      }
      return found;
    };
    for (const scope of [preamble, body]) {
      meta.title = findPreambleCmd(scope, 'title') ?? meta.title;
      meta.author = findPreambleCmd(scope, 'author') ?? meta.author;
      const d = findPreambleCmd(scope, 'date');
      if (d !== null) meta.date = d;
    }
    // Theorem-like environments: \newtheorem{env}[shared]{Name}[within]
    const theorems = {};
    let currentStyle = 'plain';
    const thmRe = /\\theoremstyle\{([^}]*)\}|\\newtheorem(\*?)\{([^}]*)\}(?:\[([^\]]*)\])?\{([^}]*)\}(?:\[([^\]]*)\])?/g;
    let tm;
    while ((tm = thmRe.exec(preamble + body))) {
      if (tm[1] !== undefined) { currentStyle = tm[1].trim(); continue; }
      theorems[tm[3]] = { name: tm[5], counter: tm[4] || tm[3], within: tm[6] || null, numbered: !tm[2], style: currentStyle };
    }
    for (const [env, name, style] of [['proof', 'Proof', 'proof']]) {
      if (!theorems[env]) theorems[env] = { name, counter: null, numbered: false, style };
    }
    // Simple argument-free macros: \newcommand{\foo}{bar}
    const macros = {};
    const macroRe = /\\(?:re)?newcommand\*?\{?\\([a-zA-Z]+)\}?(\[\d\])?/g;
    let mm;
    while ((mm = macroRe.exec(preamble))) {
      if (mm[2]) continue;
      const p = latexSkipSpaces(preamble, mm.index + mm[0].length);
      if (preamble[p] === '{') macros[mm[1]] = latexReadGroup(preamble, p).content;
    }
    let defaultLstLanguage = '';
    const lstLang = /\\lstset\{[\s\S]*?language\s*=\s*\{?([A-Za-z+#]+)/.exec(preamble);
    if (lstLang) defaultLstLanguage = lstLang[1];
    const isArticle = !/\\documentclass(?:\[[^\]]*\])?\{(?:report|book|memoir|scrbook|scrreprt)\}/.test(preamble);

    // --- Numbering state --------------------------------------------------------
    const counters = { chapter: 0, section: 0, subsection: 0, subsubsection: 0, equation: 0, table: 0, figure: 0, listing: 0, footnote: 0 };
    const labels = {};
    const toc = [];
    const footnotes = [];
    const bibOrder = [];
    const bibRe = /\\bibitem(?:\[[^\]]*\])?\{([^}]*)\}/g;
    let bm;
    while ((bm = bibRe.exec(body))) bibOrder.push(bm[1].trim());
    const citeNumbers = {};
    bibOrder.forEach((key, idx) => { citeNumbers[key] = idx + 1; });
    let lastLabelTarget = { num: '', type: 'section' };
    const sectionNumber = () => {
      const parts = [];
      if (!isArticle) parts.push(counters.chapter);
      parts.push(counters.section);
      return parts.join('.');
    };
    const counterValue = (name) => {
      const thm = Object.values(theorems).find(t => t.counter === name && t.within);
      const within = thm ? thm.within : (name === 'equation' || name === 'table' || name === 'figure' ? (isArticle ? null : 'chapter') : null);
      const n = counters[name] || 0;
      if (within === 'section') return `${sectionNumber()}.${n}`;
      if (within === 'chapter') return `${counters.chapter}.${n}`;
      if (within === 'subsection') return `${sectionNumber()}.${counters.subsection}.${n}`;
      return String(n);
    };
    const resetWithin = (level) => {
      for (const t of Object.values(theorems)) {
        if (t.within === level && t.counter) counters[t.counter] = 0;
      }
    };

    const REF = (key) => `\u0002${key.trim()}\u0003`;
    const CITE = (key) => `\u0004${key.trim()}\u0005`;

    // --- Inline conversion ----------------------------------------------------
    const escapeMd = (text) => text.replace(/([*_`|=~])/g, '\\$1');

    function convertMath(tex) {
      return tex
        .replace(/\\label\{[^}]*\}/g, '')
        .replace(/\\eqref\{([^}]*)\}/g, (_, k) => `\\text{(${REF(k)})}`)
        .replace(/\\(?:auto|c|C)?ref\{([^}]*)\}/g, (_, k) => `\\text{${REF(k)}}`)
        .replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, (all, name) => (macros[name] !== undefined ? macros[name] : all));
    }

    function convertInline(text, ctx = {}) {
      let out = '';
      let k = 0;
      const n = text.length;
      while (k < n) {
        const ch = text[k];
        // Math
        if (ch === '$') {
          const isDisplay = text[k + 1] === '$';
          const delim = isDisplay ? '$$' : '$';
          let e = k + delim.length;
          while (e < n) {
            if (text[e] === '\\') { e += 2; continue; }
            if (text.startsWith(delim, e)) break;
            e += 1;
          }
          const tex = convertMath(text.slice(k + delim.length, e)).trim();
          out += isDisplay ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
          k = e + delim.length;
          continue;
        }
        if (ch === '\\' && (text[k + 1] === '(' || text[k + 1] === '[')) {
          const closer = text[k + 1] === '(' ? '\\)' : '\\]';
          const e = text.indexOf(closer, k + 2);
          const end = e === -1 ? n : e;
          const tex = convertMath(text.slice(k + 2, end)).trim();
          out += text[k + 1] === '(' ? `$${tex}$` : `\n\n$$\n${tex}\n$$\n\n`;
          k = end + 2;
          continue;
        }
        if (ch === '\\') {
          const m = /^\\([a-zA-Z@]+\*?|.)/.exec(text.slice(k));
          if (!m) { out += '\\\\'; k += 1; continue; }
          let name = m[1];
          let starred = false;
          if (name.length > 1 && name.endsWith('*')) { starred = true; name = name.slice(0, -1); }
          let pos = k + m[0].length;
          const isWord = /^[a-zA-Z@]/.test(name);
          // Control-word consumes following spaces (unless it is a symbol command).
          const eatSpace = () => { if (isWord) { while (pos < n && (text[pos] === ' ' || text[pos] === '\t')) pos += 1; } };
          const args = (count, opt = 1) => { const a = latexReadArgs(text, pos, count, opt); pos = a.end; return a; };

          if (!isWord && LATEX_ACCENTS[name] && name !== '`' && name !== "'" && name !== '"' && name !== '^' && name !== '~' && name !== '=' && name !== '.') {
            // handled below
          }
          if (LATEX_ACCENTS[name] && (name.length === 1 && !/[a-zA-Z]/.test(name) || ['u', 'v', 'H', 'c', 'k', 'r'].includes(name))) {
            const a = args(1, 0);
            const base = a.args[0].replace(/^\\([ij])$/, (_, c) => c);
            out += (base + LATEX_ACCENTS[name]).normalize('NFC');
            k = pos;
            continue;
          }
          switch (name) {
            case 'textbf': case 'mathbf': case 'bm': case 'textmd': {
              const a = args(1, 0);
              const inner = convertInline(a.args[0], ctx).trim();
              out += name === 'textmd' ? inner : (inner ? `**${inner}**` : '');
              break;
            }
            case 'textit': case 'emph': case 'textsl': case 'mathit': {
              const a = args(1, 0);
              const inner = convertInline(a.args[0], ctx).trim();
              out += inner ? `*${inner}*` : '';
              break;
            }
            case 'textsc': {
              // No small-caps run in Folio; keep the words, upper-case is closer to the PDF than nothing.
              const a = args(1, 0);
              out += convertInline(a.args[0], ctx);
              break;
            }
            case 'texttt': case 'code': case 'path': case 'mintinline': {
              const a = args(name === 'mintinline' ? 2 : 1, 0);
              const raw = a.args[a.args.length - 1];
              const plain = raw.replace(/\\textbackslash(?:\{\})?/g, '\\').replace(/\\([&%$#_{}])/g, '$1').replace(/\\(?:-|\/)/g, '');
              const ticks = plain.includes('`') ? '``' : '`';
              out += `${ticks}${plain}${ticks}`;
              break;
            }
            case 'url': case 'nolinkurl': {
              const a = args(1, 0);
              out += `<${a.args[0]}>`;
              break;
            }
            case 'href': {
              const a = args(2, 0);
              out += `[${convertInline(a.args[1], ctx)}](${a.args[0].replace(/\\([#%&_])/g, '$1')})`;
              break;
            }
            case 'underline': case 'uline': {
              const a = args(1, 0);
              out += `<u>${convertInline(a.args[0], ctx)}</u>`;
              break;
            }
            case 'sout': case 'st': {
              const a = args(1, 0);
              out += `~~${convertInline(a.args[0], ctx)}~~`;
              break;
            }
            case 'textsuperscript': case 'textsubscript': {
              const a = args(1, 0);
              const tag = name === 'textsuperscript' ? 'sup' : 'sub';
              out += `<${tag}>${convertInline(a.args[0], ctx)}</${tag}>`;
              break;
            }
            case 'textcolor': {
              const a = args(2, 1);
              const hex = ctx.colors?.[a.args[0].trim()] ?? host.parseColorToHex(a.args[0].trim());
              const inner = convertInline(a.args[1], ctx);
              out += hex ? `<span style="color:#${hex}">${inner}</span>` : inner;
              break;
            }
            case 'colorbox': case 'hl': case 'highlight': {
              const a = args(name === 'colorbox' ? 2 : 1, 0);
              out += `==${convertInline(a.args[a.args.length - 1], ctx)}==`;
              break;
            }
            case 'footnote': {
              const a = args(1, 1);
              counters.footnote += 1;
              const id = a.optional[0] ? a.optional[0].trim() : String(counters.footnote);
              footnotes.push({ id, text: convertInline(a.args[0], ctx).replace(/\s*\n\s*/g, ' ').trim() });
              out += `[^${id}]`;
              break;
            }
            case 'footnotemark': case 'footnotetext': {
              args(name === 'footnotetext' ? 1 : 0, 1);
              break;
            }
            case 'cite': case 'citep': case 'citet': case 'parencite': case 'textcite': case 'autocite': {
              const a = args(1, 2);
              const keys = a.args[0].split(',').map(s => s.trim()).filter(Boolean);
              for (const key of keys) if (citeNumbers[key] === undefined) citeNumbers[key] = Object.keys(citeNumbers).length + 1;
              const note = a.optional.length ? `, ${convertInline(a.optional[a.optional.length - 1], ctx)}` : '';
              out += `[${keys.map(CITE).join(', ')}${note}]`;
              break;
            }
            case 'ref': case 'pageref': case 'autoref': case 'cref': case 'Cref': case 'nameref': {
              const a = args(1, 0);
              const key = a.args[0];
              if (name === 'pageref') out += REF(`${key}\u0006page`);
              else if (name === 'autoref' || name === 'cref' || name === 'Cref') out += REF(`${key}\u0006auto`);
              else out += REF(key);
              break;
            }
            case 'eqref': {
              const a = args(1, 0);
              out += `(${REF(a.args[0])})`;
              break;
            }
            case 'label': {
              const a = args(1, 0);
              labels[a.args[0].trim()] = { ...lastLabelTarget, section: sectionNumber() };
              break;
            }
            case 'today': out += latexFormatDate(today); eatSpace(); break;
            case 'folioinlineverb': {
              const a = args(1, 0);
              const v = verbatims[parseInt(a.args[0], 10)];
              out += `\`${v ? v.body : ''}\``;
              break;
            }
            case 'mbox': case 'text': case 'makebox': case 'fbox': case 'framebox': case 'hbox': case 'textrm': case 'textsf':
            case 'textup': case 'textnormal': case 'ensuremath': case 'NoCaseChange': case 'MakeUppercase': case 'MakeLowercase': {
              const a = args(1, 0);
              let inner = convertInline(a.args[0], ctx);
              if (name === 'MakeUppercase') inner = inner.toUpperCase();
              if (name === 'MakeLowercase') inner = inner.toLowerCase();
              out += inner;
              break;
            }
            case 'includegraphics': {
              const a = args(1, 1);
              out += `*[Image: ${escapeMd(a.args[0])}]*`;
              break;
            }
            case 'item': {
              // \item outside a list: treat as a bullet line.
              const a = args(0, 1);
              out += `\n- ${a.optional[0] ? `**${convertInline(a.optional[0], ctx)}** ` : ''}`;
              break;
            }
            default: {
              if (!isWord) {
                const sym = LATEX_SYMBOLS[name];
                out += sym !== undefined ? sym : name;
                break;
              }
              if (macros[name] !== undefined) {
                out += convertInline(macros[name], ctx);
                eatSpace();
                break;
              }
              if (LATEX_WORD_SYMBOLS[name] !== undefined) {
                out += LATEX_WORD_SYMBOLS[name];
                if (text[pos] === '{' && text[pos + 1] === '}') pos += 2;
                else eatSpace();
                break;
              }
              if (LATEX_DROP_WITH_ARGS[name] !== undefined) {
                args(LATEX_DROP_WITH_ARGS[name], 1);
                break;
              }
              if (LATEX_DROP_NO_ARGS.has(name)) { eatSpace(); break; }
              // Unknown command: keep the content of a following {group}, drop the name.
              const p = latexSkipSpaces(text, pos, false);
              if (text[p] === '{') {
                const g = latexReadGroup(text, p);
                out += convertInline(g.content, ctx);
                pos = g.end;
              } else {
                eatSpace();
              }
            }
          }
          if (starred) { /* starred variants behave the same here */ }
          k = pos;
          continue;
        }
        if (ch === '{' || ch === '}') { k += 1; continue; }
        if (ch === '~') { out += '\u00a0'; k += 1; continue; }
        if (ch === '-' && text.startsWith('---', k)) { out += '—'; k += 3; continue; }
        if (ch === '-' && text.startsWith('--', k)) { out += '–'; k += 2; continue; }
        if (ch === '`' && text[k + 1] === '`') { out += '“'; k += 2; continue; }
        if (ch === "'" && text[k + 1] === "'") { out += '”'; k += 2; continue; }
        if (ch === '`') { out += '‘'; k += 1; continue; }
        if (ch === "'") { out += '’'; k += 1; continue; }
        if (ch === '&') { out += ' '; k += 1; continue; }
        if (/[*_|=]/.test(ch)) { out += `\\${ch}`; k += 1; continue; }
        out += ch;
        k += 1;
      }
      return out;
    }

    // Paragraph text: collapse whitespace, keep explicit \\ breaks as <br>.
    function inlineParagraph(text, ctx) {
      const converted = convertInline(text, ctx);
      return converted
        .split(/\n{2,}/)
        .map(p => p.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
        .filter(Boolean)
        .map(p => (/^(?:#{1,6}\s|>|[-+]\s|\d+[.)]\s)/.test(p) ? `\\${p}` : p));
    }

    // --- Block conversion ----------------------------------------------------
    const colors = {};
    const colRe = /\\definecolor\{([^}]*)\}\{(RGB|rgb|HTML|gray)\}\{([^}]*)\}/g;
    let cm;
    while ((cm = colRe.exec(preamble + body))) {
      const [, name, model, value] = cm;
      let hex = null;
      if (model === 'HTML') hex = value.trim().toUpperCase();
      else if (model === 'RGB') hex = value.split(',').map(v => Math.max(0, Math.min(255, parseInt(v, 10) || 0)).toString(16).padStart(2, '0')).join('').toUpperCase();
      else if (model === 'rgb') hex = value.split(',').map(v => Math.round(Math.max(0, Math.min(1, parseFloat(v) || 0)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
      else if (model === 'gray') { const g = Math.round((parseFloat(value) || 0) * 255).toString(16).padStart(2, '0'); hex = (g + g + g).toUpperCase(); }
      if (hex) colors[name] = hex;
    }
    const baseCtx = { colors };

    function numberDisplayMath(env, inner) {
      const starred = env.endsWith('*') || env === 'displaymath' || env === 'math';
      const base = env.replace(/\*$/, '');
      const multiRow = ['align', 'gather', 'flalign', 'alignat', 'eqnarray', 'multline'].includes(base);
      let tex = inner;
      if (base === 'eqnarray') tex = tex.replace(/&\s*([=<>]|\\[a-z]+)\s*&/g, '&$1 ');
      if (base === 'alignat') tex = tex.replace(/^\s*\{\d+\}/, '');
      const takeLabel = (row) => {
        const lm = /\\label\{([^}]*)\}/.exec(row);
        return lm ? lm[1].trim() : null;
      };
      if (!multiRow || base === 'multline') {
        const label = takeLabel(tex);
        const hasTag = /\\tag\*?\{/.test(tex);
        let tag = '';
        if (!starred && !/\\no(?:number|tag)\b/.test(tex) && !hasTag) {
          counters.equation += 1;
          tag = ` \\tag{${counterValue('equation')}}`;
          if (label) labels[label] = { num: counterValue('equation'), type: 'equation', section: sectionNumber() };
        }
        tex = convertMath(tex).replace(/\\no(?:number|tag)\b/g, '').trim();
        if (base === 'multline') return `\\begin{gathered}${tex}\\end{gathered}${tag}`;
        return `${tex}${tag}`;
      }
      const rows = latexSplitTopLevel(tex, 'row');
      const outRows = rows.map(row => {
        if (!row.trim()) return null;
        const label = takeLabel(row);
        let r = row;
        if (!starred && !/\\no(?:number|tag)\b/.test(r) && !/\\tag\*?\{/.test(r)) {
          counters.equation += 1;
          r += ` \\tag{${counterValue('equation')}}`;
          if (label) labels[label] = { num: counterValue('equation'), type: 'equation', section: sectionNumber() };
        }
        return convertMath(r).replace(/\\no(?:number|tag)\b/g, '').trim();
      }).filter(r => r !== null);
      const katexEnv = base === 'gather' ? 'gather*' : 'align*';
      return `\\begin{${katexEnv}}\n${outRows.join(' \\\\\n')}\n\\end{${katexEnv}}`;
    }

    function convertTabular(spec, inner, ctx) {
      const aligns = latexParseColumnSpec(spec);
      let src2 = inner
        .replace(/\\(?:toprule|bottomrule|hline|endhead|endfirsthead|endfoot|endlastfoot)(?:\[[^\]]*\])?/g, '')
        .replace(/\\cmidrule(?:\([^)]*\))?\{[^}]*\}/g, '')
        .replace(/\\cline\{[^}]*\}/g, '')
        .replace(/\\addlinespace(?:\[[^\]]*\])?/g, '')
        .replace(/\\(?:rowcolor|cellcolor)(?:\[[^\]]*\])?\{[^}]*\}/g, '');
      // Header ends at the first \midrule (booktabs) or the first row otherwise.
      const midIdx = src2.search(/\\midrule/);
      let headSrc = '';
      if (midIdx !== -1) {
        headSrc = src2.slice(0, midIdx);
        src2 = src2.slice(midIdx).replace(/\\midrule(?:\[[^\]]*\])?/g, '');
      }
      const parseRows = (s) => latexSplitTopLevel(s, 'row')
        .filter(r => r.trim())
        .map(r => latexSplitTopLevel(r, 'cell').map(cell => {
          const mc = /^\s*\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}\s*$/.exec(cell);
          if (mc) return { span: parseInt(mc[1], 10) || 1, align: latexParseColumnSpec(mc[2])[0] || 'center', text: mc[3] };
          return { span: 1, align: null, text: cell };
        }));
      let headRows = headSrc ? parseRows(headSrc) : [];
      let bodyRows = parseRows(src2);
      if (!headRows.length && bodyRows.length) headRows = [bodyRows.shift()];
      const cellMd = (c) => inlineParagraph(c.text, ctx).join(' ').trim();
      const hasSpans = [...headRows, ...bodyRows].some(r => r.some(c => c.span > 1));
      if (!hasSpans && headRows.length === 1) {
        const esc = (s) => s.replace(/(?<!\\)\|/g, '\\|');
        const head = headRows[0].map(c => esc(cellMd(c)).replace(/^\*\*(.*)\*\*$/, '$1') || ' ');
        const width = Math.max(head.length, ...bodyRows.map(r => r.length));
        while (head.length < width) head.push(' ');
        const delim = Array.from({ length: width }, (_, i) => ({ left: ':---', center: ':---:', right: '---:' }[aligns[i] || 'left']));
        const lines = [`| ${head.join(' | ')} |`, `| ${delim.join(' | ')} |`];
        for (const r of bodyRows) {
          const cells = r.map(c => esc(cellMd(c)) || ' ');
          while (cells.length < width) cells.push(' ');
          lines.push(`| ${cells.join(' | ')} |`);
        }
        return lines.join('\n');
      }
      // Spanning or multi-row headers: raw HTML table (Folio supports colspan).
      const htmlCell = (tag, c, col) => {
        const align = c.align || aligns[col] || 'left';
        const span = c.span > 1 ? ` colspan="${c.span}"` : '';
        const text = cellMd(c).replace(/&/g, '&amp;');
        return `<${tag}${span} align="${align}">${text}</${tag}>`;
      };
      const rowHtml = (r, tag, boldify = false) => {
        let col = 0;
        return '<tr>' + r.map(c => {
          const cc = boldify && c.text.trim() && !/^\s*\\textbf/.test(c.text) ? { ...c, text: `\\textbf{${c.text.trim()}}` } : c;
          const h = htmlCell(tag, cc, col);
          col += c.span;
          return h;
        }).join('') + '</tr>';
      };
      const lines = ['<table>'];
      headRows.forEach((r, i) => lines.push(i === 0 ? rowHtml(r, 'th') : rowHtml(r, 'td', true)));
      bodyRows.forEach(r => lines.push(rowHtml(r, 'td')));
      lines.push('</table>');
      return lines.join('\n');
    }

    function convertList(env, inner, ctx, depth) {
      const items = latexSplitTopLevel(inner, 'item').slice(1);
      const ordered = env === 'enumerate' || env === 'compactenum' || env === 'inparaenum' || env === 'asparaenum';
      const out = [];
      items.forEach((itemSrc, idx) => {
        let s = itemSrc;
        let term = null;
        const p = latexSkipSpaces(s, 0);
        if (s[p] === '[') {
          const g = latexReadGroup(s, p, '[', ']');
          term = g.content;
          s = s.slice(g.end);
        }
        const marker = ordered ? `${idx + 1}. ` : '- ';
        const pad = ' '.repeat(marker.length);
        const blocks = convertBlocks(s, ctx, depth + 1);
        let first = blocks.length ? blocks[0] : '';
        let rest = blocks.slice(1);
        if (term !== null) {
          const t = convertInline(term, ctx).trim();
          if (env === 'description') first = `**${t}** ${first}`.trim();
          else first = `${t} ${first}`.trim();
        }
        if (first.startsWith('- ') || /^\d+\. /.test(first)) { rest = [first, ...rest]; first = ''; }
        out.push(marker + first.split('\n').join('\n' + pad));
        for (const b of rest) out.push(b.split('\n').map(l => (l ? pad + l : l)).join('\n'));
      });
      // Tight list: join items with single newlines.
      return out.join('\n');
    }

    function theoremHead(env, opt) {
      const t = theorems[env];
      let num = '';
      if (t.numbered && t.counter) {
        counters[t.counter] = (counters[t.counter] || 0) + 1;
        num = counterValue(t.counter);
        lastLabelTarget = { num, type: t.name.toLowerCase() };
      }
      const note = opt ? ` (${convertInline(opt, baseCtx).trim()})` : '';
      const label = `${t.name}${num ? ` ${num}` : ''}${note}.`;
      if (t.style === 'remark' || t.style === 'proof') return `*${label}*`;
      return `**${label}**`;
    }

    function convertBlocks(src0, ctx, depth = 0) {
      const blocks = [];
      let para = '';
      const flush = () => {
        if (para.trim()) {
          const parts = inlineParagraph(para, ctx);
          // Split out display math emitted inline.
          for (const p of parts) blocks.push(p);
        }
        para = '';
      };
      const re = /\\(begin)\{([^}]+)\}|\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)(?![a-zA-Z])|\\(maketitle|tableofcontents|hrule|caption|par|item)(?![a-zA-Z])|\\\[|\$\$/g;
      let cursor = 0;
      let m;
      while ((m = re.exec(src0))) {
        if (m[0] === '\\item') continue; // handled by list splitting
        para += src0.slice(cursor, m.index);
        let next = m.index + m[0].length;
        if (m[0] === '\\[' || m[0] === '$$') {
          const closer = m[0] === '\\[' ? '\\]' : '$$';
          const e = src0.indexOf(closer, next);
          const end = e === -1 ? src0.length : e;
          flush();
          blocks.push(`$$\n${convertMath(src0.slice(next, end)).trim()}\n$$`);
          next = end + closer.length;
        } else if (m[1]) {
          const env = m[2].trim();
          const { bodyEnd, end } = latexFindEnvEnd(src0, env, next);
          let inner = src0.slice(next, bodyEnd);
          next = end;
          flush();
          if (env === 'folioverbatim') {
            const idx = parseInt(latexReadGroup(inner, inner.indexOf('{')).content, 10);
            const v = verbatims[idx];
            let lang = '';
            let caption = '';
            let label = '';
            if (v.env === 'lstlisting') {
              const opts = v.opts.replace(/^\[|\]$/g, '');
              lang = (/language\s*=\s*\{?([A-Za-z+#]+)/.exec(opts) || [])[1] || defaultLstLanguage;
              const capM = /caption\s*=\s*/.exec(opts);
              if (capM) {
                const after = opts.slice(capM.index + capM[0].length);
                caption = after.startsWith('{') ? latexReadGroup(after, 0).content : after.split(',')[0];
              }
              label = ((/label\s*=\s*\{?([^,}\]]+)/.exec(opts) || [])[1] || '').trim();
            } else if (v.env === 'minted') {
              lang = (/\{([^}]*)\}/.exec(v.opts) || [])[1] || '';
            }
            if (v.env === 'comment') continue;
            if (caption || label) {
              counters.listing += 1;
              if (label) labels[label] = { num: String(counters.listing), type: 'listing', section: sectionNumber() };
            }
            if (caption) blocks.push(`**Listing ${counters.listing}:** ${inlineParagraph(caption, ctx).join(' ')}`);
            const code = v.body.replace(/^\n/, '').replace(/\n\s*$/, '');
            const fence = code.includes('```') ? '~~~~' : '```';
            blocks.push(`${fence}${(lang || '').toLowerCase()}\n${code}\n${fence}`);
          } else if (LATEX_DISPLAY_MATH_ENVS.has(env)) {
            blocks.push(`$$\n${numberDisplayMath(env, inner)}\n$$`);
          } else if (host.SUPPORTED_MATH_ENVIRONMENTS.has(env)) {
            blocks.push(`$$\n${convertMath(`\\begin{${env}}${inner}\\end{${env}}`)}\n$$`);
          } else if (LATEX_LIST_ENVS.has(env)) {
            blocks.push(convertList(env, inner, ctx, depth));
          } else if (env === 'abstract') {
            const innerBlocks = convertBlocks(inner, ctx, depth + 1);
            blocks.push(['> **Abstract**', '>', ...innerBlocks.flatMap((b, i) => [...(i ? ['>'] : []), ...b.split('\n').map(l => `> ${l}`.trimEnd())])].join('\n'));
          } else if (env === 'quote' || env === 'quotation' || env === 'verse') {
            const innerBlocks = convertBlocks(inner, ctx, depth + 1);
            blocks.push(innerBlocks.flatMap((b, i) => [...(i ? ['>'] : []), ...b.split('\n').map(l => `> ${l}`.trimEnd())]).join('\n'));
          } else if (theorems[env]) {
            const o = latexReadArgs(inner, 0, 0, 1);
            if (o.optional.length) inner = inner.slice(o.end);
            const head = theoremHead(env, o.optional[0]);
            const innerBlocks = convertBlocks(inner, ctx, depth + 1);
            const italicBody = theorems[env].style === 'plain';
            const styled = innerBlocks.map(b => (italicBody && !b.startsWith('$$') && !/^(?:[-|>]|\d+\.|<table|```)/.test(b) ? `<i>${b}</i>` : b));
            if (env === 'proof') {
              const lastIdx = styled.length - 1;
              if (lastIdx >= 0 && !styled[lastIdx].startsWith('$$')) styled[lastIdx] += ' □';
              else styled.push('□');
            }
            if (styled.length && !styled[0].startsWith('$$') && !/^(?:[-|>]|\d+\.|<table|```)/.test(styled[0])) styled[0] = `${head} ${styled[0]}`;
            else styled.unshift(head);
            blocks.push(...styled);
          } else if (env === 'tabular' || env === 'tabularx' || env === 'tabular*' || env === 'longtable' || env === 'tabulary' || env === 'array') {
            let rest = inner;
            if (env === 'tabularx' || env === 'tabular*' || env === 'tabulary') rest = rest.slice(latexReadArgs(rest, 0, 1, 0).end);
            const specArgs = latexReadArgs(rest, 0, 1, 1);
            blocks.push(convertTabular(specArgs.args[0], rest.slice(specArgs.end), ctx));
          } else if (LATEX_FLOAT_ENVS.has(env)) {
            const kind = env.startsWith('table') || env === 'wraptable' ? 'table' : 'figure';
            const o = latexReadArgs(inner, 0, env === 'minipage' || env.startsWith('wrap') ? 1 : 0, 1);
            inner = inner.slice(o.end);
            blocks.push(...convertBlocks(inner, { ...ctx, floatKind: env === 'minipage' ? ctx.floatKind : kind }, depth + 1));
          } else if (env === 'thebibliography') {
            inner = inner.slice(latexReadArgs(inner, 0, 1, 0).end);
            blocks.push(isArticle ? '## References' : '## Bibliography');
            const items = inner.split(/\\bibitem/).slice(1);
            for (const it of items) {
              const a = latexReadArgs(it, 0, 1, 1);
              const key = a.args[0].trim();
              const label = a.optional[0] ? convertInline(a.optional[0], ctx) : CITE(key);
              const text = inlineParagraph(it.slice(a.end), ctx).join(' ');
              blocks.push(`[${label}] ${text}`);
            }
          } else if (env === 'center' || env === 'flushleft' || env === 'flushright' || env === 'small' || env === 'footnotesize' || env === 'document') {
            blocks.push(...convertBlocks(inner, ctx, depth + 1));
          } else {
            // Unknown environment: convert its body as ordinary content.
            const o = latexReadArgs(inner, 0, 0, 1);
            blocks.push(...convertBlocks(inner.slice(o.end), ctx, depth + 1));
          }
        } else if (m[3]) {
          const level = m[3];
          const starred = m[4] === '*';
          const a = latexReadArgs(src0, next, 1, 1);
          next = a.end;
          flush();
          if (level === 'paragraph' || level === 'subparagraph') {
            // Run-in heading: bold text that starts the next paragraph.
            para = `\\textbf{${a.args[0]}} `;
            cursor = next;
            re.lastIndex = next;
            continue;
          }
          let num = '';
          if (!starred) {
            if (level === 'chapter') { counters.chapter += 1; counters.section = 0; counters.subsection = 0; counters.subsubsection = 0; resetWithin('chapter'); if (!isArticle) counters.equation = 0; }
            if (level === 'section') { counters.section += 1; counters.subsection = 0; counters.subsubsection = 0; resetWithin('section'); }
            if (level === 'subsection') { counters.subsection += 1; counters.subsubsection = 0; resetWithin('subsection'); }
            if (level === 'subsubsection') counters.subsubsection += 1;
            const sn = sectionNumber();
            num = level === 'chapter' ? String(counters.chapter)
              : level === 'section' ? sn
              : level === 'subsection' ? `${sn}.${counters.subsection}`
              : `${sn}.${counters.subsection}.${counters.subsubsection}`;
            lastLabelTarget = { num, type: level };
          }
          const title = inlineParagraph(a.optional[0] && false ? a.optional[0] : a.args[0], ctx).join(' ');
          const hashes = { chapter: '#', section: '##', subsection: '###', subsubsection: '####' }[level];
          const levelHashes = isArticle ? hashes : ({ chapter: '##', section: '###', subsection: '####', subsubsection: '#####' }[level]);
          blocks.push(`${levelHashes} ${num ? `${num}\u2003` : ''}${title}`);
          if (!starred || a.optional.length) toc.push({ level, num, title: inlineParagraph(a.optional[0] ?? a.args[0], ctx).join(' ') });
        } else if (m[5]) {
          const cmd = m[5];
          flush();
          if (cmd === 'maketitle') {
            const titleParts = latexSplitTopLevel(meta.title || '', 'row').map(t => inlineParagraph(t, ctx).join(' ').replace(/^\*\*(.*)\*\*$/, '$1')).filter(Boolean);
            if (titleParts.length) blocks.push(`# ${titleParts[0]}`);
            if (titleParts.length > 1) blocks.push(`*${titleParts.slice(1).join(' — ')}*`);
            const authors = (meta.author || '').split(/\\and(?![a-zA-Z])/).map(s => inlineParagraph(s, ctx).join(' ')).filter(Boolean);
            if (authors.length) blocks.push(authors.join(' · '));
            const date = meta.date === null ? latexFormatDate(today) : inlineParagraph(meta.date, ctx).join(' ');
            if (date) blocks.push(date);
          } else if (cmd === 'tableofcontents') {
            blocks.push('\u0001TOC\u0001');
          } else if (cmd === 'hrule') {
            blocks.push('---');
          } else if (cmd === 'caption') {
            const a = latexReadArgs(src0, next, 1, 1);
            next = a.end;
            const kind = ctx.floatKind || 'figure';
            counters[kind] += 1;
            lastLabelTarget = { num: counterValue(kind), type: kind };
            const lab = kind === 'table' ? 'Table' : 'Figure';
            blocks.push(`**${lab} ${counterValue(kind)}:** ${inlineParagraph(a.args[0], ctx).join(' ')}`);
          } else if (cmd === 'par') {
            // paragraph break
          }
        }
        cursor = next;
        re.lastIndex = next;
      }
      para += src0.slice(cursor);
      flush();
      // Display math that convertInline produced inside a paragraph was split already.
      return blocks.flatMap(b => b.split(/\n{2,}(?=\$\$\n)|(?<=\n\$\$)\n{2,}/)).map(b => b.trim()).filter(Boolean);
    }

    let markdown = convertBlocks(body, baseCtx).join('\n\n');

    // Title fallback when \maketitle is missing but \title exists.
    if (meta.title && !/^# /m.test(markdown)) {
      const titleParts = latexSplitTopLevel(meta.title, 'row').map(t => inlineParagraph(t, baseCtx).join(' ').replace(/^\*\*(.*)\*\*$/, '$1')).filter(Boolean);
      if (titleParts.length) markdown = `# ${titleParts[0]}\n\n${markdown}`;
    }

    // Table of contents.
    if (markdown.includes('\u0001TOC\u0001')) {
      const tocLines = ['**Contents**', ''];
      const indentFor = { chapter: 0, section: isArticle ? 0 : 2, subsection: isArticle ? 2 : 4, subsubsection: isArticle ? 4 : 6 };
      for (const entry of toc) {
        tocLines.push(`${' '.repeat(indentFor[entry.level] ?? 0)}- ${entry.num ? `${entry.num}\u2003` : ''}${entry.title}`);
      }
      markdown = markdown.replace('\u0001TOC\u0001', toc.length ? tocLines.join('\n') : '');
    }

    // Footnote definitions.
    if (footnotes.length) {
      markdown += '\n\n' + footnotes.map(f => `[^${f.id}]: ${f.text}`).join('\n');
    }

    // Resolve references and citations.
    const typeNames = { section: 'Section', subsection: 'Section', subsubsection: 'Section', chapter: 'Chapter', equation: 'Equation', table: 'Table', figure: 'Figure', listing: 'Listing' };
    // Pages do not exist in Folio: "on page \pageref{x}" becomes "in Section N".
    markdown = markdown.replace(/(?:\bon[ \u00a0]+)?\b(?:page|p\.)[ \u00a0]*\u0002([^\u0003\u0006]*)\u0006page\u0003/g,
      (_, key) => (labels[key] && labels[key].section ? `in Section\u00a0${labels[key].section}` : '??'));
    markdown = markdown.replace(/\u0002([^\u0003]*)\u0003/g, (_, raw) => {
      const [key, mode] = raw.split('\u0006');
      const target = labels[key];
      if (!target) return '??';
      if (mode === 'page') return target.section ? `§${target.section}` : target.num;
      if (mode === 'auto') {
        const tn = typeNames[target.type] || (target.type ? target.type[0].toUpperCase() + target.type.slice(1) : '');
        return target.type === 'equation' ? `${tn} (${target.num})` : `${tn} ${target.num}`.trim();
      }
      return target.num;
    });
    markdown = markdown.replace(/\u0004([^\u0005]*)\u0005/g, (_, key) => String(citeNumbers[key] ?? '?'));

    return markdown.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  return { isLatexDocument, convertLatexToMarkdown };
}

  root.FolioLatexModule = { version: 1, create: createFolioLatexImporter };
})(typeof root !== 'undefined' ? root : globalThis);
