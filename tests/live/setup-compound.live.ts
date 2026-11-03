// The LIVE run of the compound answer (MOM-168): one real setup turn against the real model, for the answer "Runs, at least 3 a week."
// to the question "What would you like to count?". It shows whether live Claude records the 3 a week as the floor and says it is
// skipping the floor question, or asks the floor question again. Run it with
//   npx vitest run --config vitest.live.config.mts tests/live/setup-compound.live.ts
// It is not part of `npm test` and never runs in CI (tests/live/ is reached only by vitest.live.config.mts).
//
// Safety: no database at all. The Supabase client is the in-memory stand-in the replay tests use, the only value read from .env.local is
// ANTHROPIC_API_KEY (never printed), and the run stops by itself when the estimated cost passes MAX_COST_USD. The turn goes through
// takeSetupTurn() exactly as the app calls it (checks, retries, shown-after-one-retry), with the model call made directly, so no usage
// row is written anywhere. The report names rules and codes only and is written to the system temp folder.

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SETUP_MODEL, requestSetupTurnFromModel } from '@/lib/ai/setup';
import { estimateCostUsd, readEnvFileValue } from '@/lib/ai/setupLive';
import { takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import type { SetupSession, Transcript } from '@/types/setup';
import { resetFakeSave } from '../helpers/fakeSetupSave';
import { Script, goal } from '../helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('../helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const MAX_COST_USD = 0.5;
// MOM168_LIVE_ANSWER=first runs the production answer from the very first turn (2026-11-02 about 23:20 UTC); the default is the compound
// answer at the count question.
const FIRST = process.env.MOM168_LIVE_ANSWER === 'first';
const FIRST_ANSWER = 'I want to run three days a week';
const COMPOUND = FIRST ? FIRST_ANSWER : 'Runs, at least 3 a week';

describe('live compound answer', () => {
  it(`asks ${SETUP_MODEL} one turn after "${COMPOUND}"`, async () => {
    const key = readEnvFileValue(readFileSync(join(process.cwd(), '.env.local'), 'utf8'), 'ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set in .env.local.');
    process.env.ANTHROPIC_API_KEY = key;
    resetFakeSave({ id: '11111111-1111-4111-8111-111111111111' });

    // The conversation up to the count question, as the earlier replay tests build it; or, for the first answer, only the opening question.
    const script = new Script()
      .add({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', reply: FIRST ? FIRST_ANSWER : 'I want to run more' })
      .add({
        topic: 'target',
        question: 'What would you like to count to know this is going well?',
        edit: (m) => {
          m.goals = [goal('running', 'Running', { why: 'it clears my head' })];
        },
        reply: COMPOUND,
      });
    const transcript: Transcript = FIRST
      ? [
          { role: 'assistant', turn: script.turns[0] },
          { role: 'person', text: FIRST_ANSWER },
        ]
      : [
          { role: 'assistant', turn: script.turns[0] },
          { role: 'person', text: 'I want to run more' },
          { role: 'assistant', turn: script.turns[1] },
          { role: 'person', text: COMPOUND },
        ];
    const session: SetupSession = { transcript, draft: FIRST ? script.turns[0].draft : script.turns[1].draft, spentTokens: 0 };

    const warns: { codes?: string[]; rules?: string[]; category?: string }[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('[setup]') && typeof args[1] === 'object' && args[1] !== null) warns.push(args[1] as (typeof warns)[number]);
      else realWarn(...args);
    };

    let inputTokens = 0;
    let outputTokens = 0;
    let calls = 0;
    const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      const cost = estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens) ?? 0;
      if (cost > MAX_COST_USD) throw new Error('Stopped: the estimated cost passed the stop-loss.');
      calls += 1;
      const result = await requestSetupTurnFromModel({
        transcript: args.transcript,
        draft: args.draft,
        today: args.today,
        retryFeedback: args.retryFeedback,
        dateHint: args.dateHint,
        sourceNote: args.sourceNote,
        returningNote: args.returningNote,
        timeoutMs: args.timeoutMs,
      });
      const usage = result.usage ?? null;
      inputTokens += usage?.inputTokens ?? 0;
      outputTokens += usage?.outputTokens ?? 0;
      return {
        kind: 'answered',
        result,
        turns: args.transcript.filter((m) => m.role === 'assistant').length + 1,
        spentTokens: args.spentTokens + (usage ? usage.inputTokens + usage.outputTokens : 0),
      };
    };

    let outcome: Awaited<ReturnType<typeof takeSetupTurn>>;
    try {
      outcome = await takeSetupTurn(session, { runTurn: runTurn as never });
    } finally {
      console.warn = realWarn;
    }

    const cost = estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens);
    const turn = outcome.ok && outcome.data.kind === 'turn' ? outcome.data.turn : null;
    const target = turn?.draft.model.goals[0]?.targets.at(-1) ?? null;
    const report = {
      model: SETUP_MODEL,
      answer: COMPOUND,
      resultKind: outcome.ok ? outcome.data.kind : 'error',
      calls,
      thrownAway: outcome.ok && outcome.data.kind === 'turn' ? outcome.data.rejected : null,
      thrownAwayCodes: warns.flatMap((w) => w.codes ?? []),
      reply: turn && {
        kind: turn.kind,
        topic: turn.topic,
        skipped: turn.skipped,
        say: turn.say,
        question: turn.question,
        detail: turn.detail,
        options: turn.options,
      },
      recordedTarget: target && { title: target.title, measure: target.measure, unit: target.unit, floor: target.floor, aspiration: target.aspiration, period: target.period },
      saidEntries: turn?.draft.said.map((s) => `${s.path}@${s.turn}:${s.how}`) ?? [],
      recordedGoal: (turn?.draft.model.goals.length ?? 0) > 0,
      recordedTargetRuns: target !== null,
      numberGuessed: target !== null && (target.floor !== null || target.aspiration !== null),
      recordedFloor3: target?.floor === 3,
      skippedFloor: turn?.skipped?.topic === 'floor',
      askedFloorAgain: turn?.topic === 'floor',
      askedLevel: turn?.topic === 'number_level',
      tokens: { input: inputTokens, output: outputTokens },
      estimatedCostUsd: cost === null ? null : Number(cost.toFixed(4)),
    };
    const text = JSON.stringify(report, null, 2);
    const file = join(tmpdir(), 'mom168-compound-live-report.json');
    writeFileSync(file, text);
    console.log(`\nLIVE REPORT (also written to ${file})\n${text}\n`);
    expect(calls).toBeGreaterThan(0);
  });
});
