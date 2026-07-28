/**
 * The docs site stylesheet. Same tokens as web/app/globals.css — if that
 * palette changes, change it here too; they are deliberately duplicated
 * rather than shared, because the web app is a template that gets copied
 * into user projects and must not depend on this build.
 */
export const CSS = String.raw`
@property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

:root {
  color-scheme: dark;
  --bg: #030308;
  --bg-elev: #090a11;
  --surface: rgba(255,255,255,.026);
  --surface-hover: rgba(255,255,255,.05);
  --line: rgba(255,255,255,.075);
  --line-strong: rgba(255,255,255,.16);
  --fg: #f2f4fb;
  --fg-muted: #9098ad;
  --fg-faint: #616880;
  --accent: #7c8cff;
  --accent-2: #c46bff;
  --accent-soft: rgba(124,140,255,.14);
  --accent-glow: rgba(124,140,255,.45);
  --on-accent: #06070d;
  --success: #35e39a;
  --danger: #ff6b81;
  --radius: 18px;
  --radius-sm: 11px;
  --shadow: 0 1px 2px rgba(0,0,0,.6), 0 24px 60px -28px rgba(0,0,0,.9);
  --sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, 'SF Mono', SFMono-Regular, 'JetBrains Mono', Menlo, Consolas, monospace;
  --sidebar: 17rem;
  --header: 3.6rem;
}

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: calc(var(--header) + 1.5rem); }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition-duration: .01ms !important; }
}

body {
  margin: 0; min-height: 100dvh; background: var(--bg); color: var(--fg);
  font-family: var(--sans); font-size: 15px; line-height: 1.68;
  -webkit-font-smoothing: antialiased;
}

/* ── Backdrop ─────────────────────────────────────────── */
.fx { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.fx span { position: absolute; display: block; }
.fx-blob { border-radius: 50%; filter: blur(90px); will-change: transform; }
.fx-blob-a { top: -20rem; left: -12rem; width: 44rem; height: 34rem; opacity: .38;
  background: radial-gradient(closest-side, var(--accent), transparent);
  animation: drift-a 26s ease-in-out infinite alternate; }
.fx-blob-b { top: -24rem; right: -14rem; width: 40rem; height: 32rem; opacity: .26;
  background: radial-gradient(closest-side, var(--accent-2), transparent);
  animation: drift-b 32s ease-in-out infinite alternate; }
@keyframes drift-a { to { transform: translate3d(6rem,4rem,0) scale(1.15); } }
@keyframes drift-b { to { transform: translate3d(-5rem,6rem,0) scale(1.2); } }
.fx-grid { inset: 0;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 62px 62px;
  -webkit-mask-image: radial-gradient(90% 55% at 50% 0%, #000 10%, transparent 75%);
  mask-image: radial-gradient(90% 55% at 50% 0%, #000 10%, transparent 75%); }
.fx-noise { inset: -200%; width: 500%; height: 500%; opacity: .03;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: grain 6s steps(6) infinite; }
@keyframes grain {
  0%{transform:translate(0,0)} 20%{transform:translate(-3%,2%)} 40%{transform:translate(2%,-3%)}
  60%{transform:translate(-2%,-2%)} 80%{transform:translate(3%,3%)} }

/* ── Header ───────────────────────────────────────────── */
.site-header {
  position: fixed; top: 0; left: 0; right: 0; z-index: 30; height: var(--header);
  display: flex; align-items: center; gap: 1rem; padding: 0 clamp(1rem,3vw,1.5rem);
  background: color-mix(in oklab, var(--bg) 62%, transparent);
  backdrop-filter: saturate(1.8) blur(16px); -webkit-backdrop-filter: saturate(1.8) blur(16px);
}
.site-header::after {
  content: ''; position: absolute; inset: auto 0 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--line-strong) 18%, var(--accent) 50%, var(--line-strong) 82%, transparent);
  background-size: 220% 100%; animation: sweep 9s linear infinite; opacity: .6;
}
@keyframes sweep { to { background-position: -220% 0; } }

.brand { display: inline-flex; align-items: center; gap: .6rem; color: var(--fg);
  font-weight: 600; letter-spacing: -.015em; text-decoration: none; }
.brand-mark { display: grid; place-items: center; flex: none; width: 32px; height: 32px;
  border: 1px solid var(--line); border-radius: 10px; font-size: 17px; line-height: 1;
  background: linear-gradient(150deg, var(--accent-soft), rgba(255,255,255,.02));
  transition: border-color .25s ease, box-shadow .25s ease, transform .35s cubic-bezier(.22,1,.36,1); }
.brand:hover .brand-mark { border-color: color-mix(in oklab, var(--accent) 45%, transparent);
  box-shadow: 0 6px 24px -8px var(--accent-glow); transform: translateX(3px); }
.header-tag { padding: .12rem .5rem; border: 1px solid var(--line); border-radius: 999px;
  background: var(--surface); color: var(--fg-faint); font-family: var(--mono); font-size: .68rem; letter-spacing: .06em; }
.header-links { margin-left: auto; display: flex; align-items: center; gap: .35rem; }
.header-links a { padding: .38rem .7rem; border-radius: var(--radius-sm); color: var(--fg-muted);
  font-size: .88rem; font-weight: 500; text-decoration: none; transition: color .15s, background .15s; }
.header-links a:hover { color: var(--fg); background: var(--surface-hover); }

.nav-toggle { display: none; align-items: center; justify-content: center; width: 34px; height: 34px;
  padding: 0; border: 1px solid var(--line); border-radius: 9px; background: var(--surface);
  color: var(--fg); font-size: 1rem; cursor: pointer; }

/* ── Layout ───────────────────────────────────────────── */
.shell { display: grid; grid-template-columns: var(--sidebar) minmax(0,1fr);
  gap: clamp(1.5rem,4vw,3.5rem); max-width: 78rem; margin: 0 auto;
  padding: calc(var(--header) + 2rem) clamp(1rem,3vw,2rem) 6rem; }

.sidebar { position: sticky; top: calc(var(--header) + 1.5rem); align-self: start;
  max-height: calc(100dvh - var(--header) - 3rem); overflow-y: auto; padding-right: .5rem;
  scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.sidebar::-webkit-scrollbar { width: 6px; }
.sidebar::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 3px; }

.search-wrap { position: relative; margin-bottom: 1.25rem; }
.search-wrap input { width: 100%; padding: .55rem .75rem .55rem 2rem; border: 1px solid var(--line);
  border-radius: var(--radius-sm); background: rgba(0,0,0,.35); color: var(--fg);
  font: inherit; font-size: .88rem; transition: border-color .15s, box-shadow .2s, background .2s; }
.search-wrap input::placeholder { color: var(--fg-faint); }
.search-wrap input:focus { outline: none; border-color: color-mix(in oklab, var(--accent) 65%, transparent);
  background: rgba(0,0,0,.5); box-shadow: 0 0 0 3px var(--accent-soft); }
.search-wrap::before { content: '⌕'; position: absolute; left: .7rem; top: 50%; transform: translateY(-52%);
  color: var(--fg-faint); font-size: 1rem; pointer-events: none; }
.search-key { position: absolute; right: .5rem; top: 50%; transform: translateY(-50%);
  padding: .05rem .35rem; border: 1px solid var(--line); border-radius: 5px;
  color: var(--fg-faint); font-family: var(--mono); font-size: .68rem; pointer-events: none; }
.search-wrap input:focus ~ .search-key { opacity: 0; }

.results { list-style: none; margin: 0 0 1rem; padding: 0; display: none; flex-direction: column; gap: 2px; }
.results.is-open { display: flex; }
.results li a { display: block; padding: .45rem .6rem; border: 1px solid transparent; border-radius: 9px;
  color: var(--fg-muted); font-size: .85rem; text-decoration: none; }
.results li a:hover, .results li a.is-active { background: var(--surface-hover); border-color: var(--line); color: var(--fg); }
.results .r-doc { display: block; color: var(--fg-faint); font-family: var(--mono); font-size: .68rem;
  letter-spacing: .06em; text-transform: uppercase; }
.results .r-empty { padding: .5rem .6rem; color: var(--fg-faint); font-size: .85rem; }

.nav-group { margin-bottom: 1.35rem; }
.nav-group > h3 { margin: 0 0 .45rem .6rem; color: var(--fg-faint); font-family: var(--mono);
  font-size: .67rem; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; }
.nav-group ul { list-style: none; margin: 0; padding: 0; }
.nav-group > ul > li > a { display: block; padding: .3rem .6rem; border-left: 2px solid transparent;
  color: var(--fg-muted); font-size: .89rem; text-decoration: none; transition: color .15s, border-color .15s; }
.nav-group > ul > li > a:hover { color: var(--fg); }
.nav-group > ul > li > a.is-active { color: var(--fg); border-left-color: var(--accent); font-weight: 550; }
.sub-nav { margin: .1rem 0 .35rem; display: none; }
.sub-nav.is-open { display: block; }
.sub-nav a { display: block; padding: .16rem .6rem .16rem 1.3rem; border-left: 2px solid transparent;
  color: var(--fg-faint); font-size: .82rem; text-decoration: none; }
.sub-nav a:hover { color: var(--fg-muted); }
.sub-nav a.is-active { color: var(--accent); border-left-color: var(--line-strong); }

/* ── Hero ─────────────────────────────────────────────── */
.hero { margin-bottom: 3rem; }
.hero h1 { margin: .6rem 0 1rem; font-size: clamp(2.2rem,5.5vw,3.4rem); line-height: 1.1;
  letter-spacing: -.045em; font-weight: 620; max-width: 18ch;
  background: linear-gradient(112deg,#fff 20%,var(--accent) 62%,var(--accent-2) 92%);
  background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: shift 14s ease-in-out infinite alternate; }
@keyframes shift { to { background-position: 100% 0; } }
.hero p { margin: 0 0 1.5rem; color: var(--fg-muted); font-size: 1.06rem; max-width: 52ch; }
.eyebrow { display: inline-flex; align-items: center; gap: .55rem; padding: .32rem .8rem .32rem .55rem;
  border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--fg-muted);
  font-family: var(--mono); font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); flex: none;
  animation: halo 2.6s ease-out infinite; }
@keyframes halo { 0% { box-shadow: 0 0 0 0 var(--success); } 70%,100% { box-shadow: 0 0 0 7px transparent; } }
.hero-cta { display: flex; flex-wrap: wrap; gap: .6rem; }
.button { position: relative; display: inline-flex; align-items: center; gap: .45rem; overflow: hidden;
  padding: .58rem 1.05rem; border: 1px solid transparent; border-radius: var(--radius-sm);
  background: linear-gradient(135deg,var(--accent),var(--accent-2)); color: var(--on-accent);
  font-size: .9rem; font-weight: 600; text-decoration: none;
  transition: box-shadow .25s, filter .2s, transform .1s; }
.button::after { content: ''; position: absolute; inset: 0; transform: translateX(-120%);
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.45) 50%, transparent 80%);
  transition: transform .6s cubic-bezier(.22,1,.36,1); }
.button:hover::after { transform: translateX(120%); }
.button:hover { color: var(--on-accent); filter: brightness(1.06); box-shadow: 0 10px 30px -10px var(--accent-glow); }
.button.ghost { background: var(--surface); border-color: var(--line); color: var(--fg); }
.button.ghost:hover { background: var(--surface-hover); border-color: var(--line-strong); filter: none; box-shadow: none; }

/* ── Prose ────────────────────────────────────────────── */
.doc { scroll-margin-top: calc(var(--header) + 1.5rem); padding-bottom: 3.5rem; margin-bottom: 3.5rem;
  border-bottom: 1px solid var(--line); }
.doc:last-child { border-bottom: 0; }
.doc-kicker { display: inline-block; margin-bottom: .5rem; color: var(--fg-faint);
  font-family: var(--mono); font-size: .68rem; letter-spacing: .16em; text-transform: uppercase; }

.doc h1, .doc h2, .doc h3, .doc h4 { position: relative; margin: 2.2rem 0 .8rem;
  line-height: 1.2; letter-spacing: -.022em; font-weight: 620; scroll-margin-top: calc(var(--header) + 1.5rem); }
.doc > h1:first-of-type { margin-top: 0; }
.doc h1 { font-size: 1.95rem; letter-spacing: -.035em; }
.doc h2 { font-size: 1.35rem; padding-top: 1.4rem; border-top: 1px solid var(--line); }
.doc h3 { font-size: 1.06rem; }
.doc h4 { font-size: .95rem; color: var(--fg-muted); }
.anchor { position: absolute; left: -1.1rem; width: 1.1rem; color: var(--fg-faint);
  font-weight: 400; text-decoration: none; opacity: 0; transition: opacity .15s; }
.doc :is(h1,h2,h3,h4):hover .anchor { opacity: 1; }
.anchor:hover { color: var(--accent); }

.doc p, .doc li { color: color-mix(in oklab, var(--fg) 88%, var(--fg-muted)); }
.doc p { margin: 0 0 1rem; }
.doc ul, .doc ol { margin: 0 0 1rem; padding-left: 1.3rem; }
.doc li { margin: .3rem 0; }
.doc li::marker { color: var(--fg-faint); }
.doc a { color: var(--accent); text-decoration: none; border-bottom: 1px solid color-mix(in oklab, var(--accent) 35%, transparent); }
.doc a:hover { color: color-mix(in oklab, var(--accent) 70%, white); border-bottom-color: currentColor; }
.doc strong { color: var(--fg); font-weight: 620; }
.doc hr { margin: 2rem 0; border: 0; border-top: 1px solid var(--line); }
.doc img { max-width: 100%; }

.doc blockquote { margin: 0 0 1rem; padding: .8rem 1rem; border: 1px solid var(--line);
  border-left: 2px solid var(--accent); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  background: var(--surface); }
.doc blockquote p:last-child { margin-bottom: 0; }

.doc :not(pre) > code { font-family: var(--mono); font-size: .855em; padding: .12em .42em;
  border: 1px solid var(--line); border-radius: 6px; background: rgba(255,255,255,.035);
  color: color-mix(in oklab, var(--accent) 45%, var(--fg)); white-space: nowrap; }

.table-wrap { overflow-x: auto; margin: 0 0 1.2rem; border: 1px solid var(--line);
  border-radius: var(--radius-sm); background: var(--bg-elev); }
.doc table { width: 100%; border-collapse: collapse; font-size: .88rem; }
.doc th, .doc td { padding: .55rem .8rem; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
.doc tr:last-child td { border-bottom: 0; }
.doc th { color: var(--fg-faint); font-family: var(--mono); font-size: .7rem; font-weight: 600;
  letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
.doc td code { white-space: nowrap; }

/* ── Code blocks ──────────────────────────────────────── */
.code { position: relative; margin: 0 0 1.2rem; border: 1px solid var(--line);
  border-radius: var(--radius-sm); background: #05060b; overflow: hidden; }
.code-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  padding: .35rem .5rem .35rem .8rem; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.015); }
.code-lang { color: var(--fg-faint); font-family: var(--mono); font-size: .67rem;
  letter-spacing: .14em; text-transform: uppercase; }
.copy { padding: .2rem .5rem; border: 1px solid var(--line); border-radius: 6px; background: transparent;
  color: var(--fg-muted); font: inherit; font-family: var(--mono); font-size: .7rem; cursor: pointer;
  transition: color .15s, border-color .15s, background .15s; }
.copy:hover { color: var(--fg); border-color: var(--line-strong); background: var(--surface-hover); }
.copy.is-done { color: var(--success); border-color: color-mix(in oklab, var(--success) 40%, transparent); }
.code pre { margin: 0; padding: .9rem 1rem; overflow-x: auto; }
.code code { font-family: var(--mono); font-size: .82rem; line-height: 1.65; color: #d7dbeb; }
.t-comment { color: #5c6480; font-style: italic; }
.t-string  { color: #9fe6b6; }
.t-keyword { color: #a99bff; }
.t-number  { color: #ffc48a; }
.t-key     { color: #7fd1ff; }
.t-flag    { color: #ffb3d0; }
.t-deco    { color: #f0a6ff; }

/* ── Footer ───────────────────────────────────────────── */
.site-footer { max-width: 78rem; margin: 0 auto; padding: 0 clamp(1rem,3vw,2rem) 4rem;
  color: var(--fg-faint); font-size: .82rem; }
.site-footer a { color: var(--fg-muted); }

.to-top { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 20; display: grid; place-items: center;
  width: 38px; height: 38px; border: 1px solid var(--line); border-radius: 11px; background: var(--bg-elev);
  color: var(--fg-muted); font-size: .9rem; cursor: pointer; opacity: 0; pointer-events: none;
  transition: opacity .25s, color .15s, border-color .15s; }
.to-top.is-visible { opacity: 1; pointer-events: auto; }
.to-top:hover { color: var(--fg); border-color: var(--line-strong); }

/* ── Responsive ───────────────────────────────────────── */
@media (max-width: 62rem) {
  .shell { grid-template-columns: minmax(0,1fr); }
  .nav-toggle { display: inline-flex; }
  .sidebar { position: fixed; inset: var(--header) auto 0 0; z-index: 25; width: min(20rem, 84vw);
    max-height: none; height: calc(100dvh - var(--header)); padding: 1.25rem;
    background: var(--bg-elev); border-right: 1px solid var(--line);
    transform: translateX(-102%); transition: transform .28s cubic-bezier(.22,1,.36,1); }
  .sidebar.is-open { transform: none; }
  .scrim { position: fixed; inset: var(--header) 0 0; z-index: 24; background: rgba(0,0,0,.6);
    opacity: 0; pointer-events: none; transition: opacity .25s; }
  .scrim.is-open { opacity: 1; pointer-events: auto; }
  .anchor { display: none; }
}
@media (min-width: 62.0625rem) { .scrim { display: none; } }
`;
