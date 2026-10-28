// Which fetch a Hevy sync uses (lib/services/hevySyncDeps.ts, MOM-129). The browser tests' stand-in for Hevy may be
// used only when all three guards pass; each one failing on its own means the real fetch.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FakeHevyEnv } from '@/lib/config/env';
import { fakeHevyAllowed, hevySyncDeps } from '@/lib/services/hevySyncDeps';
import { fakeHevyFetch } from '@/lib/testing/fakeHevyFetch';

const ALL_PASS: FakeHevyEnv = { E2E_FAKE_HEVY: '1', NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' };

describe('the stand-in for Hevy', () => {
  it('is used when all three guards pass', async () => {
    expect(fakeHevyAllowed(ALL_PASS)).toBe(true);
    expect((await hevySyncDeps(ALL_PASS)).fetch).toBe(fakeHevyFetch);
    expect((await hevySyncDeps({ ...ALL_PASS, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' })).fetch).toBe(fakeHevyFetch);
    expect((await hevySyncDeps({ ...ALL_PASS, NODE_ENV: 'test' })).fetch).toBe(fakeHevyFetch);
  });

  it('is not used with the flag off', async () => {
    for (const flag of [undefined, '', '0', 'true', 'yes']) {
      const env = { ...ALL_PASS, E2E_FAKE_HEVY: flag };
      expect(fakeHevyAllowed(env), String(flag)).toBe(false);
      expect(await hevySyncDeps(env), String(flag)).toEqual({});
    }
  });

  it('is not used when NODE_ENV is production', async () => {
    const env = { ...ALL_PASS, NODE_ENV: 'production' };
    expect(fakeHevyAllowed(env)).toBe(false);
    expect(await hevySyncDeps(env)).toEqual({});
  });

  it('is not used when the Supabase URL is not on this machine', async () => {
    for (const url of ['https://abcd.supabase.co', 'http://localhost.evil.example', 'http://10.0.0.5:54321', 'not a url', '', undefined]) {
      const env = { ...ALL_PASS, NEXT_PUBLIC_SUPABASE_URL: url };
      expect(fakeHevyAllowed(env), String(url)).toBe(false);
      expect(await hevySyncDeps(env), String(url)).toEqual({});
    }
  });

  it('is loaded only through a dynamic import, and only the deps file refers to it', () => {
    const root = join(__dirname, '..');
    const deps = readFileSync(join(root, 'lib/services/hevySyncDeps.ts'), 'utf8');
    expect(deps).toMatch(/await import\('@\/lib\/testing\/fakeHevyFetch'\)/);
    expect(deps).not.toMatch(/^import .*fakeHevyFetch/m);
    for (const file of ['app/actions/integrations.ts', 'lib/services/syncedEntries.ts', 'components/integrations/HevySyncControl.tsx']) {
      expect(readFileSync(join(root, file), 'utf8'), file).not.toMatch(/fakeHevyFetch/);
    }
  });
});

describe('what the stand-in answers', () => {
  const ask = (key: string) => fakeHevyFetch('https://api.hevyapp.com/v1/workouts?page=1', { headers: { 'api-key': key } });

  it('two workouts for an ordinary key, a 401 for a refused one, a failed request for a slow one', async () => {
    const ok = await ask('e2e-hevy-ok-0123456789');
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { workouts: unknown[] }).workouts).toHaveLength(2);
    expect((await ask('e2e-hevy-refused-0123')).status).toBe(401);
    await expect(ask('e2e-hevy-slow-01234567')).rejects.toThrow();
  });
});
