// @vitest-environment jsdom
//
// Everyday words on every setup card (MOM-111 round 3c, wording fix after the owner's review of reading-11-ideas.png): "Some
// starting points for the fewest pages in a week" and "Pages a week, from what you said about where you are now" read as
// jargon. A sweep over every scripted conversation in the eval set and the smoke set, every step, as the card shows it (after
// code's own rewrites, lib/services/setup.ts): no card text says "fewest", "floor", "aspiration", "baseline" or "where you are
// now", and every detail line of starting ideas quotes a value the person said, or is absent. Then the rules themselves:
// the number wording builder, the checks, and the normalizer.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinalCard } from '@/components/setup/FinalCard';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { SETUP_TURN_BUDGET_MS, runCheckedTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import type { ModelSetupResult } from '@/lib/ai/setup';
import { checkEverydayWords, checkTurn } from '@/lib/setup/checks';
import { normalizeDateTurn } from '@/lib/setup/codeTurns';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { RETRY_FEEDBACK } from '@/lib/setup/feedback';
import { normalizeNumberTurn, numberAbout, numberHelp, numberQuestion } from '@/lib/setup/numbers';
import { optionsLead } from '@/lib/setup/optionsLead';
import { shownModel } from '@/lib/setup/paraphrase';
import { jargonIn, normalizePlainTurn, quotesSaid } from '@/lib/setup/plainCard';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { personWords } from '@/lib/setup/said';
import type { AssistantTurn, SetupDraft, TargetDraft, Transcript } from '@/types/setup';
import { goal, scriptedModel, target } from './helpers/setupScript';
import { READING_CASE_ID, SETUP_CASES, type ScriptedCase } from './setup-evals/cases';
import { SMOKE_CASES } from './setup-evals/smokeCases';
import { E2E_CASE_ID } from './e2e/support/setupConversation';

vi.mock('@/app/actions/setup', () => ({ askSetupTurn: vi.fn(), saveSetup: vi.fn() }));
afterEach(cleanup);

const TODAY = '2026-10-27';
const BANNED = /\b(fewest|floor|aspirations?|baseline)\b|\bwhere you are now\b/i;

// A turn as the card shows it: the same rewrites the service makes, in the same order.
function asShown(turn: AssistantTurn, before: Transcript, prevDraft: SetupDraft, today: string): AssistantTurn {
  const dated = normalizeDateTurn(turn, before, prevDraft, today);
  return normalizePlainTurn(normalizeNumberTurn(dated, today, personWords(before)), before);
}

// Every card of one scripted conversation, as the person sees it, with the words they had said by then.
async function cardsOf(c: ScriptedCase): Promise<{ at: string; text: string; ideasDetail: string | null | undefined; said: string[] }[]> {
  const report = await runSetupEval(c, scriptedModel(c.script), { today: c.today });
  const today = c.today ?? TODAY;
  const out: { at: string; text: string; ideasDetail: string | null | undefined; said: string[] }[] = [];
  let prevDraft = emptyDraft();
  report.transcript.forEach((m, i) => {
    if (m.role !== 'assistant') return;
    const before = report.transcript.slice(0, i);
    const said = personWords(before);
    const turn = asShown(m.turn, before, prevDraft, today);
    prevDraft = m.turn.draft;
    const card =
      turn.kind === 'playback' && turn.chunk ? (
        <PlaybackCard chunk={turn.chunk} lines={renderPlayback(shownModel(turn.draft, before), turn.chunk, { today, said })} busy={false} onApprove={() => {}} onChange={() => {}} />
      ) : turn.kind === 'final' ? (
        <FinalCard lines={renderFinal(shownModel(turn.draft, before), { today, said })} saving={false} error={null} onSave={() => {}} onChange={() => {}} />
      ) : (
        <QuestionCard turn={turn} busy={false} onAnswer={() => {}} today={today} said={said} />
      );
    const { container } = render(card);
    // "What does this mean?" on a number card opens code's own words in place: they are card text too.
    const help = numberHelp(turn.draft, turn.topic, today) ?? '';
    const detail = container.querySelector('[data-slot="question-detail"]')?.textContent;
    out.push({ at: `${c.id} turn ${i} (${turn.kind}, ${turn.topic ?? 'no topic'})`, text: `${container.textContent ?? ''}\n${help}`, ideasDetail: turn.kind === 'ideas' ? detail : undefined, said });
    cleanup();
  });
  return out;
}

const ALL_CASES: ScriptedCase[] = [...SETUP_CASES, ...SMOKE_CASES];

describe('the sweep: every card of every scripted conversation, in everyday words', () => {
  it.each(ALL_CASES.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    for (const card of await cardsOf(c)) {
      const banned = card.text.match(BANNED);
      expect(banned && jargonIn(banned[0], card.said).length > 0 ? banned[0] : null, card.at).toBeNull();
      if (card.ideasDetail !== undefined && card.ideasDetail !== null) expect(quotesSaid(card.ideasDetail, card.said), `${card.at}: "${card.ideasDetail}"`).toBe(true);
    }
  });

  it.each([
    ['the workout case', E2E_CASE_ID, 'How many runs make a week count, even a hard one?', 'You said you run about 2 times a week now.'],
    ['the reading case', READING_CASE_ID, 'How many pages make a week count, even a hard one?', 'You said you read about 50 pages a week now.'],
  ])('%s: the ideas card asks the number question and quotes what the person said', async (_name, id, lead, detail) => {
    const c = ALL_CASES.find((x) => x.id === id)!;
    const ideas = (await cardsOf(c)).filter((x) => x.ideasDetail !== undefined);
    expect(ideas).toHaveLength(1);
    expect(ideas[0].text.startsWith(`${lead}Pick one or write your own.${detail}`)).toBe(true);
    expect(ideas[0].ideasDetail).toBe(detail);
  });
});

// ---------------------------------------------------------------------------
// The number wording builder
// ---------------------------------------------------------------------------

const counted = (t: TargetDraft): SetupDraft => {
  const d = emptyDraft();
  d.model.goals.push({ ...goal('g1', 'Get going'), targets: [t] });
  return d;
};
const turn = (over: Partial<AssistantTurn> = {}): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'What number feels right?',
  detail: null,
  topic: 'floor',
  options: [],
  draft: counted(target('t1', 'Pages')),
  ...over,
});

describe('one wording builder for every counted thing', () => {
  it.each([
    [target('t1', 'Pages'), 'How many pages make a week count, even a hard one?', 'How many pages a week are you hoping for?'],
    [target('t1', 'Workouts'), 'How many workouts make a week count, even a hard one?', 'How many workouts a week are you hoping for?'],
    [target('t1', 'Runs'), 'How many runs make a week count, even a hard one?', 'How many runs a week are you hoping for?'],
    [target('t1', 'Practice', { measure: 'time' }), 'How many minutes of practice make a week count, even a hard one?', 'How many minutes of practice a week are you hoping for?'],
    [
      target('t1', 'Blocks sewn', { period: { kind: 'deadline', dueDate: '2026-12-15' } }),
      'How many blocks sewn by Tuesday, Dec 15 would still count as on track?',
      'How many blocks sewn by Tuesday, Dec 15 are you hoping for?',
    ],
  ])('%s', (t, least, hoped) => {
    expect(numberQuestion('floor', t, TODAY)).toBe(least);
    expect(numberQuestion('aspiration', t, TODAY)).toBe(hoped);
    for (const words of [least, hoped, numberAbout('floor', t, TODAY), numberAbout('aspiration', t, TODAY), numberHelp(counted(t), 'floor', TODAY)!]) {
      expect(words).not.toMatch(/\b(fewest|floor|aspiration|aim|target|baseline)\b/i);
    }
  });

  it('is the bold line of a number question, and of an ideas or options card about that number', () => {
    expect(normalizeNumberTurn(turn(), TODAY).question).toBe('How many pages make a week count, even a hard one?');
    expect(optionsLead(turn({ kind: 'ideas' }), TODAY)).toBe('How many pages make a week count, even a hard one?');
    expect(optionsLead(turn({ kind: 'interpretations', topic: 'aspiration' }), TODAY)).toBe('How many pages a week are you hoping for?');
  });

  it('an offer of ideas about a number says what the number is, in code\'s words', () => {
    const offer = turn({ kind: 'offer_ideas', question: 'Do you have a number in mind, or would some starting ideas help?', detail: 'The fewest pages a week.' });
    expect(normalizeNumberTurn(offer, TODAY).detail).toBe('The number of pages that makes a week count, even a hard one.');
  });
});

// ---------------------------------------------------------------------------
// The checks, and the normalizer that leaves out what still breaks them
// ---------------------------------------------------------------------------

const ctxOf = (...said: string[]) => ({
  transcript: said.flatMap((text): Transcript => [{ role: 'assistant', turn: turn({ topic: 'idea', question: 'What would you like to work on?' }) }, { role: 'person', text }]),
  prevDraft: emptyDraft(),
});
const codes = (t: AssistantTurn, ctx = ctxOf('I want to read more books. I read about 50 pages a week now.')) => checkEverydayWords(t, ctx).map((x) => x.code);

describe('the checks: jargon, and a source pointed at without the fact', () => {
  it.each(['fewest', 'floor', 'aspiration', 'baseline', 'where you are now'])('"%s" in a line the card shows is flagged', (word) => {
    expect(codes(turn({ topic: 'shape', question: 'Does it keep going?', detail: `Think of your ${word} here.` }))).toContain('plain.jargon');
  });

  it('a word the person said themselves is theirs to use', () => {
    const ctx = ctxOf('I want to do my pelvic floor exercises.');
    expect(codes(turn({ topic: 'shape', question: 'Do the floor exercises keep going?' }), ctx)).toEqual([]);
  });

  it('words code replaces or hides are not read: a number question, and the lead-in and question of a card code leads', () => {
    expect(codes(turn({ question: "What's the fewest pages a week?" }))).toEqual([]);
    expect(codes(turn({ kind: 'ideas', say: 'From your baseline.', question: 'Which fewest?', detail: 'You said you read about 50 pages a week now.', options: ['At least 50 a week'] }))).toEqual([]);
  });

  it('a detail line of starting ideas quotes a value the person said, or is absent', () => {
    const ideas = (detail: string | null) => turn({ kind: 'ideas', detail, options: ['At least 50 a week', 'At least 100 a week'] });
    expect(codes(ideas('You said you read about 50 pages a week now.'))).toEqual([]);
    expect(codes(ideas(null))).toEqual([]);
    expect(codes(ideas('Pages a week, from what you said about where you are now.'))).toEqual(['plain.jargon', 'plain.unquoted_source']);
    expect(codes(ideas('Pages a week.'))).toEqual(['plain.unquoted_source']);
    expect(codes(ideas('You said "about 50 pages" a week now.'))).toEqual([]);
  });

  it('never points at an earlier answer by name, in any line the card shows', () => {
    for (const vague of ['From what you said, this should fit.', 'Based on what you told me, this works.', 'Using what you said earlier.']) {
      expect(codes(turn({ topic: 'shape', question: 'Does it keep going?', detail: vague })), vague).toContain('plain.unquoted_source');
    }
    expect(codes(turn({ topic: 'shape', question: 'Does it keep going?', detail: 'From what you said, 50 pages a week.' }))).toEqual([]);
  });

  it('both are plain-words checks: one retry with fixed words, then the card leaves out what still breaks them', async () => {
    const transcript: Transcript = [
      { role: 'assistant', turn: turn({ topic: 'idea', question: 'What would you like to work on?' }) },
      { role: 'person', text: 'I want to read more books. I read about 50 pages a week now.' },
      { role: 'assistant', turn: turn({ kind: 'offer_ideas', question: 'Do you have a number in mind, or would some starting ideas help?', detail: 'The number of pages that makes a week count.' }) },
      { role: 'person', text: 'Some ideas, please.' },
    ];
    const draft = counted(target('t1', 'Pages'));
    const vague = turn({ kind: 'ideas', draft, detail: 'Pages a week, from what you said about where you are now.', options: ['At least 50 pages a week', 'At least 100 pages a week'] });
    const calls: RunSetupTurnArgs[] = [];
    let now = 0;
    const runTurn = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      calls.push(args);
      now += 1_000;
      const result: ModelSetupResult = { ok: true, raw: vague, model: 'm', usage: null };
      return { kind: 'answered', result, turns: 1, spentTokens: 0 };
    };
    const view = await runCheckedTurn(
      { userId: 'u', session: { transcript, draft, spentTokens: 0 }, today: TODAY, deadlineMs: SETUP_TURN_BUDGET_MS },
      { runTurn: runTurn as never, nowMs: () => now },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1].retryFeedback).toEqual(expect.arrayContaining([RETRY_FEEDBACK['plain.jargon'], RETRY_FEEDBACK['plain.unquoted_source']]));
    expect(view).toMatchObject({ kind: 'turn', rejected: 1, turn: { detail: null } });
    if (view.kind !== 'turn') throw new Error('no turn');
    expect(checkTurn(view.turn, { transcript, prevDraft: draft }).filter((x) => x.rule !== 'plain_words')).toEqual([]);
  });

  it('the normalizer leaves out a lead-in or detail line in jargon, and keeps a quoted one', () => {
    const before: Transcript = [{ role: 'person', text: 'I read about 50 pages a week now.' }];
    expect(normalizePlainTurn(turn({ topic: 'shape', say: 'From your baseline.', detail: 'Plans run in weeks.' }), before)).toMatchObject({ say: '', detail: 'Plans run in weeks.' });
    expect(normalizePlainTurn(turn({ kind: 'ideas', detail: 'You said you read about 50 pages a week now.' }), before).detail).toBe('You said you read about 50 pages a week now.');
    expect(normalizePlainTurn(turn({ kind: 'ideas', detail: 'Pages a week.' }), before).detail).toBeNull();
  });

  it('tells Claude: the number in everyday words, and quote the fact or leave it out', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('How many workouts make a week count, even a hard one?');
    expect(SETUP_SYSTEM_PROMPT).toContain('You said you read about 50 pages a week now.');
    expect(SETUP_SYSTEM_PROMPT).toContain('Never point at an earlier answer by an abstract name');
    expect(SETUP_SYSTEM_PROMPT).not.toMatch(/What's the fewest|fewest or the aim/);
  });
});
