/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Next regenerates `next-env.d.ts` on every build and points it at
// `.next/types`, which is gitignored — so a fresh clone could not typecheck
// before building. These two references are the part that actually matters;
// tsconfig.json excludes the generated file and uses this instead.

// Next types `*.module.css` but not plain global stylesheets, and TypeScript 6
// stopped letting an unresolvable side-effect import pass (TS2882). This is
// what `import './globals.css'` in app/layout.tsx resolves to.
declare module '*.css';
