// The two cards code writes in guided setup (MOM-178, lib/setup/cards.ts), as the browser specs answer them: the time zone card the moment
// what counts is approved, and the settings card the moment the planning is. Neither asks Claude, so the scripted person's line for each is
// what they tap, not what they type: a yes to the zone the phone reports (or another zone from the search), and the choices on the card.

import { expect, type Page } from '@playwright/test';
import { SETTINGS_ROWS, type SettingsAnswers } from '../../../lib/setup/cards';
import { MEANING_LINK, MEANING_TEXT, TYPE_INSTEAD } from '../../../lib/setup/session';
import { weekdayName } from '../../../lib/setup/playback';
import type { NumbersAnswer } from '../../../lib/setup/stepCards';
import type { WeekAnswer } from '../../../lib/setup/weekCards';
import { FAKE_MODEL_PORT } from './localStack';

export type CodeCard = 'zone' | 'settings' | 'week' | 'goal' | 'step';

const setupRequests = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${FAKE_MODEL_PORT}/__fake/last`)).json()) as { setupRequests: number }).setupRequests;

// The scripted person who is not sure what a question means (MOM-180). "What does this mean?" shows code's explanation in place and makes
// no call to Claude, so the count of the fake model's requests must not move; a simple topic has no "Still not clear? Ask Claude", so
// the person who still wants Claude's words types the question in the card's answer box, which always reaches Claude.
export async function askWhatItMeans(page: Page): Promise<void> {
  const before = await setupRequests();
  await page.getByRole('button', { name: MEANING_LINK }).click();
  await expect(page.locator('[data-slot="help-explain"]')).toBeVisible();
  expect(await setupRequests(), '"What does this mean?" makes no call to Claude').toBe(before);
  if ((await page.getByLabel('Your answer').count()) === 0) {
    const instead = page.getByRole('button', { name: TYPE_INSTEAD });
    await (((await instead.count()) > 0 ? instead : page.getByRole('button', { name: 'Type your answer' })).first()).click();
  }
  await page.getByLabel('Your answer').fill(MEANING_TEXT);
  await page.getByRole('button', { name: 'Send' }).click();
}

// What the scripted person gives each card (the eval case's person lines, lib/setup/evals.ts PersonLine).
export interface CardLine {
  say: string;
  zone?: string;
  settings?: SettingsAnswers;
  // A week card (MOM-179): what the person taps. Without it, `say` is typed in the card's answer box, as "Type your answer" does.
  week?: WeekAnswer;
  // A goal card (MOM-180): the words of the person's tap ("It keeps going.", "8 weeks."). Without it, `say` is typed in the card's answer box.
  goal?: string;
  // A step card (MOM-180 B2): the words of the tap ("A few goals.", "Something I do.", "I'll log it myself.", a picked day), or the number boxes. Without it, `say`
  // is typed in the card's answer box.
  step?: string | NumbersAnswer;
}

// The card on screen, if it is one of the two code writes.
export async function codeCardOn(page: Page): Promise<CodeCard | null> {
  if ((await page.locator('[data-card="time-zone"]').count()) > 0) return 'zone';
  if ((await page.locator('[data-card="settings"]').count()) > 0) return 'settings';
  if ((await page.locator('[data-card="week"]').count()) > 0) return 'week';
  if ((await page.locator('[data-card="goal"]').count()) > 0) return 'goal';
  if ((await page.locator('[data-card="step"]').count()) > 0) return 'step';
  return null;
}

// Answers the card the way the scripted person does. A yes counts only while the zone shown is the one the person is in; a phone on another
// zone (the browser's UTC clock in the CI case) is answered with "A different one" and the search, as a person would.
export async function answerCodeCard(page: Page, card: CodeCard, line: CardLine, personZone = 'America/Denver'): Promise<void> {
  if (card === 'zone') {
    const wanted = line.zone ?? personZone;
    // The card carries the zone its Yes accepts (the words say it plainly, never as an id).
    const offered = await page.locator('[data-card="time-zone"]').getAttribute('data-zone');
    if (line.zone === undefined && offered === wanted) {
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      return;
    }
    const other = page.getByRole('button', { name: 'A different one' });
    if ((await other.count()) > 0) await other.click();
    await page.getByRole('searchbox', { name: 'Search time zones' }).fill(wanted.split('/').pop()!.replace('_', ' '));
    await page.getByRole('list', { name: 'Matching time zones' }).getByRole('button').filter({ hasText: wanted }).first().click();
    return;
  }
  if (card === 'week') {
    await answerWeekCard(page, line);
    return;
  }
  if (card === 'goal') {
    await answerGoalButtons(page, line);
    return;
  }
  if (card === 'step') {
    await answerStepButtons(page, line);
    return;
  }
  await tapSettingsChoices(page, line);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

// A week card (MOM-179) answered the way the scripted person does: by taps when the line has them, else typed in the card's answer box (which
// goes to Claude, as it always has), or "What does this mean?" from that box.
export async function answerWeekCard(page: Page, line: CardLine): Promise<void> {
  const week = line.week;
  if (!week) {
    await page.getByRole('button', { name: 'Type your answer' }).click();
    if (line.say === MEANING_TEXT) {
      await askWhatItMeans(page);
      return;
    }
    await page.getByLabel('Your answer').fill(line.say);
    await page.getByRole('button', { name: 'Send' }).click();
    return;
  }
  const next = page.getByRole('button', { name: 'Next', exact: true });
  switch (week.topic) {
    case 'day_end':
      await page.getByLabel('Time your day ends', { exact: true }).fill(week.time);
      await page.getByRole('button', { name: 'Use this time', exact: true }).click();
      return;
    case 'week_start':
      await page.getByRole('button', { name: weekdayName(week.weekday), exact: true }).click();
      return;
    case 'capacity': {
      const rows = page.locator('fieldset[data-day-type]');
      for (const row of await rows.all()) {
        const name = ((await row.getAttribute('data-day-type')) ?? '').toLowerCase();
        const answer = week.rows[name];
        if (!answer) continue;
        await row.getByRole('textbox').fill(answer.amount);
        if (answer.unit) await row.getByRole('button', { name: answer.unit === 'minutes' ? 'Minutes' : 'Hours', exact: true }).click();
      }
      await next.click();
      return;
    }
    case 'slots_or_quota':
      if (week.answer.kind === 'any') {
        await page.getByRole('button', { name: "Any day, as long as the week's number is met" }).click();
        return;
      }
      await page.getByRole('button', { name: 'On set days', exact: true }).click();
      for (const day of week.answer.weekdays) await page.getByRole('button', { name: weekdayName(day), exact: true }).click();
      await next.click();
      return;
    case 'planning_moment':
      if (week.weekday !== undefined) await page.getByRole('button', { name: weekdayName(week.weekday), exact: true }).click();
      if (week.time !== undefined) await page.getByLabel('Time to plan').fill(week.time);
      await next.click();
      return;
  }
}

// A goal card of buttons (MOM-180) answered the way the scripted person does: by the tap when the line has one, else typed in the card's answer box.
export async function answerGoalButtons(page: Page, line: CardLine): Promise<void> {
  if (line.goal !== undefined && line.say !== MEANING_TEXT) {
    const labels: Record<string, string> = {
      'Never tried it.': 'Never tried it',
      'Dabbled a little.': 'Dabbled a little',
      'Done it before.': 'Done it before',
      'It keeps going.': 'It keeps going',
      'It ends on a date.': 'It ends on a date',
      'It has a deadline.': 'It has a deadline',
    };
    const label = labels[line.goal] ?? line.goal.replace(/.$/, '');
    await page.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await answerWeekCard(page, { ...line, week: undefined });
}

// Taps the choices the scripted person makes on the settings card (and not Next), so a spec can look at the card with them chosen.
export async function tapSettingsChoices(page: Page, line: CardLine): Promise<void> {
  for (const row of SETTINGS_ROWS) {
    const value = line.settings?.[row.topic];
    const label = row.choices.find((c) => c.value === value)?.label;
    if (label) await page.getByRole('button', { name: label, exact: true }).click();
  }
}

// What a tap says, as the button reads: "A few goals." is the button "A few goals", and the level card's two buttons are named for the choice, not the number.
export function stepButtonLabel(say: string): string {
  if (/is the least that counts\.$/.test(say)) return 'The least that counts';
  if (/is what I'm aiming for\.$/.test(say)) return "What I'm aiming for";
  return say.replace(/\.$/, '');
}

// A step card (MOM-180 B2) answered the way the scripted person does: by the tap or the number boxes when the line has them, else typed in the card's answer box.
export async function answerStepButtons(page: Page, line: CardLine): Promise<void> {
  const step = line.step;
  if (step === undefined || line.say === MEANING_TEXT) {
    await answerWeekCard(page, { ...line, week: undefined });
    return;
  }
  if (typeof step === 'object') {
    if (step.floor !== undefined) await page.locator('[data-field="floor"]').fill(step.floor);
    if (step.aspiration !== undefined) await page.locator('[data-field="aspiration"]').fill(step.aspiration);
    if (step.unit) await page.getByRole('button', { name: step.unit === 'minutes' ? 'Minutes' : 'Hours', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: stepButtonLabel(step), exact: true }).click();
}
