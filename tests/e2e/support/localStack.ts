// What the browser specs need to know about the local Supabase stack, and the guards that keep them off anything
// else (MOM-61). Imported by playwright.config.ts and by a unit test (tests/e2e-guard.test.ts), so it has no
// Playwright import and no side effects on load.
//
// The specs create real accounts and goals. They must never run against the production project, so the Supabase URL
// is checked here before a server is started, and the Mailpit address is held to the same rule.

import { execFileSync } from 'node:child_process';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// Throws unless `url` is an http(s) address on this machine. The message names the variable and the host, never a
// key or a path, so it is safe to show.
export function assertLocalUrl(url: string | undefined, name: string): string {
  let host: string;
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    throw new Error(`${name} is missing or not a URL. The E2E specs only run against the local Supabase stack (npx supabase start).`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${name} points at "${host}", not localhost or 127.0.0.1. The E2E specs create accounts and goals and must only run ` +
        'against the local Supabase stack. Nothing was started.',
    );
  }
  return url as string;
}

// The variables the Next.js dev server is started with. Everything is explicit, so nothing from .env.local (which
// holds the production project) can reach it: Next.js does not replace a variable that is already set, and an empty
// string counts as set (checked in tests/e2e-guard.test.ts). The model key is pinned empty on purpose: the wizard
// specs expect "Claude plans aren't set up", and a real key would make Generate a paid request.
export interface LocalStackEnv {
  serverEnv: Record<string, string>;
  mailpitUrl: string;
}

// Pure: turns `supabase status -o env` output into the dev server's environment. Values are never logged.
export function localStackEnvFrom(status: Record<string, string>): LocalStackEnv {
  const apiUrl = assertLocalUrl(status.API_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  const mailpitUrl = assertLocalUrl(status.MAILPIT_URL ?? status.INBUCKET_URL, 'MAILPIT_URL');
  const anon = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const service = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!anon || !service) throw new Error('`supabase status -o env` did not give the local anon and service keys. Is the stack running?');
  return {
    mailpitUrl,
    serverEnv: {
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service,
      // Pinned empty, not left unset: see the comment above.
      ANTHROPIC_API_KEY: '',
      HEVY_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      // No CAPTCHA widget: the local Auth server has CAPTCHA off, so a site key from .env.local would break sign-in (MOM-64).
      NEXT_PUBLIC_CAPTCHA_SITE_KEY: '',
      NEXT_PUBLIC_CAPTCHA_PROVIDER: '',
    },
  };
}

// Parses KEY="value" lines (the format of `supabase status -o env`).
export function parseEnvLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

// Runs the Supabase CLI for the local stack. The output is parsed here and never printed.
export function readLocalStackEnv(): LocalStackEnv {
  let text: string;
  try {
    text = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
  } catch {
    throw new Error('Could not read the local Supabase stack. Start it with `npx supabase start` (needs Docker), then run the specs again.');
  }
  return localStackEnvFrom(parseEnvLines(text));
}

// The specs refuse to run when the model key is present in the runner's own environment: they expect the
// not-configured failure, and a present key means someone may have a paid path open.
export function assertNoModelKey(env: Record<string, string | undefined>): void {
  if (env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is set in this shell. The E2E specs must run without it (the wizard specs expect "Claude plans ' +
        "aren't set up on the server yet\"). Unset it for this run, for example `ANTHROPIC_API_KEY= npm run test:e2e`.",
    );
  }
}

// ---------------------------------------------------------------------------
// The fake model for the guided setup spec (MOM-111)
// ---------------------------------------------------------------------------

// The port of the fake Anthropic server the runner starts (tests/e2e/support/fakeAnthropic.ts).
export const FAKE_MODEL_PORT = 3199;

// What the dev server is given instead of an empty model key: a dummy key and the address of the fake model, on this machine.
// The SDK sends every request to ANTHROPIC_BASE_URL, so nothing can reach the real API (the key is not a real one either),
// and the fake answers 401 to everything that is not a setup turn, so the other specs still see "not configured".
// Configured here and in playwright.config.ts only: no switch exists in the app's own code.
export function fakeModelEnv(port: number = FAKE_MODEL_PORT): { ANTHROPIC_API_KEY: string; ANTHROPIC_BASE_URL: string } {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('The fake model needs a port between 1024 and 65535.');
  return { ANTHROPIC_API_KEY: 'e2e-fake-key-not-a-secret', ANTHROPIC_BASE_URL: assertLocalUrl(`http://127.0.0.1:${port}`, 'ANTHROPIC_BASE_URL') };
}
