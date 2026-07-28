#!/usr/bin/env node
/**
 * Builds the Chassis documentation site: docs/**\/*.md -> dist/index.html.
 *
 *   npm --prefix site install
 *   npm --prefix site run build     # then open site/dist/index.html
 *
 * One self-contained page. The CSS, the client script and the search index
 * are all inlined, so the output works from a file:// URL and drops onto
 * any static host with no configuration.
 *
 * The markdown under docs/ stays the single source of truth — nothing here
 * holds prose of its own, so the site cannot drift from the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { SECTIONS, NOT_A_PAGE } from './pages.mjs';
import { CSS } from './theme.mjs';
import { JS } from './client.mjs';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(siteDir, '..');
const outDir = path.join(siteDir, 'dist');
const checkOnly = process.argv.includes('--check');

const REPO = 'dvd90/chassis';
const BLOB = `https://github.com/${REPO}/blob/master/`;
const SITE = 'https://dvd90.github.io/chassis/';

const fail = (message) => {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
};

// ── Helpers ─────────────────────────────────────────────────

const escapeHtml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]
  );

/** Strip inline markdown so headings and search text read as prose. */
const stripMd = (s) =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/^\s*[#>\-*+]\s*/, '')
    .replace(/^\s*\d+\.\s*/, '')
    .trim();

const slugify = (s) =>
  stripMd(s)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'section';

/** A page's stable id, derived from its path: docs/guides/web.md -> guides-web */
const pageSlug = (file) =>
  file
    .replace(/^docs\//, '')
    .replace(/\.md$/, '')
    .replace(/\//g, '-')
    .toLowerCase();

// ── Syntax highlighting ─────────────────────────────────────
// Deliberately small: the docs use four languages, and a real highlighter
// would be a dependency and a bundle for a handful of colours.

const RULES = {
  ts: [
    ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
    ['string', /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/],
    ['deco', /@\w+/],
    [
      'keyword',
      /\b(?:import|from|export|default|const|let|var|function|async|await|return|class|extends|implements|new|if|else|for|of|in|try|catch|throw|type|interface|readonly|public|private|as|satisfies|typeof|null|undefined|true|false|void)\b/
    ],
    ['number', /\b\d+(?:\.\d+)?\b/]
  ],
  bash: [
    ['comment', /#[^\n]*/],
    ['string', /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/],
    ['flag', /(?<=\s)--?[\w-]+/],
    ['number', /\b\d+(?:\.\d+)?\b/]
  ],
  json: [
    ['key', /"(?:[^"\\]|\\.)*"(?=\s*:)/],
    ['string', /"(?:[^"\\]|\\.)*"/],
    ['keyword', /\b(?:true|false|null)\b/],
    ['number', /-?\b\d+(?:\.\d+)?\b/]
  ],
  yaml: [
    ['comment', /#[^\n]*/],
    ['key', /^[ \t]*-?[ \t]*[\w.-]+(?=:)/m],
    ['string', /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/],
    ['number', /\b\d+(?:\.\d+)?\b/]
  ]
};

const ALIASES = {
  typescript: 'ts',
  tsx: 'ts',
  js: 'ts',
  javascript: 'ts',
  mjs: 'ts',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  yml: 'yaml'
};

const COMPILED = Object.fromEntries(
  Object.entries(RULES).map(([lang, rules]) => [
    lang,
    new RegExp(
      rules.map(([name, re]) => `(?<${name}>${re.source})`).join('|'),
      'gm'
    )
  ])
);

/** Highlight raw (unescaped) code, escaping everything as it goes. */
function highlight(code, lang) {
  const re = COMPILED[ALIASES[lang] ?? lang];
  if (!re) return escapeHtml(code);

  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    out += escapeHtml(code.slice(last, m.index));
    out += `<span class="t-${kind}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

// ── Markdown -> HTML ────────────────────────────────────────

/**
 * Pull fenced code out before marked sees it, so highlighting runs on raw
 * text and this file controls the escaping. Placeholders keep their
 * indentation so blocks nested in list items stay nested.
 */
function extractCode(md, blocks) {
  return md.replace(
    /^([ \t]*)```([\w-]*)[ \t]*\n([\s\S]*?)^\1```[ \t]*$/gm,
    (_all, indent, lang, body) => {
      const dedented = body
        .split('\n')
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join('\n')
        .replace(/\n$/, '');
      blocks.push({ lang: lang || 'text', code: dedented });
      return `${indent}@@CODE${blocks.length - 1}@@`;
    }
  );
}

function codeHtml({ lang, code }) {
  const label = lang === 'text' ? 'code' : lang;
  return (
    `<div class="code"><div class="code-head">` +
    `<span class="code-lang">${escapeHtml(label)}</span>` +
    `<button class="copy" type="button">copy</button></div>` +
    `<pre><code>${highlight(code, lang)}</code></pre></div>`
  );
}

/** Headings in source order, with ids made unique within the page. */
function collectHeadings(md, slug) {
  const seen = new Map();
  const headings = [];
  let inFence = false;

  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (!m) continue;

    const depth = m[1].length;
    const text = stripMd(m[2]);
    let id = depth === 1 ? slug : `${slug}--${slugify(text)}`;
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count > 1) id = `${id}-${count}`;
    headings.push({ depth, text, id });
  }
  return headings;
}

/** Rewrite a markdown link target to an in-page anchor or a GitHub URL. */
function resolveLink(href, fromFile, byFile) {
  if (/^(https?:|mailto:|tel:)/.test(href)) return href;

  const [target, frag] = href.split('#');
  if (!target) {
    // Same-document anchor: scope it to this page's heading ids.
    const page = byFile.get(fromFile);
    const hit = page.headings.find((h) => slugify(h.text) === frag);
    return hit ? `#${hit.id}` : `#${page.slug}`;
  }

  const resolved = path
    .normalize(path.join(path.dirname(fromFile), target))
    .replace(/\\/g, '/');

  const page = byFile.get(resolved);
  if (page) {
    if (!frag) return `#${page.slug}`;
    const hit = page.headings.find((h) => slugify(h.text) === frag);
    return `#${hit ? hit.id : page.slug}`;
  }

  // docs/README.md is replaced by the sidebar; everything else that exists
  // in the repo (source files, workflows) links to GitHub.
  if (NOT_A_PAGE.includes(resolved)) return '#top';
  return BLOB + resolved;
}

function renderPage(page, byFile) {
  const blocks = [];
  const md = extractCode(page.markdown, blocks);

  let html = marked.parse(md, { mangle: false, headerIds: false });

  // Headings: consume the ids collected from the source, in order.
  const queue = page.headings.slice();
  html = html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (all, depth, inner) => {
    const next = queue.shift();
    if (!next) return all;
    return (
      `<h${depth} id="${next.id}">` +
      `<a class="anchor" href="#${next.id}" aria-label="Link to this section">#</a>` +
      `${inner}</h${depth}>`
    );
  });
  if (queue.length) {
    fail(
      `${page.file}: ${queue.length} heading(s) were collected but not rendered ` +
        `— the source scan and marked disagree (setext headings?)`
    );
  }

  html = html.replace(
    /<a href="([^"]*)"/g,
    (_all, href) => `<a href="${escapeHtml(resolveLink(href, page.file, byFile))}"`
  );

  html = html.replace(/<table>/g, '<div class="table-wrap"><table>');
  html = html.replace(/<\/table>/g, '</table></div>');

  html = html.replace(
    /<p>@@CODE(\d+)@@<\/p>/g,
    (_all, i) => codeHtml(blocks[Number(i)])
  );
  // A block that ended up outside a paragraph (inside a list item).
  html = html.replace(/@@CODE(\d+)@@/g, (_all, i) => codeHtml(blocks[Number(i)]));

  return html;
}

// ── Search index ────────────────────────────────────────────

function indexPage(page) {
  const entries = [];
  let inFence = false;
  let current = { id: page.slug, heading: page.title };

  for (const raw of page.markdown.split('\n')) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h = raw.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (h) {
      const text = stripMd(h[2]);
      const hit = page.headings.find(
        (x) => x.text === text && x.depth === h[1].length
      );
      current = { id: hit ? hit.id : page.slug, heading: text };
      entries.push({ id: current.id, d: page.title, h: text, t: text });
      continue;
    }

    if (/^\s*\|/.test(raw)) continue; // table rows are mostly punctuation
    const text = stripMd(raw);
    if (text.length < 24) continue;
    entries.push({ id: current.id, d: page.title, h: current.heading, t: text });
  }
  return entries;
}

// ── Load and validate ───────────────────────────────────────

const pages = [];
for (const section of SECTIONS) {
  for (const entry of section.pages) {
    const full = path.join(repoRoot, entry.file);
    if (!fs.existsSync(full)) {
      fail(`site/pages.mjs lists "${entry.file}", which does not exist`);
    }
    const markdown = fs.readFileSync(full, 'utf8');
    const slug = pageSlug(entry.file);
    pages.push({
      ...entry,
      section: section.title,
      slug,
      markdown,
      headings: collectHeadings(markdown, slug)
    });
  }
}

// Every doc must be reachable: a page nobody linked is a page nobody reads.
const listed = new Set([...pages.map((p) => p.file), ...NOT_A_PAGE]);
const onDisk = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.md')) {
      onDisk.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
    }
  }
})(path.join(repoRoot, 'docs'));

const missing = onDisk.filter((f) => !listed.has(f));
if (missing.length) {
  fail(
    `these docs are not in the site nav — add them to site/pages.mjs:\n  ` +
      missing.join('\n  ')
  );
}

const byFile = new Map(pages.map((p) => [p.file, p]));
const searchIndex = pages.flatMap(indexPage);

// ── Emit ────────────────────────────────────────────────────

const navHtml = SECTIONS.map((section) => {
  const items = section.pages
    .map((entry) => {
      const page = byFile.get(entry.file);
      const subs = page.headings
        .filter((h) => h.depth === 2)
        .map(
          (h) =>
            `<a href="#${h.id}" data-heading="${h.id}">${escapeHtml(h.text)}</a>`
        )
        .join('');
      return (
        `<li><a href="#${page.slug}" data-doc="${page.slug}">${escapeHtml(page.title)}</a>` +
        (subs ? `<div class="sub-nav">${subs}</div>` : '') +
        `</li>`
      );
    })
    .join('');
  return `<div class="nav-group"><h3>${escapeHtml(section.title)}</h3><ul>${items}</ul></div>`;
}).join('');

const docsHtml = pages
  .map(
    (page) =>
      `<article class="doc" id="${page.slug}">` +
      `<span class="doc-kicker">${escapeHtml(page.section)}</span>` +
      renderPage(page, byFile) +
      `</article>`
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chassis — documentation</title>
<meta name="description" content="A lightweight, decorator-driven Express + TypeScript backend starter. Clone, run, ship.">
<meta name="color-scheme" content="dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23090a11'/%3E%3Ctext x='16' y='23' font-size='19' text-anchor='middle'%3E%F0%9F%8F%8E%EF%B8%8F%3C/text%3E%3C/svg%3E">
<link rel="canonical" href="${SITE}">
<meta property="og:title" content="Chassis — Express 5 + TypeScript backend starter">
<meta property="og:description" content="Pick a database, an auth provider and an optional Next.js front end; the scaffolder ships only what you chose.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'Chassis',
  description:
    'A lightweight, decorator-driven Express 5 + TypeScript backend starter. Scaffold with create-chassis and get only the modules you chose.',
  codeRepository: `https://github.com/${REPO}`,
  programmingLanguage: ['TypeScript', 'JavaScript'],
  runtimePlatform: 'Node.js',
  license: 'https://opensource.org/licenses/MIT',
  url: SITE,
  author: { '@type': 'Person', name: 'dvd90' }
})}</script>
<style>${CSS}</style>
</head>
<body id="top">
<div class="fx" aria-hidden="true">
  <span class="fx-blob fx-blob-a"></span>
  <span class="fx-blob fx-blob-b"></span>
  <span class="fx-grid"></span>
  <span class="fx-noise"></span>
</div>

<header class="site-header">
  <button class="nav-toggle" id="nav-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" aria-controls="nav">☰</button>
  <a class="brand" href="#top"><span class="brand-mark" aria-hidden="true">🏎️</span>Chassis</a>
  <span class="header-tag">docs</span>
  <div class="header-links">
    <a href="#getting-started">Get started</a>
    <a href="https://www.npmjs.com/package/create-chassis">npm</a>
    <a href="https://github.com/${REPO}">GitHub</a>
  </div>
</header>

<div class="scrim" id="scrim"></div>

<div class="shell">
  <aside class="sidebar" id="nav">
    <div class="search-wrap">
      <input id="search" type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false" aria-label="Search the documentation">
      <span class="search-key">/</span>
    </div>
    <ul class="results" id="results"></ul>
    <nav>${navHtml}</nav>
  </aside>

  <div>
    <section class="hero">
      <span class="eyebrow"><span class="dot"></span>Express 5 · TypeScript · Next.js</span>
      <h1>Everything you need to ship an API.</h1>
      <p>Chassis gives you NestJS-style controller ergonomics on plain Express 5 — in a handful of small files you can actually read. Pick a database, an auth provider and an optional Next.js front end; the scaffolder ships only what you chose.</p>
      <div class="hero-cta">
        <a class="button" href="#getting-started">Get started</a>
        <a class="button ghost" href="https://github.com/${REPO}">View on GitHub</a>
      </div>
    </section>

    <main>${docsHtml}</main>
  </div>
</div>

<footer class="site-footer">
  Built from the markdown in <a href="${BLOB}docs">docs/</a> — the docs in the repo are the source of truth.
</footer>

<button class="to-top" id="to-top" type="button" aria-label="Back to top">↑</button>

<script>window.__DOCS__=${JSON.stringify(searchIndex)};</script>
<script>${JS}</script>
</body>
</html>
`;

// ── Agent-readable companions ───────────────────────────────
// llms.txt is the convention for "how a language model should understand
// this project". It only helps if it is actually served, so the repo's copy
// is republished here with its links pointed at the site, alongside a
// llms-full.txt carrying every page's source in one fetch.

const llmsTxt =
  fs
    .readFileSync(path.join(repoRoot, 'llms.txt'), 'utf8')
    .replace(/\]\(([^)]+)\)/g, (all, target) => {
      const page = byFile.get(target.split('#')[0].replace(/^\.\//, ''));
      return page ? `](${SITE}#${page.slug})` : all;
    })
    .trimEnd() +
  `\n\n## Full text\n\n` +
  `- [Every page, one file](${SITE}llms-full.txt)\n` +
  `- [Agent guide](${SITE}AGENTS.md): conventions and definition of done\n` +
  `- [Source](https://github.com/${REPO})\n`;

const llmsFull = [
  '# Chassis — complete documentation',
  '',
  `Generated from https://github.com/${REPO}. Every page below is the`,
  'verbatim source markdown, in the order the site presents it.',
  ...pages.map(
    (page) => `\n\n<!-- source: ${page.file} -->\n\n${page.markdown.trim()}`
  )
].join('\n');

const extras = [
  ['llms.txt', llmsTxt],
  ['llms-full.txt', llmsFull],
  ['AGENTS.md', fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8')],
  ['robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`],
  [
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `  <url><loc>${SITE}</loc></url>\n</urlset>\n`
  ]
];

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
const summary =
  `${pages.length} pages · ${searchIndex.length} search entries · ` +
  `${kb(html.length)} + ${extras.length} companion files`;

if (checkOnly) {
  console.log(`✔ ${summary} (not written)`);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  for (const [name, body] of extras) {
    fs.writeFileSync(path.join(outDir, name), body);
  }
  console.log(`✔ site/dist — ${summary}`);
}
