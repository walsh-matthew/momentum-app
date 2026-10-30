// @vitest-environment jsdom
//
// MOM-111 setup round 3b, from the owner's screenshot review on 2026-10-29. Every fix sits in the shared component or rule
// all setup cards use, and each test below runs across every step, every date card or every error kind:
// 1. Number questions say what the number is: the counted thing and fewest-or-aim, options that say which one they set, and
//    a help link that explains the two with the person's own counted thing (lib/setup/numbers.ts, checks.ts).
// 2. Never a date shown and then asked for: a known date is the question itself (lib/setup/codeTurns.ts normalizeDateTurn,
//    showsDateAndAsks, checks.ts plain.date_asks; lib/dates/casual.ts keeps "today, Friday, Oct 30").
// 3. The date button looks like every other answer, with a small calendar icon, inside the card (DateAnswer.tsx).
// 4. The counted thing is the person's own word in options, details and the recap (checks.ts choice.ideas_words).
// 5. One alert look for every error card (SetupAlert.tsx), 6. soft words that never blame and never name the model
//    (lib/setup/session.ts ERROR_COPY), 7. the question stays above the error card, whose help says what happened.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { RetryNotice } from '@/components/setup/RetryNotice';
import { SetupAlert } from '@/components/setup/SetupAlert';
import { answerChoiceClasses } from '@/components/setup/AnswerChoice';
import { casualText } from '@/lib/dates/casual';
import { checkDateLeadIn, checkOptionList, checkTurn } from '@/lib/setup/checks';
import { DATE_TOPICS, normalizeDateTurn, showsDateAndAsks } from '@/lib/setup/codeTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { NUMBER_TOPICS, countedTarget, normalizeNumberTurn, numberHelp, numberQuestion } from '@/lib/setup/numbers';
import { renderFinal } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import {
  CHANGE_ANSWER,
  ERROR_COPY,
  MEANING_LINK,
  MEANING_TEXT,
  PICK_DATE,
  PICK_OTHER_DATE,
  RETRY_CAUSES,
  SAVED,
  SEND_AGAIN,
  TRY_AGAIN,
  errorCopy,
  type RetryCause,
} from '@/lib/setup/session';
import { SETUP_STEPS } from '@/lib/setup/steps';
import { runSetupEval } from '@/lib/setup/evals';
import type { AssistantTurn, SetupDraft, SetupTopic, Transcript, TurnKind } from '@/types/setup';
import { goal, scriptedModel, target } from './helpers/setupScript';
import { READING_CASE_ID, SETUP_CASES } from './setup-evals/cases';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const TODAY = '2026-10-30';
const ALL_TOPICS = [...new Set(SETUP_STEPS.flatMap((s) => s.topics))];
const DATE_TOPIC_LIST = [...DATE_TOPICS] as SetupTopic[];

// A draft with one goal counting the person's own thing.
function counting(title: string, over: Parameters<typeof target>[2] = {}): SetupDraft {
  const d = emptyDraft();
  const g = goal('g1', 'Get fit');
  g.targets.push(target('t1', title, over));
  d.model.goals.push(g);
  return d;
}
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'What is the least you would count?',
  detail: null,
  topic: 'floor',
  options: [],
  draft: counting('Workouts'),
  ...over,
});
const said = (text: string): Transcript[number] => ({ role: 'person', text });
const asked = (over: Partial<AssistantTurn> = {}): Transcript[number] => ({ role: 'assistant', turn: turn(over) });

// ---------------------------------------------------------------------------
// Finding 1: number questions say what the number is
// ---------------------------------------------------------------------------

describe('finding 1: a number question names the counted thing and whether it is the fewest or the aim', () => {
  it.each([
    // Round 3c: in everyday words, never "fewest" or "aim" on their own.
    ['floor', counting('Workouts'), 'How many workouts make a week count, even a hard one?'],
    ['aspiration', counting('Workouts', { floor: 2 }), 'How many workouts a week are you hoping for?'],
    ['floor', counting('Pages'), 'How many pages make a week count, even a hard one?'],
    ['floor', counting('Practice', { measure: 'time' }), 'How many minutes of practice make a week count, even a hard one?'],
    ['floor', counting('Blocks sewn', { period: { kind: 'deadline', dueDate: '2026-12-15' } }), 'How many blocks sewn by Tuesday, Dec 15 would still count as on track?'],
  ] as const)('a bare %s question becomes "%s"', (topic, draft, words) => {
    const shown = normalizeNumberTurn(turn({ topic, draft, question: 'What number feels right?' }), TODAY);
    expect(shown.question).toBe(words);
  });

  it('always shows code\'s words, even when Claude\'s already name the thing (round 3c: "fewest" read as jargon)', () => {
    const own = turn({ question: "What's the fewest workouts a week you'd still call on track?" });
    expect(normalizeNumberTurn(own, TODAY).question).toBe('How many workouts make a week count, even a hard one?');
    const same = turn({ question: 'How many workouts make a week count, even a hard one?' });
    expect(normalizeNumberTurn(same, TODAY)).toBe(same);
  });

  it.each(ALL_TOPICS.filter((t) => !NUMBER_TOPICS.has(t)))('leaves a %s question alone', (topic) => {
    const t = turn({ topic, question: 'What number feels right?' });
    expect(normalizeNumberTurn(t, TODAY)).toBe(t);
  });

  it('the rewritten question passes every check, in at most about 12 words', () => {
    const shown = normalizeNumberTurn(turn({ question: 'How many?' }), TODAY);
    const ctx = { transcript: [asked({ topic: 'target', question: "What would you like to count to know it's going well?" }), said('Workouts')], prevDraft: shown.draft };
    expect(checkTurn(shown, ctx)).toEqual([]);
  });

  it.each(['ideas', 'interpretations', 'proposal'] as const)('%s on the fewest or the aim say which number each option sets', (kind) => {
    const fewest = (options: string[]) => checkOptionList(turn({ kind, detail: 'Workouts a week, as starting points.', options })).map((x) => x.code);
    expect(fewest(['2 workouts a week', '3 workouts a week'])).toContain('choice.ideas_role');
    expect(fewest(['At least 2 a week', 'At least 3 a week'])).toEqual([]);
    const aim = checkOptionList(turn({ kind, topic: 'aspiration', detail: 'Workouts a week.', options: ['Aiming for 3 a week', 'Aiming for 4 a week'] }));
    expect(aim).toEqual([]);
    expect(RETRY_FEEDBACK['choice.ideas_role']).toMatch(/At least.*Aiming for/);
  });

  // Every step's topic, on a card whose draft counts "workouts": a number question explains the fewest and the aim in place,
  // with that word; any other question asks Claude what it means.
  it.each(ALL_TOPICS)('the help link on a %s card', (topic) => {
    const onAnswer = vi.fn();
    const draft = counting('Workouts');
    render(<QuestionCard turn={turn({ topic, draft, question: 'What is it?' })} busy={false} onAnswer={onAnswer} today={TODAY} />);
    const links = screen.getAllByRole('button', { name: MEANING_LINK });
    expect(links).toHaveLength(1);
    fireEvent.click(links[0]);
    if (NUMBER_TOPICS.has(topic)) {
      expect(onAnswer).not.toHaveBeenCalled();
      const words = screen.getByText(/The first number is how many workouts make a week count, even a hard one/);
      expect(words.textContent).toContain("The second is how many you're hoping for");
      expect(words.textContent).not.toMatch(/fewest|\baim\b/i);
      expect(words.textContent).toBe(numberHelp(draft, topic, TODAY));
    } else {
      expect(onAnswer).toHaveBeenCalledWith(MEANING_TEXT);
    }
  });

  it('the counted thing is the newest target still missing that number', () => {
    const d = counting('Workouts', { floor: 2 });
    d.model.goals[0].targets.push(target('t2', 'Stretches'));
    expect(countedTarget(d, 'floor')?.title).toBe('Stretches');
    expect(countedTarget(d, 'aspiration')?.title).toBe('Stretches');
    expect(numberQuestion('floor', countedTarget(d, 'floor')!, TODAY)).toContain('stretches');
  });

  it('tells Claude to name the thing and fewest-or-aim, with "At least" and "Aiming for" options', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('A question that asks for a number names the thing counted');
    expect(SETUP_SYSTEM_PROMPT).toContain('("At least 2 a week", "Aiming for 3 a week")');
  });
});

// ---------------------------------------------------------------------------
// Finding 2: never a date shown and then asked for
// ---------------------------------------------------------------------------

describe('finding 2: never show a date and then ask for one', () => {
  const shape = (answer: string): Transcript => [asked({ topic: 'shape', question: 'Does it keep going, end on a date, or have a deadline?' }), said(answer)];
  const KINDS: TurnKind[] = ['question', 'proposal'];
  const variants = (topic: SetupTopic, kind: TurnKind): AssistantTurn[] => [
    turn({ kind, topic, say: 'Today is Friday, Oct 30.', question: 'Which day works?' }),
    turn({ kind, topic, say: '', question: 'Is Friday, Nov 20 the day, or another one?' }),
    turn({ kind, topic, say: 'Got it.', question: 'Which day works?', detail: 'Like Friday, Nov 20.' }),
    turn({ kind, topic, say: 'Got it.', question: kind === 'proposal' ? 'Done by Friday, Nov 20?' : 'Which day works?' }),
  ];

  it.each(DATE_TOPIC_LIST.flatMap((topic) => KINDS.map((kind) => [topic, kind] as const)))('a %s %s card: the lead-in and question never both show a date and ask for one', (topic, kind) => {
    for (const t of variants(topic, kind)) {
      for (const transcript of [shape('It keeps going.'), shape('A deadline, November 20.')]) {
        const shown = normalizeDateTurn(t, transcript, emptyDraft(), TODAY);
        expect(showsDateAndAsks(shown), `${t.say} | ${t.question} | ${t.detail}`).toBe(false);
        expect(checkDateLeadIn(shown).map((x) => x.code)).toEqual([]);
      }
    }
  });

  it('the check flags a date shown and then asked for, in the lead-in, the question or the detail', () => {
    expect(checkDateLeadIn(turn({ topic: 'start_date', say: 'Today is Friday, Oct 30.', question: 'Which day?' })).map((x) => x.code)).toEqual(['plain.date_lead_in']);
    expect(checkDateLeadIn(turn({ topic: 'deadline_date', question: 'Is it Nov 20, or which day?' })).map((x) => x.code)).toEqual(['plain.date_asks']);
    expect(checkDateLeadIn(turn({ topic: 'end_date', question: 'Which day?', detail: 'Maybe Nov 20.' })).map((x) => x.code)).toEqual(['plain.date_asks']);
    expect(checkDateLeadIn(turn({ kind: 'proposal', topic: 'end_date', question: 'Run until Friday, Nov 20?' }))).toEqual([]);
  });

  it.each([
    ['start_date', 'It keeps going.', 'Start today, Friday, Oct 30?'],
    ['deadline_date', 'A deadline, November 20.', 'Done by Friday, Nov 20?'],
  ] as const)('a %s with a known date proposes it as the question: "%s"', (topic, answer, words) => {
    const shown = normalizeDateTurn(turn({ topic, question: 'Which day?' }), shape(answer), emptyDraft(), TODAY);
    expect(shown.kind).toBe('proposal');
    expect(casualText(shown.question ?? '', TODAY)).toBe(words);
    render(<QuestionCard turn={shown} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.getByRole('heading', { name: words })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('data-tone')).toBe('main');
    expect(screen.getByLabelText(PICK_OTHER_DATE)).toBeTruthy();
  });

  it('a date proposal keeps no other answer that only repeats "Pick a different date"', () => {
    const t = turn({ kind: 'proposal', topic: 'start_date', question: 'Start today, Friday, Oct 30?', options: ['I already started earlier', 'Pick another day', 'Today, Friday, Oct 30'] });
    expect(normalizeDateTurn(t, shape('It keeps going.'), emptyDraft(), TODAY).options).toEqual(['Today, Friday, Oct 30']);
  });
});

// ---------------------------------------------------------------------------
// Finding 3: the date button looks like every other answer
// ---------------------------------------------------------------------------

describe('finding 3: "Pick a date" looks like the other answers, with a calendar icon, inside the card', () => {
  it.each(DATE_TOPIC_LIST.flatMap((topic) => [[topic, false], [topic, true]] as const))('%s, suggested %s', (topic, suggests) => {
    const t = suggests ? turn({ kind: 'proposal', topic, question: 'On Monday, Nov 2?' }) : turn({ topic, question: 'Which day?' });
    const { container } = render(<QuestionCard turn={t} busy={false} onAnswer={() => {}} today={TODAY} />);
    const field = screen.getByLabelText(suggests ? PICK_OTHER_DATE : PICK_DATE);
    const trigger = field.closest('[data-picker="date"]') as HTMLElement;
    const tone = suggests ? 'answer' : 'main';
    // The same shape, width, border and type as every other answer.
    expect(trigger.className.startsWith(answerChoiceClasses(tone, false))).toBe(true);
    expect(trigger.getAttribute('data-slot')).toBe('answer-choice');
    expect(trigger.querySelector('[data-slot="picker-icon"]')).toBeTruthy();
    // Inside the card, not under it.
    expect(container.querySelector('section')?.contains(trigger)).toBe(true);
    if (suggests) {
      const yes = screen.getByRole('button', { name: 'Yes' });
      expect(yes.getAttribute('data-slot')).toBe('answer-choice');
      expect(yes.getAttribute('data-tone')).toBe('main');
    }
  });
});

// ---------------------------------------------------------------------------
// Finding 4: the person's own words
// ---------------------------------------------------------------------------

describe('finding 4: the counted thing is the person\'s own word', () => {
  it.each(['ideas', 'interpretations', 'proposal', 'offer_ideas'] as const)('a %s that counts a stock word the person never said is flagged', (kind) => {
    const transcript: Transcript = [asked({ topic: 'target', question: 'What would you like to count?' }), said('Workouts.')];
    const options = kind === 'offer_ideas' ? [] : ['2 sessions a week', '3 sessions a week'];
    const found = checkOptionList(turn({ kind, topic: 'target', detail: 'Sessions a week.', options }), { transcript, prevDraft: emptyDraft() });
    expect(found.map((x) => x.code)).toContain('choice.ideas_words');
    const own = checkOptionList(turn({ kind, topic: 'target', detail: 'Workouts a week.', options: kind === 'offer_ideas' ? [] : ['2 workouts a week', '3 workouts a week'] }), { transcript, prevDraft: emptyDraft() });
    expect(own.map((x) => x.code)).not.toContain('choice.ideas_words');
  });

  it('the reading case finishes clean, and its ideas and recap count "pages", never "sessions"', async () => {
    const c = SETUP_CASES.find((x) => x.id === READING_CASE_ID)!;
    const report = await runSetupEval(c, scriptedModel(c.script));
    expect(report.finished).toBe(true);
    expect(report.finalIssues).toEqual([]);
    const shown = c.script.flatMap((t) => [t.detail ?? '', ...t.options]).join(' ');
    expect(shown).not.toMatch(/sessions/i);
    const last = c.script[c.script.length - 1];
    expect(renderFinal(last.draft.model)[0]).toBe('Your goal: at least 100 pages a week.');
  });
});

// ---------------------------------------------------------------------------
// Findings 5 to 7: the error cards
// ---------------------------------------------------------------------------

const WORDS: Record<RetryCause, [string, string | null, string]> = {
  stuck: ["Sorry, I didn't follow that", 'Could you say it a different way?', CHANGE_ANSWER],
  network: ["Couldn't connect", 'Your answer is saved. Check your connection, then try again.', TRY_AGAIN],
  busy: ['Things are busy right now', 'Your answer is saved. Give it a moment, then try again.', TRY_AGAIN],
  wait: ['Things are busy right now', 'Your answer is saved. Give it a moment, then try again.', TRY_AGAIN],
  no_answer: ["That didn't go through", 'Your answer is saved. Try again.', TRY_AGAIN],
  timed_out: ['That took too long', 'Your answer is saved. Try again.', TRY_AGAIN],
  not_configured: ["Setup isn't available right now", 'Nothing was saved. Try again later.', TRY_AGAIN],
  unsent: ["Your last answer wasn't sent", null, SEND_AGAIN],
};

describe('findings 5 to 7: every error card', () => {
  it('has words for every cause', () => expect(Object.keys(WORDS).sort()).toEqual([...RETRY_CAUSES].sort()));

  it.each(RETRY_CAUSES)('a %s card: the alert look, the headline first, then the line, then the one button', (cause) => {
    const [headline, line, button] = WORDS[cause];
    const { container } = render(<RetryNotice cause={cause} onRetry={() => {}} onChangeAnswer={() => {}} />);
    const alert = container.querySelector('[data-slot="setup-alert"]') as HTMLElement;
    expect(alert.className).toMatch(/border-warn/);
    expect(alert.className).toMatch(/bg-warn/);
    expect(container.innerHTML).not.toMatch(/danger|destructive|red-/);
    expect(alert.querySelector('[data-slot="setup-alert-icon"]')).toBeTruthy();
    const role = screen.getByRole(cause === 'unsent' ? 'status' : 'alert');
    expect(role.firstElementChild?.textContent).toBe(headline);
    expect(role.textContent).toBe(`${headline}${line ?? ''}`);
    const buttons = [...container.querySelectorAll('button[data-tone]')];
    expect(buttons.map((b) => b.textContent)).toEqual([button]);
    // The button comes after the words.
    expect(role.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(RETRY_CAUSES)('a %s card never names the model or blames the person', (cause) => {
    const copy = ERROR_COPY[cause];
    for (const text of [copy.headline, copy.line ?? '', copy.why]) {
      expect(text).not.toMatch(/claude|anthropic|\bAI\b/i);
      expect(text).not.toMatch(/\byou (did|made|typed|entered) (it|that|something) wrong\b|\byour (mistake|fault|error)\b|\binvalid\b/i);
    }
  });

  it.each(RETRY_CAUSES)('a %s card with no answer waiting never says the answer is saved', (cause) => {
    expect(errorCopy(cause, false).line ?? '').not.toContain(SAVED);
    render(<RetryNotice cause={cause} onRetry={() => {}} />);
    expect(document.body.textContent).not.toContain(SAVED);
  });

  it.each(RETRY_CAUSES)('"What does this mean?" on a %s card says what happened and why the button fixes it', (cause) => {
    const { container } = render(<RetryNotice cause={cause} onRetry={() => {}} onChangeAnswer={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    expect(container.querySelector('[data-slot="help-explain"]')?.textContent).toBe(ERROR_COPY[cause].why);
  });

  it.each(RETRY_CAUSES)('a %s card sits under the question it belongs to', (cause) => {
    render(
      <QuestionCard
        turn={turn({ topic: 'why', question: 'Why does this matter to you?' })}
        busy={false}
        onAnswer={() => {}}
        today={TODAY}
        pending="Because of my kids."
        notice={<RetryNotice cause={cause} onRetry={() => {}} onChangeAnswer={() => {}} />}
      />,
    );
    const question = screen.getByRole('heading', { name: 'Why does this matter to you?' });
    const role = screen.getByRole(cause === 'unsent' ? 'status' : 'alert');
    expect(question.compareDocumentPosition(role) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Because of my kids.')).toBeTruthy();
  });

  it('the shared alert look is used for any setup error, with no button', () => {
    const { container } = render(<SetupAlert headline="Could not save your setup. Nothing was saved." />);
    expect(screen.getByRole('alert').textContent).toBe('Could not save your setup. Nothing was saved.');
    expect(container.querySelector('[data-slot="setup-alert"]')?.className).toMatch(/border-warn/);
  });
});
