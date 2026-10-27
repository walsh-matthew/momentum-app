// The setup eval set (MOM-111): every scripted case runs against a fake model, and every turn is checked automatically
// against the eight hard rules and the draft schema. No network call is made. A clean case must finish with a draft
// that passes the final validation the save step will use; a fixture must trip exactly the check it was written for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSetupEval, violationsOf, type EvalReport, type SetupEvalCase } from '@/lib/setup/evals';
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
  it('has sixteen cases: eight full conversations and one fixture per hard rule', () => {
    expect(SETUP_CASES).toHaveLength(16);
    expect(SETUP_CASES.filter((c) => c.expect === 'clean')).toHaveLength(8);
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
