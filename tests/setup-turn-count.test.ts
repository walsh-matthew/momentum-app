// MOM-180 part B1: how many times Claude is asked in one whole first setup, counted by the eval runner with the scripted model (no paid call). The
// same case (tests/setup-evals/cases.ts GOAL_CARDS_CASE: two goals, every goal step the cards cover, then the week questions) is run for the
// person who taps the cards and for the same person typing every answer. The same file and case run on main and on part A to give their counts.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSetupEval } from '@/lib/setup/evals';
import { GOAL_CARDS_CASE } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const run = async (c: typeof GOAL_CARDS_CASE) => {
  let calls = 0;
  const model = scriptedModel(c.script);
  const report = await runSetupEval(c, (input) => {
    calls += 1;
    return model(input);
  });
  return { report, calls };
};

describe('how many times Claude is asked in the extended first setup', () => {
  it('reaches the end, clean, and counts the calls', async () => {
    const tapping = await run(GOAL_CARDS_CASE);
    const typing = await run({ ...GOAL_CARDS_CASE, person: GOAL_CARDS_CASE.person.map(({ week: _week, goal: _goal, ...line }) => line) });
    expect(tapping.report.malformed).toBeNull();
    expect(tapping.report.finished).toBe(true);
    expect(tapping.report.turns.flatMap((t) => t.violations.map((v) => `${t.index}:${v.rule}`))).toEqual([]);
    expect(tapping.report.finalIssues).toEqual([]);
    if (process.env.TURN_COUNT_OUT) {
      writeFileSync(process.env.TURN_COUNT_OUT, JSON.stringify({ taps: tapping.calls, typed: typing.calls, turns: tapping.report.turns.length }));
    }
    expect(tapping.calls).toBeLessThanOrEqual(typing.calls);
    // Measured 2026-11-04 on the same case: main 016bd84 and part A 5b9acfe, 20 calls (the goal questions are Claude's there, so tapping saves nothing on
    // them); this branch, 16: the shape, the start date, the first stretch and the second goal's shape and start date follow a tap with no call.
    // Left unpinned when the count is being written out for another checkout.
    if (!process.env.TURN_COUNT_OUT) expect(tapping.calls).toBe(16);
  });
});
