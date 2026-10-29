// The scripted conversation the guided setup spec runs (MOM-111): one of the setup eval set's full cases (tests/setup-evals),
// so the fake model's replies and the person's lines were already checked together by `npm test` against the same rules the
// app applies. The fake model replays Claude's side (fakeAnthropic.ts); the spec types the person's side. Every name, date
// and number in it is invented.

import { SETUP_CASES, type ScriptedCase } from '../../setup-evals/cases';
import type { FakeScript } from './fakeAnthropic';

export const E2E_CASE_ID = 'run-i-what-do-you-mean-protected';
// A deadline goal: its exact date is asked as a plain question, the one card run-i never shows (MOM-111 round 2 screenshots).
export const DATE_QUESTION_CASE_ID = 'run-a-deadline-only';

function caseById(id: string): ScriptedCase {
  const found = SETUP_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`The setup eval set has no case "${id}".`);
  return found;
}

export const e2eCase = (): ScriptedCase => caseById(E2E_CASE_ID);
export const dateQuestionCase = (): ScriptedCase => caseById(DATE_QUESTION_CASE_ID);

// The scripts the fake model serves, picked by the person's first answer; the first is the default.
export function fakeScripts(): FakeScript[] {
  return [e2eCase(), dateQuestionCase()].map((c) => ({ firstAnswer: c.person[0].say, turns: c.script }));
}
