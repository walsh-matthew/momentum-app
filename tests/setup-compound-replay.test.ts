// MOM-168: setup uses extra detail a person packs into an answer (docs/DOMAIN_MODEL.md §2.1 rule 5). Found in the MOM-167 title-fix
// block on 2026-11-02: when the count question is answered "runs, at least 3 a week", nothing told Claude to record the 3 a week, so a
// reply that recorded the floor and asked the floor question again passed; and a reply that recorded it and said it was skipping that
// question was thrown away as skip.unanswered, because answeredTopics knew nothing about a target's floor. These tests replay that
// answer through the server's turn loop (takeSetupTurn) with a stand-in for Claude, and pin the approved words (the Jira comment on
// MOM-168). No network call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { checkAskedAgain, checkLevelQuotesNumber, checkSkipAnswered, checkTurn, type TurnContext } from '@/lib/setup/checks';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { IN_PASSING_TOPICS, answeredTopics } from '@/lib/setup/leaves';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { HARD_RULES } from '@/lib/setup/steps';
import { emptyDraft } from '@/lib/setup/draft';
import { returningDraft, type ReturningMode } from '@/lib/setup/returning';
import type { AssistantTurn, SetupDraft, SetupSession, Transcript } from '@/types/setup';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { Script, goal, item, target } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const MODEL = 'claude-opus-5-5';
const FIRST_ANSWER = 'I want to run more';
const COMPOUND = 'Runs, at least 3 a week';
const FLOOR_PATH = 'goals.running.targets.runs.floor';

// The conversation up to the count question, answered with the compound answer.
function counting() {
  const script = new Script()
    .add({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', reply: FIRST_ANSWER })
    .add({
      topic: 'target',
      question: "What would you like to count to know it's going well?",
      edit: (m) => {
        m.goals = [goal('running', 'Running', { why: 'it clears my head' })];
      },
      reply: COMPOUND,
    });
  const transcript: Transcript = [
    { role: 'assistant', turn: script.turns[0] },
    { role: 'person', text: FIRST_ANSWER },
    { role: 'assistant', turn: script.turns[1] },
    { role: 'person', text: COMPOUND },
  ];
  return { transcript, draft: script.turns[1].draft };
}

const SKIP_LINE = "You said at least 3 runs a week, so I'll use that.";
const FLOOR_Q = 'In a hard week, how many runs would still count?';
const SOURCE_Q = 'Where do you track this now, if anywhere?';

// Claude's reply to the compound answer: the target and its floor are recorded either way; `next` is what it does after.
function reply(next: 'asks_floor_again' | 'skips_floor' | 'floor_not_recorded'): AssistantTurn {
  const { draft } = counting();
  const out = structuredClone(draft);
  out.model.goals[0].targets = [target('runs', 'Runs', { floor: next === 'floor_not_recorded' ? null : 3 })];
  if (next !== 'floor_not_recorded') out.said.push({ path: FLOOR_PATH, turn: 3, how: 'said' });
  const asksFloor = next !== 'skips_floor';
  return {
    kind: 'question',
    chunk: null,
    skipped: asksFloor ? null : { topic: 'floor', line: SKIP_LINE },
    say: '',
    question: asksFloor ? FLOOR_Q : SOURCE_Q,
    detail: null,
    topic: asksFloor ? 'floor' : 'source',
    options: [],
    draft: out,
  };
}

function stubTurns(raws: unknown[]) {
  const calls: RunSetupTurnArgs[] = [];
  const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
    const raw = raws[Math.min(calls.length, raws.length - 1)];
    calls.push(args);
    return {
      kind: 'answered',
      result: { ok: true as const, raw, model: MODEL, usage: { inputTokens: 900, outputTokens: 100 } },
      turns: args.transcript.filter((m) => m.role === 'assistant').length + 1,
      spentTokens: args.spentTokens + 1000,
    };
  };
  return { run: run as never, calls };
}

const session = (): SetupSession => {
  const { transcript, draft } = counting();
  return { transcript, draft, spentTokens: 0 };
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFakeSave({ id: ME });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const logged = () => (warn.mock.calls as unknown[][]).map((c) => c[1] as { codes?: string[]; category?: string });

describe('the count question is answered "runs, at least 3 a week" (MOM-168)', () => {
  it('lets Claude record the floor and skip the floor question in one line, with no retry', async () => {
    const stub = stubTurns([reply('skips_floor')]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.skipped).toEqual({ topic: 'floor', line: SKIP_LINE });
    expect(result.data.turn.draft.model.goals[0].targets[0].floor).toBe(3);
  });

  it('retries a reply that records the floor and asks for it again, then accepts the corrected reply', async () => {
    const stub = stubTurns([reply('asks_floor_again'), reply('skips_floor')]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1].retryFeedback).toEqual([RETRY_FEEDBACK['plain.asked_again']]);
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.topic).toBe('source');
    expect(logged().some((l) => l.codes?.includes('plain.asked_again'))).toBe(true);
  });

  it('shows the reply after its one retry when Claude asks again anyway, never "Try again"', async () => {
    const stub = stubTurns([reply('asks_floor_again')]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls).toHaveLength(2);
    expect(logged().some((l) => l.category === 'plain_words' && l.codes?.includes('plain.asked_again'))).toBe(true);
  });

  it('still refuses a skip of the floor when no floor was recorded', async () => {
    const skipping = reply('skips_floor');
    skipping.draft = reply('floor_not_recorded').draft;
    const stub = stubTurns([skipping]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(stub.calls[1].retryFeedback?.join(' ')).toContain(RETRY_FEEDBACK['skip.unanswered']);
    expect(result).toMatchObject({ ok: true, data: { kind: 'failed' } });
  });
});

describe('the check for a question asked again (MOM-168)', () => {
  const ctx = (): TurnContext => {
    const { transcript, draft } = counting();
    return { transcript, prevDraft: draft };
  };

  it('flags the floor asked straight after it was recorded, softly', () => {
    const found = checkAskedAgain(reply('asks_floor_again'), ctx());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ rule: 'plain_words', code: 'plain.asked_again' });
  });

  it('does not flag a clarification, where nothing was recorded', () => {
    expect(checkAskedAgain({ ...reply('floor_not_recorded'), topic: 'floor', question: FLOOR_Q }, ctx())).toEqual([]);
  });

  it('does not flag a topic recorded on an earlier turn, such as another thing to count', () => {
    const earlier = reply('skips_floor');
    const c: TurnContext = { transcript: ctx().transcript, prevDraft: earlier.draft };
    const another: AssistantTurn = { ...earlier, skipped: null, topic: 'target', question: 'Is there anything else you want to count?' };
    expect(checkAskedAgain(another, c)).toEqual([]);
  });

  it('leaves ideas, interpretations and a proposal alone, and asks nothing of other topics', () => {
    for (const kind of ['ideas', 'interpretations', 'proposal'] as const) expect(checkAskedAgain({ ...reply('asks_floor_again'), kind }, ctx())).toEqual([]);
    expect(checkAskedAgain({ ...reply('asks_floor_again'), topic: 'source' }, ctx())).toEqual([]);
  });

  it('is part of the full check, as a plain-words violation only', () => {
    const violations = checkTurn(reply('asks_floor_again'), ctx());
    expect(violations.map((x) => x.code)).toEqual(['plain.asked_again']);
  });

  it('accepts the corrected reply in the full check', () => {
    expect(checkTurn(reply('skips_floor'), ctx())).toEqual([]);
    expect(checkSkipAnswered(reply('skips_floor'), ctx())).toEqual([]);
  });
});

describe('answeredTopics reads the fields a person can give inside another answer (MOM-168)', () => {
  const withGoal = (over: Partial<ReturnType<typeof goal>> = {}, ...targets: ReturnType<typeof target>[]): SetupDraft => {
    const d = emptyDraft();
    d.model.goals = [goal('g1', 'Running', { targets, ...over })];
    return d;
  };
  const topics = (d: SetupDraft) => answeredTopics(d.model);

  it('counts a target, its floor and its aspiration', () => {
    expect(topics(withGoal())).not.toContain('target');
    const t = topics(withGoal({}, target('t1', 'Runs', { floor: 3, aspiration: 4 })));
    expect([...t]).toEqual(expect.arrayContaining(['target', 'floor', 'aspiration']));
    expect(topics(withGoal({}, target('t1', 'Runs')))).not.toContain('floor');
  });

  it('counts named days, a deadline date, a source and an app metric', () => {
    expect(topics(withGoal({}, target('t1', 'Runs', { period: { kind: 'weekly' } })))).not.toContain('slots_or_quota');
    expect(topics(withGoal({}, target('t1', 'Runs', { period: { kind: 'day_slots', weekdays: [1, 3] } })))).toContain('slots_or_quota');
    expect(topics(withGoal({}, target('t1', 'Report', { period: { kind: 'deadline', dueDate: '2026-12-01' } })))).toContain('deadline_date');
    expect(topics(withGoal({}, target('t1', 'Runs', { sources: [{ kind: 'manual' }] })))).toContain('source');
    const synced = topics(withGoal({}, target('t1', 'Lifts', { sources: [{ kind: 'synced', provider: 'hevy', metric: 'sets' }] })));
    expect([...synced]).toEqual(expect.arrayContaining(['source', 'metric']));
    expect(topics(withGoal({}, target('t1', 'Lifts', { sources: [{ kind: 'synced', provider: 'hevy', metric: null }] })))).not.toContain('metric');
  });

  it('counts the goal-level answers: shape, dates, block length, return, and whether a date can move', () => {
    expect([...topics(withGoal())].filter((t) => IN_PASSING_TOPICS.has(t))).toEqual([]);
    const d = withGoal({
      shape: 'ongoing',
      startDate: '2026-11-02',
      endDate: '2026-12-31',
      blockWeeks: 8,
      items: [item('i1', 'deadline_task', 'Report', { dueDate: '2026-12-01', dateCanMove: false })],
    });
    expect([...topics(d)]).toEqual(expect.arrayContaining(['shape', 'start_date', 'end_date', 'block_length', 'deadline_date', 'date_can_move']));
    const parked = withGoal({ state: 'parked', returnWhen: { kind: 'on_request' } });
    expect(topics(parked)).toContain('parked_return');
  });

  it('judges the goal and target being set up, so an earlier floor does not excuse skipping a later one', () => {
    const d = withGoal({}, target('t1', 'Runs', { floor: 3 }), target('t2', 'Pages'));
    expect(topics(d)).toContain('target');
    expect(topics(d)).not.toContain('floor');
    const two = withGoal({}, target('t1', 'Runs', { floor: 3 }));
    two.model.goals.push(goal('g2', 'Reading'));
    expect(topics(two)).not.toContain('target');
    expect(topics(two)).not.toContain('floor');
  });

  it('leaves role out, since the schema always sets it', () => {
    expect(IN_PASSING_TOPICS.has('role')).toBe(false);
  });
});

describe('the approved words (MOM-168, Jira comment)', () => {
  const LINE =
    'When one answer holds more than the question asked (a number, how often, a unit (only for an amount like pages or pounds), an app, a date), record every part of it in the draft with its "said" entry in the same turn. Never ask for a part you recorded. If your next question would have asked for it, set "skipped" to that topic with one short plain line that names what you are using ("You said at least 3 runs a week, so I\'ll use that.") and ask the next thing. Read "at least N" as the least that counts and "aiming for N" as the number hoped for; for any other number with no such word, ask which it is.';

  it('tells Claude, in rule 5, to record the extra detail, say it is using it, and not ask again', () => {
    expect(HARD_RULES.find((r) => r.n === 5)?.text).toContain(LINE);
    expect(SETUP_SYSTEM_PROMPT).toContain(LINE);
  });

  it('says in fixed words what the retries for a question asked again and for an unquoted number mean', () => {
    expect(RETRY_FEEDBACK['plain.asked_again']).toBe(
      'The person already gave this and you recorded it, so do not ask for it. Say you are using it in "skipped" and ask the next thing.',
    );
    expect(RETRY_FEEDBACK['plain.level_no_number']).toBe(
      'Quote the number they gave in "say" ("You said 3 runs a week.") and ask only which level it is, so the number is used and never asked for again.',
    );
  });
});

// ---------------------------------------------------------------------------
// The first answer already holds what they count and how often (production, 2026-11-02 about 23:20 UTC)
// ---------------------------------------------------------------------------

const THREE_DAYS = 'I want to run three days a week';
const LEVEL_SAY = 'You said 3 runs a week.';
const LEVEL_Q = "Is that the least that counts, or what you're aiming for?";
const COUNT_Q = 'What would you like to count to know this is going well?';

// Claude's reply to the first answer records the goal and the target "Runs" together, with no number: the person gave one with no
// "at least" or "aiming for", so which level it is stays theirs to say. Then step 7, and the person's pick.
function firstAnswer() {
  const script = new Script()
    .add({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', reply: THREE_DAYS })
    .add({
      topic: 'why',
      question: 'Why does this matter to you?',
      edit: (m) => {
        m.goals = [goal('running', 'Running', { targets: [target('runs', 'Runs')] })];
      },
      reply: 'It clears my head',
    })
    .add({
      topic: 'number_level',
      skipped: { topic: 'target', line: "You told me you'd count runs, so I'll use that." },
      say: LEVEL_SAY,
      question: LEVEL_Q,
      detail: 'The least that counts is the number for a hard week: a week at it is still a good week.',
      edit: (m) => {
        m.goals[0].why = 'it clears my head';
      },
      reply: 'The least that counts.',
    })
    .add({
      topic: 'source',
      question: SOURCE_Q,
      edit: (m) => {
        m.goals[0].targets[0].floor = 3;
      },
      said: ['goals.running.targets.runs.floor@0'],
    });
  const person = [THREE_DAYS, 'It clears my head', 'The least that counts.'];
  // The conversation as it stands when assistant turn `n` is about to be written: n assistant turns, each followed by its reply.
  const upTo = (n: number): Transcript =>
    Array.from({ length: n }, (_, i) => [{ role: 'assistant' as const, turn: script.turns[i] }, { role: 'person' as const, text: person[i] }]).flat();
  return { script, upTo };
}

describe('a first answer that holds what they count and how often (MOM-168)', () => {
  it('accepts the reply that records the goal and its target together, with no number guessed, and no retry', async () => {
    const { script, upTo } = firstAnswer();
    const stub = stubTurns([script.turns[1]]);
    const result = await takeSetupTurn({ transcript: upTo(1), draft: script.turns[0].draft, spentTokens: 0 }, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.draft.model.goals[0].targets[0]).toMatchObject({ title: 'Runs', floor: null, aspiration: null, period: { kind: 'weekly' } });
  });

  const atStepSeven = () => {
    const { script, upTo } = firstAnswer();
    return { script, session: { transcript: upTo(2), draft: script.turns[1].draft, spentTokens: 0 } satisfies SetupSession };
  };

  it('accepts a skip of "what would you like to count" and the level question that quotes the number, with no retry', async () => {
    const { script, session } = atStepSeven();
    const stub = stubTurns([script.turns[2]]);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    // Code does not turn the level question into "how many": it is still the question of which level the number is. Since MOM-180 B2 it goes out as the
    // card, which quotes the one number Claude quoted in its own words, and the skip line stays.
    expect(result.data.turn.topic).toBe('number_level');
    expect(LEVEL_SAY).toContain('3');
    expect(LEVEL_Q).toContain('least that counts');
    expect(result.data.turn.question).toBe("Is 3 the least that counts, or what you're aiming for?");
    expect(result.data.turn.say).toBe('');
    expect(result.data.turn.skipped?.topic).toBe('target');
  });

  it('retries a reply that asks "what would you like to count" when the first answer already gave it', async () => {
    const { script, session } = atStepSeven();
    const asksToCount: AssistantTurn = { ...script.turns[2], skipped: null, say: '', topic: 'target', question: COUNT_Q, detail: null };
    const stub = stubTurns([asksToCount, script.turns[2]]);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls[1].retryFeedback).toEqual([RETRY_FEEDBACK['plain.asked_again']]);
  });

  it('retries a level question that does not quote the number', async () => {
    const { script, session } = atStepSeven();
    const bare: AssistantTurn = { ...script.turns[2], say: '' };
    expect(checkLevelQuotesNumber(bare).map((x) => x.code)).toEqual(['plain.level_no_number']);
    expect(checkLevelQuotesNumber(script.turns[2])).toEqual([]);
    const stub = stubTurns([bare, script.turns[2]]);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls[1].retryFeedback).toEqual([RETRY_FEEDBACK['plain.level_no_number']]);
  });

  it("writes the person's pick as the floor, resting on the first message that holds the number", () => {
    const { script, upTo } = firstAnswer();
    const ctx: TurnContext = { transcript: upTo(3), prevDraft: script.turns[2].draft };
    expect(script.turns[3].draft.said).toContainEqual({ path: 'goals.running.targets.runs.floor', turn: 1, how: 'said' });
    expect(checkTurn(script.turns[3], ctx)).toEqual([]);
  });
});

describe("the widened check for a question asked again (MOM-168, the owner's two tests)", () => {
  const ask = (topic: AssistantTurn['topic'], draft: SetupDraft, kind: AssistantTurn['kind'] = 'question'): AssistantTurn => ({
    kind,
    chunk: kind === 'playback' ? 'targets' : null,
    skipped: null,
    say: '',
    question: kind === 'playback' || kind === 'final' ? null : 'A question?',
    detail: null,
    topic,
    options: [],
    draft,
  });
  const saved = (floor: number | null): SetupDraft => {
    const d = emptyDraft();
    d.model.goals = [goal('old', 'Reading', { shape: 'ongoing', startDate: '2026-10-01', blockWeeks: 8, targets: [target('pages', 'Pages', { floor, sources: [{ kind: 'manual' }] })] })];
    return d;
  };

  // (a) Add to your goals, with a goal already saved: a question about the NEW goal's target or floor is not flagged, because the
  // saved goal holds those topics.
  it.each(['add_goal', 'add_target'] as const)('does not flag a question about the new target or floor in "%s" mode', (mode: ReturningMode) => {
    const returning = { mode, goalTitle: mode === 'add_target' ? 'Run more' : null, saved: { timeZone: 'America/Chicago', dayEnd: '21:00', weekStart: 1 } };
    const start = returningDraft(mode, returning.goalTitle);
    const ctx: TurnContext = { transcript: [], prevDraft: start, returning };
    expect(checkAskedAgain(ask('target', start), ctx)).toEqual([]);
    const withTarget = structuredClone(start);
    if (mode === 'add_goal') withTarget.model.goals = [goal('g1', 'Reading more')];
    withTarget.model.goals[0].targets = [target('t1', 'Pages')];
    for (const topic of ['floor', 'aspiration', 'source', 'number_level'] as const) expect(checkAskedAgain(ask(topic, withTarget), ctx)).toEqual([]);
  });

  it.each(['target', 'floor', 'source', 'shape', 'start_date', 'block_length'] as const)(
    'does not flag "%s" for a new goal when an earlier saved goal holds it',
    (topic) => {
      const earlier = saved(3);
      const next = structuredClone(earlier);
      next.model.goals.push(goal('new', 'Cooking'));
      expect(checkAskedAgain(ask(topic, next), { transcript: [], prevDraft: earlier })).toEqual([]);
      // Once the new goal has its own target (no floor, no source yet), a question about its floor or source is still not a repeat; a
      // question about the target itself, after it was recorded and never asked, is.
      next.model.goals[1].targets = [target('meals', 'Meals')];
      const expected = topic === 'target' ? ['plain.asked_again'] : [];
      expect(checkAskedAgain(ask(topic, next), { transcript: [], prevDraft: earlier }).map((x) => x.code)).toEqual(topic === 'shape' || topic === 'start_date' || topic === 'block_length' ? [] : expected);
    },
  );

  // (b) A playback or "did I get this right?" confirm turn is never flagged: those kinds ask for no topic.
  it.each(['playback', 'final', 'proposal', 'ideas', 'interpretations'] as const)('never flags a "%s" turn', (kind) => {
    const d = saved(3);
    for (const topic of [...IN_PASSING_TOPICS]) expect(checkAskedAgain(ask(topic, d, kind), { transcript: [], prevDraft: d })).toEqual([]);
  });

  it('flags a topic the draft holds that was never asked, and leaves it once it was asked or skipped', () => {
    const d = saved(3);
    const history = (turn: AssistantTurn): Transcript => [
      { role: 'assistant', turn },
      { role: 'person', text: 'Okay' },
    ];
    expect(checkAskedAgain(ask('floor', d), { transcript: [], prevDraft: d }).map((x) => x.code)).toEqual(['plain.asked_again']);
    expect(checkAskedAgain(ask('floor', d), { transcript: history(ask('floor', emptyDraft())), prevDraft: d })).toEqual([]);
    expect(checkAskedAgain(ask('floor', d), { transcript: history({ ...ask('source', d), skipped: { topic: 'floor', line: 'Using that.' } }), prevDraft: d })).toEqual([]);
  });

  it('judges the way back of the newest parked goal, not an earlier one', () => {
    const d = emptyDraft();
    d.model.goals = [goal('a', 'Cooking', { state: 'parked', returnWhen: { kind: 'on_request' } }), goal('b', 'Guitar', { state: 'parked' })];
    expect(answeredTopics(d.model)).not.toContain('parked_return');
    d.model.goals[1].returnWhen = { kind: 'on_request' };
    expect(answeredTopics(d.model)).toContain('parked_return');
  });
});
