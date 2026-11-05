// MOM-180 part B2: the cards code writes for guided setup's steps 3, 7 and 9, and the time zone hand-off that makes no Claude call. What these hold the code
// to (docs/DOMAIN_MODEL.md §2.2 steps 3, 7 and 9, §4.2 principles 1 and 13): nothing pre-selected, each tap recorded as the person's own answer, a card not
// shown when the draft already holds the value, a refused value changes nothing, and Claude is not asked for any of it.

import { describe, expect, it } from 'vitest';
import { codeTurn } from '@/lib/setup/cards';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { explanationFor } from '@/lib/setup/explain';
import { personWords } from '@/lib/setup/said';
import { awaitsClaude, pickedDateText } from '@/lib/setup/session';
import {
  STEP_CARD_MARK,
  STEP_WORDS,
  aimHeldFrom,
  answerNumbers,
  answerStepCard,
  breakupCard,
  isNamesCard,
  isStepCard,
  levelCard,
  levelFrom,
  numbersCard,
  numbersProblem,
  returnCard,
  roleCard,
  sequencingCard,
  sourceCard,
  sourceNeed,
  stepCardDetail,
  stepCardInPlaceOf,
  stepChoices,
  withNextSourceOrWeekTurn,
  type StepAnswer,
} from '@/lib/setup/stepCards';
import { FIXED_WORDS, isFixedQuestion } from '@/lib/setup/fixedQuestions';
import { validateDraft } from '@/lib/setup/validate';
import { WEEK_CARD_MARK } from '@/lib/setup/weekCards';
import type { AssistantTurn, SetupDraft, SetupSession, Transcript } from '@/types/setup';
import { LEVEL_HOURS_CASE, METRIC_CASE, NUMBERS_HOURS_CASE, STEP_CARDS_CASE } from './setup-evals/cases';
import { goal, item, scriptedModel, target } from './helpers/setupScript';

const TODAY = '2026-11-05'; // a Thursday

const draftWith = (...goals: ReturnType<typeof goal>[]): SetupDraft => {
  const d = emptyDraft();
  d.model.goals.push(...goals);
  return d;
};
const text = (t: string): StepAnswer => ({ kind: 'text', text: t });
const onCard = (card: AssistantTurn): SetupSession => ({ transcript: [{ role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 });
const lastTurn = (s: SetupSession): AssistantTurn => {
  const last = s.transcript[s.transcript.length - 1];
  if (last.role !== 'assistant') throw new Error('the conversation ends with the person');
  return last.turn;
};
const lastText = (s: SetupSession): string => {
  const last = s.transcript[s.transcript.length - 1];
  return last.role === 'person' ? last.text : '';
};

// Claude's own question on a topic, after the person said something (the server's hand-off reads this).
function claudeAsks(draft: SetupDraft, topic: AssistantTurn['topic'], question: string, over: Partial<AssistantTurn> = {}): { turn: AssistantTurn; transcript: Transcript } {
  const opener = codeTurn(draft, { kind: 'question', chunk: null, topic: 'idea', question: 'What would you like to work on?', detail: null });
  const turn = { ...codeTurn(draft, { kind: 'question', chunk: null, topic, question, detail: null }), ...over };
  return { turn, transcript: [{ role: 'assistant', turn: opener }, { role: 'person', text: 'Something the person said.' }] };
}
const swapped = (draft: SetupDraft, topic: AssistantTurn['topic'], question: string, over: Partial<AssistantTurn> = {}, today: string | null = TODAY): AssistantTurn | null => {
  const { turn, transcript } = claudeAsks(draft, topic, question, over);
  return stepCardInPlaceOf(turn, transcript, today);
};

const twoGoals = () => draftWith(goal('g1', 'Lift weights'), goal('g2', 'Cook at home'));
const withTarget = (over: Partial<ReturnType<typeof target>> = {}, title = 'Runs'): SetupDraft => {
  const g = goal('g1', 'Run more', { state: 'active' });
  g.targets.push(target('t1', title, over));
  return draftWith(g);
};
const progressIssues = (s: SetupSession) => validateDraft(s.draft, s.transcript, 'progress').issues.map((i) => `${i.path}: ${i.message}`);

describe('the extended conversation, with steps 3, 7 and 9 as cards', () => {
  it('runs clean through the eval runner, and code writes the cards that follow a tap', async () => {
    const model = scriptedModel(STEP_CARDS_CASE.script);
    const report = await runSetupEval(STEP_CARDS_CASE, model);
    expect(report.malformed).toBeNull();
    expect(report.finished).toBe(true);
    expect(report.turns.flatMap((t) => t.violations.map((v) => `${t.index}:${v.rule}`))).toEqual([]);
    expect(report.finalIssues).toEqual([]);
    const byCode = (topic: string) => report.turns.some((t) => t.byCode && t.turn.topic === topic);
    for (const topic of ['breakup', 'sequencing', 'parked_return', 'role', 'floor', 'source', 'day_end']) expect(byCode(topic), `${topic} is written by code`).toBe(true);
    // The goals' names are asked by code after "A few goals", and the parked goal's way back is the person's own.
    expect(report.turns.find((t) => t.turn.question === STEP_WORDS.namesQuestion)?.byCode).toBe(true);
    const parked = report.draft.model.goals.find((g) => g.state === 'parked');
    expect(parked?.returnWhen).toEqual({ kind: 'on_request' });
    expect(report.draft.model.goals[0].targets[0]).toMatchObject({ role: 'effort', floor: 2, sources: [{ kind: 'manual' }] });
  });
});

describe('step 3: one goal or a few, together or one first, and when a goal set aside comes back', () => {
  it('the first card asks one goal or a few, with nothing pre-selected, and its line is the owner\'s', () => {
    const card = breakupCard(draftWith(goal('g1', 'Get healthy')));
    expect(isStepCard(card)).toBe(true);
    expect(card.question).toBe('Is this one goal, or a few separate ones?');
    expect(stepCardDetail(card)).toBe('Each goal gets its own plan.');
    expect(stepChoices(card)?.map((c) => c.label)).toEqual(['Just one goal', 'A few goals']);
  });

  it('"Just one goal" is the person\'s message and changes nothing; step 3 is done, so code plays the goals back with no call (B3)', () => {
    const d = draftWith(goal('g1', 'Get healthy'));
    const next = answerStepCard(onCard(breakupCard(d)), text('Just one goal.'), TODAY) as SetupSession;
    expect(next).not.toBeNull();
    expect(next.transcript[1]).toEqual({ role: 'person', text: 'Just one goal.' });
    expect(awaitsClaude(next)).toBe(false);
    expect(lastTurn(next)).toMatchObject({ kind: 'playback', chunk: 'goals', say: '', question: null });
    expect(next.draft).toEqual(d);
  });

  it('"A few goals" makes code ask for the names, with no call; the typed names are Claude\'s to read', () => {
    const next = answerStepCard(onCard(breakupCard(draftWith(goal('g1', 'Get healthy')))), text('A few goals.'), TODAY) as SetupSession;
    expect(awaitsClaude(next)).toBe(false);
    const names = lastTurn(next);
    expect(isNamesCard(names)).toBe(true);
    expect(names.question).toBe('What are the goals?');
    expect(stepCardDetail(names)).toBe('Name each one, in your own words.');
    expect(stepChoices(names)).toBeNull();
    expect(answerStepCard(next, text('Lifting weights and cooking at home.'), TODAY)).toBeNull();
  });

  it('Claude\'s own breakup question goes out as the card only for one goal, and not when it asks again', () => {
    expect(swapped(draftWith(goal('g1', 'Get healthy')), 'breakup', 'Is this one goal, or a few separate ones?')?.topic).toBe('breakup');
    expect(swapped(twoGoals(), 'breakup', 'Is this one goal, or a few separate ones?')).toBeNull();
    // A clarification of a typed answer (the turn before was the same topic) stays Claude's.
    const d = draftWith(goal('g1', 'Get healthy'));
    const { turn } = claudeAsks(d, 'breakup', 'Which of these do you mean?');
    const earlier = codeTurn(d, { kind: 'question', chunk: null, topic: 'breakup', question: 'Is this one goal, or a few?', detail: null });
    const transcript: Transcript = [{ role: 'assistant', turn: earlier }, { role: 'person', text: 'Hmm.' }];
    expect(stepCardInPlaceOf(turn, transcript, TODAY)).toBeNull();
  });

  it('together or one first: the choices name the goals from the draft, nothing is pre-selected', () => {
    const card = sequencingCard(twoGoals());
    expect(card.question).toBe('Would you like to start them together, or one first?');
    expect(stepChoices(card)?.map((c) => c.label)).toEqual(['All together', '"Lift weights" first', '"Cook at home" first']);
    expect(swapped(draftWith(goal('g1', 'Only one')), 'sequencing', 'Together, or one first?')).toBeNull();
  });

  it('"All together" changes no goal; "<goal> first" sets the others aside, records each as said, and the way back follows with no call', () => {
    const together = answerStepCard(onCard(sequencingCard(twoGoals())), text('All together.'), TODAY) as SetupSession;
    expect(together.draft.model.goals.map((g) => g.state)).toEqual(['active', 'active']);
    // Nothing is set aside, so step 3 is done: code plays the goals back (B3).
    expect(awaitsClaude(together)).toBe(false);
    expect(lastTurn(together)).toMatchObject({ kind: 'playback', chunk: 'goals' });

    const first = answerStepCard(onCard(sequencingCard(twoGoals())), text('"Lift weights" first.'), TODAY) as SetupSession;
    expect(first.draft.model.goals.map((g) => g.state)).toEqual(['active', 'parked']);
    expect(first.draft.said).toContainEqual({ path: 'goals.g2.state', turn: 1, how: 'said' });
    expect(awaitsClaude(first)).toBe(false);
    const back = lastTurn(first);
    expect(back.topic).toBe('parked_return');
    expect(back.question).toBe('When should "Cook at home" come back?');
    expect(stepCardDetail(back)).toBeNull();
    expect(progressIssues(first)).toEqual([]);
  });

  it('a goal set aside comes back on a day or only when asked; a day not after today changes nothing', () => {
    const parked = draftWith(goal('g1', 'Lift weights'), goal('g2', 'Cook at home', { state: 'parked' }));
    const card = returnCard(parked) as AssistantTurn;
    expect(stepChoices(card)).toBeNull();

    const asked = answerStepCard(onCard(card), text('Only when I ask.'), TODAY) as SetupSession;
    expect(asked.draft.model.goals[1].returnWhen).toEqual({ kind: 'on_request' });
    expect(asked.draft.said).toContainEqual({ path: 'goals.g2.returnWhen', turn: 1, how: 'said' });
    // The last goal set aside has its way back: code plays the goals back (B3).
    expect(awaitsClaude(asked)).toBe(false);
    expect(lastTurn(asked)).toMatchObject({ kind: 'playback', chunk: 'goals' });

    const onDay = answerStepCard(onCard(card), text(pickedDateText('2027-03-01')), TODAY) as SetupSession;
    expect(onDay.draft.model.goals[1].returnWhen).toEqual({ kind: 'date', date: '2027-03-01' });
    expect(onDay.draft.said).toContainEqual({ path: 'goals.g2.returnDate', turn: 1, how: 'said' });
    expect(progressIssues(onDay)).toEqual([]);

    // Today and an earlier day are refused, as is a season (which is typed, for Claude).
    expect(answerStepCard(onCard(card), text(pickedDateText(TODAY)), TODAY)).toBeNull();
    expect(answerStepCard(onCard(card), text(pickedDateText('2026-10-01')), TODAY)).toBeNull();
    expect(answerStepCard(onCard(card), text('In the spring.'), TODAY)).toBeNull();
  });

  it('each goal set aside is asked in turn, and no card is written for a goal that already has its way back', () => {
    const d = draftWith(goal('g1', 'A'), goal('g2', 'B', { state: 'parked' }), goal('g3', 'C', { state: 'parked' }));
    const first = answerStepCard(onCard(returnCard(d) as AssistantTurn), text('Only when I ask.'), TODAY) as SetupSession;
    expect(lastTurn(first).question).toBe('When should "C" come back?');
    const second = answerStepCard(first, text('Only when I ask.'), TODAY) as SetupSession;
    expect(lastTurn(second)).toMatchObject({ kind: 'playback', chunk: 'goals' });
    expect(returnCard(second.draft)).toBeNull();
    expect(swapped(second.draft, 'parked_return', 'When should it come back?')).toBeNull();
  });
});

describe('step 7: something I do or a result, which level a number is, and the number boxes', () => {
  it('the role card names the counted thing in quotes, with the owner\'s line and two buttons, nothing pre-selected', () => {
    const card = roleCard(withTarget(), personWords([])) as AssistantTurn;
    // The counted thing is in the person's own words, as the other number cards say it ("runs").
    expect(card.question).toBe('Is "runs" something you do, or a result?');
    expect(stepCardDetail(card)).toBe('Something you do gets a number to hit each week. A result is tracked so you can watch it move.');
    expect(stepChoices(card)?.map((c) => c.label)).toEqual(['Something I do', 'A result']);
  });

  it('comes only in place of Claude\'s own role question, and not when the person already gave it', () => {
    const d = withTarget();
    expect(swapped(d, 'role', 'Is that something you do, or a result?')?.topic).toBe('role');
    expect(swapped(draftWith(goal('g1', 'No target yet')), 'role', 'Is that something you do?')).toBeNull();
    const said = structuredClone(d);
    said.said.push({ path: 'goals.g1.targets.t1.role', turn: 1, how: 'said' });
    expect(swapped(said, 'role', 'Is that something you do, or a result?')).toBeNull();
  });

  it('"Something I do" records the role as the person\'s own and the number boxes follow with no call; "A result" leaves the next step to Claude', () => {
    const d = withTarget();
    const card = roleCard(d, []) as AssistantTurn;
    const effort = answerStepCard(onCard(card), text('Something I do.'), TODAY) as SetupSession;
    expect(effort.draft.model.goals[0].targets[0].role).toBe('effort');
    expect(effort.draft.said).toContainEqual({ path: 'goals.g1.targets.t1.role', turn: 1, how: 'said' });
    expect(awaitsClaude(effort)).toBe(false);
    expect(lastTurn(effort).topic).toBe('floor');

    const result = answerStepCard(onCard(card), text('A result.'), TODAY) as SetupSession;
    expect(result.draft.model.goals[0].targets[0].role).toBe('outcome');
    expect(awaitsClaude(result)).toBe(true);

    // A number the draft already holds needs no box.
    const held = withTarget({ floor: 3 });
    const done = answerStepCard(onCard(roleCard(held, []) as AssistantTurn), text('Something I do.'), TODAY) as SetupSession;
    expect(awaitsClaude(done)).toBe(true);
  });

  it('the least that counts or what I am aiming for: the card quotes the one number Claude quoted, and the tap is the person\'s own message that says it', () => {
    const d = withTarget();
    const card = swapped(d, 'number_level', "Is that the least that counts, or what you're aiming for?", { say: 'You said 3 runs a week.' }) as AssistantTurn;
    expect(card.question).toBe("Is 3 the least that counts, or what you're aiming for?");
    expect(stepCardDetail(card)).toBeNull();
    expect(stepChoices(card)?.map((c) => c.label)).toEqual(['The least that counts', "What I'm aiming for"]);
    const least = answerStepCard(onCard(card), text('3 is the least that counts.'), TODAY) as SetupSession;
    expect(least.draft.model.goals[0].targets[0]).toMatchObject({ floor: 3, aspiration: null });
    expect(least.draft.said).toContainEqual({ path: 'goals.g1.targets.t1.floor', turn: 1, how: 'said' });
    expect(awaitsClaude(least)).toBe(true);
    expect(progressIssues(least)).toEqual([]);
  });

  it("aiming for holds the number in the person's message and asks the least that counts next, then writes both", () => {
    const card = swapped(withTarget(), 'number_level', 'Which is it?', { say: 'You said 3 runs a week.' }) as AssistantTurn;
    const aiming = answerStepCard(onCard(card), text("3 is what I'm aiming for."), TODAY) as SetupSession;
    // Nothing is written yet: the draft refuses a number hoped for with nothing beneath it.
    expect(aiming.draft.model.goals[0].targets[0]).toMatchObject({ floor: null, aspiration: null });
    expect(aiming.draft.said).toEqual([]);
    expect(progressIssues(aiming)).toEqual([]);
    expect(awaitsClaude(aiming)).toBe(false);
    expect(aimHeldFrom(aiming.transcript)).toEqual({ value: 3, at: 1 });
    const boxes = lastTurn(aiming);
    expect(boxes.topic).toBe('floor');
    expect(boxes.question).toBe('In a hard week, how many runs would still count?');
    // Only the least that counts is asked, and one above the number held is refused, changing nothing.
    expect(numbersProblem(aiming.draft, { floor: '5' }, [], 3)).toBe("Your aim can't be lower than the least that counts.");
    expect(answerStepCard(aiming, { kind: 'numbers', answer: { floor: '5' } }, TODAY)).toBeNull();
    const ok = answerStepCard(aiming, { kind: 'numbers', answer: { floor: '2' } }, TODAY) as SetupSession;
    expect(ok.draft.model.goals[0].targets[0]).toMatchObject({ floor: 2, aspiration: 3 });
    // The aim was said in the tap's message, the least that counts in the answer to the boxes.
    expect(ok.draft.said).toEqual(
      expect.arrayContaining([
        { path: 'goals.g1.targets.t1.aspiration', turn: 1, how: 'said' },
        { path: 'goals.g1.targets.t1.floor', turn: 3, how: 'said' },
      ]),
    );
    expect(progressIssues(ok)).toEqual([]);
  });

  it('a level card is not written when Claude quotes no number, two numbers, or a time with no unit; Claude\'s own question stands', () => {
    expect(swapped(withTarget(), 'number_level', 'Which level is it?')).toBeNull();
    expect(swapped(withTarget(), 'number_level', 'Is 3 or 4 the least?', { say: 'You said 3 or 4.' })).toBeNull();
    const time = withTarget({ measure: 'time' }, 'Reading');
    expect(swapped(time, 'number_level', 'Is that the least?', { say: 'You said 30.' })).toBeNull();
    const named = swapped(time, 'number_level', 'Is that the least?', { say: 'You said 30 minutes a week.' }) as AssistantTurn;
    expect(named.question).toBe("Is 30 minutes the least that counts, or what you're aiming for?");
    const hours = withTarget({ measure: 'time' }, 'Hours of reading');
    const inHours = swapped(hours, 'number_level', 'Is that the least?', { say: 'You said 2.' }) as AssistantTurn;
    expect(inHours.question).toBe("Is 2 hours the least that counts, or what you're aiming for?");
    const tapped = answerStepCard(onCard(inHours), text('2 hours is the least that counts.'), TODAY) as SetupSession;
    expect(tapped.draft.model.goals[0].targets[0].floor).toBe(120);
    expect(progressIssues(tapped)).toEqual([]);
    expect(levelFrom('3', withTarget().model.goals[0].targets[0], [])).toEqual({ token: '3', value: 3 });
  });

  it('the number boxes show only what the draft lacks, with the owner\'s question words and no pre-selected unit', () => {
    const both = numbersCard(withTarget(), TODAY, []) as AssistantTurn;
    expect(both.topic).toBe('floor');
    expect(both.question).toBe('In a hard week, how many runs would still count?');
    expect(explanationFor('floor', both.draft)?.text).toContain('runs');
    const aimOnly = numbersCard(withTarget({ floor: 2 }), TODAY, []) as AssistantTurn;
    expect(aimOnly.topic).toBe('aspiration');
    expect(aimOnly.question).toBe('How many runs a week are you hoping for?');
    expect(numbersCard(withTarget({ floor: 2, aspiration: 3 }), TODAY, [])).toBeNull();
    // A time whose words name no unit is asked in time, since the card asks minutes or hours.
    const time = numbersCard(withTarget({ measure: 'time' }, 'Reading'), TODAY, []) as AssistantTurn;
    expect(time.question).toBe('In a hard week, how much time on reading would still count?');
  });

  it('answers the boxes in the person\'s own words, the least that counts and the number hoped for, each as said', () => {
    const card = numbersCard(withTarget(), TODAY, []) as AssistantTurn;
    const next = answerNumbers(onCard(card), { floor: '2', aspiration: '4' }) as SetupSession;
    expect(lastText(next)).toBe("The least that counts is 2. I'm hoping for 4.");
    expect(next.draft.model.goals[0].targets[0]).toMatchObject({ floor: 2, aspiration: 4 });
    expect(next.draft.said).toEqual(expect.arrayContaining([{ path: 'goals.g1.targets.t1.floor', turn: 1, how: 'said' }, { path: 'goals.g1.targets.t1.aspiration', turn: 1, how: 'said' }]));
    expect(awaitsClaude(next)).toBe(true);
    expect(progressIssues(next)).toEqual([]);
    // The number hoped for may be left empty.
    const floorOnly = answerNumbers(onCard(card), { floor: '2', aspiration: '' }) as SetupSession;
    expect(floorOnly.draft.model.goals[0].targets[0]).toMatchObject({ floor: 2, aspiration: null });
  });

  it('a refused answer changes nothing: a missing number, a number that is not one, an aim below the least that counts', () => {
    const d = withTarget();
    const card = numbersCard(d, TODAY, []) as AssistantTurn;
    expect(numbersProblem(d, { floor: '' })).toBe('Add a number for the least that counts.');
    expect(numbersProblem(d, { floor: 'two' })).toBe('Add a number for the least that counts.');
    expect(numbersProblem(d, { floor: '0' })).toBe('Add a number for the least that counts.');
    expect(numbersProblem(d, { floor: '2', aspiration: 'lots' })).toBe("Add the number you're hoping for, or leave it empty.");
    expect(numbersProblem(d, { floor: '4', aspiration: '3' })).toBe("Your aim can't be lower than the least that counts.");
    expect(numbersProblem(d, { floor: '2', aspiration: '3' })).toBeNull();
    expect(answerNumbers(onCard(card), { floor: '4', aspiration: '3' })).toBeNull();
    expect(answerNumbers(onCard(card), { floor: '' })).toBeNull();
    // Only the number hoped for is asked, with the least that counts held: below it is refused.
    const held = withTarget({ floor: 4 });
    expect(numbersProblem(held, { aspiration: '3' })).toBe("Your aim can't be lower than the least that counts.");
  });

  it('a time target is stored in minutes: its own words name the unit, or the card asks minutes or hours (neither pre-selected)', () => {
    // Words that name hours: asked in hours, stored in minutes, and the person's message says hours so the draft check reads it.
    const hours = withTarget({ measure: 'time' }, 'Hours of reading');
    const inHours = answerNumbers(onCard(numbersCard(hours, TODAY, []) as AssistantTurn), { floor: '2', aspiration: '3' }) as SetupSession;
    expect(lastText(inHours)).toBe("The least that counts is 2 hours. I'm hoping for 3 hours.");
    expect(inHours.draft.model.goals[0].targets[0]).toMatchObject({ floor: 120, aspiration: 180 });
    expect(progressIssues(inHours)).toEqual([]);
    // Words that name no unit: the unit is the person's tap, and a number without one is named in a callout.
    const open = withTarget({ measure: 'time' }, 'Reading');
    expect(numbersProblem(open, { floor: '2' })).toBe('Choose minutes or hours for reading.');
    const picked = answerNumbers(onCard(numbersCard(open, TODAY, []) as AssistantTurn), { floor: '45', unit: 'minutes' }) as SetupSession;
    expect(picked.draft.model.goals[0].targets[0].floor).toBe(45);
    const half = answerNumbers(onCard(numbersCard(open, TODAY, []) as AssistantTurn), { floor: '1.5', unit: 'hours' }) as SetupSession;
    expect(half.draft.model.goals[0].targets[0].floor).toBe(90);
    expect(progressIssues(half)).toEqual([]);
    // 0.13 hours is 7.8 minutes, which 0.13 x 60 does not make exactly (7.800000000000001): the message says minutes, so the check reads the same number.
    const odd = answerNumbers(onCard(numbersCard(open, TODAY, []) as AssistantTurn), { floor: '0.13', unit: 'hours' }) as SetupSession;
    expect(odd.draft.model.goals[0].targets[0].floor).toBe(7.8);
    expect(lastText(odd)).toBe('The least that counts is 7.8 minutes.');
    expect(progressIssues(odd)).toEqual([]);
  });

  it('a typed answer that holds the target, the floor and the first stretch shows none of the level, number or first-stretch cards', () => {
    const held = withTarget({ floor: 2, aspiration: 3 });
    held.model.goals[0].shape = 'ongoing';
    held.model.goals[0].blockWeeks = 8;
    expect(swapped(held, 'floor', 'In a hard week, how many runs would still count?')).toBeNull();
    expect(swapped(held, 'aspiration', 'How many runs a week are you hoping for?')).toBeNull();
    expect(swapped(held, 'number_level', 'Which level?', { say: 'You said 2.' })?.topic).toBe('number_level');
    expect(numbersCard(held, TODAY, [])).toBeNull();
  });

  it('Claude\'s floor question goes out as the number boxes, but not when the person asked what it means', () => {
    const d = withTarget();
    expect(swapped(d, 'floor', 'In a hard week, how many runs would still count?')?.topic).toBe('floor');
    const { turn } = claudeAsks(d, 'floor', 'In a hard week, how many runs would still count?');
    const asked: Transcript = [{ role: 'assistant', turn: codeTurn(d, { kind: 'question', chunk: null, topic: 'target', question: 'What would you count?', detail: null }) }, { role: 'person', text: 'What do you mean?' }];
    expect(stepCardInPlaceOf(turn, asked, TODAY)).toBeNull();
  });
});

describe('step 9: where each thing counted is tracked', () => {
  it('asks the first target with no source, in the person\'s words, with the owner\'s line and an app button for each app Momentum reads', () => {
    const d = withTarget();
    const card = sourceCard(d, []) as AssistantTurn;
    expect(card.question).toBe('Where do you track runs now, if anywhere?');
    expect(stepCardDetail(card)).toBe('An app can count it for you, or you can log it yourself with a tap.');
    expect(stepChoices(card)?.map((c) => c.label)).toEqual(["I'll log it myself", 'Hevy', 'Google Calendar']);
    expect(swapped(d, 'source', 'Where do you track this now, if anywhere?')?.topic).toBe('source');
  });

  it('is not asked for a target that already has a source', () => {
    const d = withTarget({ sources: [{ kind: 'manual' }] });
    expect(sourceNeed(d)).toBeNull();
    expect(sourceCard(d, [])).toBeNull();
    expect(swapped(d, 'source', 'Where do you track this now?')).toBeNull();
  });

  it('logging it myself is the person\'s message and the source, and the day end card follows with no call', () => {
    const d = withTarget();
    const next = answerStepCard(onCard(sourceCard(d, []) as AssistantTurn), text("I'll log it myself."), TODAY) as SetupSession;
    expect(next.draft.model.goals[0].targets[0].sources).toEqual([{ kind: 'manual' }]);
    expect(next.draft.said).toContainEqual({ path: 'goals.g1.targets.t1.sources', turn: 1, how: 'said' });
    expect(awaitsClaude(next)).toBe(false);
    const after = lastTurn(next);
    expect(after.topic).toBe('day_end');
    expect(after.detail).toBe(WEEK_CARD_MARK);
    expect(progressIssues(next)).toEqual([]);
  });

  it('an app that counts more than one number asks which counts next (a quantity only), then goes on', () => {
    const d = withTarget({ measure: 'quantity', unit: 'pounds' }, 'Weight lifted');
    const hevy = answerStepCard(onCard(sourceCard(d, []) as AssistantTurn), text('Hevy.'), TODAY) as SetupSession;
    expect(hevy.draft.model.goals[0].targets[0].sources).toEqual([{ kind: 'synced', provider: 'hevy', metric: null }]);
    expect(awaitsClaude(hevy)).toBe(false);
    const ask = lastTurn(hevy);
    expect(ask.topic).toBe('metric');
    expect(ask.question).toBe('Which number counts for weight lifted in Hevy?');
    expect(stepChoices(ask)?.map((c) => c.label)).toEqual(['pounds lifted', 'kilograms lifted', 'sets', 'minutes']);
    const metric = answerStepCard(hevy, text('pounds lifted.'), TODAY) as SetupSession;
    expect(metric.draft.model.goals[0].targets[0].sources).toEqual([{ kind: 'synced', provider: 'hevy', metric: 'volume_lbs' }]);
    expect(lastTurn(metric).topic).toBe('day_end');
    expect(progressIssues(metric)).toEqual([]);
    // A count in Hevy has no number to choose between: the day end card follows the app at once.
    const count = withTarget({ measure: 'count' });
    const counted = answerStepCard(onCard(sourceCard(count, []) as AssistantTurn), text('Hevy.'), TODAY) as SetupSession;
    expect(lastTurn(counted).topic).toBe('day_end');
  });

  it('each target is asked in turn, and the answer to a different kind of thing is not taken', () => {
    const g = goal('g1', 'Lift', { state: 'active' });
    g.targets.push(target('t1', 'Sessions'), target('t2', 'Runs'));
    const d = draftWith(g);
    const first = answerStepCard(onCard(sourceCard(d, []) as AssistantTurn), text("I'll log it myself."), TODAY) as SetupSession;
    expect(lastTurn(first).question).toBe('Where do you track runs now, if anywhere?');
    expect(answerStepCard(first, text('Strava.'), TODAY)).toBeNull();
    expect(answerStepCard(first, text('A result.'), TODAY)).toBeNull();
  });
});

describe('the time zone tap makes no Claude call when the next step is a card', () => {
  const afterZone = (d: SetupDraft): SetupSession => ({
    transcript: [
      { role: 'assistant', turn: codeTurn(d, { kind: 'proposal', chunk: null, topic: 'time_zone', question: 'Your phone is set to Mountain Time (Denver). Is that your time zone?', detail: 'Time zone card, written by code.', options: ['America/Denver'] }) },
      { role: 'person', text: 'Yes' },
    ],
    draft: d,
    spentTokens: 0,
  });

  it('a target with no source: the source card follows', () => {
    const next = withNextSourceOrWeekTurn(afterZone(withTarget()));
    expect(awaitsClaude(next)).toBe(false);
    expect(lastTurn(next).topic).toBe('source');
  });

  it('every target has its source: the day end card follows', () => {
    const next = withNextSourceOrWeekTurn(afterZone(withTarget({ sources: [{ kind: 'manual' }] })));
    expect(awaitsClaude(next)).toBe(false);
    expect(lastTurn(next).topic).toBe('day_end');
  });

  it('with the day end and week start already held, code asks the kinds of days in fixed words, and only the answer is Claude\'s (B3)', () => {
    const held = withTarget({ sources: [{ kind: 'manual' }] });
    held.model.person.dayEnd = '21:00';
    held.model.person.weekStart = 1;
    const next = withNextSourceOrWeekTurn(afterZone(held));
    expect(awaitsClaude(next)).toBe(false);
    const asked = lastTurn(next);
    expect(isFixedQuestion(asked)).toBe(true);
    expect(asked).toMatchObject({ topic: 'day_types', question: FIXED_WORDS.dayTypesQuestion });
  });
});

describe('every card is a code-written turn the server can hold to the draft check, and carries its mark', () => {
  it('each card the module writes is a step card with a topic of its own', () => {
    const t = withTarget();
    const cards = [breakupCard(t), sequencingCard(twoGoals()), roleCard(t, []), numbersCard(t, TODAY, []), sourceCard(t, []), levelCard(t, '3')];
    for (const card of cards) {
      expect(card).not.toBeNull();
      expect(isStepCard(card as AssistantTurn)).toBe(true);
      expect((card as AssistantTurn).detail?.startsWith(STEP_CARD_MARK)).toBe(true);
      expect((card as AssistantTurn).options).toEqual([]);
    }
  });

  it('the draft behind a card is Claude\'s draft untouched, and an item the draft holds is not asked again', () => {
    const d = withTarget();
    d.model.goals[0].items.push(item('i1', 'habit', 'Go for a run', { targetKey: 't1' }));
    const card = roleCard(d, []) as AssistantTurn;
    expect(card.draft).toEqual(d);
  });
});

describe('the short conversations the browser spec photographs', () => {
  it.each([LEVEL_HOURS_CASE, NUMBERS_HOURS_CASE, METRIC_CASE])('$id: every turn passes the rules up to where it stops, and code writes the cards after a tap', async (c) => {
    const report = await runSetupEval(c, scriptedModel(c.script));
    expect(report.malformed).toBeNull();
    expect(report.turns.flatMap((t) => t.violations.map((v) => `${t.index}:${v.rule}:${v.code}`))).toEqual([]);
    expect(report.ranOutOfPerson).toBe(true);
  });

  it('the level card for hours quotes the hours, and aiming for asks the least that counts in hours with the aim already held', async () => {
    const report = await runSetupEval(LEVEL_HOURS_CASE, scriptedModel(LEVEL_HOURS_CASE.script));
    const level = report.turns.find((t) => t.turn.topic === 'number_level');
    expect(level?.turn.question).toBe("Is 2 hours the least that counts, or what you're aiming for?");
    expect(report.draft.model.goals[0].targets[0]).toMatchObject({ aspiration: 120, floor: 60 });
  });

  it('the app that counts more than one number: source, then which number, then the day end card, all by code', async () => {
    const report = await runSetupEval(METRIC_CASE, scriptedModel(METRIC_CASE.script));
    // The idea and the why are code's too since B3.
    expect(report.turns.filter((t) => t.byCode).map((t) => t.turn.topic)).toEqual(['idea', 'why', 'source', 'metric', 'day_end']);
    expect(report.draft.model.goals[0].targets[0].sources).toEqual([{ kind: 'synced', provider: 'hevy', metric: 'volume_lbs' }]);
  });
});
