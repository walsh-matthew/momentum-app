// MOM-180 part B3: the exact Claude calls each scripted first setup makes (docs/DOMAIN_MODEL.md §4.2 principle 13: a call code could replace is a
// defect). Each call is listed by what it reads (the topic of the question the person just answered) and what it asks next (the topic of the
// model's reply, before any card goes out in its place). The fake refuses to be asked for a turn code writes (a placeholder that carries code's
// mark), and the list is compared whole, so an extra call fails the build. No paid call: the model is the scripted fake.
//
// Also here, the worst realistic output for the rules B3 adds (failure log F-096): the model asking the why again after code asked it, and the model
// writing words of its own into a playback.

import { describe, expect, it } from 'vitest';
import { checkTurn } from '@/lib/setup/checks';
import { runSetupEval, type SetupEvalCase } from '@/lib/setup/evals';
import { FIXED_QUESTION_MARK, FIXED_WORDS, isFixedQuestion } from '@/lib/setup/fixedQuestions';
import { GOAL_CARD_MARK } from '@/lib/setup/goalCards';
import { STEP_CARD_MARK } from '@/lib/setup/stepCards';
import { WEEK_CARD_MARK } from '@/lib/setup/weekCards';
import { SETTINGS_CARD_MARK, TIME_ZONE_CARD_MARK } from '@/lib/setup/cards';
import type { AssistantTurn } from '@/types/setup';
import { GOAL_CARDS_CASE, STEP_CARDS_CASE, type ScriptedCase } from './setup-evals/cases';
import { EXACT_CALL_CASES, MEANING_CASE, ONE_GOAL_CASE, TWO_TOGETHER_CASE, TYPED_MANY_CASE } from './setup-evals/exactCallCases';

const CODE_MARKS = [FIXED_QUESTION_MARK, GOAL_CARD_MARK, STEP_CARD_MARK, WEEK_CARD_MARK, SETTINGS_CARD_MARK, TIME_ZONE_CARD_MARK];
const isPlaceholder = (turn: AssistantTurn): boolean => turn.kind === 'final' || CODE_MARKS.some((m) => (turn.detail ?? '').startsWith(m));

// The scripted model, counting: each call as "<topic read>><topic asked>". It throws when asked for a turn code writes.
async function calls(c: ScriptedCase, script: AssistantTurn[] = c.script) {
  const list: string[] = [];
  const report = await runSetupEval(c, ({ transcript }) => {
    const n = transcript.filter((m) => m.role === 'assistant').length;
    const turn = script[n];
    if (!turn) throw new Error(`the script has no turn ${n}`);
    if (isPlaceholder(turn)) throw new Error(`Claude was asked for turn ${n}, which code writes (${turn.topic ?? turn.kind})`);
    const asked = [...transcript].reverse().find((m) => m.role === 'assistant');
    list.push(`${asked?.role === 'assistant' ? (asked.turn.topic ?? asked.turn.chunk ?? asked.turn.kind) : 'start'}>${turn.topic ?? turn.chunk ?? turn.kind}`);
    return structuredClone(turn);
  });
  return { report, list };
}

const clean = (report: Awaited<ReturnType<typeof runSetupEval>>) => {
  expect(report.malformed).toBeNull();
  expect(report.finished).toBe(true);
  expect(report.turns.flatMap((t) => t.violations.map((v) => `${t.index}:${v.rule}:${v.code}`))).toEqual([]);
  expect(report.finalIssues).toEqual([]);
};

// The exact calls, in order (owner, B3 design stop, MOM-180 comment 10387).
const EXPECTED: Record<string, string[]> = {
  [ONE_GOAL_CASE.id]: ['why>breakup', 'priorities>starting_point', 'target>role', 'day_types>capacity'],
  [TWO_TOGETHER_CASE.id]: ['why>breakup', 'breakup>sequencing', 'priorities>starting_point', 'target>role', 'target>role', 'day_types>capacity'],
  [TYPED_MANY_CASE.id]: ['why>breakup', 'priorities>starting_point', 'shape>start_date', 'day_types>capacity'],
  [MEANING_CASE.id]: ['why>breakup', 'priorities>starting_point', 'target>target', 'target>role', 'day_types>capacity'],
  // The B1 and B2 extended conversations (15 and 13 calls after B2). The B1 case types its step 3, 7 and 9 answers, so reading them stays Claude's: the
  // typed sequencing and way back, the typed least that counts (Claude then plays the targets back) and the typed source.
  [GOAL_CARDS_CASE.id]: [
    'why>breakup',
    'breakup>sequencing',
    'sequencing>parked_return',
    'parked_return>goals',
    'priorities>starting_point',
    'target>floor',
    'floor>targets',
    'source>day_end',
    'day_types>capacity',
  ],
  [STEP_CARDS_CASE.id]: ['why>breakup', 'breakup>sequencing', 'priorities>starting_point', 'target>role', 'day_types>capacity'],
};

describe.each([...EXACT_CALL_CASES, GOAL_CARDS_CASE, STEP_CARDS_CASE])('the exact Claude calls of $id', (c) => {
  it('reaches the final card, clean, with exactly the listed calls and no other', async () => {
    const { report, list } = await calls(c);
    clean(report);
    expect(list).toEqual(EXPECTED[c.id]);
  });
});

describe('what B3 makes code write', () => {
  it('opens with the idea and the why in code\'s own words, with no call, and one call reads both answers', async () => {
    const { report, list } = await calls(ONE_GOAL_CASE);
    const [idea, why] = report.turns;
    expect([idea.byCode, why.byCode]).toEqual([true, true]);
    expect([idea.turn.question, why.turn.question]).toEqual([FIXED_WORDS.ideaQuestion, FIXED_WORDS.whyQuestion]);
    expect([isFixedQuestion(idea.turn), isFixedQuestion(why.turn)]).toEqual([true, true]);
    expect(list[0]).toBe('why>breakup');
    // The one call's draft holds the goal and its why, from the two answers.
    expect(report.turns[2].turn.draft.model.goals[0]).toMatchObject({ title: 'Run more', why: 'it clears my head' });
  });

  it('plays the goals and targets back, asks the three fixed questions, and shows the final card, all by code', async () => {
    const { report } = await calls(ONE_GOAL_CASE);
    const byCode = (pick: (t: AssistantTurn) => boolean) => report.turns.filter((t) => pick(t.turn)).map((t) => t.byCode);
    expect(byCode((t) => t.kind === 'playback')).toEqual([true, true, true, true]);
    expect(byCode((t) => t.kind === 'final')).toEqual([true]);
    expect(report.turns.filter((t) => isFixedQuestion(t.turn)).map((t) => t.turn.topic)).toEqual(['idea', 'why', 'priorities', 'target', 'day_types']);
  });

  it('a typed answer that covers several questions shows none of the cards it answered', async () => {
    const { report } = await calls(TYPED_MANY_CASE);
    const topics = report.turns.map((t) => t.turn.topic);
    for (const topic of ['block_length', 'target', 'role', 'floor', 'number_level'] as const) expect(topics).not.toContain(topic);
    expect(report.draft.model.goals[0]).toMatchObject({ shape: 'ongoing', blockWeeks: 8, startDate: '2026-10-27' });
    expect(report.draft.model.goals[0].targets[0]).toMatchObject({ title: 'Runs', floor: 3 });
  });

  it('two goals together ask what to count for each goal, by its title', async () => {
    const { report } = await calls(TWO_TOGETHER_CASE);
    expect(report.turns.filter((t) => t.turn.topic === 'target').map((t) => t.turn.question)).toEqual([
      'What would you like to count for "Lift weights"?',
      'What would you like to count for "Cook at home"?',
    ]);
  });
});

// The worst realistic output (F-096): what a real model can write that the rule exists to stop.
describe('a model that asks again what code asked, or writes into a playback, is caught', () => {
  const withModelTurn = (c: ScriptedCase, at: number, change: (t: AssistantTurn) => AssistantTurn): ScriptedCase => {
    const script = structuredClone(c.script);
    script[at] = change(script[at]);
    return { ...c, script };
  };

  it('asking the why again, straight after code asked it and the reply is recorded, is a repeat (rule 5)', async () => {
    const bad = withModelTurn(ONE_GOAL_CASE, 2, (t) => ({ ...t, topic: 'why', question: 'Why does running matter to you?', detail: null }));
    const { report } = await calls(bad as SetupEvalCase & { script: AssistantTurn[] });
    expect(report.turns[2].violations.map((v) => v.code)).toContain('skip.repeat');
  });

  it('asking the why again is fine as an explanation, after the person asked what it means', () => {
    const asked = ONE_GOAL_CASE.script[1];
    const turn: AssistantTurn = { ...ONE_GOAL_CASE.script[2], topic: 'why', question: 'What is your reason for wanting this?', say: 'I mean what it would change for you.', detail: null };
    const transcript = [
      { role: 'assistant' as const, turn: ONE_GOAL_CASE.script[0] },
      { role: 'person' as const, text: 'I want to run more.' },
      { role: 'assistant' as const, turn: asked },
      { role: 'person' as const, text: 'What do you mean?' },
    ];
    expect(checkTurn(turn, { transcript, prevDraft: ONE_GOAL_CASE.script[1].draft }).map((v) => v.code)).not.toContain('skip.repeat');
  });

  it('a playback the model writes words into is refused (rule 7)', async () => {
    const bad = withModelTurn(ONE_GOAL_CASE, 2, (t) => ({ ...t, kind: 'playback', chunk: 'goals', topic: null, question: null, say: 'Here is your goal: you will run more every day.', detail: null }));
    const { report } = await calls(bad as SetupEvalCase & { script: AssistantTurn[] });
    expect(report.turns[2].violations.map((v) => v.code)).toContain('playback.words');
  });
});
