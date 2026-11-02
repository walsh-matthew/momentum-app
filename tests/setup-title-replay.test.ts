// MOM-167 title-check fix. Found on production on 2026-11-02 (21:31 to 21:36 UTC): at "what would you like to count", every reply
// was thrown away, even for the answer "runs". Claude's clean version of a title ("plain") is one sentence by the prompt's own
// rule, shownModel put it in the title's place, and checkTitles then flagged the sentence on every try; a unit mistake that the
// retry could not hear about came back on the last try. These tests replay that conversation through the server's turn loop
// (takeSetupTurn) with a stand-in for Claude, and pin the approved words of the fix (the Jira comment on MOM-167).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { shownModel } from '@/lib/setup/paraphrase';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { UNIT_EXTRA_MESSAGE, UNIT_MISSING_MESSAGE } from '@/lib/setup/validate';
import { emptyDraft } from '@/lib/setup/draft';
import type { AssistantTurn, SetupSession, Transcript } from '@/types/setup';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { Script, goal, target } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const MODEL = 'claude-opus-5-5';
const FIRST_ANSWER = 'I need to run at least three times a week to get in the shape';
const GOAL_SENTENCE = 'I need to run to get in the shape';
const TARGET_SENTENCE = 'I need to run at least three times a week';

// The conversation up to the count question: the idea, then Claude's turn that names the goal and asks what to count.
function counting() {
  const script = new Script()
    .add({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', reply: FIRST_ANSWER })
    .add({
      topic: 'target',
      question: "What would you like to count to know it's going well?",
      edit: (m) => {
        m.goals = [goal('running', 'Running', { why: null })];
      },
      plain: [{ path: 'goals.running.title', text: GOAL_SENTENCE }],
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

// Claude's reply to "runs". `title` and `unit` are what it writes for the target; its clean versions are full sentences.
function reply(title: string, unit: string | null): AssistantTurn {
  const { draft } = counting();
  const next = structuredClone(draft);
  next.model.goals[0].targets = [target('runs', title, { unit })];
  next.plain = [
    { path: 'goals.running.title', text: GOAL_SENTENCE },
    { path: 'goals.running.targets.runs.title', text: TARGET_SENTENCE },
  ];
  return { kind: 'question', chunk: null, skipped: null, say: '', question: 'How many runs would still count in a hard week?', detail: null, topic: 'floor', options: [], draft: next };
}

// A stand-in for the model call: answers with the next raw reply it is given and remembers what it was asked.
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

const logged = () => (warn.mock.calls as unknown[][]).map((c) => c[1] as { codes?: string[] });

describe('the count question is answered with "runs" (MOM-167 title-check fix)', () => {
  it('shows the turn when Claude’s clean versions of the titles are full sentences', async () => {
    const stub = stubTurns([reply('Runs', null)]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    if (!result.ok || result.data.kind !== 'turn') throw new Error('expected a turn');
    // The person is shown the short name, not Claude’s sentence.
    const model = shownModel(result.data.turn.draft, session().transcript);
    expect(model.goals[0].targets[0].title).toBe('Runs');
    expect(model.goals[0].title).toBe('Running');
  });

  it('keeps the title when the clean version is a sentence, and uses a short clean version', () => {
    const { transcript } = counting();
    const sentence = reply('Runs', null).draft;
    expect(shownModel(sentence, transcript).goals[0].targets[0].title).toBe('Runs');
    const short = structuredClone(sentence);
    short.plain = [{ path: 'goals.running.title', text: 'Running more' }];
    expect(shownModel(short, [...transcript, { role: 'person', text: 'I want to run more' }]).goals[0].title).toBe('Running more');
  });

  it('still flags a title that is a sentence itself, and retries it once', async () => {
    const stub = stubTurns([reply('I need to run', null), reply('I need to run', null)]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    // Shown after its one retry, never "Try again".
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1].retryFeedback?.join(' ')).toContain(RETRY_FEEDBACK['plain.title']);
  });

  it('tells each retry every rule broken on the tries before it, so a fixed rule cannot come back', async () => {
    // Try 0 puts a unit on a count; try 1 fixes it but writes a sentence title; try 2 writes the unit again.
    const stub = stubTurns([reply('Runs', 'runs'), reply('I need to run', null), reply('I need to run', 'runs')]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls[0].retryFeedback).toBeUndefined();
    expect(stub.calls[1].retryFeedback).toEqual([RETRY_FEEDBACK['draft.unit_extra'] + ' Paths: goals.running.targets.runs.unit.']);
    const third = (stub.calls[2].retryFeedback ?? []).join('\n');
    expect(third).toContain(RETRY_FEEDBACK['draft.unit_extra']);
    expect(third).toContain(RETRY_FEEDBACK['plain.title']);
    expect(result).toMatchObject({ ok: true, data: { kind: 'failed' } });
    expect(logged().some((l) => l.codes?.includes('draft.unit_extra'))).toBe(true);
  });

  it('shows a title-only violation after its retry, even when an earlier try broke another rule', async () => {
    // Try 0 breaks the unit rule and the title check; try 1 fixes the unit and leaves the title: it was told, so it is shown.
    const stub = stubTurns([reply('I need to run', 'runs'), reply('I need to run', null)]);
    const result = await takeSetupTurn(session(), { runTurn: stub.run });
    expect(result).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 1 } });
    expect(stub.calls).toHaveLength(2);
    const told = (stub.calls[1].retryFeedback ?? []).join('\n');
    expect(told).toContain(RETRY_FEEDBACK['draft.unit_extra']);
    expect(told).toContain(RETRY_FEEDBACK['plain.title']);
  });
});

describe('the approved words (MOM-167 title-check fix, Jira comment)', () => {
  it('says which way to fix a unit mistake', () => {
    expect(UNIT_EXTRA_MESSAGE).toBe('Only a quantity has a unit. Leave the unit empty and keep what is counted, timed or ticked off in the title.');
    expect(UNIT_MISSING_MESSAGE).toBe('A quantity needs a unit. Ask what it is measured in, or make it a count if it is only counted.');
    expect(RETRY_FEEDBACK['draft.unit_extra']).toBe(
      'Only a quantity, an amount of something like pages or pounds, has a unit. For a count, a time or a checklist, set "unit" to null and name what is measured in the title.',
    );
    expect(RETRY_FEEDBACK['draft.unit_missing']).toBe(
      "A quantity needs a unit, the person's own word for what it is measured in, so ask for it in this turn. If they only count occurrences, make it a count with no unit.",
    );
  });

  it('tells Claude a title’s clean version is the short name itself', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain(
      'The exception is a title (a goal\'s, target\'s or work item\'s): its clean version is the short name itself, a few words and never a sentence ("Runs", not "I need to run at least three times a week").',
    );
  });

  it('names the retry for a quantity with no unit', async () => {
    const quantity = reply('Pages', null);
    quantity.draft.model.goals[0].targets[0].measure = 'quantity';
    const stub = stubTurns([quantity]);
    await takeSetupTurn(session(), { runTurn: stub.run });
    expect((stub.calls[1].retryFeedback ?? []).join(' ')).toContain(RETRY_FEEDBACK['draft.unit_missing']);
    expect(emptyDraft().plain).toEqual([]);
  });
});
