// @vitest-environment jsdom
//
// MOM-111 setup fix round 2, from the owner's second phone run on 2026-10-29. Setup could not get past "where do you track
// it": every reply was thrown away as 'schema' or 'output', and one turn ended in "Could not reach the server". These tests
// pin the fixes in the shared places every step and card uses:
// - B: the draft the answer "Hevy for lifts and I'll log my runs myself" needs is easy to write and passes; the apps a synced
//   source may name are listed; a key left out reads as "not answered" instead of throwing the reply away (swept over every
//   such key).
// - A: a thrown-away reply is logged by paths and zod codes only, and its retry hears each path and what goes there; an
//   unusable answer says which way it failed.
// - C: a turn stops retrying when another call cannot fit before the server's limit, and ends in the stuck-reply card.
// - "Heavy" is Hevy, and an Apple Watch cannot be read yet; lengths of time are counted from the start date (finding 7);
//   the new plain-words checks (findings 1, 4 and 9); and sweeps over every card (findings 2, 8, 12, 13 and 14).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnswerChoice } from '@/components/setup/AnswerChoice';
import { FinalCard } from '@/components/setup/FinalCard';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { RetryNotice } from '@/components/setup/RetryNotice';
import { MIN_CALL_MS, SETUP_TURN_BUDGET_MS, runCheckedTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { checkDateLeadIn, checkOneQuestion, checkQuestionLength, checkTurn } from '@/lib/setup/checks';
import { dateStep, lengthProposal } from '@/lib/setup/codeTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { OUTPUT_FEEDBACK, OUTPUT_PROBLEMS, shapeFeedback, shapeIssuesForLog } from '@/lib/setup/feedback';
import { DRAFT_SHAPE_TEXT } from '@/lib/setup/prompt';
import { durationEnd, durationIn, durationWeeks, isOnlyDuration, stretchLastDay } from '@/lib/setup/relativeDates';
import { describeAt } from '@/lib/setup/schemaText';
import { PICK_OTHER_DATE, PROPOSAL_YES_TEXT, TYPE_INSTEAD, errorText, type RetryCause } from '@/lib/setup/session';
import { appsIn, sourceNote } from '@/lib/setup/sources';
import { validateDraft } from '@/lib/setup/validate';
import { AssistantTurnSchema, SetupDraftSchema, type AssistantTurn, type SetupDraft, type SetupSession, type Transcript } from '@/types/setup';
import { goal, item, scriptedModel, target } from './helpers/setupScript';
import { SETUP_CASES } from './setup-evals/cases';
import { SMOKE_CASES, SMOKE_TODAY } from './setup-evals/smokeCases';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'Where do you track this now, if anywhere?',
  detail: null,
  topic: 'source',
  options: [],
  draft: emptyDraft(),
  ...over,
});

// The draft at the "where do you track it" step of the owner's run: one goal, the approved "workouts" target, floor 2, aim 3.
function atSourceStep(): SetupDraft {
  const d = emptyDraft();
  d.model.goals.push(
    goal('g1', 'Physical fitness', {
      startDate: '2026-11-02',
      shape: 'ongoing',
      blockWeeks: 9,
      targets: [target('workouts', 'Workouts', { floor: 2, aspiration: 3 })],
      items: [item('i1', 'habit', 'Do a workout', { targetKey: 'workouts' })],
    }),
  );
  d.approved = ['goals', 'targets'];
  return d;
}

// ---------------------------------------------------------------------------
// B: the draft the answer needs
// ---------------------------------------------------------------------------

describe('B: "Hevy for lifts and I\'ll log my runs myself" is easy to write and passes', () => {
  it('as two sources on the one approved target, with no label of which activity each covers', () => {
    const d = atSourceStep();
    d.model.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'hevy', metric: null }, { kind: 'manual' }];
    expect(SetupDraftSchema.safeParse(d).success).toBe(true);
    // Provenance needs the conversation; every rule about the draft itself passes.
    expect(validateDraft(d, [], 'progress').issues.filter((i) => i.code === 'rule')).toEqual([]);
  });

  it('and with the metric key left out, which reads as "not answered"', () => {
    const d = atSourceStep() as unknown as { model: { goals: { targets: { sources: unknown[] }[] }[] } };
    d.model.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'hevy' }, { kind: 'manual' }];
    const parsed = SetupDraftSchema.safeParse(d);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.model.goals[0].targets[0].sources[0]).toEqual({ kind: 'synced', provider: 'hevy', metric: null });
  });

  it('the prompt lists the apps a synced source may name, and says what any other app is', () => {
    expect(DRAFT_SHAPE_TEXT).toContain('provider: "hevy" | "google_calendar", the only apps Momentum can read; for any other app the source is the manual kind');
    expect(DRAFT_SHAPE_TEXT).toContain('metric: null unless this target is a quantity counted in that app');
  });

  it('refuses a capitalised or unknown app name, and the retry names the path and the apps allowed', () => {
    for (const provider of ['Hevy', 'apple watch', 'strava']) {
      const d = atSourceStep() as unknown as { model: { goals: { targets: { sources: unknown[] }[] }[] } };
      d.model.goals[0].targets[0].sources = [{ kind: 'synced', provider, metric: null }];
      const parsed = AssistantTurnSchema.safeParse(turn({ draft: d as unknown as SetupDraft }));
      expect(parsed.success, provider).toBe(false);
      if (parsed.success) continue;
      const lines = shapeFeedback(parsed.error.issues);
      expect(lines.join('\n')).toContain('draft.model.goals[0].targets[0].sources[0].provider: must be "hevy" | "google_calendar"');
      expect(lines.join('\n')).not.toContain(provider);
    }
  });
});

// Every key that is nullable or a list, at every level, found by walking the schema itself.
function defaultedPaths(schema: z.ZodType, at: string[] = [], out: string[][] = []): string[][] {
  const def = (schema as unknown as { _zod: { def: { type: string; shape?: Record<string, z.ZodType>; innerType?: z.ZodType; element?: z.ZodType; options?: z.ZodType[] } } })._zod.def;
  if (def.type === 'object') {
    for (const [key, child] of Object.entries(def.shape ?? {})) {
      const childDef = (child as unknown as { _zod: { def: { type: string } } })._zod.def;
      if (childDef.type === 'default') out.push([...at, key]);
      defaultedPaths(child, [...at, key], out);
    }
  } else if (def.type === 'default' || def.type === 'nullable') {
    defaultedPaths(def.innerType as z.ZodType, at, out);
  } else if (def.type === 'union') {
    for (const option of def.options ?? []) defaultedPaths(option, at, out);
  } else if (def.type === 'array') {
    defaultedPaths(def.element as z.ZodType, [...at, '0'], out);
  }
  return out;
}

describe('B2: a key left out reads as "not answered", swept over every nullable key and list', () => {
  // A draft with an item in every list, so every nested key exists to be left out.
  const full = (): SetupDraft => {
    const d = atSourceStep();
    d.model.person.dayTypes = [{ name: 'Busy', capacityUnit: 'hours', capacityAmount: 1 }];
    d.model.person.priorities = ['Family'];
    d.model.settings.quietTimes = ['Sunday'];
    d.model.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'hevy', metric: null }];
    d.model.goals[0].items[0].steps = [];
    d.said = [{ path: 'goals.g1.startDate', turn: 1, how: 'said' }];
    d.plain = [{ path: 'goals.g1.title', text: 'Physical fitness' }];
    return d;
  };
  const paths = defaultedPaths(SetupDraftSchema);

  it('finds the keys to sweep', () => {
    expect(paths.length).toBeGreaterThan(40);
    expect(paths.map((p) => p.join('.'))).toEqual(expect.arrayContaining(['model.goals.0.targets.0.sources.0.metric', 'plain', 'model.goals.0.why']));
  });

  it.each(paths.map((p) => [p.join('.'), p] as const))('%s', (_name, path) => {
    const d = full() as unknown as Record<string, unknown>;
    let node: Record<string, unknown> = d;
    for (const step of path.slice(0, -1)) node = node[step] as Record<string, unknown>;
    if (!(path[path.length - 1] in node)) return; // a key on the other branch of a union
    delete node[path[path.length - 1]];
    const parsed = SetupDraftSchema.safeParse(d);
    expect(parsed.success).toBe(true);
  });

  it('a stray key is still refused', () => {
    const d = full() as unknown as { model: { goals: { targets: { sources: Record<string, unknown>[] }[] }[] } };
    d.model.goals[0].targets[0].sources[0].activity = 'lifts';
    expect(SetupDraftSchema.safeParse(d).success).toBe(false);
  });

  it('a reply that leaves out every key but its kind and draft is read, with nothing filled in', () => {
    const parsed = AssistantTurnSchema.safeParse({ kind: 'question', draft: emptyDraft() });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ say: '', question: null, detail: null, topic: null, options: [], chunk: null, skipped: null });
  });
});

// ---------------------------------------------------------------------------
// A: logs and retry feedback
// ---------------------------------------------------------------------------

describe('A: a reply that broke the shape', () => {
  const SECRET = 'my-private-words-123';
  const broken = (): unknown => {
    const d = atSourceStep() as unknown as Record<string, unknown> & { model: { goals: Record<string, unknown>[] } };
    d.model.goals[0].targets = [{ ...target('t', 'T'), sources: [{ kind: 'synced', provider: SECRET, metric: null, activity: SECRET }] }];
    d.plain = [{ path: 'goals.g1.title', text: '' }];
    return { ...turn({ draft: d as unknown as SetupDraft }), say: 42 };
  };

  it('logs only paths and zod codes, never a value', () => {
    const parsed = AssistantTurnSchema.safeParse(broken());
    if (parsed.success) throw new Error('expected a failure');
    const logged = shapeIssuesForLog(parsed.error.issues);
    expect(logged.map((i) => i.code)).toEqual(expect.arrayContaining(['invalid_type', 'unrecognized_keys', 'too_small']));
    expect(JSON.stringify(logged)).not.toContain(SECRET);
    expect(logged.find((i) => i.code === 'unrecognized_keys')?.keys).toEqual(['activity']);
  });

  it('gives the retry one line per place, each naming the path and what the shape needs there', () => {
    const parsed = AssistantTurnSchema.safeParse(broken());
    if (parsed.success) throw new Error('expected a failure');
    const lines = shapeFeedback(parsed.error.issues);
    expect(lines.some((l) => l.startsWith('say: must be string'))).toBe(true);
    expect(lines.some((l) => l.startsWith('draft.plain[0].text: must be string of 1 to 300 characters'))).toBe(true);
    expect(lines.some((l) => l.includes('remove the key "activity"'))).toBe(true);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('describes the schema at any path, through lists and unions', () => {
    expect(describeAt(AssistantTurnSchema, ['draft', 'model', 'goals', 0, 'startDate'])).toBe('date written YYYY-MM-DD | null');
    expect(describeAt(AssistantTurnSchema, ['draft', 'model', 'goals', 0, 'targets', 0, 'period', 'kind'])).toBe('"weekly" | "day_slots" | "deadline"');
    expect(describeAt(AssistantTurnSchema, ['nothing', 'here'])).toBeNull();
  });

  it('says which way an unusable answer failed, in its own words', () => {
    expect(OUTPUT_PROBLEMS).toEqual(['max_tokens', 'no_text', 'not_json']);
    expect(new Set(Object.values(OUTPUT_FEEDBACK)).size).toBe(3);
    expect(OUTPUT_FEEDBACK.max_tokens).toMatch(/cut off/);
  });
});

// ---------------------------------------------------------------------------
// A and C in the service: the retry hears it, and the turn keeps to its time
// ---------------------------------------------------------------------------

describe('A and C: a turn in the service', () => {
  let session: SetupSession;
  let good: AssistantTurn;
  beforeEach(async () => {
    const c = SETUP_CASES.find((x) => x.expect === 'clean');
    if (!c) throw new Error('no case');
    const report = await runSetupEval(c, scriptedModel(c.script));
    const t: Transcript = report.transcript.slice(0, 4);
    session = { transcript: t, draft: (t[2] as { role: 'assistant'; turn: AssistantTurn }).turn.draft, spentTokens: 0 };
    good = c.script[2];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  // A stand-in for runSetupTurn() on a fake clock: each call takes `ms[i]`.
  function clocked(replies: unknown[], ms: number[]) {
    let now = 0;
    const calls: RunSetupTurnArgs[] = [];
    const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      calls.push(args);
      now += ms[calls.length - 1] ?? 1_000;
      const raw = replies[calls.length - 1];
      return { kind: 'answered', result: { ok: true, raw, model: 'm', usage: null }, turns: 1, spentTokens: 0 };
    };
    return { calls, deps: { runTurn: runTurn as never, nowMs: () => now } };
  }

  it('tells the retry the failing path and what goes there, not a general note', async () => {
    const bad = { ...good, draft: { ...good.draft, model: { ...good.draft.model, goals: [{ key: 'Bad Key' }] } } };
    const { calls, deps } = clocked([bad, good], [1_000, 1_000]);
    const view = await runCheckedTurn({ userId: 'u', session, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(view).toMatchObject({ kind: 'turn', rejected: 1 });
    expect(calls[1].retryFeedback?.join('\n')).toMatch(/^draft\.model\.goals\[0\]\.key: must be name made of a lowercase letter/m);
  });

  it('passes each call the time its turn has left, less a margin', async () => {
    const { calls, deps } = clocked([good], [1_000]);
    await runCheckedTurn({ userId: 'u', session, deadlineMs: 100_000 }, deps);
    expect(calls[0].timeoutMs).toBe(95_000);
  });

  it('stops retrying when another call cannot fit, and ends in the time-limit card instead of a network error', async () => {
    const { calls, deps } = clocked([{}, good], [SETUP_TURN_BUDGET_MS - MIN_CALL_MS + 1]);
    const view = await runCheckedTurn({ userId: 'u', session, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(calls).toHaveLength(1);
    // Round 3, finding 6: the time limit is a technical failure, with only "Try again".
    expect(view).toEqual({ kind: 'failed', reason: 'timed_out', message: errorText('timed_out'), rejected: 1 });
  });

  it('also stops when the time left is shorter than the longest call so far', async () => {
    const { calls, deps } = clocked([{}, {}, good], [100_000, 1_000]);
    // A 190s budget: after a 100s call, 90s are left. That is more than MIN_CALL_MS but less than the 100s the call took.
    await runCheckedTurn({ userId: 'u', session, deadlineMs: 190_000 }, deps);
    expect(calls).toHaveLength(1);
  });

  it('passes the source note for the source question', async () => {
    const src: Transcript = [{ role: 'assistant', turn: turn({ draft: atSourceStep() }) }, { role: 'person', text: "Heavy for lifts and I'll log my runs myself" }];
    const { calls, deps } = clocked([good], [1_000]);
    await runCheckedTurn({ userId: 'u', session: { transcript: src, draft: atSourceStep(), spentTokens: 0 }, deadlineMs: SETUP_TURN_BUDGET_MS }, deps);
    expect(calls[0].sourceNote).toMatch(/"Heavy" means the app Hevy/);
  });
});

// ---------------------------------------------------------------------------
// Voice-to-text app names
// ---------------------------------------------------------------------------

describe('the app the person means, at the source question', () => {
  it('reads "Heavy" as Hevy, and an Apple Watch as an app that cannot be read yet', () => {
    expect(appsIn("Heavy for lifts and I'll log my runs myself")).toEqual({ readable: [{ provider: 'hevy', name: 'Hevy', heard: 'Heavy' }], unreadable: [] });
    expect(appsIn('Hevy for lifts and my Apple Watch for runs')).toEqual({ readable: [{ provider: 'hevy', name: 'Hevy', heard: 'Hevy' }], unreadable: ['Apple Watch'] });
    expect(appsIn('my google calendar')).toMatchObject({ readable: [{ provider: 'google_calendar' }] });
    expect(appsIn('I just write it down')).toEqual({ readable: [], unreadable: [] });
  });

  it('writes a note for Claude only at the source question', () => {
    const at = (topic: AssistantTurn['topic'], text: string): Transcript => [{ role: 'assistant', turn: turn({ topic }) }, { role: 'person', text }];
    const note = sourceNote(at('source', 'Hevy for lifts and my Apple Watch for runs')) ?? '';
    expect(note).toContain('"Hevy" is the app Hevy');
    expect(note).toContain('Apple Watch is an app Momentum cannot read yet');
    expect(note).toContain('one short line');
    expect(sourceNote(at('starting_point', 'I lift heavy'))).toBeUndefined();
    expect(sourceNote(at('source', 'I write it in a notebook'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Finding 7: lengths of time, from the start date
// ---------------------------------------------------------------------------

describe('finding 7: lengths of time', () => {
  it('reads a length, and not how often', () => {
    expect(durationIn('two months from now')).toEqual({ phrase: 'two months', amount: 2, unit: 'month' });
    expect(durationIn('8 weeks')).toMatchObject({ amount: 8, unit: 'week' });
    expect(durationIn('for 10 weeks, please')).toMatchObject({ amount: 10, unit: 'week' });
    expect(durationIn('a couple of months')).toMatchObject({ amount: 2, unit: 'month' });
    for (const often of ['3 times a week', 'once a week', 'every two weeks', '30 minutes a day', 'two per week']) expect(durationIn(often), often).toBeNull();
    expect(isOnlyDuration('two months from now')).toBe(true);
    expect(isOnlyDuration('8 weeks, 3 times a week')).toBe(false);
  });

  it('counts from the start date: an exact end date, or whole weeks with the last day', () => {
    const d = { phrase: 'two months', amount: 2, unit: 'month' } as const;
    expect(durationEnd('2026-11-02', d)).toBe('2027-01-02');
    expect(durationEnd('2027-01-31', { phrase: 'a month', amount: 1, unit: 'month' })).toBe('2027-02-28');
    expect(durationWeeks('2026-11-02', d)).toBe(9);
    expect(stretchLastDay('2026-11-02', 9)).toBe('2027-01-03');
    expect(lengthProposal('2026-11-02', d, 'end_date', SMOKE_TODAY).question).toBe('End Saturday, Jan 2, 2027?');
    expect(lengthProposal('2026-11-02', d, 'block_length', SMOKE_TODAY).question).toBe('A first stretch of 9 weeks, through Sunday, Jan 3, 2027?');
  });

  it('proposes it as code, with Yes as the main button, when the answer is only a length', () => {
    const d = atSourceStep();
    d.model.goals[0].blockWeeks = null;
    const t: Transcript = [{ role: 'assistant', turn: turn({ topic: 'block_length', question: 'How many weeks should the first stretch run?', draft: d }) }, { role: 'person', text: '8 weeks' }];
    const step = dateStep(t, d, SMOKE_TODAY);
    expect(step).toMatchObject({ kind: 'turn', turn: { kind: 'proposal', topic: 'block_length', question: 'A first stretch of 8 weeks, through Sunday, Dec 27?' } });
    // The turn's own words pass every rule; the fixture's draft has no conversation behind it, so its values are left out.
    if (step?.kind === 'turn') expect(checkTurn(step.turn, { transcript: t, prevDraft: d }).filter((v) => v.rule !== 'draft' && !v.path)).toEqual([]);
  });

  it('a length said earlier goes to Claude as a note with the exact proposal; one about the past does not', () => {
    const d = atSourceStep();
    d.model.goals[0].blockWeeks = null;
    const earlier: Transcript = [
      { role: 'assistant', turn: turn({ topic: 'idea', question: 'What would you like to work on?' }) },
      { role: 'person', text: 'Get fit over the next 10 weeks' },
      { role: 'assistant', turn: turn({ topic: 'why', question: 'Why does this matter to you?' }) },
      { role: 'person', text: 'For my kids' },
    ];
    const step = dateStep(earlier, d, SMOKE_TODAY);
    expect(step).toMatchObject({ kind: 'hint' });
    if (step?.kind === 'hint') expect(step.hint).toContain('"A first stretch of 10 weeks, through Sunday, Jan 10, 2027?"');
    const past: Transcript = [{ role: 'assistant', turn: turn({ topic: 'starting_point', question: 'Where are you with this today?' }) }, { role: 'person', text: 'I lifted for two years' }];
    expect(dateStep(past, d, SMOKE_TODAY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Findings 1, 4 and 9: the checks every turn gets
// ---------------------------------------------------------------------------

describe('findings 1, 4 and 9: the new checks', () => {
  it('flags a long core question, and a question hidden in the detail line', () => {
    expect(checkQuestionLength(turn({ question: 'Where do you track this now, if anywhere, so I know where your progress comes from?' }))).toHaveLength(1);
    expect(checkQuestionLength(turn())).toEqual([]);
    expect(checkOneQuestion(turn({ detail: 'Is it Hevy?' })).map((v) => v.code)).toEqual(expect.arrayContaining(['one_question.hidden']));
  });

  it('flags a lead-in that repeats the date on a date question', () => {
    expect(checkDateLeadIn(turn({ topic: 'start_date', kind: 'proposal', say: 'I would start this today, Tuesday, Oct 27.', question: 'Start today, Tuesday, Oct 27?' }))).toHaveLength(1);
    expect(checkDateLeadIn(turn({ topic: 'start_date', kind: 'proposal', say: '', question: 'Start today, Tuesday, Oct 27?' }))).toEqual([]);
    expect(checkDateLeadIn(turn({ topic: 'floor', say: 'From Oct 27 on.' }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Every card: one main button, one submit, second choices that never look disabled (findings 2, 8, 14)
// ---------------------------------------------------------------------------

const TODAY = '2026-10-29';
const draft = emptyDraft();
const QUESTION_TURNS: [string, AssistantTurn][] = [
  ['question', turn({ topic: 'floor', question: 'What is the least you would count as still on track?' })],
  ['offer of ideas', turn({ kind: 'offer_ideas', topic: 'floor', question: 'Do you have a number in mind, or would some starting ideas help?' })],
  ['ideas', turn({ kind: 'ideas', topic: 'floor', question: 'Which would you like to start from?', options: ['2 a week', '3 a week'] })],
  ['interpretations', turn({ kind: 'interpretations', topic: 'floor', question: 'Which of these is closest?', options: ['A number', 'Some ideas'] })],
  ['proposal', turn({ kind: 'proposal', topic: 'block_length', question: 'Would a first stretch of 8 weeks work?' })],
  ['date question', turn({ topic: 'start_date', question: 'Which day would you like to start?' })],
  ['date confirmation', turn({ kind: 'proposal', topic: 'start_date', question: 'Start Monday, Nov 2?', options: ['Today, Thursday, Oct 29'] })],
];

// A disabled main button still counts: Send waiting for words is the card's main button all the same.
const mainCount = (root: HTMLElement) => root.querySelectorAll('[data-tone="main"]').length;
const submitCount = (root: HTMLElement) => root.querySelectorAll('button[type="submit"]').length;
const secondLooksEnabled = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-tone="second"]:not([disabled])')].every((b) => !/\b(text-muted|opacity-\d+)\b/.test(b.className.replace(/disabled:\S+/g, '')));

describe('every card: at most one main button, one submit, and second choices that look like choices', () => {
  it.each(QUESTION_TURNS)('a %s card', (_name, t) => {
    const { container } = render(<QuestionCard turn={t} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(mainCount(container)).toBeLessThanOrEqual(1);
    expect(submitCount(container)).toBeLessThanOrEqual(1);
    expect(secondLooksEnabled(container)).toBe(true);
    const typeIt = screen.queryByRole('button', { name: TYPE_INSTEAD });
    if (typeIt) {
      fireEvent.click(typeIt);
      expect(mainCount(container), 'after "Type it instead"').toBeLessThanOrEqual(1);
      expect(submitCount(container)).toBe(1);
    }
  });

  it('a playback card, with and without the change box open', () => {
    const { container } = render(<PlaybackCard chunk="goals" lines={['Goal: Physical fitness.']} busy={false} onApprove={() => {}} onChange={() => {}} />);
    expect(mainCount(container)).toBe(1);
    expect(secondLooksEnabled(container)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Change something' }));
    expect(mainCount(container)).toBe(1);
    expect(submitCount(container)).toBe(1);
  });

  it('the final card and the quick path', () => {
    const final = render(<FinalCard lines={['One goal.']} saving={false} error={null} onSave={() => {}} onChange={() => {}} />);
    expect(mainCount(final.container)).toBe(1);
    cleanup();
    const quick = render(<QuickPathCard message="Done." sections={[]} missing={[]} canSave saving={false} error={null} onSave={() => {}} onStartOver={() => {}} />);
    expect(mainCount(quick.container)).toBe(1);
    expect(secondLooksEnabled(quick.container)).toBe(true);
  });

  it.each([
    ['stuck', 'Change my answer'],
    ['network', 'Try again'],
    ['unsent', 'Send it again'],
  ] as [RetryCause, string][])('the %s error card leads with "%s"', (cause, main) => {
    const { container } = render(<RetryNotice cause={cause} onRetry={() => {}} onChangeAnswer={() => {}} />);
    expect(mainCount(container)).toBe(1);
    expect(container.querySelector('[data-tone="main"]')?.textContent).toBe(main);
    expect(secondLooksEnabled(container)).toBe(true);
  });
});

describe('finding 2: while a reply loads, every answer fades the same way', () => {
  it('a disabled main answer looks exactly like a disabled other answer', () => {
    render(
      <>
        <AnswerChoice tone="main" disabled onClick={() => {}}>
          Yes
        </AnswerChoice>
        <AnswerChoice disabled onClick={() => {}}>
          Today
        </AnswerChoice>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Yes' }).className).toBe(screen.getByRole('button', { name: 'Today' }).className);
  });

  it.each(QUESTION_TURNS)('on a %s card waiting for its reply, no answer is filled', (_name, t) => {
    const { container } = render(<QuestionCard turn={t} busy onAnswer={() => {}} today={TODAY} pending="My answer" />);
    expect(container.querySelectorAll('.bg-primary').length).toBe(0);
  });
});

describe('findings 1, 4 and 9 on the screen', () => {
  it('shows the question in bold and the detail under it in regular weight', () => {
    render(<QuestionCard turn={turn({ detail: 'If an app Momentum can read has it, it counts it for you.' })} busy={false} onAnswer={() => {}} today={TODAY} />);
    const q = screen.getByRole('heading', { name: 'Where do you track this now, if anywhere?' });
    const detail = screen.getByText('If an app Momentum can read has it, it counts it for you.');
    expect(q.className).toContain('font-semibold');
    expect(detail.className).toContain('font-normal');
    expect(detail.getAttribute('data-slot')).toBe('question-detail');
  });

  it('a date confirmation: Yes, "Pick a different date", and a small "Type it instead" link; no second date field', () => {
    const onAnswer = vi.fn();
    render(<QuestionCard turn={QUESTION_TURNS[6][1]} busy={false} onAnswer={onAnswer} today={TODAY} />);
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('data-tone')).toBe('main');
    // Round 3, finding 3: "Pick a different date" is the date field itself, so the only date field sits inside it.
    const pick = screen.getByLabelText(PICK_OTHER_DATE);
    expect(pick.closest('[data-picker="date"]')?.getAttribute('data-tone')).toBe('answer');
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Use this date' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onAnswer).toHaveBeenCalledWith(PROPOSAL_YES_TEXT);
    fireEvent.click(screen.getByRole('button', { name: TYPE_INSTEAD }));
    expect(screen.getByLabelText('Your answer')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Your answer'));
  });
});

// The scripted smoke cases are the owner's paths; each one runs clean (tests/setup-smoke-fixes.test.ts runs them too).
describe('the owner\'s round 2 paths, scripted', () => {
  it.each(SMOKE_CASES.filter((c) => c.id.startsWith('run-m')).map((c) => [c.id, c] as const))('%s finishes clean', async (_id, c) => {
    const report = await runSetupEval(c, scriptedModel(c.script));
    expect(report.finished).toBe(true);
    expect(report.finalIssues).toEqual([]);
  });
});
