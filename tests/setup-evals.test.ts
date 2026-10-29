// The setup eval set (MOM-111): every scripted case runs against a fake model, and every turn is checked automatically
// against the eight hard rules and the draft schema. No network call is made. A clean case must finish with a draft
// that passes the final validation the save step will use; a fixture must trip exactly the check it was written for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSetupEval, violationsOf, type EvalReport, type SetupEvalCase } from '@/lib/setup/evals';
import { renderPlayback } from '@/lib/setup/playback';
import { unexplainedTerms } from '@/lib/setup/plainWords';
import { MEANING_TEXT } from '@/lib/setup/session';
import { HARD_RULES } from '@/lib/setup/steps';
import { HARD_RULE_IDS, type AssistantTurn } from '@/types/setup';
import { scriptedModel } from './helpers/setupScript';
import { SETUP_CASES, type ScriptedCase } from './setup-evals/cases';

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(() => {
    throw new Error('the setup evals must not touch the network');
  });
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const run = (c: ScriptedCase): Promise<EvalReport> => runSetupEval(c, scriptedModel(c.script));
const described = (r: EvalReport): string[] =>
  r.turns.flatMap((t) => t.violations.map((v) => `turn ${t.index} [${v.rule}] ${v.message}`));
const byId = (id: string): ScriptedCase => {
  const c = SETUP_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  return c;
};

describe('the eval set', () => {
  it('has twenty cases: twelve full conversations and one fixture per hard rule', () => {
    expect(SETUP_CASES).toHaveLength(20);
    expect(SETUP_CASES.filter((c) => c.expect === 'clean')).toHaveLength(12);
    expect(SETUP_CASES.filter((c) => c.expect !== 'clean').map((c) => c.rules[0]).sort()).toEqual([...HARD_RULE_IDS].sort());
  });

  it('covers a deadline-only goal, a habit goal and a person who already answered something', () => {
    const ids = SETUP_CASES.map((c) => c.id);
    expect(ids).toContain('run-a-deadline-only');
    expect(ids).toContain('run-b-habit-ideas');
    expect(ids).toContain('run-c-answered-already');
    expect(ids).toContain('run-g-relative-deadline');
    expect(ids).toContain('run-h-two-activities');
  });

  it('exercises every hard rule in at least one case', () => {
    const covered = new Set(SETUP_CASES.flatMap((c) => c.rules));
    expect([...covered].sort()).toEqual([...HARD_RULE_IDS].sort());
  });

  it('keeps the rules in the doc order, eight of them', () => {
    expect(HARD_RULES.map((r) => r.id)).toEqual([...HARD_RULE_IDS]);
    expect(HARD_RULES.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('has no personal detail in a case: no email, phone number or street address', () => {
    const everything = SETUP_CASES.flatMap((c) => [c.title, ...c.person.map((p) => p.say)]).join('\n');
    expect(everything).not.toMatch(/@|\b\d{3}[-. ]\d{3,4}[-. ]\d{4}\b|\bstreet\b|\bavenue\b/i);
  });
});

describe('setup clarity (MOM-111): the cases from the owner\'s live setup', () => {
  const clean = SETUP_CASES.filter((c) => c.expect === 'clean');

  it('asks every scripted question in everyday words: no internal word goes unexplained', () => {
    const words = clean.flatMap((c) => c.script.flatMap((t) => [t.say, t.question ?? '', t.skipped?.line ?? '', ...t.options]));
    expect(words.flatMap(unexplainedTerms)).toEqual([]);
  });

  it('"what do you mean?" on the crowd-out question: Claude explains with examples, and setup carries on to the save', async () => {
    const c = byId('run-i-what-do-you-mean-protected');
    const report = await run(c);
    const asked = report.turns.findIndex((t) => t.turn.topic === 'priorities');
    expect(c.person[asked].say).toBe(MEANING_TEXT);
    const explained = report.turns[asked + 1].turn;
    expect(explained.topic).toBe('priorities');
    expect(explained.say).toMatch(/for example/);
    expect(report.turns[asked + 1].violations).toEqual([]);
    expect(report.finished).toBe(true);
    expect(report.finalIssues).toEqual([]);
    expect(renderPlayback(report.draft.model, 'targets')[0]).toContain('Family time and your sleep');
  });

  it('"what do you mean?" on a person fact (the day end): explained, not a repeat, and setup carries on', async () => {
    const c = byId('run-j-what-do-you-mean-day-end');
    const report = await run(c);
    const asked = report.turns.findIndex((t) => t.turn.topic === 'day_end');
    expect(c.person[asked].say).toBe(MEANING_TEXT);
    expect(report.turns[asked + 1].turn.topic).toBe('day_end');
    expect(report.turns[asked + 1].violations).toEqual([]);
    expect(report.draft.model.person.dayEnd).toBe('21:00');
    expect(report.finished).toBe(true);
  });

  it('a long first message (on a computer): the why is recorded from it, and the why and the starting point are skipped in one line each', async () => {
    const c = byId('run-k-long-first-message');
    const report = await run(c);
    expect(c.person[0].say.split(' ').length).toBeGreaterThan(15);
    expect(report.draft.model.goals[0].why).toBe('it clears my head');
    const skipped = report.turns.flatMap((t) => (t.turn.skipped ? [t.turn.skipped] : []));
    expect(skipped.map((x) => x.topic)).toEqual(['why', 'starting_point']);
    for (const x of skipped) expect(x.line.split(/[.!?]\s/).length).toBe(1);
    // Neither is asked.
    expect(report.turns.filter((t) => t.turn.topic === 'why' || t.turn.topic === 'starting_point')).toEqual([]);
    expect(report.finished).toBe(true);
  });

  it('one-word answers (on a phone): follow-ups on the same topic carry it on, and setup finishes', async () => {
    const c = byId('run-l-one-word-answers');
    const report = await run(c);
    for (const line of c.person) expect(line.say.split(' ').length, line.say).toBeLessThanOrEqual(2);
    expect(c.person.map((p) => p.say)).toEqual(expect.arrayContaining(['family', '2 goals', 'no']));
    // A question straight after the reply on the same topic, more than once: "2 goals" then "What are the goals?", and so on.
    const followUps = report.turns.filter((t, i) => i > 0 && t.turn.topic !== null && t.turn.topic === report.turns[i - 1].turn.topic);
    expect(followUps.map((t) => t.turn.topic)).toEqual(['breakup', 'sequencing', 'priorities']);
    expect(report.finished).toBe(true);
    expect(report.finalIssues).toEqual([]);
    // "spring" cannot be restated after "It comes back", so it is shown as said.
    expect(renderPlayback(report.draft.model, 'goals')).toContain('Set aside for now: Cooking. It comes back, in your words: "spring"');
  });
});

describe('what the eval set would catch if the model did it', () => {
  // Takes a clean case's script and changes one turn, to show the checks fail on the change.
  async function withTurn(id: string, index: number, change: (t: AssistantTurn) => void): Promise<EvalReport> {
    const c = byId(id);
    const script = structuredClone(c.script);
    change(script[index]);
    return runSetupEval(c, scriptedModel(script));
  }

  it('works a relative deadline out into a date instead of asking for it', async () => {
    // Turn 5 is where the model asks for the exact date; here it writes the date itself from "the week before", and
    // points at the person's message that said only that (index 9).
    const c = byId('run-g-relative-deadline');
    const script = structuredClone(c.script);
    script[5].draft.model.goals[0].endDate = '2027-05-29';
    script[5].draft.said.push({ path: 'goals.g1.endDate', turn: 9, how: 'said' });
    const report = await runSetupEval(c, scriptedModel(script));
    expect(report.turns[5].violations.map((v) => v.rule)).toContain('draft');
    expect(report.turns[5].violations.map((v) => v.message).join(' ')).toMatch(/does not say/);
  });

  it('records a deadline task with no answer to "can the date move?"', async () => {
    const c = byId('run-a-deadline-only');
    const script = structuredClone(c.script);
    // Drop the can-move answer from the turn that records the date, and from every later draft.
    for (const t of script.slice(7)) {
      t.draft.model.goals[0].items[0].dateCanMove = null;
      t.draft.said = t.draft.said.filter((s) => !s.path.endsWith('dateCanMove'));
    }
    const report = await runSetupEval(c, scriptedModel(script));
    expect(report.turns[7].violations.map((v) => v.message).join(' ')).toMatch(/Can the date move/);
    expect(report.finalIssues?.map((i) => i.path)).toContain('goals.g1.items.i1.dateCanMove');
  });

  it('approves parts that were never played back', async () => {
    const report = await withTurn('run-a-deadline-only', 4, (t) => {
      t.draft.approved = ['goals', 'targets'];
    });
    expect(report.turns[4].violations.map((v) => v.rule)).toContain('chunked_playback');
  });

  it('saves a weekly target without ever having the week start', async () => {
    // The final validation is what stops it: a weekly target needs the week start, where a deadline goal does not.
    const c = byId('run-b-habit-ideas');
    const script = structuredClone(c.script);
    for (const t of script) {
      t.draft.model.person.weekStart = null;
      t.draft.said = t.draft.said.filter((s) => s.path !== 'person.weekStart');
    }
    const report = await runSetupEval(c, scriptedModel(script));
    expect(report.finalIssues?.map((i) => i.path)).toContain('person.weekStart');
  });

  it('turns a model that is not valid JSON of the right shape into a malformed report, not a crash', async () => {
    const c = byId('run-a-deadline-only');
    const report = await runSetupEval(c, () => ({ nonsense: true }) as unknown as AssistantTurn);
    expect(report.malformed).not.toBeNull();
    expect(report.turns).toHaveLength(0);
  });
});

describe.each(SETUP_CASES)('case $id', (c) => {
  it(c.title, async () => {
    const report = await run(c);
    expect(report.malformed).toBeNull();
    if (c.expect === 'clean') {
      expect(described(report)).toEqual([]);
      expect(report.ranOutOfPerson).toBe(false);
      expect(report.finished).toBe(true);
      // The finished draft passes the same validation the save step uses.
      expect(report.finalIssues).toEqual([]);
    } else {
      expect(violationsOf(report)).toEqual(c.expect.violations);
    }
  });
});
