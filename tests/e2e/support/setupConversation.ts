// The scripted conversation the guided setup spec runs (MOM-111): one of the setup eval set's full cases (tests/setup-evals),
// so the fake model's replies and the person's lines were already checked together by `npm test` against the same rules the
// app applies. The fake model replays Claude's side (fakeAnthropic.ts); the spec types the person's side. Every name, date
// and number in it is invented.

import { casualDate, dateInZone } from '../../../lib/dates/casual';
import type { AssistantTurn } from '../../../types/setup';
import { DEADLINE_90_CASE, GOAL_CARDS_CASE, READING_CASE_ID, RETURNING_CASES, SETUP_CASES, WEEK_CARDS_CASE, addTargetCase, type ScriptedCase } from '../../setup-evals/cases';
import type { FakeScript } from './fakeAnthropic';

export const E2E_CASE_ID = 'run-i-what-do-you-mean-protected';
// A deadline goal: its date is asked with no suggestion, the one card run-i never shows (MOM-111 round 2 screenshots).
export const DATE_QUESTION_CASE_ID = 'run-a-deadline-only';

function caseById(id: string): ScriptedCase {
  const found = SETUP_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`The setup eval set has no case "${id}".`);
  return found;
}

export const e2eCase = (): ScriptedCase => caseById(E2E_CASE_ID);
export const dateQuestionCase = (): ScriptedCase => caseById(DATE_QUESTION_CASE_ID);

// Adding to a setup that is finished (MOM-132 part 2). A new weekly goal: the returning eval case "return-g-reading", whose conversation asks
// nothing about the person's days or settings. A new weekly target for the goal the spec seeds ("Stay fit", tests/e2e/support/homeSeed.ts):
// the same builder as the eval set's, so the saved goal's title is the one the conversation is about.
export const ADD_GOAL_CASE_ID = 'return-g-reading';
export const addGoalCase = (): ScriptedCase => {
  const found = RETURNING_CASES.find((c) => c.id === ADD_GOAL_CASE_ID);
  if (!found) throw new Error(`The returning eval set has no case "${ADD_GOAL_CASE_ID}".`);
  return found;
};
// The title of the goal tests/e2e/support/homeSeed.ts seeds (HOME_TITLES.goal; setup-add.spec.ts checks they agree). Not imported from there:
// the global setup that starts the fake model must not load the browser fixtures.
export const SEEDED_GOAL_TITLE = 'Stay fit';
export const SWIMS = { title: 'Swims', reply: 'Swims.', word: 'swims', itemTitle: 'Log a swim' } as const;
export const addTargetFor = (goalTitle: string): ScriptedCase =>
  addTargetCase({
    id: 'e2e-add-target',
    goalTitle,
    counted: { reply: SWIMS.reply, title: SWIMS.title, word: SWIMS.word, itemTitle: SWIMS.itemTitle },
    floor: { reply: 'Two a week.', value: 2 },
  });

// The eval set writes its conversations for one fixed day (cases.ts TODAY). A start date card written by code (MOM-180) suggests the person's own
// today, so the scripted draft has to hold that day for the date the person accepted to match the one on the card. The day is worked out as
// the spec works it out: the person's day in America/Denver, or the day after it in the case CI failed in (the browser on UTC after 00:00 UTC,
// E2E_UTC_AHEAD_OF_PERSON=1), because a first setup has no time zone yet and uses the device's date.
const SCRIPT_TODAY = '2026-10-27';
const SCRIPT_TODAY_WORDS = 'Tuesday, Oct 27';
export function scriptedPersonDay(): string {
  const day = dateInZone('America/Denver') ?? SCRIPT_TODAY;
  return process.env.E2E_UTC_AHEAD_OF_PERSON === '1' ? new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : day;
}
function onThePersonsDay(turns: readonly AssistantTurn[]): AssistantTurn[] {
  const day = scriptedPersonDay();
  const words = casualDate(day, day, { relative: false });
  return JSON.parse(JSON.stringify(turns).split(SCRIPT_TODAY).join(day).split(SCRIPT_TODAY_WORDS).join(words)) as AssistantTurn[];
}

// The scripts the fake model serves, picked by the person's first answer; the first is the default.
export function fakeScripts(goalTitleForTarget: string = SEEDED_GOAL_TITLE): FakeScript[] {
  // The reading case (MOM-111 round 3b, finding 4): a goal that is not exercise, photographed as its own set.
  const first = [e2eCase(), dateQuestionCase(), caseById(READING_CASE_ID), WEEK_CARDS_CASE, GOAL_CARDS_CASE, DEADLINE_90_CASE].map((c) => ({ firstAnswer: c.person[0].say, turns: onThePersonsDay(c.script) }));
  const adding: FakeScript[] = [
    { mode: 'add_goal', firstAnswer: addGoalCase().person[0].say, turns: addGoalCase().script },
    { mode: 'add_target', firstAnswer: addTargetFor(goalTitleForTarget).person[0].say, turns: addTargetFor(goalTitleForTarget).script },
  ];
  return [...first, ...adding];
}
