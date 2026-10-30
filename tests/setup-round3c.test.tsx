// @vitest-environment jsdom
//
// MOM-111 round 3c, from the screenshot review of round 3b by the owner and a second reviewer:
// 1. One bold line per card, and it is the most important one (components/setup/cardText.tsx). The browser sweep in
//    tests/e2e/setup-cards.spec.ts reads the computed weights at 390px; here every card kind is checked by its classes.
// 2. A card of starting ideas, or of readings of an answer, leads with code's own line, with the counted thing and the goal
//    (lib/setup/optionsLead.ts), then "Pick one or write your own."; Claude's lead-in there is one short line or nothing.
// 3. The final recap and the playback read as the person's goal ("Your goal: at least 3 runs a week"), with their capitals.

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAD_SLOT } from '@/components/setup/cardText';
import { FinalCard } from '@/components/setup/FinalCard';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { RetryNotice } from '@/components/setup/RetryNotice';
import { SETUP_TURN_BUDGET_MS, runCheckedTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import type { ModelSetupResult } from '@/lib/ai/setup';
import { OPTIONS_SAY_MAX_CHARS, checkLeadIn, onlyPlainWords } from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { optionsLead } from '@/lib/setup/optionsLead';
import { countedWords, renderFinal, renderPlayback } from '@/lib/setup/playback';
import { quickPathSections } from '@/lib/setup/quickPath';
import { PICK_ONE, RETRY_CAUSES } from '@/lib/setup/session';
import type { AssistantTurn, SetupModel, TargetDraft, Transcript, TurnKind } from '@/types/setup';
import { READING_CASE_ID, SETUP_CASES } from './setup-evals/cases';
import { goal, target } from './helpers/setupScript';
import { E2E_CASE_ID } from './e2e/support/setupConversation';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const TODAY = '2026-10-29';
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'Which of these would you like to start from?',
  detail: null,
  topic: 'floor',
  options: [],
  draft: emptyDraft(),
  ...over,
});
const withTargets = (goals: { title: string; targets: TargetDraft[] }[]) => {
  const d = emptyDraft();
  goals.forEach((g, i) => d.model.goals.push({ ...goal(`g${i + 1}`, g.title), targets: g.targets }));
  return d;
};
// The scripted ideas card of a case in the eval set, as the fake model serves it to the browser specs.
const ideasTurnOf = (id: string): AssistantTurn => {
  const c = SETUP_CASES.find((x) => x.id === id)!;
  return c.script.find((t) => t.kind === 'ideas')!;
};

// ---------------------------------------------------------------------------
// Finding 1: one bold line per card
// ---------------------------------------------------------------------------

// Every element on the card that is set heavier than regular, by its classes (jsdom computes no Tailwind styles).
const HEAVY = /\b(font-(medium|semibold|bold|extrabold|black)|section-title)\b/;
const heavyOn = (root: Element) => [root, ...root.querySelectorAll('*')].filter((el) => HEAVY.test(el.getAttribute('class') ?? ''));

const model = (): SetupModel => withTargets([{ title: 'Run more', targets: [target('t1', 'Runs', { floor: 3 })] }]).model;
const CARDS: [string, () => ReactElement][] = [
  ['a plain question', () => <QuestionCard turn={turn({ say: 'Got it.', question: 'Does it keep going?', detail: 'So the plan knows.', topic: 'shape' })} busy={false} onAnswer={() => {}} today={TODAY} />],
  ['an ideas card', () => <QuestionCard turn={ideasTurnOf(E2E_CASE_ID)} busy={false} onAnswer={() => {}} today={TODAY} />],
  [
    'an options card',
    () => <QuestionCard turn={turn({ kind: 'interpretations', say: 'Not sure which.', options: ['At least 2 a week', 'At least 3 a week'], draft: withTargets([{ title: 'Run more', targets: [target('t1', 'Runs')] }]) })} busy={false} onAnswer={() => {}} today={TODAY} />,
  ],
  ['a proposal', () => <QuestionCard turn={turn({ kind: 'proposal', question: 'Three a week to start?', options: ['Two a week'] })} busy={false} onAnswer={() => {}} today={TODAY} />],
  ['a date question', () => <QuestionCard turn={turn({ topic: 'deadline_date', question: 'Which day does it have to be done by?' })} busy={false} onAnswer={() => {}} today={TODAY} />],
  ['a date confirmation', () => <QuestionCard turn={turn({ kind: 'proposal', topic: 'start_date', question: 'Start today, Thursday, Oct 29?' })} busy={false} onAnswer={() => {}} today={TODAY} />],
  ['a playback', () => <PlaybackCard chunk="targets" lines={renderPlayback(model(), 'targets')} busy={false} onApprove={() => {}} onChange={() => {}} />],
  ['the final card', () => <FinalCard lines={renderFinal(model())} saving={false} error={null} onSave={() => {}} onChange={() => {}} />],
  ['the final card with a save error', () => <FinalCard lines={renderFinal(model())} saving={false} error="Nothing was saved yet." onSave={() => {}} onChange={() => {}} />],
  [
    'the quick path',
    () => <QuickPathCard message="Setup has stopped asking." sections={quickPathSections(model())} missing={['A time zone']} canSave={false} saving={false} error={null} onSave={() => {}} onStartOver={() => {}} />,
  ],
  ...RETRY_CAUSES.map((cause): [string, () => ReactElement] => [
    `the ${cause} error card under its question`,
    () => (
      <QuestionCard
        turn={turn({ question: 'Does it keep going?', topic: 'shape' })}
        busy={false}
        onAnswer={() => {}}
        today={TODAY}
        pending="It keeps going."
        notice={<RetryNotice cause={cause} onRetry={() => {}} onChangeAnswer={() => {}} />}
      />
    ),
  ]),
  ['the error card on its own', () => <RetryNotice cause="no_answer" onRetry={() => {}} headingId="setup-retry" />],
];

describe('finding 1: one bold line on every card, and nothing heavier', () => {
  it.each(CARDS)('%s', (_name, card) => {
    const { container } = render(card());
    const leads = container.querySelectorAll(`[data-slot="${LEAD_SLOT}"]`);
    expect(leads).toHaveLength(1);
    expect(leads[0].className).toContain('font-semibold');
    expect(heavyOn(container)).toEqual([leads[0]]);
  });

  it('under an error card, the error headline leads and the question above it is regular weight', () => {
    render(CARDS.find(([n]) => n === 'the network error card under its question')![1]());
    const question = screen.getByRole('heading', { name: 'Does it keep going?' });
    expect(question.className).toContain('font-normal');
    expect(question.getAttribute('data-slot')).toBeNull();
    expect(document.querySelector(`[data-slot="${LEAD_SLOT}"]`)?.closest('[data-slot="setup-alert"]')).not.toBeNull();
  });

  it('while the answer waits on its reply, the question still leads', () => {
    render(<QuestionCard turn={turn({ question: 'Does it keep going?', topic: 'shape' })} busy onAnswer={() => {}} today={TODAY} pending="It keeps going." />);
    expect(screen.getByRole('heading', { name: 'Does it keep going?' }).getAttribute('data-slot')).toBe(LEAD_SLOT);
  });
});

// ---------------------------------------------------------------------------
// Finding 2: the ideas card leads with code's line
// ---------------------------------------------------------------------------

describe('finding 2: a card of options leads with one short line in code\'s words', () => {
  it.each([
    // The wording fix after round 3c: the number question in everyday words.
    ['the workout case', E2E_CASE_ID, 'In a hard week, how many runs would still count?'],
    ['the reading case', READING_CASE_ID, 'In a hard week, how many pages would still count?'],
  ])('%s: the lead asks the number question, then "Pick one or write your own.", then the detail and the ideas', (_name, id, lead) => {
    const t = ideasTurnOf(id);
    expect(optionsLead(t, TODAY)).toBe(lead);
    render(<QuestionCard turn={t} busy={false} onAnswer={() => {}} today={TODAY} />);
    const heading = screen.getByRole('heading', { name: lead });
    expect(heading.getAttribute('data-slot')).toBe(LEAD_SLOT);
    const pick = screen.getByText(PICK_ONE);
    expect(pick.className).toContain('font-normal');
    // Claude's question is not shown: the lead says it.
    expect(screen.queryByText(t.question!)).toBeNull();
    const detail = document.querySelector('[data-slot="question-detail"]')!;
    expect(detail.className).toContain('font-normal');
    const first = document.querySelector('[data-slot="answer-choice"]')!;
    for (const [a, b] of [
      [heading, pick],
      [pick, detail],
      [detail, first],
    ]) {
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(first.className).toContain('font-normal');
  });

  it.each([
    ['the workout case', E2E_CASE_ID],
    ['the reading case', READING_CASE_ID],
  ])('%s: no lead-in of Claude\'s renders; code\'s line is the first text on the card', (_name, id) => {
    const t = ideasTurnOf(id);
    expect(t.say.trim()).not.toBe('');
    for (const kind of ['ideas', 'interpretations'] as const) {
      const shown = { ...t, kind };
      expect(optionsLead(shown, TODAY)).not.toBeNull();
      const { container } = render(<QuestionCard turn={shown} busy={false} onAnswer={() => {}} today={TODAY} />);
      expect(container.textContent).not.toContain(t.say.trim());
      // The first element with words of its own is code's lead.
      const firstText = [...container.querySelectorAll('section *')].find((el) =>
        [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''),
      );
      expect(firstText?.getAttribute('data-slot')).toBe(LEAD_SLOT);
      expect(firstText?.textContent).toBe(optionsLead(shown, TODAY));
      cleanup();
    }
  });

  it('where code has no words for the topic, Claude\'s lead-in still shows above its question', () => {
    const t = turn({ kind: 'interpretations', topic: 'role', say: 'Not sure which.', question: 'Which of these is closest?', options: ['One', 'Two'] });
    render(<QuestionCard turn={t} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.getByText('Not sure which.')).toBeTruthy();
  });

  it('names the goal too when there is more than one, and keeps the person\'s capitals', () => {
    const d = withTargets([
      { title: 'Run more', targets: [target('t1', 'Runs', { floor: 2 })] },
      { title: 'Learn Spanish', targets: [target('t2', 'Spanish lessons')] },
    ]);
    expect(optionsLead(turn({ kind: 'ideas', draft: d }), TODAY, ['I want to take Spanish lessons.'])).toBe(
      'For Learn Spanish, in a hard week, how many Spanish lessons would still count?',
    );
  });

  it('on the aim, on what to count, on the goal itself, and on readings of an answer', () => {
    const d = withTargets([{ title: 'Read more books', targets: [target('t1', 'Pages', { floor: 50 })] }]);
    expect(optionsLead(turn({ kind: 'ideas', topic: 'aspiration', draft: d }), TODAY)).toBe('How many pages a week are you hoping for?');
    expect(optionsLead(turn({ kind: 'ideas', topic: 'target', draft: d }), TODAY)).toBe('Some ways to count your progress on Read more books');
    expect(optionsLead(turn({ kind: 'ideas', topic: 'idea' }), TODAY)).toBe('Some goal ideas to start from');
    expect(optionsLead(turn({ kind: 'interpretations', topic: 'floor', draft: d }), TODAY)).toBe('In a hard week, how many pages would still count?');
    expect(optionsLead(turn({ kind: 'interpretations', topic: 'day_end' }), TODAY)).toBe('A few ways to read your answer about when your day ends');
  });

  it.each(['question', 'offer_ideas', 'proposal'] as TurnKind[])('a %s card keeps Claude\'s question as its lead', (kind) => {
    expect(optionsLead(turn({ kind }), TODAY)).toBeNull();
  });

  it('with no words for the topic, Claude\'s question leads, with no "Pick one" line', () => {
    const t = turn({ kind: 'interpretations', topic: 'role', question: 'Which of these is closest?', options: ['One', 'Two'] });
    expect(optionsLead(t, TODAY)).toBeNull();
    render(<QuestionCard turn={t} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.getByRole('heading', { name: 'Which of these is closest?' })).toBeTruthy();
    expect(screen.queryByText(PICK_ONE)).toBeNull();
  });

  it('a lead-in on a card code leads is never shown, so it is never retried', () => {
    const ctx = { transcript: [] as Transcript, prevDraft: emptyDraft() };
    const t = { ...ideasTurnOf(READING_CASE_ID), say: 'Here are a few starting points, based on what you told me about your weeks.' };
    expect(checkLeadIn(t, ctx)).toEqual([]);
  });

  it(`where Claude's question leads a card of options, its lead-in is one short line, at most ${OPTIONS_SAY_MAX_CHARS} characters, or nothing`, () => {
    const ctx = { transcript: [] as Transcript, prevDraft: emptyDraft() };
    // An empty draft has no counted target, so code has no words for these cards' topic.
    for (const kind of ['ideas', 'interpretations'] as const) {
      expect(checkLeadIn(turn({ kind, say: 'Here are some starting points.' }), ctx)).toEqual([]);
      expect(checkLeadIn(turn({ kind, say: '' }), ctx)).toEqual([]);
      const long = checkLeadIn(turn({ kind, say: 'Here are a few starting points, based on what you told me about your weeks.' }), ctx);
      expect(long.map((x) => x.code)).toContain('plain.options_say');
      expect(onlyPlainWords(long)).toBe(true);
      expect(checkLeadIn(turn({ kind, say: 'Good. Here they are.' }), ctx).map((x) => x.code)).toContain('plain.options_say');
    }
    // An ordinary question keeps the longer lead-in limit.
    expect(checkLeadIn(turn({ say: 'Here are a few starting points, based on what you told me about your weeks.' }), ctx)).toEqual([]);
  });

  it('a long lead-in on a card of options is retried once with fixed words, then shown', async () => {
    const transcript: Transcript = [
      { role: 'assistant', turn: turn({ kind: 'offer_ideas', question: 'Do you have a number in mind, or would some starting ideas help?', detail: 'The number of runs that makes a week count.' }) },
      { role: 'person', text: 'Some ideas, please.' },
    ];
    const long = turn({
      kind: 'ideas',
      say: 'Here are a few starting points, based on what you told me about your weeks.',
      detail: 'Runs a week, from what you said.',
      options: ['At least 2 runs a week', 'At least 3 runs a week'],
    });
    const calls: RunSetupTurnArgs[] = [];
    let now = 0;
    const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      calls.push(args);
      now += 1_000;
      const result: ModelSetupResult = { ok: true, raw: long, model: 'm', usage: null };
      return { kind: 'answered', result, turns: 1, spentTokens: 0 };
    };
    const view = await runCheckedTurn(
      { userId: 'u', session: { transcript, draft: emptyDraft(), spentTokens: 0 }, today: TODAY, deadlineMs: SETUP_TURN_BUDGET_MS },
      { runTurn: runTurn as never, nowMs: () => now },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].retryFeedback).toContain(RETRY_FEEDBACK['plain.options_say']);
    expect(view).toMatchObject({ kind: 'turn', rejected: 1 });
  });
});

// ---------------------------------------------------------------------------
// Finding 3: the recap reads as the person's goal
// ---------------------------------------------------------------------------

describe('finding 3: the final recap and the playback read as the person\'s goal', () => {
  const oneGoal = (t: TargetDraft, title = 'Run more') => withTargets([{ title, targets: [t] }]).model;

  it('one goal, no aim: "Your goal: at least 3 runs a week."', () => {
    expect(renderFinal(oneGoal(target('t1', 'Runs', { floor: 3 })))[0]).toBe('Your goal: at least 3 runs a week.');
  });

  it('one goal, with an aim: "Your goal: at least 2 workouts a week, aiming for 3."', () => {
    expect(renderFinal(oneGoal(target('t1', 'Workouts', { floor: 2, aspiration: 3 })))[0]).toBe('Your goal: at least 2 workouts a week, aiming for 3.');
  });

  it('two goals: each line names its goal first', () => {
    const m = withTargets([
      { title: 'Read more', targets: [target('t1', 'Pages', { floor: 100 })] },
      { title: 'Get stronger', targets: [target('t2', 'Workouts', { floor: 2, aspiration: 3 })] },
    ]).model;
    expect(renderFinal(m).slice(0, 2)).toEqual(['Read more: at least 100 pages a week.', 'Get stronger: at least 2 workouts a week, aiming for 3.']);
  });

  it('keeps the person\'s own capitals: "Spanish lessons" stays capitalized', () => {
    const m = oneGoal(target('t1', 'Spanish lessons', { floor: 2 }), 'Learn Spanish');
    expect(renderFinal(m, { said: ['I want to learn Spanish.', 'Spanish lessons.'] })[0]).toBe('Your goal: at least 2 Spanish lessons a week.');
    expect(countedWords('Spanish lessons', ['I want to take Spanish lessons.'])).toBe('Spanish lessons');
    // A capital only at the start of what they typed ("Pages.") is not theirs to keep.
    expect(countedWords('Pages', ['Pages.'])).toBe('pages');
    expect(renderFinal(oneGoal(target('t1', 'Pages', { floor: 100 })), { said: ['I want to read more books.', 'Pages.'] })[0]).toBe('Your goal: at least 100 pages a week.');
  });

  it('one is one: "at least 1 run a week"', () => {
    expect(renderFinal(oneGoal(target('t1', 'Runs', { floor: 1, aspiration: 2 })))[0]).toBe('Your goal: at least 1 run a week, aiming for 2.');
  });

  it('the playback says the same thing in the same words', () => {
    const one = oneGoal(target('t1', 'Workouts', { floor: 2, aspiration: 3 }));
    expect(renderPlayback(one, 'targets')).toContain('  Your goal: at least 2 workouts a week, aiming for 3.');
    const two = withTargets([
      { title: 'Read more', targets: [target('t1', 'Pages', { floor: 100 })] },
      { title: 'Learn Spanish', targets: [target('t2', 'Spanish lessons', { floor: 2 })] },
    ]).model;
    const lines = renderPlayback(two, 'targets', { said: ['I want to take Spanish lessons.'] });
    expect(lines).toContain('  Read more: at least 100 pages a week.');
    expect(lines).toContain('  Learn Spanish: at least 2 Spanish lessons a week.');
  });

  it('never tells the person what they will do', () => {
    const m = withTargets([
      { title: 'Read more', targets: [target('t1', 'Pages', { floor: 100 }), target('t2', 'Books')] },
      { title: 'Get stronger', targets: [target('t3', 'Workouts', { floor: 2, aspiration: 3 })] },
    ]).model;
    for (const line of [...renderFinal(m), ...renderPlayback(m, 'targets')]) expect(line).not.toMatch(/you'll count/i);
  });
});
