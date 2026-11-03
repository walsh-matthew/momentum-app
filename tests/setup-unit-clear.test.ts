// MOM-176. Claude sometimes writes a unit on a count, a time or a checklist ("sessions" on a count). Code clears it before the
// turn is checked (lib/setup/units.ts, wired in runCheckedTurn), so the turn is kept, no retry is spent and the person sees nothing
// different. These tests pin the function, replay the turn through the server's loop, and check that the final save check still
// rejects a unit on a non-quantity if one ever got through.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { clearStrayUnits } from '@/lib/setup/units';
import { validateDraft } from '@/lib/setup/validate';
import { MEASURES } from '@/types/database.types';
import type { AssistantTurn, SetupSession, TargetDraft, Transcript } from '@/types/setup';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { Script, goal, target } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const MODEL = 'claude-opus-5-5';
const FIRST_ANSWER = 'I need to run at least three times a week to get in the shape';

// The conversation up to the count question, then the person's answer "runs" (the same one the MOM-167 replay uses).
function counting() {
  const script = new Script()
    .add({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', reply: FIRST_ANSWER })
    .add({
      topic: 'target',
      question: "What would you like to count to know it's going well?",
      edit: (m) => {
        m.goals = [goal('running', 'Running', { why: null })];
      },
      reply: 'runs',
    });
  const transcript: Transcript = [
    { role: 'assistant', turn: script.turns[0] },
    { role: 'person', text: FIRST_ANSWER },
    { role: 'assistant', turn: script.turns[1] },
    { role: 'person', text: 'runs' },
  ];
  return { transcript, draft: script.turns[1].draft };
}

// Claude's reply to "runs" with the targets it writes.
function replyWith(targets: TargetDraft[]): AssistantTurn {
  const { draft } = counting();
  const next = structuredClone(draft);
  next.model.goals[0].targets = targets;
  return { kind: 'question', chunk: null, skipped: null, say: '', question: 'How many runs would still count in a hard week?', detail: null, topic: 'floor', options: [], draft: next };
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

const targetsOf = (turn: AssistantTurn): TargetDraft[] => turn.draft.model.goals.flatMap((g) => g.targets);

describe('clearStrayUnits', () => {
  it.each(MEASURES.filter((m) => m !== 'quantity'))('clears the unit on a %s target', (measure) => {
    const turn = replyWith([target('runs', 'Runs', { measure, unit: 'sessions' })]);
    const out = clearStrayUnits(turn);
    expect(out.cleared).toBe(1);
    expect(targetsOf(out.turn)[0]).toMatchObject({ measure, unit: null, title: 'Runs' });
  });

  it('leaves a quantity target alone, with its unit', () => {
    const turn = replyWith([target('pages', 'Pages', { measure: 'quantity', unit: 'pages' })]);
    const out = clearStrayUnits(turn);
    expect(out.cleared).toBe(0);
    expect(out.turn).toBe(turn);
    expect(targetsOf(out.turn)[0].unit).toBe('pages');
  });

  it('never fills a missing unit: a quantity with none stays without one, and a count with none is untouched', () => {
    const turn = replyWith([target('pages', 'Pages', { measure: 'quantity', unit: null }), target('runs', 'Runs', { measure: 'count', unit: null })]);
    const out = clearStrayUnits(turn);
    expect(out.cleared).toBe(0);
    expect(out.turn).toBe(turn);
    expect(targetsOf(out.turn).map((t) => t.unit)).toEqual([null, null]);
  });

  it('changes nothing but the unit, counts every target it cleared, and leaves a quantity beside them', () => {
    const turn = replyWith([
      target('runs', 'Runs', { measure: 'count', unit: 'sessions', floor: 3 }),
      target('read', 'Reading', { measure: 'time', unit: 'minutes' }),
      target('pages', 'Pages', { measure: 'quantity', unit: 'pages' }),
    ]);
    const before = structuredClone(turn);
    const out = clearStrayUnits(turn);
    expect(out.cleared).toBe(2);
    expect(targetsOf(out.turn).map((t) => t.unit)).toEqual([null, null, 'pages']);
    // Everything except those two units is as it was.
    const expected = structuredClone(before);
    expected.draft.model.goals[0].targets[0].unit = null;
    expected.draft.model.goals[0].targets[1].unit = null;
    expect(out.turn).toEqual(expected);
    // The turn it was given is not changed.
    expect(turn).toEqual(before);
  });

  it('leaves the said entries as they are', () => {
    const turn = replyWith([target('runs', 'Runs', { measure: 'count', unit: 'sessions' })]);
    turn.draft.said = [{ path: 'goals.running.targets.runs.unit', turn: 3, how: 'said' }];
    expect(clearStrayUnits(turn).turn.draft.said).toEqual(turn.draft.said);
  });
});

describe('a unit on a count is cleared instead of throwing the turn away (MOM-176)', () => {
  it('keeps the turn on the first try with the unit empty and nothing rejected', async () => {
    const raw = replyWith([target('runs', 'Runs', { measure: 'count', unit: 'sessions' })]);
    const stub = stubTurns([raw]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.draft.model.goals[0].targets[0]).toMatchObject({ measure: 'count', unit: null, title: 'Runs' });
    // Claude's own object is not changed; the cleared copy is what is kept.
    expect(raw.draft.model.goals[0].targets[0].unit).toBe('sessions');
  });

  it('logs one line with a count and the attempt, and no value, title or path', async () => {
    const stub = stubTurns([replyWith([target('runs', 'Runs', { measure: 'count', unit: 'sessions' })])]);
    await takeSetupTurn(session(), { runTurn: stub.run });
    const lines = (warn.mock.calls as unknown[][]).filter((c) => c[0] === '[setup] a stray unit was cleared');
    expect(lines).toEqual([['[setup] a stray unit was cleared', { cleared: 1, attempt: 0 }]]);
    const everything = JSON.stringify(warn.mock.calls);
    expect(everything).not.toContain('sessions');
    expect(everything).not.toContain('Runs');
    expect(everything).not.toContain('runs');
  });

  it('clears a time and a checklist the same way', async () => {
    for (const measure of ['time', 'checklist'] as const) {
      const stub = stubTurns([replyWith([target('runs', 'Runs', { measure, unit: 'minutes' })])]);
      const result = await takeSetupTurn(session(), { runTurn: stub.run });
      expect(result, measure).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
      expect(stub.calls).toHaveLength(1);
    }
  });

  it('keeps a quantity with its unit on the first try, and logs nothing', async () => {
    const stub = stubTurns([replyWith([target('pages', 'Pages', { measure: 'quantity', unit: 'pages' })])]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.draft.model.goals[0].targets[0]).toMatchObject({ measure: 'quantity', unit: 'pages' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('still sends a quantity with no unit back, with the unit_missing retry line', async () => {
    const stub = stubTurns([replyWith([target('pages', 'Pages', { measure: 'quantity', unit: null })])]);
    await takeSetupTurn(session(), { runTurn: stub.run });
    expect(stub.calls.length).toBeGreaterThan(1);
    expect((stub.calls[1].retryFeedback ?? []).join(' ')).toContain(RETRY_FEEDBACK['draft.unit_missing']);
  });
});

describe('the final save check is the safety net', () => {
  it('still rejects a unit on a non-quantity in a saved session', () => {
    const { transcript, draft } = counting();
    const saved = structuredClone(draft);
    saved.model.goals[0].targets = [target('runs', 'Runs', { measure: 'count', unit: 'sessions' })];
    const final = validateDraft(saved, transcript, 'final');
    expect(final.issues.find((i) => i.hint === 'unit_extra')).toMatchObject({ path: 'goals.running.targets.runs.unit', code: 'rule' });
    expect(validateDraft(saved, transcript, 'progress').issues.some((i) => i.hint === 'unit_extra')).toBe(true);
  });
});
