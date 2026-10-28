// Which fetch a Hevy sync uses (MOM-129). Always the real one, except in the browser tests (tests/e2e), which cannot
// intercept a call the dev server makes and so ask it to answer from a canned stand-in instead.
//
// The stand-in is used only when ALL THREE hold, and any one failing means the real fetch:
//   1. E2E_FAKE_HEVY is exactly "1" (only tests/e2e/support/localStack.ts sets it, for the test dev server),
//   2. NODE_ENV is not "production",
//   3. the Supabase URL is on this machine (localhost or 127.0.0.1), never a hosted project.
// The stand-in's module is loaded by a dynamic import only after the guard passes, so on any other path it is not
// even evaluated. tests/hevy-sync-deps.test.ts proves each guard on its own.

import { getFakeHevyEnv, type FakeHevyEnv } from '@/lib/config/env';
import type { HevySyncDeps } from './syncedEntries';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function isLocalUrl(url: string | undefined): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url ?? '').hostname);
  } catch {
    return false;
  }
}

export function fakeHevyAllowed(env: FakeHevyEnv): boolean {
  return env.E2E_FAKE_HEVY === '1' && env.NODE_ENV !== 'production' && isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL);
}

// `{}` means the adapter uses the real fetch.
export async function hevySyncDeps(env: FakeHevyEnv = getFakeHevyEnv()): Promise<HevySyncDeps> {
  if (!fakeHevyAllowed(env)) return {};
  const { fakeHevyFetch } = await import('@/lib/testing/fakeHevyFetch');
  return { fetch: fakeHevyFetch };
}
