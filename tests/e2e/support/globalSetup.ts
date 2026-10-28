// Runs once before the browser specs (playwright.config.ts `globalSetup`, MOM-111): starts the fake model the guided setup spec
// talks to, and empties the LOCAL Claude usage log so the shared 200-call daily cap (which counts every row of the last 24
// hours) cannot stop a spec because earlier runs used it up. The log is cleared in the local database container only, the same
// way scripts/run-sql-verify.ts reaches it; playwright.config.ts has already refused to start unless Supabase is the local stack.

import { execFileSync } from 'node:child_process';
import { startFakeAnthropic } from './fakeAnthropic';
import { FAKE_MODEL_PORT } from './localStack';
import { e2eCase } from './setupConversation';

function clearLocalUsageLog(): void {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split(/\r?\n/);
  const db = names.find((name) => name.startsWith('supabase_db_'));
  if (!db) throw new Error('No local Supabase database container is running. Start it with `npx supabase start`.');
  execFileSync('docker', ['exec', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'delete from public.llm_usage_logs'], { stdio: 'ignore' });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  clearLocalUsageLog();
  const fake = await startFakeAnthropic(FAKE_MODEL_PORT, e2eCase().script);
  return () => fake.close();
}
