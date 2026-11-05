// MOM-180 parts B1 and B2: how many times Claude is asked in one whole first setup, counted by the eval runner with the scripted model (no paid call). The
// same case is run for the person who taps the cards and for the same person typing every answer. The same file and cases run on main (after B1) to give its
// counts: set TURN_COUNT_OUT to a path prefix and each case writes `<prefix>.<case id>.json` instead of pinning the count.
//   GOAL_CARDS_CASE (B1): two goals, every goal step the goal cards cover, then the week questions as cards.
//   STEP_CARDS_CASE (B2): the same two goals with steps 3, 7 and 9 as cards too (one goal or a few and the names, together or one first, when the goal set aside
//   comes back, something I do, the number boxes, where it is tracked), and the time zone tap that no longer calls Claude.
// "What does this mean?" is code's own words (part A), so it costs no call and is not in the script.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSetupEval } from '@/lib/setup/evals';
import { GOAL_CARDS_CASE, STEP_CARDS_CASE } from './setup-evals/cases';
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

// Measured 2026-11-05 on these same cases. GOAL_CARDS_CASE: main (after B1) 16; this branch 15, because the time zone tap is followed by the source card, which
// code writes, instead of a question of Claude's. STEP_CARDS_CASE: this branch 13 tapping (see the close-out for main's count of the same conversation).
const PINNED: Record<string, number> = { [GOAL_CARDS_CASE.id]: 15, [STEP_CARDS_CASE.id]: 13 };

describe.each([GOAL_CARDS_CASE, STEP_CARDS_CASE])('how many times Claude is asked in the extended first setup: $id', (c) => {
  it('reaches the end, clean, and counts the calls', async () => {
    const tapping = await run(c);
    const typing = await run({ ...c, person: c.person.map(({ week: _week, goal: _goal, step: _step, ...line }) => line) });
    expect(tapping.report.malformed).toBeNull();
    expect(tapping.report.finished).toBe(true);
    expect(tapping.report.turns.flatMap((t) => t.violations.map((v) => `${t.index}:${v.rule}`))).toEqual([]);
    expect(tapping.report.finalIssues).toEqual([]);
    if (process.env.TURN_COUNT_OUT) {
      writeFileSync(`${process.env.TURN_COUNT_OUT}.${c.id}.json`, JSON.stringify({ taps: tapping.calls, typed: typing.calls, turns: tapping.report.turns.length }));
    }
    expect(tapping.calls).toBeLessThanOrEqual(typing.calls);
    // Left unpinned when the count is being written out for another checkout.
    if (!process.env.TURN_COUNT_OUT) expect(tapping.calls).toBe(PINNED[c.id]);
  });
});
