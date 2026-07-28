/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Next regenerates `next-env.d.ts` on every build and points it at
// `.next/types`, which is gitignored — so a fresh clone could not typecheck
// before building. These two references are the part that actually matters;
// tsconfig.json excludes the generated file and uses this instead.
