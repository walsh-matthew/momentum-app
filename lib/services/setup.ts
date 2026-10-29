// Guided setup's server side (MOM-111, docs/DOMAIN_MODEL.md §2): the next turn of the conversation, and the save. Server-only.
//
// Nothing about a setup is stored before the person approves it (the owner's 2026-10-27 decision). The browser holds the
// conversation and sends all of it with each turn, so everything arriving here is untrusted: it is parsed against the
// schemas in types/setup.ts, bounded in size, and the person is the signed-in user, never a field of the request.
//
// A turn: when the person's answer to a date question is only a relative date ("Monday"), code answers it itself with no
// call (lib/setup/codeTurns.ts, MOM-111 finding 8); otherwise runSetupTurn() (lib/services/llm.ts) applies the setup budget
// and limits and makes the one Claude call, with any date code read passed in as a hint. Its answer is then checked here, by
// code, before anyone sees it: it must parse as a turn, and checkTurn() must find no hard rule broken and the draft valid.
// A reply that fails is thrown away, counted, and asked for again (up to twice more), and each retry is told in fixed words
// which rule failed and what to do instead (lib/setup/feedback.ts, MOM-111 root cause A): the same input used to bring back
// the same mistake. It stops early when a retry breaks the same rules at the same paths as the one before. A reply that
// breaks only the plain-words checks gets one retry and is then shown, with its rule names logged (MOM-111 addition a): only
// the hard rules and the draft rules can end in "try again". Three unusable replies in a row end in a plain "try again" and
// nothing is lost. The count of thrown-away replies is returned and logged by category, rule name, check code, topic name and
// draft path only, never with any text or value (the usage log marks a call 'ok' when the API answered, even if the answer
// then fails the schema, so it cannot show this).
//
// The save: FIRST SETUP ONLY. It validates the draft in 'final' mode, turns it into the payload save_guided_setup() reads
// (migration 015) and makes that one call, which is one database transaction: everything the person approved, or nothing.
// If the person already has a goal the function refuses and nothing is written. Adding a goal after the first setup is a
// later piece of work and will be its own function.

import 'server-only';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkTurn, onlyPlainWords, type Violation } from '@/lib/setup/checks';
import { dateStep } from '@/lib/setup/codeTurns';
import { SHAPE_FEEDBACK, failingPaths, retryFeedback } from '@/lib/setup/feedback';
import { shownModel } from '@/lib/setup/paraphrase';
import { spokenTimes } from '@/lib/setup/playback';
import { personToday } from '@/lib/setup/relativeDates';
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
function quickPathView(session: SetupSession, reason: QuickPathReason, message: string, locale: string | undefined, today: string | undefined): SetupTurnView {
  const shown = withAllApproved(session);
  const validation = validateDraft(shown.draft, shown.transcript, 'final');
  return {
    kind: 'quick_path',
    reason,
    message,
    sections: quickPathSections(shownModel(session.draft, session.transcript), {
      locale,
      spokenTime: spokenTimes(session.draft, session.transcript),
      today: today ?? null,
    }),
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

  const context = { transcript: session.transcript, prevDraft: session.draft };
  // The person's own today: their time zone's date once setup knows it, else their device's (MOM-111 finding 8).
  const personDay = personToday(session.draft.model.person.timeZone, today, new Date());

  // An answer that is only a relative date ("Monday") is answered by code, with no call: the date as a proposal, or the
  // question again for a vague one. The turn is checked like any other; one that failed would go to Claude instead.
  const step = dateStep(session.transcript, session.draft, personDay);
  if (step?.kind === 'turn' && checkTurn(step.turn, context).length === 0) {
    return { ok: true, data: { kind: 'turn', turn: step.turn, spentTokens: session.spentTokens, rejected: 0 } };
  }
  const dateHint = step?.kind === 'hint' ? step.hint : undefined;

  let spentTokens = session.spentTokens;
  let rejected = 0;
  // Why the last try was thrown away, in code's own words, sent with the next one (MOM-111 root cause A).
  let feedback: string[] | undefined;
  // The plain-words checks get one retry; after it, a reply that breaks only them is shown (MOM-111 addition a).
  let plainRetried = false;
  let lastSignature: string | null = null;
  for (let attempt = 0; attempt <= MAX_REPLY_RETRIES; attempt++) {
    const answer = await runTurn({
      userId: user.data.userId,
      transcript: session.transcript,
      draft: session.draft,
      spentTokens,
      today: personDay,
      retryFeedback: feedback,
      dateHint,
    });
    if (answer.kind === 'quick_path') return { ok: true, data: quickPathView(session, answer.reason, answer.message, locale, personDay) };
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
      feedback = [SHAPE_FEEDBACK];
      lastSignature = null;
      continue;
    }
    const turn = AssistantTurnSchema.safeParse(result.raw);
    if (!turn.success) {
      rejected += 1;
      console.warn('[setup] a reply was thrown away', { category: 'schema' });
      feedback = [SHAPE_FEEDBACK];
      lastSignature = null;
      continue;
    }
    const violations = checkTurn(turn.data, context);
    if (violations.length === 0) return { ok: true, data: { kind: 'turn', turn: turn.data, spentTokens, rejected } };

    const rules = ruleNames(violations);
    const plainOnly = onlyPlainWords(violations);
    // Names only: rule names and the codes in lib/setup/checks.ts, both fixed lists, never text.
    const codes = [...new Set(violations.map((x) => x.code))].sort();
    if (plainOnly && (plainRetried || attempt === MAX_REPLY_RETRIES)) {
      console.warn('[setup] a reply was shown after its plain-words retry', { category: 'plain_words', rules, codes });
      return { ok: true, data: { kind: 'turn', turn: turn.data, spentTokens, rejected } };
    }
    rejected += 1;
    // The turn's topic and the topic it skipped are names from SETUP_TOPICS (the schema allows nothing else), never text.
    // Paths are the draft's keys and field names, never values (lib/setup/feedback.ts).
    console.warn('[setup] a reply was thrown away', {
      category: 'rules',
      rules,
      codes,
      paths: failingPaths(violations),
      topic: turn.data.topic,
      skippedTopic: turn.data.skipped?.topic ?? null,
    });
    feedback = retryFeedback(violations);
    if (plainOnly) {
      plainRetried = true;
      continue;
    }
    // The same rules failed at the same paths twice, feedback and all: a third try would be the same call again, so stop and
    // spend nothing more.
    const signature = `${codes.join()}|${failingPaths(violations).join()}`;
    if (signature === lastSignature) break;
    lastSignature = signature;
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
