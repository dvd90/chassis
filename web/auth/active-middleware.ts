/**
 * The edge half of the active provider, kept separate from `active.ts` so
 * the middleware bundle never pulls in React components or `next/headers`.
 * create-chassis rewrites this line alongside `active.ts`.
 */
export * from './providers/none.middleware';
