// The guards that keep the browser specs (MOM-61) on the local stack and off the model. Pure and fast: no browser,
// no Supabase, no network. `npm test` runs this; `npm run test:e2e` is what needs Docker.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { afterEach, describe, expect, it } from 'vitest';
import { assertLocalUrl, assertNoModelKey, localStackEnvFrom, parseEnvLines } from './e2e/support/localStack';

const LOCAL = {
  API_URL: 'http://127.0.0.1:54321',
  MAILPIT_URL: 'http://127.0.0.1:54324',
  ANON_KEY: 'local-anon',
  SERVICE_ROLE_KEY: 'local-service',
};

describe('assertLocalUrl', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'https://localhost', 'http://127.0.0.1'])('accepts %s', (url) => {
    expect(assertLocalUrl(url, 'X')).toBe(url);
  });

  it.each([
    ['a hosted project', 'https://abcdefghijklmnop.supabase.co'],
    ['a custom domain', 'https://db.example.com'],
    ['another machine on the network', 'http://192.168.1.20:54321'],
    ['0.0.0.0', 'http://0.0.0.0:54321'],
    ['localhost as a prefix of a real domain', 'https://localhost.evil.example'],
    ['localhost inside the path of a real domain', 'https://evil.example/localhost'],
    ['localhost as the user part of the address', 'http://localhost@evil.example'],
    ['a look-alike with a trailing dot-domain', 'https://127.0.0.1.evil.example'],
  ])('refuses %s', (_name, url) => {
    expect(() => assertLocalUrl(url, 'NEXT_PUBLIC_SUPABASE_URL')).toThrow(/localhost or 127\.0\.0\.1/);
  });

  it.each([undefined, '', 'not a url', '127.0.0.1:54321'])('refuses %j as missing or not a URL', (value) => {
    expect(() => assertLocalUrl(value, 'NEXT_PUBLIC_SUPABASE_URL')).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('names the variable and the host, and never the full address', () => {
    const url = 'https://secretproject.supabase.co/rest/v1?apikey=do-not-print';
    try {
      assertLocalUrl(url, 'NEXT_PUBLIC_SUPABASE_URL');
      expect.unreachable();
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(message).toContain('secretproject.supabase.co');
      expect(message).not.toContain('do-not-print');
    }
  });
});

describe('localStackEnvFrom', () => {
  it('builds the dev server environment from the local status', () => {
    const { serverEnv, mailpitUrl } = localStackEnvFrom(LOCAL);
    expect(serverEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('local-anon');
    expect(serverEnv.SUPABASE_SERVICE_ROLE_KEY).toBe('local-service');
    expect(mailpitUrl).toBe('http://127.0.0.1:54324');
  });

  it('throws if the Supabase URL is not local, before anything is started', () => {
    expect(() => localStackEnvFrom({ ...LOCAL, API_URL: 'https://abc.supabase.co' })).toThrow(/localhost or 127\.0\.0\.1/);
  });

  it('throws if the inbox is not local', () => {
    expect(() => localStackEnvFrom({ ...LOCAL, MAILPIT_URL: 'https://mail.example.com' })).toThrow(/MAILPIT_URL/);
  });

  it('throws if the keys are missing, rather than starting a server that cannot sign anyone in', () => {
    expect(() => localStackEnvFrom({ API_URL: LOCAL.API_URL, MAILPIT_URL: LOCAL.MAILPIT_URL })).toThrow(/keys/);
  });

  it('pins the model key, the other server secrets and the CAPTCHA keys to empty, so nothing from .env.local reaches the server', () => {
    const { serverEnv } = localStackEnvFrom(LOCAL);
    for (const name of [
      'ANTHROPIC_API_KEY',
      'HEVY_API_KEY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
      'NEXT_PUBLIC_CAPTCHA_PROVIDER',
    ]) {
      expect(Object.hasOwn(serverEnv, name), name).toBe(true);
      expect(serverEnv[name], name).toBe('');
    }
  });
});

describe('assertNoModelKey', () => {
  it('stops the run when the key is set in the runner\'s environment', () => {
    expect(() => assertNoModelKey({ ANTHROPIC_API_KEY: 'sk-ant-whatever' })).toThrow(/ANTHROPIC_API_KEY is set/);
  });
  it('does not print the key', () => {
    try {
      assertNoModelKey({ ANTHROPIC_API_KEY: 'sk-ant-do-not-print' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-ant-do-not-print');
    }
  });
  it.each([{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_API_KEY: undefined }])('lets %j through', (env) => {
    expect(() => assertNoModelKey(env)).not.toThrow();
  });
});

describe('parseEnvLines', () => {
  it('reads KEY="value" and KEY=value lines and ignores the rest', () => {
    expect(parseEnvLines('API_URL="http://127.0.0.1:54321"\nANON_KEY=abc\n# note\n\nnot a var')).toEqual({
      API_URL: 'http://127.0.0.1:54321',
      ANON_KEY: 'abc',
    });
  });
});

// The server is started with ANTHROPIC_API_KEY set to an empty string and relies on Next.js leaving it alone when
// .env.local sets a real one. That is a fact about Next.js, so it is checked here with the real loader.
describe('Next.js keeps a variable that is already set, even to an empty string', () => {
  const saved = { ...process.env };
  const dirs: string[] = [];
  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('an empty ANTHROPIC_API_KEY in the environment wins over one in .env.local', () => {
    const dir = mkdtempSync(join(tmpdir(), 'momentum-env-'));
    dirs.push(dir);
    writeFileSync(join(dir, '.env.local'), 'ANTHROPIC_API_KEY=from-env-local\nNEXT_PUBLIC_SUPABASE_URL=https://prod.example.supabase.co\n');
    process.env.ANTHROPIC_API_KEY = '';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    loadEnvConfig(dir, true);
    expect(process.env.ANTHROPIC_API_KEY).toBe('');
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  });

  it('and the app treats the empty value as not configured', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    const { getAnthropicApiKey } = await import('@/lib/config/env');
    expect(() => getAnthropicApiKey()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
