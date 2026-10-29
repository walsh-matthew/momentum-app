// The safety rails of a live setup eval run (lib/ai/setupLive.ts, tests/live/setup-pilot.live.ts; MOM-128). A live run makes
// paid Claude calls and writes a throwaway account and usage rows through the service-role client, and the developer's
// .env.local points at PRODUCTION. These tests prove the run refuses to go anywhere but the local stack whatever the
// environment says, that the only thing taken from .env.local is the Anthropic key, and that `npm test` can never start a
// live run. Nothing here makes a network call or reads a real .env.local.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiveRunRefused,
  applyLiveEnvironment,
  assertLocalSupabaseUrl,
  estimateCostUsd,
  isLocalSupabaseUrl,
  localStackFromStatus,
  parseStatusEnv,
  readEnvFileValue,
  topicKeyedReplies,
  type LocalStack,
} from '@/lib/ai/setupLive';
import type { AssistantTurn, SetupTopic } from '@/types/setup';
import { emptyDraft } from '@/lib/setup/draft';

const PRODUCTION_URL = 'https://abcdefghijklmnop.supabase.co';
const PRODUCTION_SERVICE_KEY = 'prod-service-role-key-do-not-use';
const LOCAL: LocalStack = { apiUrl: 'http://127.0.0.1:54321', anonKey: 'local-anon', serviceRoleKey: 'local-service' };

describe('which Supabase addresses count as local', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://localhost', 'https://127.0.0.1:54321/', ' http://127.0.0.1:54321 '])(
    '%s is local',
    (url) => expect(isLocalSupabaseUrl(url)).toBe(true),
  );

  it.each([
    ['the production project', PRODUCTION_URL],
    ['a name that only starts with localhost', 'http://localhost.example.com:54321'],
    ['a name that only starts with 127.0.0.1', 'http://127.0.0.1.example.com'],
    ['a host that only mentions 127.0.0.1 in its path', 'https://example.com/127.0.0.1'],
    ['a host that only mentions localhost in its query', 'https://example.com/?host=localhost'],
    ['127.0.0.1 as the user part of an address to another host', 'http://127.0.0.1@example.com'],
    ['localhost as the user part of an address to another host', 'http://localhost:pw@example.com'],
    ['another loopback spelling', 'http://127.0.0.2:54321'],
    ['a LAN address', 'http://192.168.1.20:54321'],
    ['a local name over another protocol', 'ftp://localhost'],
    ['nothing', ''],
    ['only spaces', '   '],
    ['text that is not an address', 'not a url'],
    ['a missing value', undefined],
    ['a number', 127],
  ])('%s is not local', (_name, url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
    expect(() => assertLocalSupabaseUrl(url)).toThrow(LiveRunRefused);
  });

  it('the refusal never prints the address it refused', () => {
    try {
      assertLocalSupabaseUrl(PRODUCTION_URL);
      throw new Error('should have refused');
    } catch (error) {
      expect((error as Error).message).not.toContain('supabase.co');
      expect((error as Error).message).toMatch(/not the local stack/);
    }
  });
});

describe('the environment a live run uses', () => {
  // What .env.local gives the process: production.
  const productionEnv = () => ({
    NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'prod-anon',
    SUPABASE_SERVICE_ROLE_KEY: PRODUCTION_SERVICE_KEY,
    ANTHROPIC_API_KEY: undefined as string | undefined,
  });

  it('overwrites a production address and keys with the local stack\'s, whatever the environment held', () => {
    const env: Record<string, string | undefined> = productionEnv();
    applyLiveEnvironment(env, LOCAL, 'sk-ant-test');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('local-anon');
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('local-service');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(Object.values(env)).not.toContain(PRODUCTION_URL);
    expect(Object.values(env)).not.toContain(PRODUCTION_SERVICE_KEY);
  });

  it('refuses, and changes nothing, when the stack it was given is not local', () => {
    const env: Record<string, string | undefined> = productionEnv();
    const before = { ...env };
    expect(() => applyLiveEnvironment(env, { ...LOCAL, apiUrl: PRODUCTION_URL }, 'sk-ant-test')).toThrow(LiveRunRefused);
    expect(env).toEqual(before);
  });

  it.each([
    ['lookalike host', 'http://localhost.example.com'],
    ['hosted project', PRODUCTION_URL],
    ['empty', ''],
  ])('refuses a %s even though the keys and the Anthropic key are fine', (_name, apiUrl) => {
    const env: Record<string, string | undefined> = productionEnv();
    expect(() => applyLiveEnvironment(env, { ...LOCAL, apiUrl }, 'sk-ant-test')).toThrow(/not the local stack/);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(PRODUCTION_URL);
  });

  it('refuses when the local stack did not report its keys, or the Anthropic key is missing', () => {
    expect(() => applyLiveEnvironment({}, { ...LOCAL, serviceRoleKey: '' }, 'sk-ant-test')).toThrow(/did not report its keys/);
    expect(() => applyLiveEnvironment({}, LOCAL, '')).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('checks the address before it checks the key, so a production address is always the reason given', () => {
    expect(() => applyLiveEnvironment({}, { ...LOCAL, apiUrl: PRODUCTION_URL }, '')).toThrow(/not the local stack/);
  });

  describe("the address the service client will read (lib/config/env.ts)", () => {
    const saved = { ...process.env };
    beforeEach(() => {
      vi.resetModules();
      process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION_URL;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon';
      process.env.SUPABASE_SERVICE_ROLE_KEY = PRODUCTION_SERVICE_KEY;
    });
    afterEach(() => {
      process.env = { ...saved };
      vi.resetModules();
    });

    it('is the local one after applyLiveEnvironment, with production in the process environment beforehand', async () => {
      applyLiveEnvironment(process.env, LOCAL, 'sk-ant-test');
      const { getPublicEnv, getSupabaseServiceRoleKey } = await import('@/lib/config/env');
      expect(() => assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL)).not.toThrow();
      expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
      expect(getSupabaseServiceRoleKey()).toBe('local-service');
    });

    it('would be refused if the production address were what the client read', async () => {
      const { getPublicEnv } = await import('@/lib/config/env');
      expect(() => assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL)).toThrow(LiveRunRefused);
    });
  });
});

describe('what is read from .env.local', () => {
  const envFile = [
    '# the real file points at production',
    `NEXT_PUBLIC_SUPABASE_URL=${PRODUCTION_URL}`,
    'NEXT_PUBLIC_SUPABASE_ANON_KEY="prod-anon"',
    `SUPABASE_SERVICE_ROLE_KEY=${PRODUCTION_SERVICE_KEY}`,
    '',
    "ANTHROPIC_API_KEY='sk-ant-from-file'",
    'HEVY_API_KEY=hevy',
  ].join('\r\n');

  it('is one named value, and nothing else is parsed', () => {
    expect(readEnvFileValue(envFile, 'ANTHROPIC_API_KEY')).toBe('sk-ant-from-file');
    expect(readEnvFileValue(envFile, 'HEVY_API_KEY')).toBe('hevy');
    expect(readEnvFileValue(envFile, 'NOT_THERE')).toBeNull();
    expect(readEnvFileValue('ANTHROPIC_API_KEY=\n', 'ANTHROPIC_API_KEY')).toBeNull();
    expect(readEnvFileValue('# ANTHROPIC_API_KEY=commented', 'ANTHROPIC_API_KEY')).toBeNull();
    expect(readEnvFileValue('XANTHROPIC_API_KEY=other', 'ANTHROPIC_API_KEY')).toBeNull();
  });

  it('the live runner reads only the Anthropic key from the file and takes the Supabase side from the local stack', () => {
    const runner = readFileSync(join(process.cwd(), 'tests', 'live', 'setup-pilot.live.ts'), 'utf8');
    expect([...runner.matchAll(/readEnvFileValue\([^)]*\)/g)].map((m) => m[0])).toEqual(["readEnvFileValue(envFile, 'ANTHROPIC_API_KEY')"]);
    expect(runner).toMatch(/applyLiveEnvironment\(process\.env, localStackFromStatus\(/);
    expect(runner).toMatch(/assertLocalSupabaseUrl\(getPublicEnv\(\)\.NEXT_PUBLIC_SUPABASE_URL\)/);
    // No other way for the production address to get in.
    expect(runner).not.toMatch(/dotenv|loadEnv|process\.env\.NEXT_PUBLIC_SUPABASE_URL\s*=/);
  });

  it('reads the local stack from `supabase status -o env` text', () => {
    const text = ['API_URL="http://127.0.0.1:54321"', 'ANON_KEY="local-anon"', 'SERVICE_ROLE_KEY="local-service"', 'junk', ''].join('\n');
    expect(parseStatusEnv(text)).toMatchObject({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'local-anon' });
    expect(localStackFromStatus(text)).toEqual(LOCAL);
    // A stack that is not running reports nothing, and that is refused rather than guessed at.
    expect(localStackFromStatus('')).toEqual({ apiUrl: '', anonKey: '', serviceRoleKey: '' });
    expect(() => applyLiveEnvironment({}, localStackFromStatus(''), 'sk-ant-test')).toThrow(LiveRunRefused);
  });
});

describe('a live run cannot start from `npm test`', () => {
  const dir = join(process.cwd(), 'tests', 'live');

  it('the default test config includes only *.test files, and the live files are not named like one', () => {
    const config = readFileSync(join(process.cwd(), 'vitest.config.mts'), 'utf8');
    expect(config).toMatch(/include:\s*\['tests\/\*\*\/\*\.test\.\{ts,tsx\}'\]/);
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f, f).toMatch(/\.live\.ts$/);
      expect(f, f).not.toMatch(/\.test\./);
    }
  });

  it('the live config is separate and only includes the live files; the script is the only way to run it', () => {
    const live = readFileSync(join(process.cwd(), 'vitest.live.config.mts'), 'utf8');
    expect(live).toMatch(/include:\s*\['tests\/live\/\*\*\/\*\.live\.ts'\]/);
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['eval:setup:pilot']).toBe('vitest run --config vitest.live.config.mts');
    expect(pkg.scripts.test).toBe('vitest run');
    // CI runs `npm test`, not the pilot.
    const ci = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).not.toMatch(/eval:setup|vitest\.live/);
  });
});

describe('answering a live model by what it asked about', () => {
  const turn = (over: Partial<AssistantTurn>): AssistantTurn => ({
    kind: 'question',
    chunk: null,
    skipped: null,
    detail: null,
    say: '',
    question: 'Q?',
    topic: null,
    options: [],
    draft: emptyDraft(),
    ...over,
  });
  const topics: (SetupTopic | null)[] = ['idea', 'why', 'floor', 'floor', null];
  const lines = [{ say: 'idea reply' }, { say: 'why reply' }, { say: 'first floor' }, { say: 'second floor' }, { say: 'x' }];

  it('uses each scripted reply once, in order, whatever order the model asks in', () => {
    const p = topicKeyedReplies(topics, lines);
    expect(p.reply(turn({ topic: 'floor' })).say).toBe('first floor');
    expect(p.reply(turn({ topic: 'idea' })).say).toBe('idea reply');
    expect(p.reply(turn({ topic: 'floor' })).say).toBe('second floor');
    expect(p.fallbackCount()).toBe(0);
  });

  it('gives a short neutral answer, and counts it, when no scripted reply is left or the topic is new', () => {
    const p = topicKeyedReplies(topics, lines);
    expect(p.reply(turn({ topic: 'why' })).say).toBe('why reply');
    expect(p.reply(turn({ topic: 'why' })).say).toBe('Whatever you suggest is fine.');
    expect(p.reply(turn({ kind: 'playback', topic: null, question: null })).say).toBe('Yes, that is right.');
    expect(p.reply(turn({ kind: 'proposal', topic: 'start_date' })).say).toBe('Yes, that is right.');
    expect(p.fallbackCount()).toBe(3);
  });
});

describe('the cost estimate', () => {
  it('uses the cached price table, and says nothing for a model it has no price for', () => {
    expect(estimateCostUsd('claude-opus-5-5', 1_000_000, 100_000)).toBeCloseTo(4 + 2, 6);
    expect(estimateCostUsd('claude-sonnet-5-5', 1_000_000, 1_000_000)).toBeCloseTo(12, 6);
    expect(estimateCostUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6, 6);
    expect(estimateCostUsd('some-new-model', 1, 1)).toBeNull();
  });
});
