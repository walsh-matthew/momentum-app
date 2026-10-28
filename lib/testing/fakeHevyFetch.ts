// A canned stand-in for Hevy's API, for the browser tests only (MOM-129). Loaded solely by
// lib/services/hevySyncDeps.ts, and only when its three guards pass. It answers from the key it is given, so a spec
// picks the case by the key it connects with:
//   a key containing "refused"  ->  401 (the key is refused)
//   a key containing "slow"     ->  the request fails (a timeout or network error)
//   any other key               ->  two workouts, the same two every time
// It makes no network request and reads nothing but the request.

const WORKOUTS = [
  { id: '00000000-0000-4000-8000-0000000000a1', start: '2026-10-26T17:00:00Z', end: '2026-10-26T17:45:00Z', title: 'Upper A' },
  { id: '00000000-0000-4000-8000-0000000000a2', start: '2026-10-27T17:00:00Z', end: '2026-10-27T17:50:00Z', title: 'Lower A' },
].map((w) => ({
  id: w.id,
  title: w.title,
  start_time: w.start,
  end_time: w.end,
  exercises: [{ title: 'Bench Press', sets: [{ type: 'normal', weight_kg: 60, reps: 8 }] }],
}));

export const fakeHevyFetch: typeof fetch = async (_input, init) => {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const key = headers['api-key'] ?? '';
  if (key.includes('slow')) throw new Error('The request timed out.');
  if (key.includes('refused')) return new Response('{}', { status: 401 });
  return new Response(JSON.stringify({ page: 1, page_count: 1, workouts: WORKOUTS }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
