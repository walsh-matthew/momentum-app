// Prompt caching for guided setup (MOM-111, lib/ai/setup.ts), against a mocked client: nothing here reaches the network.
// Two breakpoints, 5-minute TTL only: the fixed system prompt, and the last block of the conversation so far. What these hold
// the code to:
// - the request carries cache_control on the system block and, exactly once, on the conversation block ahead of the draft;
// - what call N+1 sends up to that block is byte-identical to what call N sent (a pure test on buildSetupMessages), including
//   after the transcript has been through JSON, and the same for a retry of one turn;
// - the draft, the device date, code's notes and the retry feedback all sit after the last breakpoint;
// - effort and thinking do not change between the calls of one setup.

import Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_BEGIN_MESSAGE, buildSetupMessages, requestSetupTurnFromModel } from '@/lib/ai/setup';
import { emptyDraft } from '@/lib/setup/draft';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import type { AssistantTurn, SetupDraft, Transcript } from '@/types/setup';

vi.mock('@/lib/config/env', () => ({ getAnthropicApiKey: () => 'sk-ant-test-key-do-not-leak' }));

const FIVE_MINUTES = { type: 'ephemeral', ttl: '5m' };

const draftTitled = (title: string): SetupDraft => {
  const d = emptyDraft();
  d.model.goals.push({
    key: 'g1', title, why: null, startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'active',
    returnWhen: null, completionMode: null, tone: null, targets: [], items: [],
  });
  return d;
};
const claudeTurn = (i: number): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: null,
  detail: null,
  say: `say ${i}`,
  question: `Question ${i}?`,
  topic: 'idea',
  options: [],
  draft: draftTitled(`Draft${i}`),
});
// `n` turns of Claude's, each followed by the person's answer (except the last one when the transcript ends on Claude).
const transcriptOf = (n: number, endOn: 'person' | 'assistant' = 'person'): Transcript => {
  const out: Transcript = [];
  for (let i = 0; i < n; i++) {
    out.push({ role: 'assistant', turn: claudeTurn(i) });
    if (i < n - 1 || endOn === 'person') out.push({ role: 'person', text: `Reply number ${i}.` });
  }
  return out;
};

type Block = { type: string; text: string; cache_control?: unknown };
const blocksOf = (m: Anthropic.MessageParam): Block[] =>
  typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content as unknown as Block[]);
const plain = (messages: Anthropic.MessageParam[]) =>
  messages.map((m) => ({ role: m.role, blocks: blocksOf(m).map((b) => ({ type: b.type, text: b.text })) }));

// Where the conversation breakpoint is: the message index and block index that carry cache_control.
function breakpoints(messages: Anthropic.MessageParam[]) {
  const found: Array<{ message: number; block: number }> = [];
  messages.forEach((m, mi) => blocksOf(m).forEach((b, bi) => b.cache_control && found.push({ message: mi, block: bi })));
  return found;
}

// Everything the API renders up to and including the breakpoint block, with the marker itself removed: the cache key is the
// content up to the block, not the marker.
function prefixThroughBreakpoint(messages: Anthropic.MessageParam[]) {
  const [bp] = breakpoints(messages);
  const out = plain(messages).slice(0, bp.message + 1);
  out[bp.message] = { ...out[bp.message], blocks: out[bp.message].blocks.slice(0, bp.block + 1) };
  return out;
}

describe('the breakpoints in a request', () => {
  let create: ReturnType<typeof vi.fn>;
  let client: Pick<Anthropic, 'messages'>;
  beforeEach(() => {
    create = vi.fn(async () => ({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify(claudeTurn(9)) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    }));
    client = { messages: { create } } as unknown as Pick<Anthropic, 'messages'>;
  });
  const sent = (call = 0) =>
    (create.mock.calls[call] as unknown as [{ system: Block[]; messages: Anthropic.MessageParam[]; output_config: unknown }])[0];

  it('puts one 5-minute breakpoint on the fixed system prompt, as the only system block', async () => {
    await requestSetupTurnFromModel({ transcript: transcriptOf(2), draft: draftTitled('Now') }, { client });
    expect(sent().system).toEqual([{ type: 'text', text: SETUP_SYSTEM_PROMPT, cache_control: FIVE_MINUTES }]);
  });

  it("puts one 5-minute breakpoint on the person's newest words, ahead of the draft and the notes", async () => {
    await requestSetupTurnFromModel(
      {
        transcript: transcriptOf(2),
        draft: draftTitled('zz-draft-sentinel'),
        today: '2031-07-19',
        dateHint: 'zz-datehint-sentinel',
        sourceNote: 'zz-sourcenote-sentinel',
        returningNote: 'zz-returning-sentinel',
        retryFeedback: ['one'],
      },
      { client },
    );
    const messages = sent().messages;
    expect(breakpoints(messages)).toEqual([{ message: messages.length - 1, block: 0 }]);
    const blocks = blocksOf(messages.at(-1)!);
    expect(blocks[0]).toEqual({ type: 'text', text: 'Reply number 1.', cache_control: FIVE_MINUTES });
    expect(blocks[1].text).toMatch(/^Current draft, to start from:/);
    // Every block after the breakpoint is volatile: the draft with the device date, code's notes, the retry feedback.
    expect(blocks.slice(1).every((b) => b.cache_control === undefined)).toBe(true);
    expect(blocks).toHaveLength(6);
    // Retry feedback is the last block, after the last breakpoint.
    expect(blocks.at(-1)!.text).toMatch(/- one$/);
    // And nothing volatile is ahead of it, in the messages or in the system prompt.
    const ahead = JSON.stringify(prefixThroughBreakpoint(messages)) + SETUP_SYSTEM_PROMPT;
    for (const volatile of ['2031-07-19', 'zz-datehint-sentinel', 'zz-sourcenote-sentinel', 'zz-returning-sentinel', '- one', 'zz-draft-sentinel']) {
      expect(ahead).not.toContain(volatile);
    }
  });

  it("puts the breakpoint on Claude's last turn when the transcript ends there, and on the opening line when it is empty", () => {
    const endsOnClaude = buildSetupMessages(transcriptOf(2, 'assistant'), draftTitled('Now'));
    expect(endsOnClaude.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(breakpoints(endsOnClaude)).toEqual([{ message: 3, block: 0 }]);
    expect(endsOnClaude.at(-1)?.content).toMatch(/^Current draft, to start from:/);

    const empty = buildSetupMessages([], emptyDraft());
    expect(breakpoints(empty)).toEqual([{ message: 0, block: 0 }]);
    expect(blocksOf(empty[0])[0].text).toBe(SETUP_BEGIN_MESSAGE);
  });

  it('keeps effort the same and adds no thinking on every call of one setup', async () => {
    for (let n = 1; n <= 3; n++) await requestSetupTurnFromModel({ transcript: transcriptOf(n), draft: draftTitled(`D${n}`) }, { client });
    const requests = [0, 1, 2].map((i) => sent(i) as unknown as Record<string, unknown>);
    expect(new Set(requests.map((r) => JSON.stringify(r.output_config))).size).toBe(1);
    expect(requests[0].output_config).toEqual({ effort: 'medium' });
    expect(new Set(requests.map((r) => r.model)).size).toBe(1);
    for (const r of requests) expect(Object.keys(r)).not.toContain('thinking');
  });

  it('builds the system prompt from fixed words only: no id, no clock reading, and not the device date', () => {
    expect(SETUP_SYSTEM_PROMPT).not.toContain(new Date().toISOString().slice(0, 10));
    expect(SETUP_SYSTEM_PROMPT).not.toContain('2031-07-19');
    expect(SETUP_SYSTEM_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('what call N+1 sends equals what call N wrote', () => {
  // Call N is made when the transcript holds N turns of Claude's and N answers; call N+1 has one turn and one answer more.
  it('matches up to the breakpoint over a 3-turn transcript, whatever the draft and notes are', () => {
    const calls = [1, 2, 3, 4].map((n) =>
      buildSetupMessages(transcriptOf(n), draftTitled(`Current${n}`), { today: `2026-11-0${n}`, dateHint: `note ${n}` }),
    );
    for (let n = 0; n < 3; n++) {
      const written = prefixThroughBreakpoint(calls[n]);
      const next = plain(calls[n + 1]);
      const last = written.length - 1;
      // Call N+1's own messages start with exactly what call N wrote: the same messages, the same blocks, the same text.
      expect(next.slice(0, last)).toEqual(written.slice(0, last));
      expect(next[last].blocks.slice(0, written[last].blocks.length)).toEqual(written[last].blocks);
      // The same thing as bytes, since the cache is a byte match.
      expect(JSON.stringify(next.slice(0, last))).toBe(JSON.stringify(written.slice(0, last)));
    }
  });

  it('still matches after the transcript has been through JSON, as it is between requests', () => {
    const before = prefixThroughBreakpoint(buildSetupMessages(transcriptOf(3), draftTitled('A')));
    const roundTripped = JSON.parse(JSON.stringify(transcriptOf(4))) as Transcript;
    const after = plain(buildSetupMessages(roundTripped, draftTitled('B')));
    const last = before.length - 1;
    expect(after.slice(0, last)).toEqual(before.slice(0, last));
    expect(after[last].blocks[0]).toEqual(before[last].blocks[0]);
  });

  it('matches for a retry of the same turn: same prefix, only the feedback after the breakpoint differs', () => {
    const first = buildSetupMessages(transcriptOf(3), draftTitled('X'));
    const retry = buildSetupMessages(transcriptOf(3), draftTitled('X'), { retryFeedback: ['Your reply broke a rule.'] });
    expect(prefixThroughBreakpoint(retry)).toEqual(prefixThroughBreakpoint(first));
    expect(blocksOf(retry.at(-1)!).length).toBe(blocksOf(first.at(-1)!).length + 1);
    expect(breakpoints(retry)).toEqual(breakpoints(first));
  });

  it("shows why a breakpoint at the very end would never be read back", () => {
    // The newest message of call N is [words, draft N, notes]; in call N+1 it is just [words]. A prefix that included the
    // draft or the notes of call N would not exist in call N+1.
    const callN = buildSetupMessages(transcriptOf(2), draftTitled('DraftN'), { dateHint: 'a note' });
    const callNext = buildSetupMessages(transcriptOf(3), draftTitled('DraftNext'), { dateHint: 'a later note' });
    expect(blocksOf(callN.at(-1)!)).toHaveLength(3);
    expect(blocksOf(callNext[callN.length - 1])).toHaveLength(1);
    expect(JSON.stringify(callNext)).not.toContain('a note');
  });

  it('sends every person message as a one-block array, the same shape it had when it was the newest', () => {
    const messages = buildSetupMessages(transcriptOf(3), draftTitled('Z'));
    for (const m of messages.filter((x) => x.role === 'user').slice(0, -1)) expect(blocksOf(m)).toHaveLength(1);
    for (const m of messages.filter((x) => x.role === 'user')) expect(Array.isArray(m.content)).toBe(true);
  });
});
