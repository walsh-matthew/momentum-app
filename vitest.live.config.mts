import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The LIVE setup eval run (MOM-128): real, paid Claude calls, so it is its own config, its own command
// (`npm run eval:setup:pilot`) and its own file pattern. The default config (vitest.config.mts) only includes
// tests/**/*.test.{ts,tsx}, so `npm test` and CI can never reach tests/live/. tests/setup-live.test.ts checks that.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/helpers/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/live/**/*.live.ts'],
    // A pilot is about 20 to 25 real calls, each several seconds.
    testTimeout: 20 * 60 * 1000,
    disableConsoleIntercept: true,
  },
});
