// The Claude call for rebalance proposals (lib/ai/rebalance.ts, MOM-47), against a mocked client:
// nothing here reaches the network or needs a key. What it sends, what it hands back untouched, and
// every way the call can fail.

import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelRebalanceOutputSchema,
  REBALANCE_MODEL,
  REBALANCE_SYSTEM_PROMPT,
  requestRebalanceFromModel,
} from '@/lib/ai/rebalance';
import type { ModelRebalanceFacts } from '@/lib/utils/rebalance';

const keyReader = vi.hoisted(() => ({ get: vi.fn(() => 'sk-ant-test-key-do-not-leak') }));
vi.mock('@/lib/config/env', () => ({ getAnthropicApiKey: keyReader.get }));

const facts: ModelRebalanceFacts = {
  currentWeek: 4,
  planWeeks: 13,
  today: '2026-11-04',
  velocity: { score: 40, trend: 'down', risk: 'rising', pressureStreak: 2 },
  weeks: [{ week: 2, unfinished: 3, finished: 4 }],
  tasks: [{ id: '11111111-1111-4111-8111-111111111111', week: 2, type: 'build', minutes: 60, dueDate: null }],
};

const proposalJson = {
  summary: 'Move one task.',
  moves: [{ action: 'carry_over', taskId: '11111111-1111-4111-8111-111111111111', fromWeek: 2, toWeek: 4, reason: 'Unfinished in week 2.' }],
  warnings: [],
};

function reply(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(proposalJson), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    ...over,
  } as Anthropic.Message;
}

function clientReturning(...results: Array<Anthropic.Message | Error>) {
  const create = vi.fn(async () => {
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next ?? reply();
  });
  return { client: { messages: { create } } as unknown as Pick<Anthropic, 'messages'>, create };
}

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  keyReader.get.mockClear();
});
afterEach(() => errorLog.mockRestore());

// What the test reply reports as used (see reply() above): read off the response and handed back, even on a refusal.
const USAGE = { inputTokens: 10, outputTokens: 10 };

describe('what it sends', () => {
  it('asks the default model, with effort set and the answer constrained by a JSON schema', async () => {
    const { client, create } = clientReturning();
    await requestRebalanceFromModel(facts, { client });

    const params = create.mock.calls[0] as unknown as [Record<string, unknown>];
    const request = params[0] as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
      output_config: { effort: string; format: { type: string; schema: unknown } };
    };
    expect(request.model).toBe(REBALANCE_MODEL);
    expect(REBALANCE_MODEL).toBe('claude-opus-5-5');
    expect(request.output_config.effort).toBe('medium');
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('sends nothing the current models reject: no thinking budget, sampling settings, forced tool or prefill', async () => {
    const { client, create } = clientReturning();
    await requestRebalanceFromModel(facts, { client });
    const request = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];

    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice', 'tools']) {
      expect(Object.keys(request)).not.toContain(key);
    }
    const messages = request.messages as Array<{ role: string }>;
    expect(messages.at(-1)?.role).toBe('user');
  });

  it('puts the plan in the user message as JSON, with ids and weeks but no titles', async () => {
    const { client, create } = clientReturning();
    await requestRebalanceFromModel(facts, { client });
    const request = (create.mock.calls[0] as unknown as [{ messages: Array<{ content: string }> }])[0];
    const text = request.messages[0].content;

    expect(text).toContain('11111111-1111-4111-8111-111111111111');
    expect(text).toContain('"currentWeek":4');
    expect(text.toLowerCase()).not.toContain('title');
  });

  it('keeps the system prompt fixed, and states the rules that matter', () => {
    expect(REBALANCE_SYSTEM_PROMPT).toMatch(/carry_over/);
    expect(REBALANCE_SYSTEM_PROMPT).toMatch(/pull_forward/);
    expect(REBALANCE_SYSTEM_PROMPT).toMatch(/never suggest one/i);
    expect(REBALANCE_SYSTEM_PROMPT).toMatch(/cannot_hold/);
    expect(REBALANCE_SYSTEM_PROMPT).toMatch(/not instructions/i);
  });

  it('offers the model only carry_over and pull_forward, so the API itself cannot produce a delete', () => {
    const schema = JSON.stringify(ModelRebalanceOutputSchema.shape.moves.element.shape.action.options);
    expect(JSON.parse(schema)).toEqual(['carry_over', 'pull_forward']);
    expect(ModelRebalanceOutputSchema.shape.moves.element.shape).not.toHaveProperty('status');
    expect(ModelRebalanceOutputSchema.shape.moves.element.shape).not.toHaveProperty('title');
  });
});

describe('what it returns', () => {
  it("hands back the model's JSON exactly as it came, with the model that answered", async () => {
    const { client } = clientReturning(reply({ model: 'claude-opus-5-5' }));
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: true, raw: proposalJson, model: 'claude-opus-5-5', usage: USAGE });
  });

  it('does not clean up, fix or filter the answer (the caller validates it)', async () => {
    const hostile = { ...proposalJson, moves: [{ ...proposalJson.moves[0], action: 'delete', status: 'done' }] };
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: JSON.stringify(hostile), citations: null }] }));
    const r = await requestRebalanceFromModel(facts, { client });
    expect(r).toEqual({ ok: true, raw: hostile, model: 'claude-opus-5-5', usage: USAGE });
  });

  it('reads the text block even when thinking blocks come first', async () => {
    const { client } = clientReturning(
      reply({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: JSON.stringify(proposalJson), citations: null },
        ] as Anthropic.Message['content'],
      }),
    );
    const r = await requestRebalanceFromModel(facts, { client });
    expect(r.ok).toBe(true);
  });
});

describe('when the model does not give a usable answer', () => {
  it('a refusal', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'refusal', content: [] }));
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: false, reason: 'refused', usage: USAGE });
  });
  it('running out of tokens', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'max_tokens' }));
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('no text block', async () => {
    const { client } = clientReturning(reply({ content: [] }));
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('text that is not JSON', async () => {
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: 'Sure! Here is a plan:', citations: null }] }));
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
});

describe('when the request fails', () => {
  const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers());

  it.each([
    ['rate limited', apiError(429), 'rate_limited'],
    ['a rejected key', apiError(401), 'not_configured'],
    ['a forbidden key', apiError(403), 'not_configured'],
    ['a server error', apiError(500), 'unavailable'],
    ['an overloaded service', apiError(529), 'unavailable'],
    ['a bad request', apiError(400), 'unavailable'],
    ['a dropped connection', new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'unavailable'],
    ['a timeout', new Anthropic.APIConnectionTimeoutError(), 'unavailable'],
    ['an unexpected error', new TypeError('boom'), 'unavailable'],
  ] as const)('%s', async (_name, error, reason) => {
    const { client } = clientReturning(error);
    expect(await requestRebalanceFromModel(facts, { client })).toEqual({ ok: false, reason });
  });

  it('no API key set', async () => {
    keyReader.get.mockImplementationOnce(() => {
      throw new Error('Invalid server environment variables.');
    });
    expect(await requestRebalanceFromModel(facts)).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('never writes the key or the plan to the log', async () => {
    const { client } = clientReturning(apiError(500));
    await requestRebalanceFromModel(facts, { client });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain('sk-ant');
    expect(logged).not.toContain('11111111-1111');
  });
});
