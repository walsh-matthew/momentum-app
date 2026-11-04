// @vitest-environment jsdom
//
// Four setup bugs found on test day 1 (owner's phone run):
// a. On an iPhone the date field fires `change` as the picker opens, with today filled in, and the card answered at once, so the
//    person could never choose another date. Choosing a date only shows it; "Use this date" answers.
// b. "What does this mean?" on a card of ideas or readings showed the same card again: code leads such a card and hid Claude's
//    lead-in, which is where the explanation is. The explanation a person asked for is always shown.
// c. The limit message did not say when Claude is back. It now says "after about 9:15 AM" in the person's zone (or the phone's), else
//    "in about N hours".
// d. A time target whose words already name a unit read "minutes of hours". Hours are asked in hours and stored in minutes.
// No network call.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DateAnswer } from '@/components/setup/DateAnswer';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { QUICK_PATH_WORDS, quickPathReason, quickPathStuckHelp } from '@/lib/setup/quickPath';
import { takeSetupTurn, runCheckedTurn, SETUP_TURN_BUDGET_MS } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import { emptyDraft } from '@/lib/setup/draft';
import { normalizePlainTurn } from '@/lib/setup/plainCard';
import { amount, amountOf, renderFinal, renderPlayback } from '@/lib/setup/playback';
import { convertHourAnswers, countedThing, numberHelp, numberQuestion, numberAbout } from '@/lib/setup/numbers';
import { resumeFallback, resumeInfo, resumeSentence } from '@/lib/setup/resume';
import { PICK_DATE, PICK_OTHER_DATE, PROPOSAL_YES_TEXT, USE_THIS_DATE, askedWhatItMeans } from '@/lib/setup/session';
import { hoursToMinutes, minutesAsHours, namesHours, namesMinutes, namesTimeUnit } from '@/lib/setup/timeUnits';
import { validateDraft } from '@/lib/setup/validate';
import type { AssistantTurn, SetupDraft, SetupSession, Transcript } from '@/types/setup';
import type { ResumeInfo } from '@/types/setupScreen';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { goal, target } from './helpers/setupScript';
import { item, quickProps, step } from './helpers/quickPath';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});
afterEach(cleanup);

const TODAY = '2026-11-04';
const ME = '11111111-1111-4111-8111-111111111111';

const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'Which day would you like?',
  detail: null,
  topic: 'start_date',
  options: [],
  draft: emptyDraft(),
  ...over,
});

// ---------------------------------------------------------------------------
// a. The date picker
// ---------------------------------------------------------------------------

describe('a. choosing a date only shows it; "Use this date" answers', () => {
  const field = (label = PICK_DATE) => screen.getByLabelText(label) as HTMLInputElement;
  const mains = (container: HTMLElement) => [...container.querySelectorAll('[data-tone="main"]')];

  it('change alone never answers, even when it fires with today filled in as the picker opens', () => {
    const onAnswer = vi.fn();
    render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.change(field(), { target: { value: TODAY } });
    expect(onAnswer).not.toHaveBeenCalled();
    // The picker button reads the date ("Wed, Nov 4"); the person can still choose another.
    expect(field().closest('[data-picker="date"]')?.textContent).toBe('Wed, Nov 4');
    fireEvent.change(field(), { target: { value: '2026-11-12' } });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(field().closest('[data-picker="date"]')?.textContent).toBe('Thu, Nov 12');
  });

  it('"Use this date" answers with the date picked last, once', () => {
    const onAnswer = vi.fn();
    render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.change(field(), { target: { value: TODAY } });
    fireEvent.change(field(), { target: { value: '2026-11-12' } });
    fireEvent.click(screen.getByRole('button', { name: USE_THIS_DATE }));
    expect(onAnswer.mock.calls).toEqual([['Thursday, November 12, 2026']]);
  });

  it('"Use this date" is not there before a pick, and is the one main button after it (never dimmed)', () => {
    const { container } = render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.queryByRole('button', { name: USE_THIS_DATE })).toBeNull();
    expect(mains(container)).toHaveLength(1);
    expect(field().closest('[data-picker="date"]')?.getAttribute('data-tone')).toBe('main');
    fireEvent.change(field(), { target: { value: '2026-11-12' } });
    const use = screen.getByRole('button', { name: USE_THIS_DATE }) as HTMLButtonElement;
    expect(mains(container)).toEqual([use]);
    expect(use.disabled).toBe(false);
    expect(field().closest('[data-picker="date"]')?.getAttribute('data-tone')).toBe('answer');
  });

  it('on a confirmation, Yes stops being the main button once a different date is picked', () => {
    const { container } = render(<DateAnswer suggests others={[]} locked={false} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(mains(container)).toHaveLength(1);
    fireEvent.change(field(PICK_OTHER_DATE), { target: { value: '2026-11-12' } });
    expect(mains(container)).toEqual([screen.getByRole('button', { name: USE_THIS_DATE })]);
    expect(screen.getByRole('button', { name: 'Yes' }).getAttribute('data-tone')).toBe('answer');
  });

  it('Yes still answers the suggested date at once', () => {
    const onAnswer = vi.fn();
    render(<DateAnswer suggests others={[]} locked={false} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onAnswer).toHaveBeenCalledWith(PROPOSAL_YES_TEXT);
  });

  it('while a reply loads, "Use this date" stays solid and sends nothing', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.change(field(), { target: { value: '2026-11-12' } });
    rerender(<DateAnswer suggests={false} others={[]} locked busy={false} onAnswer={onAnswer} today={TODAY} />);
    const use = screen.getByRole('button', { name: USE_THIS_DATE }) as HTMLButtonElement;
    expect(use.disabled).toBe(false);
    fireEvent.click(use);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('a. the other date fields already answer on a button', () => {
  it('the quick path date field and the task edit date only set a value on change (no answer until a button)', async () => {
    const { readFileSync } = await import('node:fs');
    const quick = readFileSync('components/setup/QuickPathFillIn.tsx', 'utf8');
    const task = readFileSync('components/forecast/TaskEditScreen.tsx', 'utf8');
    // Field's onChange only calls setValue; onSet runs from the form's submit.
    expect(quick).toMatch(/onChange=\{\(event\) => setValue\(event\.target\.value\)\}/);
    expect(task).toMatch(/onChange=\{\(e\) => \{\s*setDate\(e\.target\.value\);/);
  });
});

// ---------------------------------------------------------------------------
// b. "What does this mean?"
// ---------------------------------------------------------------------------

describe('b. the explanation a person asked for is always shown', () => {
  const EXPLAIN = 'A check-in is a short message asking how a run went.';
  const checkIns = (kind: AssistantTurn['kind']) =>
    turn({
      kind,
      topic: 'check_ins',
      say: EXPLAIN,
      question: 'Should Momentum ask how it went?',
      options: kind === 'question' ? [] : ['At the end of my day', 'At the end of my week', 'Never'],
    });

  it.each(['question', 'ideas', 'interpretations'] as const)('a %s card on check-ins shows the explanation when it answers "What do you mean?"', (kind) => {
    render(<QuestionCard turn={checkIns(kind)} busy={false} onAnswer={() => {}} today={TODAY} explaining />);
    expect(screen.getByText(EXPLAIN)).toBeTruthy();
  });

  it('a card of ideas still leaves off Claude\'s lead-in when nothing was asked (code leads it)', () => {
    render(<QuestionCard turn={checkIns('ideas')} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.queryByText(EXPLAIN)).toBeNull();
  });

  it('tells whether the newest turn answers "What do you mean?"', () => {
    const asked: Transcript = [
      { role: 'assistant', turn: checkIns('ideas') },
      { role: 'person', text: 'What do you mean?' },
      { role: 'assistant', turn: checkIns('ideas') },
    ];
    expect(askedWhatItMeans(asked)).toBe(true);
    expect(askedWhatItMeans(asked.slice(0, 1))).toBe(false);
    expect(askedWhatItMeans([...asked.slice(0, 1), { role: 'person', text: 'Never' }, { role: 'assistant', turn: checkIns('ideas') }])).toBe(false);
    // A pending answer: the card still shown is the one before it.
    expect(askedWhatItMeans(asked.slice(0, 2))).toBe(false);
    expect(askedWhatItMeans([])).toBe(false);
  });
});

describe('b. can normalizePlainTurn blank an explanation? Yes, when it uses a word the card may not show', () => {
  const said: Transcript = [{ role: 'person', text: 'What do you mean?' }];

  it('blanks an explanation with a jargon word the person never said ("floor")', () => {
    const t = turn({ topic: 'check_ins', say: 'The floor is the least that counts.', question: 'Should Momentum ask how it went?' });
    expect(normalizePlainTurn(t, said).say).toBe('');
  });

  it('blanks one that points back by an abstract name ("from what you said earlier")', () => {
    const t = turn({ topic: 'check_ins', say: 'Going by what you said earlier, it would message you.', question: 'Should Momentum ask how it went?' });
    expect(normalizePlainTurn(t, said).say).toBe('');
  });

  it('keeps an explanation with no such word, including the word "check-in"', () => {
    const t = turn({ topic: 'check_ins', say: 'A check-in is a short message asking how a run went.', question: 'Should Momentum ask how it went?' });
    expect(normalizePlainTurn(t, said).say).toBe(t.say);
  });

  it('keeps the jargon word when the person said it themselves', () => {
    const t = turn({ topic: 'check_ins', say: 'The floor is the least that counts.', question: 'Should Momentum ask how it went?' });
    expect(normalizePlainTurn(t, [{ role: 'person', text: 'what is the floor?' }]).say).toBe(t.say);
  });
});

// ---------------------------------------------------------------------------
// c. When Claude is back
// ---------------------------------------------------------------------------

describe('c. the limit message says when Claude is back', () => {
  // 2026-11-04 08:00 in Los Angeles (UTC-8 in November) is 16:00 UTC.
  const NOW = Date.UTC(2026, 10, 4, 16, 0, 0);
  const LA = 'America/Los_Angeles';

  it('writes the clock time in the person\'s time zone, rounded up to the minute', () => {
    expect(resumeSentence(NOW + (75 * 60 + 1) * 1000, NOW, LA)).toBe('You can use Claude for setup again after about 9:16 AM.');
    expect(resumeSentence(NOW + 75 * 60 * 1000, NOW, LA)).toBe('You can use Claude for setup again after about 9:15 AM.');
  });

  it('uses their zone, not the server\'s', () => {
    expect(resumeSentence(NOW + 75 * 60 * 1000, NOW, 'Europe/London')).toBe('You can use Claude for setup again after about 5:15 PM.');
  });

  it('says "tomorrow" when the time falls on the next day in their zone', () => {
    expect(resumeSentence(NOW + 19 * 3600 * 1000, NOW, LA)).toBe('You can use Claude for setup again after about 3:00 AM tomorrow.');
  });

  it('has no no-break space in the time', () => {
    expect(resumeSentence(NOW + 75 * 60 * 1000, NOW, LA)).not.toMatch(/[  ]/);
  });

  it('gives null for a zone nobody knows, so the fallback is used', () => {
    expect(resumeSentence(NOW, NOW, 'Not/AZone')).toBeNull();
  });

  it('the fallback is "in about N hours", rounded up, never early', () => {
    expect(resumeFallback(19 * 3600)).toBe('You can use Claude for setup again in about 19 hours.');
    expect(resumeFallback(19 * 3600 + 1)).toBe('You can use Claude for setup again in about 20 hours.');
    expect(resumeFallback(3600)).toBe('You can use Claude for setup again in about 60 minutes.');
    expect(resumeFallback(30)).toBe('You can use Claude for setup again in under a minute.');
  });

  it('resumeInfo: a saved zone gives the clock sentence; none gives only the time and the fallback', () => {
    expect(resumeInfo(75 * 60, NOW, LA)).toEqual({
      atMs: NOW + 75 * 60 * 1000,
      sentence: 'You can use Claude for setup again after about 9:15 AM.',
      fallback: 'You can use Claude for setup again in about 75 minutes.',
    });
    expect(resumeInfo(75 * 60, NOW, null).sentence).toBeNull();
  });

  describe('on the quick path card', () => {
    const steps = [step('s1', 'One thing', [item('person.dayEnd', 'When does your day end?', 'time')])];
    const props = (resume: ResumeInfo | null | undefined, reason: 'person_cap' | 'shared_cap' = 'person_cap') => ({ ...quickProps({ steps }), reason, resume });

    it('shows the saved-zone sentence once, under the reason', () => {
      render(<QuickPathCard {...props(resumeInfo(75 * 60, NOW, LA))} />);
      expect(screen.getAllByText('You can use Claude for setup again after about 9:15 AM.')).toHaveLength(1);
      expect(screen.getAllByText(/can't take more questions right now/)).toHaveLength(1);
    });

    it('with no saved zone, writes the time on the phone, in its own zone (display only)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const original = process.env.TZ;
      try {
        render(<QuickPathCard {...props(resumeInfo(75 * 60, NOW, null))} />);
        // The phone's zone here is whatever the test runner uses; the sentence is the clock-time one, not the fallback.
        expect(screen.getByText(/^You can use Claude for setup again after about \d{1,2}:\d{2} (AM|PM)( tomorrow)?\.$/)).toBeTruthy();
        expect(screen.queryByText(/in about 75 minutes/)).toBeNull();
      } finally {
        process.env.TZ = original;
        vi.useRealTimers();
      }
    });

    it('falls back to "in about N hours" when the phone cannot format a time', () => {
      const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
        throw new RangeError('no Intl');
      });
      try {
        render(<QuickPathCard {...props(resumeInfo(19 * 3600, NOW, null))} />);
        expect(screen.getByText('You can use Claude for setup again in about 19 hours.')).toBeTruthy();
      } finally {
        spy.mockRestore();
      }
    });

    it('shows nothing extra for any other reason (no resume given)', () => {
      render(<QuickPathCard {...props(null, 'shared_cap')} />);
      expect(screen.queryByText(/You can use Claude for setup again/)).toBeNull();
    });
  });

  describe('in the server\'s turn loop', () => {
    beforeEach(() => resetFakeSave({ id: ME }));

    const session = (zone: string | null): SetupSession => {
      const draft = emptyDraft();
      draft.model.person.timeZone = zone;
      return { transcript: [{ role: 'assistant', turn: turn({ topic: 'idea', question: 'What would you like to work on?', draft }) }, { role: 'person', text: 'Run more' }], draft, spentTokens: 0 };
    };
    const cap = (retryAfterSeconds: number) =>
      (async (): Promise<SetupTurnResult> => ({ kind: 'quick_path', reason: 'person_cap', message: 'm', retryAfterSeconds })) as never;

    it('hands the card the clock sentence in the saved zone', async () => {
      const now = Date.UTC(2026, 10, 4, 16, 0, 0);
      const result = await runCheckedTurn({ userId: ME, session: session('America/Los_Angeles'), today: TODAY, deadlineMs: now + SETUP_TURN_BUDGET_MS }, { runTurn: cap(75 * 60), nowMs: () => now });
      expect(result).toMatchObject({ kind: 'quick_path', reason: 'person_cap', resume: { sentence: 'You can use Claude for setup again after about 9:15 AM.', atMs: now + 75 * 60 * 1000 } });
    });

    it('with no saved zone, hands over the time and the hours fallback, no clock sentence', async () => {
      const now = Date.UTC(2026, 10, 4, 16, 0, 0);
      const result = await runCheckedTurn({ userId: ME, session: session(null), today: TODAY, deadlineMs: now + SETUP_TURN_BUDGET_MS }, { runTurn: cap(19 * 3600), nowMs: () => now });
      expect(result).toMatchObject({ kind: 'quick_path', resume: { sentence: null, fallback: 'You can use Claude for setup again in about 19 hours.', atMs: now + 19 * 3600 * 1000 } });
    });

    it('a limit with no wait (shared cap) carries no resume time', async () => {
      const result = await runCheckedTurn(
        { userId: ME, session: session(null), today: TODAY, deadlineMs: Date.now() + SETUP_TURN_BUDGET_MS },
        { runTurn: (async (): Promise<SetupTurnResult> => ({ kind: 'quick_path', reason: 'shared_cap', message: 'm' })) as never },
      );
      expect(result).toMatchObject({ kind: 'quick_path', reason: 'shared_cap' });
      expect(result).not.toHaveProperty('resume');
    });
  });
});

// ---------------------------------------------------------------------------
// d. "minutes of hours"
// ---------------------------------------------------------------------------

describe('d. words that name a time unit take no "minutes of"', () => {
  const timeTarget = (title: string, over = {}) => target('t1', title, { measure: 'time', ...over });

  it('knows which words name hours and which name minutes', () => {
    for (const w of ['hours', 'hrs', 'hours of reading', 'Hour']) expect(namesHours(w), w).toBe(true);
    for (const w of ['minutes', 'mins', 'minutes of practice']) expect(namesMinutes(w), w).toBe(true);
    for (const w of ['practice', 'time outdoors', 'shoulders']) expect(namesTimeUnit(w), w).toBe(false);
  });

  it.each([
    ['hours', 'hours'],
    ['hrs', 'hrs'],
    ['hours of reading', 'hours of reading'],
    ['minutes', 'minutes'],
    ['mins', 'mins'],
    ['Practice', 'minutes of practice'],
  ])('the counted thing for "%s" reads "%s"', (title, thing) => {
    expect(countedThing(timeTarget(title))).toBe(thing);
  });

  it('the number questions read naturally, with no "minutes of hours"', () => {
    const t = timeTarget('Hours');
    expect(numberQuestion('floor', t, TODAY)).toBe('In a hard week, how many hours would still count?');
    expect(numberQuestion('aspiration', t, TODAY)).toBe('How many hours a week are you hoping for?');
    const reading = timeTarget('Hours of reading');
    expect(numberQuestion('floor', reading, TODAY)).toBe('In a hard week, how many hours of reading would still count?');
    expect(numberAbout('aspiration', reading, TODAY)).toBe("The number of hours of reading a week you're hoping for.");
    const d = emptyDraft();
    d.model.goals.push({ ...goal('g1', 'Read'), targets: [reading] });
    expect(numberHelp(d, 'floor', TODAY)).toContain('how many hours of reading would still count');
    expect(numberHelp(d, 'floor', TODAY)).not.toMatch(/minutes of hours/);
  });

  it('minutes keep their question, and a plain thing still takes "minutes of"', () => {
    expect(numberQuestion('floor', timeTarget('Minutes'), TODAY)).toBe('In a hard week, how many minutes would still count?');
    expect(numberQuestion('floor', timeTarget('Practice'), TODAY)).toBe('In a hard week, how many minutes of practice would still count?');
  });

  it('the playback reads in hours: 180 minutes of "Hours of reading" is "3 hours of reading", never "180 minutes of hours"', () => {
    const t = timeTarget('Hours of reading', { floor: 180, aspiration: 240 });
    expect(amountOf(t, 180)).toBe('3 hours of reading');
    expect(amountOf(t, 60)).toBe('1 hour of reading');
    expect(amountOf(t, 90)).toBe('1.5 hours of reading');
    expect(amount(t, 240)).toBe('4 hours');
    const m = emptyDraft().model;
    m.goals.push({ ...goal('g1', 'Read more'), targets: [t] });
    const text = renderFinal(m).join(' ');
    expect(text).toContain('at least 3 hours of reading a week, aiming for 4 hours');
    expect(text).not.toMatch(/minutes of hours|180 minutes/);
    expect(renderPlayback(m, 'targets', {}).join(' ')).not.toMatch(/minutes of hours/);
  });

  it('minutes words and plain words read as before', () => {
    expect(amountOf(timeTarget('Minutes of practice'), 90)).toBe('90 minutes of practice');
    expect(amountOf(timeTarget('Practice'), 90)).toBe('90 minutes of practice');
    expect(amount(timeTarget('Practice'), 90)).toBe('90 minutes');
  });

  it('hours and minutes round-trip', () => {
    expect(hoursToMinutes(3)).toBe(180);
    expect(hoursToMinutes(1.5)).toBe(90);
    expect(minutesAsHours(180)).toBe(3);
    expect(minutesAsHours(45)).toBe(0.75);
  });

  describe('a bare "3" to an hours question is stored as 180', () => {
    const FLOOR = 'goals.reading.targets.hours.floor';
    const ASK = 'In a hard week, how many hours would still count?';
    const asked = (): AssistantTurn => {
      const draft = emptyDraft();
      draft.model.goals = [goal('reading', 'Reading', { targets: [target('hours', 'Hours of reading', { measure: 'time' })] })];
      return turn({ topic: 'floor', question: ASK, draft });
    };
    const reply = (floor: number, text: string): { transcript: Transcript; turn: AssistantTurn; prev: SetupDraft } => {
      const q = asked();
      const draft = structuredClone(q.draft);
      draft.model.goals[0].targets[0].floor = floor;
      draft.said.push({ path: FLOOR, turn: 1, how: 'said' });
      return { transcript: [{ role: 'assistant', turn: q }, { role: 'person', text }], turn: { ...q, topic: 'source', question: 'Where do you track this now, if anywhere?', draft }, prev: q.draft };
    };
    const floorOf = (t: AssistantTurn) => t.draft.model.goals[0].targets[0].floor;

    it('converts "3" to 180 in code', () => {
      const r = reply(3, '3');
      expect(floorOf(convertHourAnswers(r.turn, r.transcript, r.prev))).toBe(180);
    });

    it('converts "3 hours" recorded as 3, and leaves 180 recorded from "3 hours" alone', () => {
      const a = reply(3, '3 hours');
      expect(floorOf(convertHourAnswers(a.turn, a.transcript, a.prev))).toBe(180);
      const b = reply(180, '3 hours');
      expect(floorOf(convertHourAnswers(b.turn, b.transcript, b.prev))).toBe(180);
    });

    it('converts the aim the same way', () => {
      const r = reply(3, '5');
      r.turn.draft.model.goals[0].targets[0].floor = null;
      r.turn.draft.model.goals[0].targets[0].aspiration = 5;
      r.turn.draft.said = [{ path: 'goals.reading.targets.hours.aspiration', turn: 1, how: 'said' }];
      expect(convertHourAnswers(r.turn, r.transcript, r.prev).draft.model.goals[0].targets[0].aspiration).toBe(300);
    });

    it('does not convert when the answer names minutes, a value set earlier, or a target that does not count hours', () => {
      const minutes = reply(90, '90 minutes');
      expect(floorOf(convertHourAnswers(minutes.turn, minutes.transcript, minutes.prev))).toBe(90);
      const earlier = reply(3, '3');
      earlier.prev.model.goals[0].targets[0].floor = 3;
      expect(floorOf(convertHourAnswers(earlier.turn, earlier.transcript, earlier.prev))).toBe(3);
      const plain = reply(3, '3');
      plain.turn.draft.model.goals[0].targets[0].title = 'Practice';
      expect(floorOf(convertHourAnswers(plain.turn, plain.transcript, plain.prev))).toBe(3);
      const count = reply(3, '3');
      count.turn.draft.model.goals[0].targets[0].measure = 'count';
      expect(floorOf(convertHourAnswers(count.turn, count.transcript, count.prev))).toBe(3);
    });

    it('converts only the number the person said: a different value is left alone', () => {
      const r = reply(5, '3');
      expect(floorOf(convertHourAnswers(r.turn, r.transcript, r.prev))).toBe(5);
    });

    it('the validator accepts 180 for a bare "3" only after a question that asked in hours', () => {
      const r = reply(180, '3');
      const issues = (t: AssistantTurn, tr: Transcript) => validateDraft(t.draft, tr, 'progress').issues.filter((i) => i.path === FLOOR);
      expect(issues(r.turn, r.transcript)).toEqual([]);
      // A question that did not ask in hours: the same "3" does not say 180.
      const other = structuredClone(r.transcript);
      (other[0] as { role: 'assistant'; turn: AssistantTurn }).turn.question = 'In a hard week, how much would still count?';
      expect(issues(r.turn, other).map((i) => i.code)).toEqual(['not_said']);
    });

    it('through the server: Claude records the 3 it was told, and 180 is what the turn keeps', async () => {
      resetFakeSave({ id: ME });
      const r = reply(3, '3');
      const calls: RunSetupTurnArgs[] = [];
      const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
        calls.push(args);
        return {
          kind: 'answered',
          result: { ok: true as const, raw: r.turn, model: 'claude-opus-5-5', usage: { inputTokens: 900, outputTokens: 100 } },
          turns: 2,
          spentTokens: 1000,
        };
      };
      const view = await takeSetupTurn({ transcript: r.transcript, draft: r.prev, spentTokens: 0, today: TODAY }, { runTurn: run as never });
      expect(calls).toHaveLength(1);
      expect(view).toMatchObject({ ok: true, data: { kind: 'turn', rejected: 0 } });
      if (view.ok && view.data.kind === 'turn') expect(floorOf(view.data.turn)).toBe(180);
    });
  });
});

// ---------------------------------------------------------------------------
// c2. The callout on a stopped card says the way forward (Matt's D1 screenshot)
// ---------------------------------------------------------------------------

describe('c2. a card stopped by a limit that lifts says to come back to this tab, and keeps "Start again" as a small link', () => {
  const NOW = Date.UTC(2026, 10, 4, 16, 0, 0);
  const resume = resumeInfo(75 * 60, NOW, 'America/Los_Angeles');
  const open = [step('s1', 'One thing', [item('person.dayEnd', 'When does your day end?', 'time')])];
  const STUCK = ['At least one goal'];

  it('the words: a wait reason names the way forward; a setup\'s own limit still says to start again', () => {
    expect(quickPathStuckHelp('person_cap', true)).toBe(
      "Only Claude can ask for this, and it can't right now. Come back to this tab after the time above, reload the page, and tap Send it again. What you said is kept in this tab.",
    );
    expect(quickPathStuckHelp('shared_cap', false)).toContain('Come back to this tab in a little while');
    expect(quickPathStuckHelp('unchecked', false)).toContain('Come back to this tab in a little while');
    expect(quickPathStuckHelp('over_turns', false)).toBe(QUICK_PATH_WORDS.stuckHelp);
    expect(quickPathStuckHelp('over_tokens', false)).toBe(QUICK_PATH_WORDS.stuckHelp);
    // The callout no longer says the one thing that contradicted "kept" for a limit that lifts.
    expect(quickPathStuckHelp('person_cap', true)).not.toMatch(/start again/i);
  });

  it('the reason line drops "these last answers finish it" when nothing on the card can be answered', () => {
    for (const reason of ['person_cap', 'shared_cap', 'unchecked', 'over_turns', 'over_tokens'] as const) {
      expect(quickPathReason(reason, true), reason).toContain('these last answers finish it');
      expect(quickPathReason(reason, false), reason).not.toMatch(/last answers/);
    }
    expect(quickPathReason('person_cap', false)).toBe("Claude can't take more questions right now. Everything you said is kept in this tab.");
    expect(quickPathReason('over_turns', false)).toBe('Claude has hit its question limit for this setup.');
    // With no second argument it is the line it always was.
    expect(quickPathReason('person_cap')).toBe(QUICK_PATH_WORDS.reasonWait);
  });

  it('the person cap, nothing to answer: the reason, the time, and the callout that says to come back; no "last answers"', () => {
    render(<QuickPathCard {...quickProps({ steps: [], stuck: STUCK })} reason="person_cap" resume={resume} />);
    expect(screen.getByText(QUICK_PATH_WORDS.reasonWaitNothing)).toBeTruthy();
    expect(screen.getByText('You can use Claude for setup again after about 9:15 AM.')).toBeTruthy();
    expect(screen.getByText(QUICK_PATH_WORDS.stuckHelpWait(true))).toBeTruthy();
    expect(screen.queryByText(/last answers/)).toBeNull();
    expect(screen.queryByText(/Start again to begin a new setup/)).toBeNull();
    // "Start again" stays, and asks first.
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.startAgain }));
    expect(screen.getByText(QUICK_PATH_WORDS.confirmStartOver)).toBeTruthy();
  });

  it('the shared limit, nothing to answer, no time: "in a little while"', () => {
    render(<QuickPathCard {...quickProps({ steps: [], stuck: STUCK })} reason="shared_cap" />);
    expect(screen.getByText(QUICK_PATH_WORDS.stuckHelpWait(false))).toBeTruthy();
    expect(screen.queryByText(/after the time above/)).toBeNull();
  });

  it('questions left: the reason keeps "these last answers finish it"', () => {
    render(<QuickPathCard {...quickProps({ steps: open, stuck: [] })} reason="person_cap" resume={resume} />);
    expect(screen.getByText(QUICK_PATH_WORDS.reasonWait)).toBeTruthy();
  });

  it("a setup's own limit, nothing to answer: still says to start again, and promises nothing kept", () => {
    render(<QuickPathCard {...quickProps({ steps: [], stuck: STUCK })} reason="over_turns" />);
    expect(screen.getByText(QUICK_PATH_WORDS.reasonLimitNothing)).toBeTruthy();
    expect(screen.getByText(QUICK_PATH_WORDS.stuckHelp)).toBeTruthy();
    expect(screen.queryByText(/kept/)).toBeNull();
  });
});

describe('M2. the two links under an answer share one baseline', () => {
  it('"What does this mean?" is a block box, so it sits where "Type it instead" does', () => {
    render(<DateAnswer suggests={false} others={[]} locked={false} busy={false} onAnswer={() => {}} today={TODAY} />);
    const help = screen.getByRole('button', { name: 'What does this mean?' });
    const type = screen.getByRole('button', { name: 'Type it instead' });
    expect(help.className).toMatch(/\bblock\b/);
    // Both are flex items of the same row, so the same box gives the same baseline (measured at 390px in the browser spec).
    expect(help.closest('.flex')).toBe(type.parentElement);
  });
});
