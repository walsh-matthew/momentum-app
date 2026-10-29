// The scripted conversation the guided setup spec runs (MOM-111): one of the setup eval set's full cases (tests/setup-evals),
// so the fake model's replies and the person's lines were already checked together by `npm test` against the same rules the
// app applies. The fake model replays Claude's side (fakeAnthropic.ts); the spec types the person's side. Every name, date
// and number in it is invented.

import { SETUP_CASES, type ScriptedCase } from '../../setup-evals/cases';

export const E2E_CASE_ID = 'run-i-what-do-you-mean-protected';

export function e2eCase(): ScriptedCase {
  const found = SETUP_CASES.find((c) => c.id === E2E_CASE_ID);
  if (!found) throw new Error(`The setup eval set has no case "${E2E_CASE_ID}".`);
  return found;
}
