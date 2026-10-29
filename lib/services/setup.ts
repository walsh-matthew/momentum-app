// Guided setup's server side (MOM-111, docs/DOMAIN_MODEL.md §2): the next turn of the conversation, and the save. Server-only.
//
// Nothing about a setup is stored before the person approves it (the owner's 2026-10-27 decision). The browser holds the
// conversation and sends all of it with each turn, so everything arriving here is untrusted: it is parsed against the
// schemas in types/setup.ts, bounded in size, and the person is the signed-in user, never a field of the request.
//
// A turn: runSetupTurn() (lib/services/llm.ts) applies the setup budget and limits and makes the one Claude call. Its answer
// is then checked here, by code, before anyone sees it: it must parse as a turn, and checkTurn() must find no hard rule
// broken and the draft valid. A reply that fails is thrown away, counted, and asked for again (up to twice more, but not a
// third time when the second broke the same rules as the first: it is the same call again); the person never sees it. Three unusable replies in a row end in a plain "try again" and nothing is lost. The count of thrown-away
// replies is returned and logged by category, rule name and topic name only, never with any text (the usage log marks a call 'ok' when
// the API answered, even if the answer then fails the schema, so it cannot show this).
//
// The save: FIRST SETUP ONLY. It validates the draft in 'final' mode, turns it into the payload save_guided_setup() reads
// (migration 015) and makes that one call, which is one database transaction: everything the person approved, or nothing.
// If the person already has a goal the function refuses and nothing is written. Adding a goal after the first setup is a
// later piece of work and will be its own function.

import 'server-only';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkTurn, type Violation } from '@/lib/setup/checks';
import { spokenTimes } from '@/lib/setup/playback';
import { describeMissing, quickPathSections } from '@/lib/setup/quickPath';
import { draftToRows, toSavePayload } from '@/lib/setup/rows';
import { validateDraft } from '@/lib/setup/validate';
import type { Json } from '@/types/database.types';
import {
  AssistantTurnSchema,
  PersonLocaleSchema,
  SETUP_CHUNKS,
  SetupSessionSchema,
  SuggestedDateSchema,
  type SetupSession,
} from '@/types/setup';
import type { QuickPathReason, SetupSaved, SetupTurnView } from '@/types/setupScreen';
import { runSetupTurn } from './llm';
import type { ServiceResult } from './result';

// A reply that is not usable is asked for again this many times before the person is told to try again.
export const MAX_REPLY_RETRIES = 2;

// "MS001": migration 015 raises it when the person already has a goal.
export const ALREADY_SET_UP_CODE = 'MS001';
export const ALREADY_SET_UP = 'Setup has already been done for this account. Nothing was saved.';

const SIGN_IN = 'Sign in to set up your goals.';
const BAD_REQUEST = 'That setup could not be read. Start again. Nothing was saved.';
const SAVE_FAILED = 'Could not save your setup. Nothing was saved.';

export const SETUP_FAILURE_MESSAGES = {
  not_configured: "Claude isn't set up on the server yet, so setup can't go on. Nothing was saved.",
  refused: "Claude couldn't help with that. Try saying it another way. What you've said so far is kept.",
  rate_limited: "Claude is busy right now. Try again in a moment. What you've said so far is kept.",
  unavailable: "Claude couldn't be reached. Try again in a moment. What you've said so far is kept.",
  unusable: "I couldn't put together a good reply just now. What you've said so far is kept; please try again.",
} as const;

// A locale that is not one is dropped, never a reason to refuse the turn: the playback then shows times as the person gave them.
const TurnRequestSchema = SetupSessionSchema.extend({
  today: SuggestedDateSchema.optional(),
  locale: PersonLocaleSchema.optional().catch(undefined),
});

const SavedCountsSchema = z.object({ goals: z.number().int(), targets: z.number().int() });

type RunSetupTurnFn = typeof runSetupTurn;
export interface SetupDeps {
  // Swappable in tests so no network call is made.
  runTurn?: RunSetupTurnFn;
}

async function signedInUserId(): Promise<ServiceResult<{ userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: SIGN_IN };
  return { ok: true, data: { userId: data.user.id, supabase } };
}

// The rule names behind a rejection, for the log. Names only.
const ruleNames = (violations: Violation[]): string[] => [...new Set(violations.map((v) => v.rule))].sort();

// Saving from the quick path is the person's approval of every part shown, so all four count as approved.
const withAllApproved = (session: SetupSession): SetupSession => ({
  ...session,
  draft: { ...session.draft, approved: [...SETUP_CHUNKS] },
});

// The playback here is written on the server, so a clock time uses the locale the browser sent; without one, the time reads
// as the person gave it (lib/setup/playback.ts).
function quickPathView(session: SetupSession, reason: QuickPathReason, message: string, locale: string | undefined): SetupTurnView {
  const shown = withAllApproved(session);
  const validation = validateDraft(shown.draft, shown.transcript, 'final');
  return {
    kind: 'quick_path',
    reason,
    message,
    sections: quickPathSections(session.draft.model, { locale, spokenTime: spokenTimes(session.draft, session.transcript) }),
    missing: describeMissing(session.draft.model, validation.issues),
    canSave: validation.ok,
  };
}

// The next turn of Claude's, checked. `raw` is the conversation so far, as the browser sent it.
export async function takeSetupTurn(raw: unknown, deps: SetupDeps = {}): Promise<ServiceResult<SetupTurnView>> {
  const parsed = TurnRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: BAD_REQUEST };
  const { today, locale, ...session } = parsed.data;
  const last = session.transcript[session.transcript.length - 1];
  // Claude speaks first, and then only after the person has: anything else has nothing to answer.
  if (last !== undefined && last.role !== 'person') return { ok: false, error: BAD_REQUEST };

  const user = await signedInUserId();
  if (!user.ok) return user;
  const runTurn = deps.runTurn ?? runSetupTurn;

  let spentTokens = session.spentTokens;
  let rejected = 0;
  let lastRules: string | null = null;
  for (let attempt = 0; attempt <= MAX_REPLY_RETRIES; attempt++) {
    const answer = await runTurn({
      userId: user.data.userId,
      transcript: session.transcript,
      draft: session.draft,
      spentTokens,
      today,
    });
    if (answer.kind === 'quick_path') return { ok: true, data: quickPathView(session, answer.reason, answer.message, locale) };
    if (answer.kind === 'wait') return { ok: true, data: { kind: 'wait', message: answer.message, retryAfterSeconds: answer.retryAfterSeconds } };

    // The tokens of every call count against the setup budget, a thrown-away reply as much as a kept one.
    spentTokens = answer.spentTokens;
    const result = answer.result;
    if (!result.ok && result.reason !== 'bad_output') {
      return { ok: true, data: { kind: 'failed', message: SETUP_FAILURE_MESSAGES[result.reason], rejected } };
    }

    if (!result.ok) {
      rejected += 1;
      console.warn('[setup] a reply was thrown away', { category: 'output' });
      lastRules = null;
      continue;
    }
    const turn = AssistantTurnSchema.safeParse(result.raw);
    if (!turn.success) {
      rejected += 1;
      console.warn('[setup] a reply was thrown away', { category: 'schema' });
      lastRules = null;
      continue;
    }
    const violations = checkTurn(turn.data, { transcript: session.transcript, prevDraft: session.draft });
    if (violations.length > 0) {
      rejected += 1;
      const rules = ruleNames(violations);
      // The turn's topic and the topic it skipped are names from SETUP_TOPICS (the schema allows nothing else), never text.
      console.warn('[setup] a reply was thrown away', { category: 'rules', rules, topic: turn.data.topic, skippedTopic: turn.data.skipped?.topic ?? null });
      // The same input broke the same rules twice: a third try is the same call again, so stop and spend nothing more.
      if (rules.join() === lastRules) break;
      lastRules = rules.join();
      continue;
    }
    return { ok: true, data: { kind: 'turn', turn: turn.data, spentTokens, rejected } };
  }
  return { ok: true, data: { kind: 'failed', message: SETUP_FAILURE_MESSAGES.unusable, rejected } };
}

// Has the signed-in person already set up? The screen shows that instead of a second conversation.
export async function getSetupStart(): Promise<ServiceResult<{ alreadySetUp: boolean }>> {
  const user = await signedInUserId();
  if (!user.ok) return user;
  const { data, error } = await user.data.supabase.from('goals').select('id').eq('user_id', user.data.userId).limit(1);
  if (error) return { ok: false, error: 'Could not check your setup.' };
  return { ok: true, data: { alreadySetUp: data.length > 0 } };
}

// Saves an approved setup, or nothing. `quickPath` is true only when the person tapped save on the quick path screen, which
// shows every part and so counts as their approval of each. First setup only.
export async function saveApprovedSetup(raw: unknown, quickPath: unknown = false): Promise<ServiceResult<SetupSaved>> {
  const parsed = SetupSessionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: BAD_REQUEST };
  const user = await signedInUserId();
  if (!user.ok) return user;

  const session = quickPath === true ? withAllApproved(parsed.data) : parsed.data;
  const rows = draftToRows(session.draft, session.transcript);
  if (!rows.ok) {
    const missing = describeMissing(session.draft.model, rows.issues);
    return { ok: false, error: `This setup can't be saved yet.${missing.length > 0 ? ` Still needed: ${missing.join(' ')}` : ''} Nothing was saved.` };
  }

  const { data, error } = await user.data.supabase.rpc('save_guided_setup', { p_payload: toSavePayload(rows.rows) as unknown as Json });
  if (error) {
    // The code only: the message can quote what was sent.
    if (error.code === ALREADY_SET_UP_CODE) return { ok: false, error: ALREADY_SET_UP };
    console.error('[setup] could not save a setup', { code: error.code ?? 'none' });
    return { ok: false, error: SAVE_FAILED };
  }
  const counts = SavedCountsSchema.safeParse(data);
  if (!counts.success) {
    console.error('[setup] the save answered in an unexpected shape');
    return { ok: false, error: SAVE_FAILED };
  }
  return { ok: true, data: { goals: counts.data.goals, targets: counts.data.targets } };
}
