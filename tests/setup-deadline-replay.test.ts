// MOM-166: a deadline goal's setup gets past its date. Found on production on 2026-11-02: once the date was accepted, every
// reply Claude wrote was thrown away, the code-written Yes included, because a check meant for the final save (a deadline task
// has its date and the person's can-move answer) ran on every draft, while setup asks "can the date move?" in its own turn after
// the date. These tests replay that conversation through the server's turn loop (takeSetupTurn) with a stand-in for Claude, so
// nothing reaches the network, and hold the final save to the answer.
//
// The conversation is the eval case run-m-deadline-item-at-date, whose Claude turn after the date adds the deadline task with its
// date and no answer, as real Claude does, and asks the can-move question.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { runSetupEval } from '@/lib/setup/evals';
import { describeMissing } from '@/lib/setup/quickPath';
import { validateDraft } from '@/lib/setup/validate';
import type { AssistantTurn, SetupSession, Transcript } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const MODEL = 'claude-opus-5-5';

async function replayed() {
  const c = SETUP_CASES.find((x) => x.id === 'run-m-deadline-item-at-date');
  if (!c) throw new Error('no case');
  const report = await runSetupEval(c, scriptedModel(c.script));
  if (!report.finished) throw new Error('the case did not finish');
  const dateAsked = c.script.findIndex((t) => t.topic === 'deadline_date');
  const moveAsked = c.script.findIndex((t) => t.topic === 'date_can_move');
  return { script: c.script, transcript: report.transcript, dateAsked, moveAsked };
}

// A stand-in for the model call: answers with the one raw reply it is given and remembers how often it was asked.
function stubTurn(raw: unknown) {
  const calls: RunSetupTurnArgs[] = [];
  const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
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

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetFakeSave({ id: ME });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('a deadline goal gets past its date (MOM-166)', () => {
  it('passes the turn after a typed date: the task is in the draft with its date, and the turn asks whether the date can move', async () => {
    const { script, transcript, moveAsked } = await replayed();
    const reply = script[moveAsked];
    // The turn really holds the state that broke production: a deadline task with its date and no answer.
    expect(reply.draft.model.goals[0].items[0]).toMatchObject({ kind: 'deadline_task', dueDate: '2027-06-14', dateCanMove: null });
    const session: SetupSession = { transcript: transcript.slice(0, 2 * moveAsked), draft: script[moveAsked - 1].draft, spentTokens: 0 };
    const stub = stubTurn(reply);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.topic).toBe('date_can_move');
    expect(result.data.turn.question).toBe('Can that date move?');
    expect(stub.calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes the same turn when the date was a code-written proposal and the person tapped Yes', async () => {
    const { script, transcript, dateAsked, moveAsked } = await replayed();
    // The turn that asked for the date was code's proposal ("Done by ...?") and the person's reply is the Yes button.
    const proposal: AssistantTurn = { ...script[dateAsked], kind: 'proposal', question: 'Done by Mon, Jun 14, 2027?', options: ['A different day'] };
    const history: Transcript = transcript.slice(0, 2 * moveAsked).map((m, i) => {
      if (i === 2 * dateAsked) return { role: 'assistant', turn: proposal };
      if (i === 2 * dateAsked + 1) return { role: 'person', text: 'Yes' };
      return m;
    });
    // The date now rests on that Yes: accepted, not said.
    const reply: AssistantTurn = structuredClone(script[moveAsked]);
    reply.draft.said = reply.draft.said.map((s) => (s.path.endsWith('.dueDate') || s.path.endsWith('.endDate') ? { ...s, how: 'accepted' as const } : s));
    const stub = stubTurn(reply);
    const result = await takeSetupTurn({ transcript: history, draft: script[moveAsked - 1].draft, spentTokens: 0 }, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('records the person\'s answer on the next turn and carries on', async () => {
    const { script, transcript, moveAsked } = await replayed();
    const session: SetupSession = { transcript: transcript.slice(0, 2 * (moveAsked + 1)), draft: script[moveAsked].draft, spentTokens: 0 };
    const stub = stubTurn(script[moveAsked + 1]);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    expect(result.data.turn.draft.model.goals[0].items[0].dateCanMove).toBe(false);
  });

  it('still refuses an answer the person never gave: one written in the turn that asks the question', async () => {
    const { script, transcript, moveAsked } = await replayed();
    // Claude sets dateCanMove while asking it, with the date's message as the "source": not an answer to its own question.
    const guessed: AssistantTurn = structuredClone(script[moveAsked]);
    guessed.draft.model.goals[0].items[0].dateCanMove = true;
    guessed.draft.said.push({ path: 'goals.g1.items.i1.dateCanMove', turn: 2 * moveAsked - 1, how: 'said' });
    const session: SetupSession = { transcript: transcript.slice(0, 2 * moveAsked), draft: script[moveAsked - 1].draft, spentTokens: 0 };
    const stub = stubTurn(guessed);
    const result = await takeSetupTurn(session, { runTurn: stub.run });
    expect(stub.calls.length).toBeGreaterThan(1);
    expect(result).toMatchObject({ ok: true, data: { kind: 'failed' } });
  });
});

describe('the final save still needs the can-move answer (MOM-166)', () => {
  it('refuses a final draft whose deadline task has no answer, and the quick path asks for it', async () => {
    const { script, transcript, moveAsked } = await replayed();
    // The finished conversation with the answer taken back out.
    const full = (await runSetupEval(SETUP_CASES.find((x) => x.id === 'run-m-deadline-item-at-date')!, scriptedModel(script)));
    const draft = structuredClone(full.draft);
    draft.model.goals[0].items[0].dateCanMove = null;
    draft.said = draft.said.filter((s) => !s.path.endsWith('dateCanMove'));
    const final = validateDraft(draft, transcript, 'final');
    expect(final.ok).toBe(false);
    expect(final.issues.map((i) => i.path)).toContain('goals.g1.items.i1.dateCanMove');
    expect(validateDraft(draft, transcript, 'progress').issues).toEqual([]);
    // The quick path plans from the final issues, so it still asks the question in plain words.
    expect(describeMissing(draft.model, final.issues)).toContain('Whether the date for "Quilt finished" can move.');
    expect(moveAsked).toBeGreaterThan(0);
  });

  it('refuses a final draft whose deadline task has no date', async () => {
    const { script, transcript } = await replayed();
    const full = await runSetupEval(SETUP_CASES.find((x) => x.id === 'run-m-deadline-item-at-date')!, scriptedModel(script));
    const draft = structuredClone(full.draft);
    draft.model.goals[0].items[0].dueDate = null;
    expect(validateDraft(draft, transcript, 'final').issues.map((i) => i.path)).toContain('goals.g1.items.i1.dueDate');
  });
});
