import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest runs test files in parallel, and some of them spawn real
    // processes or run slow key derivation — both of which starve everything
    // else on a two-core CI runner long enough to blow the 5s default.
    // Nothing here is meant to take seconds, so this only ever absorbs
    // scheduling noise: a test that is actually broken fails on its
    // assertion, not on the clock.
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test'
    }
  }
});
