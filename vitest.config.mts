import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for pure logic and the service layer. Services run against an in-memory Supabase fake
// (tests/helpers/fakeSupabase.ts), so no network, no env vars and no database are needed.
// Database behaviour (RLS, triggers, functions) is covered by the SQL scripts in supabase/verify/.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // Next.js fails a build that imports this from a Client Component; under test it is a no-op.
      'server-only': fileURLToPath(new URL('./tests/helpers/serverOnlyStub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
