// MOM-111, the quick path's fill-in raised the longest conversation a setup may hold (types/setup.ts MAX_TRANSCRIPT_MESSAGES) so a
// session whose Claude budget is spent can still hold the question and answer of each item the person sets on the card. That bound
// guards a request that arrives from outside; it is not a limit on Claude. What these pin:
// - the bound is exactly 122 messages: the budget's 82, plus a question and an answer for each of at most 20 items;
// - every limit on Claude calls is as it was (the 40-turn budget, the tokens, the spacing, the shared cap);
// - a conversation of any length the bound allows, up to its longest, never makes a Claude call once it holds 40 of Claude's turns,
//   so the raised bound cannot let a call send more than before (the fill-in's own turns count toward the 40, they never add room).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLM_LIMITS, SETUP_BUDGET, SETUP_LIMITS, runSetupTurn, setupBudgetStatus } from '@/lib/services/llm';
import { emptyDraft } from '@/lib/setup/draft';
import { MAX_FILL_INS, MAX_TRANSCRIPT_MESSAGES, SetupSessionSchema, type AssistantTurn, type Transcript } from '@/types/setup';
import { resetUsage, rowsFor, usage } from './helpers/fakeLlmUsage';
import { USER } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});
vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const turn: AssistantTurn = {
  kind: 'question',
  chunk: null,
  skipped: null,
  detail: null,
  say: '',
  question: 'What would you like to work on?',
  topic: 'idea',
  options: [],
  draft: emptyDraft(),
};

// A conversation of `messages` messages, Claude first, taking turns.
const conversation = (messages: number): Transcript =>
  Array.from({ length: messages }, (_, i) => (i % 2 === 0 ? { role: 'assistant' as const, turn } : { role: 'person' as const, text: `reply ${i}` }));
const session = (messages: number) => ({ transcript: conversation(messages), draft: emptyDraft(), spentTokens: 0 });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetUsage();
  fetchSpy = vi.fn(() => {
    throw new Error('the network must not be reached from a unit test');
  });
  vi.stubGlobal('fetch', fetchSpy);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the longest conversation a setup may hold', () => {
  it('is 122 messages: the budget\'s 82, and a question and an answer for each of at most 20 items', () => {
    expect(MAX_FILL_INS).toBe(20);
    expect(MAX_TRANSCRIPT_MESSAGES).toBe(122);
    expect(MAX_TRANSCRIPT_MESSAGES).toBe(82 + 2 * MAX_FILL_INS);
  });

  it('is what the session schema allows, to the message', () => {
    expect(SetupSessionSchema.safeParse(session(MAX_TRANSCRIPT_MESSAGES)).success).toBe(true);
    expect(SetupSessionSchema.safeParse(session(MAX_TRANSCRIPT_MESSAGES + 1)).success).toBe(false);
    expect(SetupSessionSchema.safeParse(session(MAX_TRANSCRIPT_MESSAGES + 2)).success).toBe(false);
  });

  it('holds a conversation whose budget is spent, and the fill-in of every item it may add', () => {
    // 40 of Claude's turns, each answered, is 80 messages; 20 more items is 40 more.
    const spent = 2 * SETUP_BUDGET.maxTurns;
    expect(spent + 2 * MAX_FILL_INS).toBeLessThanOrEqual(MAX_TRANSCRIPT_MESSAGES + 2);
    expect(SetupSessionSchema.safeParse(session(spent + 2 * MAX_FILL_INS)).success).toBe(true);
  });
});

describe('every limit on Claude calls is as it was', () => {
  it('the budget, the tokens, the spacing and the shared cap are the numbers they were', () => {
    expect(SETUP_BUDGET).toEqual({ maxTurns: 40, maxTokens: 1_000_000 });
    expect(SETUP_LIMITS).toEqual({ minIntervalSeconds: 1, userDailyCap: 1_000_000, overallDailyCap: LLM_LIMITS.overallDailyCap });
    expect(LLM_LIMITS).toEqual({ minIntervalSeconds: 20, userDailyCap: 20, overallDailyCap: 200 });
  });

  it('room is left only while fewer than 40 of Claude\'s turns are in the conversation, however long the bound lets it be', () => {
    expect(setupBudgetStatus({ turns: 39, tokens: 0 })).toEqual({ ok: true });
    for (let turns = SETUP_BUDGET.maxTurns; turns <= MAX_TRANSCRIPT_MESSAGES / 2; turns++) {
      expect(setupBudgetStatus({ turns, tokens: 0 }), `${turns} turns`).toEqual({ ok: false, over: 'turns' });
    }
  });

  it.each([80, 82, 100, MAX_TRANSCRIPT_MESSAGES])('a conversation of %i messages never makes a call, a reservation or a log row', async (messages) => {
    const requestTurn = vi.fn(async () => {
      throw new Error('Claude must not be asked');
    });
    const result = await runSetupTurn({ userId: USER, transcript: conversation(messages), draft: emptyDraft(), spentTokens: 0 }, { requestTurn: requestTurn as never });
    expect(result).toMatchObject({ kind: 'quick_path', reason: 'over_turns' });
    expect(requestTurn).not.toHaveBeenCalled();
    expect(usage.reserveCalls).toHaveLength(0);
    expect(rowsFor(USER)).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a code-written fill-in turn counts as one of Claude\'s turns, so it uses up room and never adds any', async () => {
    // 38 of Claude's turns and two code-written fill-in turns is 40: no room, though Claude spoke only 38 times.
    const requestTurn = vi.fn(async () => {
      throw new Error('Claude must not be asked');
    });
    const result = await runSetupTurn({ userId: USER, transcript: conversation(2 * 40), draft: emptyDraft(), spentTokens: 0 }, { requestTurn: requestTurn as never });
    expect(result.kind).toBe('quick_path');
    expect(requestTurn).not.toHaveBeenCalled();
  });
});
