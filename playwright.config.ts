import { defineConfig, devices } from '@playwright/test';
import { assertNoModelKey, readLocalStackEnv } from './tests/e2e/support/localStack';

// Browser specs (MOM-61): `npm run test:e2e`. They run against the LOCAL Supabase stack only (`npx supabase start`),
// with a Next.js dev server this config starts on its own port. Keep `npm test` (Vitest) independent of all this.
//
// The stack's address and keys come from `npx supabase status -o env` and are passed straight to the dev server;
// they are never printed. readLocalStackEnv() throws if the Supabase URL is not localhost or 127.0.0.1.
assertNoModelKey(process.env);
const stack = readLocalStackEnv();
// The specs read the inbox through this. Set in the runner's own environment, which the workers inherit.
process.env.E2E_MAILPIT_URL = stack.mailpitUrl;

const PORT = 3100; // not 3000, so a dev server you already have running is left alone
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  // One worker: the specs share one dev server and one local stack, and the plan cooldown is per user per server.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    // Never adopt a server that is already there: it might point at another project.
    reuseExistingServer: false,
    timeout: 180_000,
    env: stack.serverEnv,
  },
});
