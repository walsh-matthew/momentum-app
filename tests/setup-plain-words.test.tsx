// @vitest-environment jsdom
//
// Setup in everyday words (MOM-111, docs/DOMAIN_MODEL.md §2.1 plain language). The owner's live setup asked "what needs
// protecting" and did not say what that meant. These tests fail if an internal word (protected, floor, target, block and the
// like) appears in a step summary, an example question in the prompt, or anything a setup card shows, without the same
// sentence saying what it means in everyday words. They also check every step carries a reason Claude can give.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FinalCard } from '@/components/setup/FinalCard';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { SETUP_QUICK_PATH_MESSAGES } from '@/lib/services/llm';
import { runSetupEval } from '@/lib/setup/evals';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { INTERNAL_TERMS, unexplainedTerms } from '@/lib/setup/plainWords';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { CHUNK_TITLES, describeMissing, quickPathSections } from '@/lib/setup/quickPath';
import { HARD_RULES, SETUP_STEPS } from '@/lib/setup/steps';
import { dayTimeWords, numbersIn } from '@/lib/setup/text';
import { SETUP_CHUNKS, type AssistantTurn, type SetupModel } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

describe('the glossary check itself', () => {
  it('flags an internal word with no everyday words beside it', () => {
    expect(unexplainedTerms("Which parts of your life matter most to keep safe? What needs protecting?")).toEqual(['protect: What needs protecting?']);
    expect(unexplainedTerms("What's your floor?")).toEqual(["floor: What's your floor?"]);
    expect(unexplainedTerms('How long is the first block?')).toEqual(['block: How long is the first block?']);
  });

  it('lets an internal word through when the same sentence says what it means', () => {
    expect(unexplainedTerms('Ask the least they would count as on track (saved as the floor).')).toEqual([]);
    expect(unexplainedTerms("What else matters that this plan shouldn't crowd out (saved as protected priorities)?")).toEqual([]);
  });

  it('knows the words the owner named', () => {
    const terms = INTERNAL_TERMS.map((t) => t.term);
    for (const t of ['protect', 'priorities', 'floor', 'aspiration', 'target', 'effort', 'outcome', 'carry-over', 'block', 'anchor']) expect(terms).toContain(t);
  });
});

describe('the step summaries and the prompt', () => {
  it.each(SETUP_STEPS.map((s) => [s.n, s] as const))('step %i says what every internal word means', (_n, step) => {
    expect(unexplainedTerms(step.summary)).toEqual([]);
    for (const e of step.examples) expect(unexplainedTerms(`${e.say ?? ''} ${e.question}`)).toEqual([]);
  });

  // A reason goes after the ask, in the question, only where it is not plain (MOM-111 finding 4): a step whose question says
  // what it is for on its own has none.
  it.each(SETUP_STEPS.filter((s) => s.reason !== null).map((s) => [s.n, s] as const))('step %i carries a short reason to put after the ask', (_n, step) => {
    const reason = step.reason ?? '';
    expect(reason.split(' ').length).toBeLessThanOrEqual(12);
    expect(unexplainedTerms(reason)).toEqual([]);
    // A reason never names a day, a time or a number the person has not said.
    expect(dayTimeWords(reason)).toEqual([]);
    expect(numbersIn(reason, { skipOne: true })).toEqual([]);
    expect(SETUP_SYSTEM_PROMPT).toContain(`Where the reason is not plain, add it after the ask, for example "${reason}".`);
  });

  it('gives most steps a reason, and never tells Claude to say it in a lead-in', () => {
    expect(SETUP_STEPS.filter((s) => s.reason !== null).length).toBeGreaterThanOrEqual(6);
    expect(SETUP_SYSTEM_PROMPT).not.toMatch(/Say why in a few words/);
  });

  it('gives the final step, which asks nothing, no reason', () => {
    expect(SETUP_STEPS.find((s) => s.n === 12)?.reason).toBeNull();
  });

  it('every example question in the rules and the prompt is in everyday words', () => {
    const quoted = [...HARD_RULES.map((r) => r.text), SETUP_SYSTEM_PROMPT].flatMap((t) => [...t.matchAll(/"([^"]*\?)"/g)].map((m) => m[1]));
    expect(quoted.length).toBeGreaterThan(10);
    expect(quoted.flatMap(unexplainedTerms)).toEqual([]);
  });

  it('tells Claude to explain a question when asked, and to keep to everyday words', () => {
    expect(SETUP_SYSTEM_PROMPT).toMatch(/When the person asks what something means, answer in "say" in plainer words with a few examples/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/unless the same sentence says what it means in everyday words/);
  });
});

// Everything a person can read on a card: text, button names, labels and placeholders.
function readable(container: HTMLElement): string {
  const attrs = [...container.querySelectorAll('[placeholder], [aria-label]')].flatMap((el) => [el.getAttribute('placeholder') ?? '', el.getAttribute('aria-label') ?? '']);
  // Each block of text is its own sentence for the check.
  const blocks = [...container.querySelectorAll('h1, h2, h3, p, li, button, label')].map((el) => el.textContent ?? '');
  return [...blocks, ...attrs].filter(Boolean).join('. ');
}

describe('what the setup cards show', () => {
  let models: SetupModel[] = [];
  beforeAll(async () => {
    const reports = await Promise.all(SETUP_CASES.filter((c) => c.expect === 'clean').map((c) => runSetupEval(c, scriptedModel(c.script))));
    models = reports.map((r) => r.draft.model);
  });

  const question = SETUP_CASES.flatMap((c) => c.script).filter((t) => t.kind !== 'playback' && t.kind !== 'final');
  const kinds = [...new Map(question.map((t) => [t.kind, t])).values()];

  it.each(kinds.map((t) => [t.kind, t] as const))('a %s card', (_kind, turn: AssistantTurn) => {
    const { container } = render(<QuestionCard turn={turn} busy={false} onAnswer={() => {}} today="2026-10-29" />);
    expect(unexplainedTerms(readable(container))).toEqual([]);
  });

  it('every playback part and the final confirmation, change box open', () => {
    for (const model of models) {
      for (const chunk of SETUP_CHUNKS) {
        const { container, getByRole } = render(<PlaybackCard chunk={chunk} lines={renderPlayback(model, chunk, { locale: 'en-US' })} busy={false} onApprove={() => {}} onChange={() => {}} />);
        fireEvent.click(getByRole('button', { name: 'Change something' }));
        expect(unexplainedTerms(readable(container)), chunk).toEqual([]);
        cleanup();
      }
      const { container, getByRole } = render(<FinalCard lines={renderFinal(model)} saving={false} error={null} onSave={() => {}} onChange={() => {}} />);
      fireEvent.click(getByRole('button', { name: 'Change something' }));
      expect(unexplainedTerms(readable(container))).toEqual([]);
      cleanup();
    }
  });

  it('the quick path, with every part, what is missing and every message', () => {
    const empty = models[0] && structuredClone(models[0]);
    if (!empty) throw new Error('no model');
    const paths = [
      'person.timeZone',
      'person.dayEnd',
      'person.weekStart',
      'person.dayTypes',
      'goals',
      ...['startDate', 'shape', 'endDate', 'blockWeeks', 'targets', 'returnWhen', 'why'].map((f) => `goals.${empty.goals[0].key}.${f}`),
      ...['floor', 'sources', 'unit', 'role'].map((f) => `goals.${empty.goals[0].key}.targets.t1.${f}`),
      ...['dueDate', 'dateCanMove', 'targetKey', 'title'].map((f) => `goals.${empty.goals[0].key}.items.i1.${f}`),
      'somewhere.else',
    ];
    const missing = describeMissing(empty, paths.map((path) => ({ path, message: '', code: 'rule' as const })));
    for (const message of Object.values(SETUP_QUICK_PATH_MESSAGES)) {
      const { container } = render(
        <QuickPathCard message={message} sections={quickPathSections(empty, { locale: 'en-US' })} missing={missing} canSave saving={false} error={null} onSave={() => {}} onStartOver={() => {}} />,
      );
      expect(unexplainedTerms(readable(container))).toEqual([]);
      cleanup();
    }
    expect(Object.values(CHUNK_TITLES).flatMap(unexplainedTerms)).toEqual([]);
  });

  it('the intro', async () => {
    const { container, findByRole } = render(<SetupConversation userId="11111111-1111-4111-8111-111111111111" />);
    await findByRole('button', { name: 'Start' });
    expect(readable(container)).toMatch(/ask what it means/);
    expect(unexplainedTerms(readable(container))).toEqual([]);
  });
});
