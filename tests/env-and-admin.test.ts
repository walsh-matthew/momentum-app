// Validated runtime environment (lib/config/env.ts, MOM-28) and the service-role client built from it
// (lib/supabase/admin.ts, MOM-37). Env is read lazily and cached, so each test loads a fresh copy of
// the module with its own variables.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_VALUE = 'https://abcdefghijklmnopqrst.supabase.co';
const SECRET = 'service-role-secret-value';

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'HEVY_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ]) {
    vi.stubEnv(name, vars[name] ?? '');
  }
  return import('@/lib/config/env');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getPublicEnv', () => {
  it('returns the validated public variables', async () => {
    const env = await loadEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_VALUE, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' });
    expect(env.getPublicEnv()).toEqual({ NEXT_PUBLIC_SUPABASE_URL: URL_VALUE, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' });
  });

  it('is lazy: loading the module with nothing set does not throw, calling it does', async () => {
    const env = await loadEnv({});
    expect(() => env.getPublicEnv()).toThrow(/Invalid public environment variables/);
  });

  it('names the variable that is wrong, and a bad URL is rejected', async () => {
    const env = await loadEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not a url', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' });
    expect(() => env.getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe('getServerEnv', () => {
  it('needs all three server keys', async () => {
    const env = await loadEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET, ANTHROPIC_API_KEY: 'a' });
    expect(() => env.getServerEnv()).toThrow(/HEVY_API_KEY/);
  });

  it('returns them when set', async () => {
    const env = await loadEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET, ANTHROPIC_API_KEY: 'a', HEVY_API_KEY: 'h' });
    expect(env.getServerEnv()).toEqual({ SUPABASE_SERVICE_ROLE_KEY: SECRET, ANTHROPIC_API_KEY: 'a', HEVY_API_KEY: 'h' });
  });

  it('never puts a value in the error', async () => {
    const env = await loadEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET, ANTHROPIC_API_KEY: 'anthropic-secret-value' });
    let message = '';
    try {
      env.getServerEnv();
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/HEVY_API_KEY/);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain('anthropic-secret-value');
  });
});

describe('getSupabaseServiceRoleKey', () => {
  it('needs only the service role key, not the unrelated secrets', async () => {
    const env = await loadEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET });
    expect(env.getSupabaseServiceRoleKey()).toBe(SECRET);
  });
  it('throws when it is missing', async () => {
    const env = await loadEnv({});
    expect(() => env.getSupabaseServiceRoleKey()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('getAnthropicApiKey', () => {
  it('needs only the Anthropic key, not the unrelated secrets', async () => {
    const env = await loadEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(env.getAnthropicApiKey()).toBe('sk-ant-test');
  });
  it('throws naming the variable, and never puts a value in the error', async () => {
    const env = await loadEnv({});
    expect(() => env.getAnthropicApiKey()).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('getGoogleOAuthEnv', () => {
  it('returns the client id and secret', async () => {
    const env = await loadEnv({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    expect(env.getGoogleOAuthEnv()).toEqual({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
  });
  it('throws naming the missing variable', async () => {
    const env = await loadEnv({ GOOGLE_CLIENT_ID: 'id' });
    expect(() => env.getGoogleOAuthEnv()).toThrow(/GOOGLE_CLIENT_SECRET/);
  });
});

describe('createSupabaseAdminClient', () => {
  beforeEach(() => vi.resetModules());

  it('builds a client with the service role key and no stored session', async () => {
    const createClient = vi.fn(() => ({ marker: 'client' }));
    vi.doMock('@supabase/supabase-js', () => ({ createClient }));
    vi.doMock('@/lib/config/env', () => ({
      getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: URL_VALUE, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
      getSupabaseServiceRoleKey: () => SECRET,
    }));
    const { createSupabaseAdminClient } = await import('@/lib/supabase/admin');

    expect(createSupabaseAdminClient()).toEqual({ marker: 'client' });
    expect(createClient).toHaveBeenCalledWith(URL_VALUE, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
    vi.doUnmock('@supabase/supabase-js');
    vi.doUnmock('@/lib/config/env');
  });
});
