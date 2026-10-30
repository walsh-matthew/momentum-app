// @vitest-environment jsdom
//
// The setup cards after the owner's phone smoke test (MOM-111 findings 1, 2, 3, 7, 8 and 13), on every card that takes an
// answer: the order on screen, how the answer box and the answers look, a date never shown as YYYY-MM-DD, a proposal's Yes as
// the main answer with any other answer beside it, the date picker, and answers that wrap.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinalCard } from '@/components/setup/FinalCard';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { MACHINE_DATE } from '@/lib/dates/casual';
import { emptyDraft } from '@/lib/setup/draft';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { optionsLead } from '@/lib/setup/optionsLead';
import { quickPathSections } from '@/lib/setup/quickPath';
import { MEANING_LINK, MEANING_TEXT, PICK_DATE, PROPOSAL_YES_TEXT, TYPE_INSTEAD } from '@/lib/setup/session';
import { SETUP_CHUNKS, type AssistantTurn, type TurnKind } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const TODAY = '2026-10-29';
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  detail: null,
  say: 'Got it, one goal.',
  question: 'Does this keep going with no end date?',
  topic: 'shape',
  options: [],
  draft: emptyDraft(),
  ...over,
});
const KINDS: TurnKind[] = ['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal'];
const forKind = (kind: TurnKind): AssistantTurn =>
  turn({ kind, options: kind === 'ideas' || kind === 'interpretations' ? ['Two a week', 'Three a week'] : kind === 'proposal' ? ['Today, Thursday, Oct 29'] : [] });

// Elements in the order they sit in the document.
const order = (...els: Element[]) => els.map((el) => [...document.body.querySelectorAll('*')].indexOf(el));
const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

describe('the question card, on every kind of asking turn (findings 1 to 3)', () => {
  it.each(KINDS)('a %s: lead-in, question, answers, box, Send, then the small help link', (kind) => {
    render(<QuestionCard turn={forKind(kind)} busy={false} onAnswer={() => {}} today={TODAY} />);
    // A proposal opens its box from a small link, so Yes stays the one main button (round 2, finding 8).
    if (kind === 'proposal') fireEvent.click(screen.getByRole('button', { name: TYPE_INSTEAD }));
    // A card of options leads with code's line instead of Claude's question and lead-in (round 3c, finding 2).
    const codeLead = optionsLead(forKind(kind), TODAY);
    const lead = screen.queryByText('Got it, one goal.');
    if (codeLead) expect(lead).toBeNull();
    const question = screen.getByRole('heading', { name: codeLead ?? 'Does this keep going with no end date?' });
    const box = screen.getByLabelText('Your answer');
    const send = screen.getByRole('button', { name: 'Send' });
    const help = screen.getByRole('button', { name: MEANING_LINK });
    const answers = document.querySelectorAll('[data-slot="answer-choice"]');
    expect(ascending(order(...(lead ? [lead] : []), question, ...answers, box, send, help))).toBe(true);
    // No full-width "What do you mean?" button any more: a small muted link.
    expect(screen.queryByRole('button', { name: MEANING_TEXT })).toBeNull();
    expect(help.className).toMatch(/text-sm/);
    expect(help.className).toMatch(/text-muted/);
    expect((box as HTMLTextAreaElement).placeholder).toBe('Type your answer');
  });

  it('puts the lead-in right above the question, in regular weight and muted, under the bold question (round 3c)', () => {
    render(<QuestionCard turn={turn()} busy={false} onAnswer={() => {}} today={TODAY} />);
    const lead = screen.getByText('Got it, one goal.');
    const question = screen.getByRole('heading', { name: 'Does this keep going with no end date?' });
    expect(lead.parentElement).toBe(question.parentElement);
    expect(lead.parentElement?.className).toContain('space-y-1');
    expect(lead.className).toContain('text-base');
    expect(lead.className).toContain('text-foreground/80');
    expect(lead.className).toContain('font-normal');
    expect(question.className).toContain('text-lg');
    expect(question.className).toContain('font-semibold');
  });

  it('gives the box a visible border, a lighter fill and a focus ring, and dims Send only while the box is empty', () => {
    render(<QuestionCard turn={turn()} busy={false} onAnswer={() => {}} today={TODAY} />);
    const box = screen.getByLabelText('Your answer');
    expect(box.className).toMatch(/border-foreground\/30/);
    expect(box.className).toMatch(/bg-foreground\/\[0\.06\]/);
    expect(box.className).toMatch(/focus-visible:ring-2/);
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'It keeps going' } });
    expect(send.disabled).toBe(false);
  });

  it('sends "What do you mean?" from the help link, and an answer\'s words from a tap', () => {
    const onAnswer = vi.fn();
    render(<QuestionCard turn={forKind('interpretations')} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    fireEvent.click(screen.getByRole('button', { name: '2. Three a week' }));
    expect(onAnswer.mock.calls).toEqual([[MEANING_TEXT], ['Option 2']]);
  });
});

describe('answers wrap, sit to the left and look like answers (findings 2 and 13)', () => {
  it.each(KINDS.filter((k) => k !== 'question'))('a %s', (kind) => {
    render(<QuestionCard turn={forKind(kind)} busy={false} onAnswer={() => {}} today={TODAY} />);
    const answers = [...document.querySelectorAll('[data-slot="answer-choice"]')];
    expect(answers.length).toBeGreaterThan(0);
    for (const a of answers) {
      expect(a.className).toContain('whitespace-normal');
      expect(a.className).toContain('text-left');
      expect(a.className).toContain('justify-start');
      expect(a.className).not.toContain('whitespace-nowrap');
      expect(a.className).toMatch(/border|bg-primary/);
    }
  });
});

describe('a proposal (finding 8)', () => {
  it('has Yes as the main answer, sending an acceptance, and any other answer beside it', () => {
    const onAnswer = vi.fn();
    render(<QuestionCard turn={turn({ kind: 'proposal', topic: 'start_date', say: '', question: 'Start Monday, Nov 9?', options: ['Today, Monday, Nov 2'] })} busy={false} onAnswer={onAnswer} today="2026-11-02" />);
    const yes = screen.getByRole('button', { name: 'Yes' });
    expect(yes.className).toContain('bg-primary');
    // Round 3b, finding 2: "today, " written in front keeps its date on screen; the tap still sends the date written out.
    const today = screen.getByRole('button', { name: 'Today, Monday, Nov 2' });
    expect(today.className).not.toContain('bg-primary');
    fireEvent.click(yes);
    fireEvent.click(today);
    expect(onAnswer.mock.calls).toEqual([[PROPOSAL_YES_TEXT], ['Today, Monday, Nov 2']]);
  });

  it.each(['start_date', 'end_date', 'deadline_date', 'parked_return'] as const)('a %s question: "Pick a date" is the date field, and picking a date answers it', (topic) => {
    const onAnswer = vi.fn();
    render(<QuestionCard turn={turn({ topic, question: 'Which day would you like?' })} busy={false} onAnswer={onAnswer} today={TODAY} />);
    expect(screen.queryByRole('button', { name: 'Use this date' })).toBeNull();
    fireEvent.change(screen.getByLabelText(PICK_DATE), { target: { value: '2026-11-12' } });
    expect(onAnswer).toHaveBeenCalledWith('Thursday, November 12, 2026');
  });

  it('no other question has a date picker', () => {
    render(<QuestionCard turn={turn({ topic: 'floor' })} busy={false} onAnswer={() => {}} today={TODAY} />);
    expect(screen.queryByLabelText(PICK_DATE)).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });
});

describe('no date reaches a setup screen as YYYY-MM-DD (finding 7)', () => {
  // A model with a date in every place the playback shows one.
  const model = () => {
    const m = emptyDraft().model;
    m.person.timeZone = 'America/Chicago';
    m.person.dayEnd = '21:00';
    m.person.weekStart = 1;
    const g = goal('g1', 'Finish the quilt', { shape: 'project', startDate: '2026-10-29', endDate: '2027-06-14', why: 'I promised it' });
    g.targets.push(target('t1', 'Blocks sewn', { floor: 12, period: { kind: 'deadline', dueDate: '2027-06-14' }, carryOver: 'cumulative', sources: [{ kind: 'manual' }] }));
    g.items.push(item('i1', 'deadline_task', 'Quilt finished', { dueDate: '2027-06-14', dateCanMove: false }));
    m.goals.push(g, goal('g2', 'Garden', { state: 'parked', returnWhen: { kind: 'date', date: '2027-03-01' } }));
    return m;
  };

  it('in Claude\'s lead-in, question, skip line and options, on every kind of asking turn', () => {
    for (const kind of KINDS) {
      const { container } = render(
        <QuestionCard
          turn={turn({
            kind,
            say: 'I would start this today, 2026-10-29.',
            question: 'Start on 2026-10-29?',
            skipped: { topic: 'why', line: 'You said 2026-11-02 already.' },
            options: kind === 'question' || kind === 'offer_ideas' ? [] : ['2026-10-29', 'November 2, 2026'],
          })}
          busy={false}
          onAnswer={() => {}}
          today={TODAY}
        />,
      );
      expect(container.textContent).not.toMatch(MACHINE_DATE);
      // Today's date reads "today" alone (round 2, finding 3); another day keeps its weekday. A card of options leads with
      // code's own line instead of the question (round 3c, finding 2).
      if (kind !== 'ideas' && kind !== 'interpretations') expect(container.textContent).toContain('Start today?');
      else expect(container.textContent).toContain('1. Today');
      expect(container.textContent).toContain('Monday, Nov 2');
      cleanup();
    }
  });

  it('in every playback part, the final confirmation and the quick path', () => {
    const m = model();
    for (const chunk of SETUP_CHUNKS) {
      const { container } = render(<PlaybackCard chunk={chunk} lines={renderPlayback(m, chunk, { today: TODAY })} busy={false} onApprove={() => {}} onChange={() => {}} />);
      expect(container.textContent, chunk).not.toMatch(MACHINE_DATE);
      cleanup();
    }
    const final = render(<FinalCard lines={renderFinal(m)} saving={false} error={null} onSave={() => {}} onChange={() => {}} />);
    expect(final.container.textContent).not.toMatch(MACHINE_DATE);
    cleanup();
    const quick = render(
      <QuickPathCard message="Done." sections={quickPathSections(m, { today: TODAY })} missing={[]} canSave saving={false} error={null} onSave={() => {}} onStartOver={() => {}} />,
    );
    expect(quick.container.textContent).not.toMatch(MACHINE_DATE);
    expect(quick.container.textContent).toContain('Monday, Jun 14, 2027');
  });
});
