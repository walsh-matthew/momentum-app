// One job at a time per person (MOM-129). Holds a person's id while their job runs and refuses a second job for the
// same person until the first ends, even when it throws. It is per server instance, not shared: there is no database
// lock (no migration), so two instances can still overlap. Callers must not rely on it for correctness, only to
// avoid needless work; for "Sync now" an overlap is harmless because an entry is keyed by (target, source, provider
// record id) and a duplicate insert is already treated as "unchanged".

const running = new Set<string>();

// Runs `job` unless one is already running for `key`, in which case it returns null and runs nothing.
export async function runExclusive<T>(key: string, job: () => Promise<T>): Promise<T | null> {
  if (running.has(key)) return null;
  running.add(key);
  try {
    return await job();
  } finally {
    running.delete(key);
  }
}
