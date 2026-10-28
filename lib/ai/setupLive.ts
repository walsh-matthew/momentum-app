// The safety rails and helpers for a LIVE setup eval run (MOM-128, design record §6.2): real Claude calls, paid for, run
// from tests/live/ and never from `npm test`. Pure: nothing here reads a file, runs a command or makes a call, so each rule
// is tested (tests/setup-live.test.ts).
//
// The rule that matters most: a live run writes usage rows and a throwaway account through the service-role client, so it
// must only ever reach the LOCAL Supabase stack. The developer's .env.local points at production. So the runner never
// takes a Supabase value from .env.local at all: it takes the local stack's own address and keys from
// `npx supabase status`, refuses anything that is not 127.0.0.1 or localhost, overwrites the process environment with the
// local values, and checks the address again after that. The only value it reads from .env.local is the Anthropic key.
// It lives in lib/ai/, not lib/setup/: lib/setup/ is pure and names no secret (tests/setup-boundary.test.ts).

import type { AssistantTurn, SetupTopic } from '@/types/setup';
import type { PersonLine } from '@/lib/setup/evals';

export class LiveRunRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveRunRefused';
  }
}

// Exactly the two names of this machine, over http or https. Parsed, not pattern-matched on the whole text: a URL such as
// http://127.0.0.1.example.com, http://localhost.example.com or http://127.0.0.1@example.com is not local, and the parser
// is what knows the difference.
export function isLocalSupabaseUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

// Returns the address, or refuses. The message never prints the address it refused: it may be the production project's.
export function assertLocalSupabaseUrl(value: unknown): string {
  if (!isLocalSupabaseUrl(value)) {
    throw new LiveRunRefused(
      'Refusing to run: the Supabase address this run would use is not the local stack (127.0.0.1 or localhost). A live run never touches a hosted project.',
    );
  }
  return (value as string).trim();
}

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

// Points the environment at the local stack and at the Anthropic key, whatever the environment held before (it may hold the
// production project's address and keys from .env.local). Nothing is changed unless every check passes first, and the
// address is checked once more after it is written, because that is the one the service client will read.
export function applyLiveEnvironment(env: Record<string, string | undefined>, local: LocalStack, anthropicApiKey: string): void {
  const apiUrl = assertLocalSupabaseUrl(local.apiUrl);
  if (!local.anonKey || !local.serviceRoleKey) {
    throw new LiveRunRefused('Refusing to run: the local Supabase stack did not report its keys. Is `npx supabase start` running?');
  }
  if (!anthropicApiKey) {
    throw new LiveRunRefused('Refusing to run: ANTHROPIC_API_KEY is not set in .env.local.');
  }
  env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = local.anonKey;
  env.SUPABASE_SERVICE_ROLE_KEY = local.serviceRoleKey;
  env.ANTHROPIC_API_KEY = anthropicApiKey;
  assertLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
}

// The value of one named variable in the text of an env file, or null. It reads that one name and nothing else, so the
// production Supabase address and keys beside it are never parsed into anything.
export function readEnvFileValue(text: string, name: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1 || line.slice(0, eq).trim() !== name) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])) value = value.slice(1, -1);
    return value === '' ? null : value;
  }
  return null;
}

// The KEY=value lines of `supabase status -o env`, values optionally quoted.
export function parseStatusEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw.trim());
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

export function localStackFromStatus(text: string): LocalStack {
  const s = parseStatusEnv(text);
  return { apiUrl: s.API_URL ?? '', anonKey: s.ANON_KEY ?? '', serviceRoleKey: s.SERVICE_ROLE_KEY ?? '' };
}

// ---------------------------------------------------------------------------
// Answering a live model by what it asked about
// ---------------------------------------------------------------------------

// A live model asks in its own order, so the scripted person's replies (written for a scripted model's order) are looked up
// by the topic of the question, each used once in the order the case gives them. A question with no reply left (a playback,
// a proposal, a topic the case never covered) gets a short neutral answer, and each of those is counted so the report can
// say how much of the run was the script and how much was filler.
export function topicKeyedReplies(
  scriptTopics: (SetupTopic | null)[],
  person: PersonLine[],
): { reply: (turn: AssistantTurn) => PersonLine; fallbackCount: () => number } {
  const queues = new Map<SetupTopic, PersonLine[]>();
  scriptTopics.forEach((topic, i) => {
    const line = person[i];
    if (topic === null || !line) return;
    queues.set(topic, [...(queues.get(topic) ?? []), line]);
  });
  let fallbacks = 0;
  return {
    reply(turn) {
      const next = turn.topic === null ? undefined : queues.get(turn.topic)?.shift();
      if (next) return next;
      fallbacks += 1;
      return { say: turn.kind === 'playback' || turn.kind === 'proposal' ? 'Yes, that is right.' : 'Whatever you suggest is fine.' };
    },
    fallbackCount: () => fallbacks,
  };
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

// Dollars per million tokens (input, output), from the Claude API price table cached 2026-10-06. Check them against the
// current table before reading the cost as more than an estimate.
export const PRICE_PER_MILLION: Record<string, readonly [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

// null for a model with no price here, so a caller cannot read an unknown model as free.
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICE_PER_MILLION[model];
  if (!price) return null;
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}
