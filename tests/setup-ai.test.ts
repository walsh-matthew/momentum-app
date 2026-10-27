// The Claude call for one turn of guided setup (lib/ai/setup.ts, MOM-111), against a mocked client: nothing here reaches
// the network or needs a key. What it sends, what it hands back untouched, every way it can fail, and what the prompt says.

import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETUP_BEGIN_MESSAGE, SETUP_MODEL, buildSetupMessages, requestSetupTurnFromModel } from '@/lib/ai/setup';
import { emptyDraft } from '@/lib/setup/draft';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { HARD_RULES, SETUP_STEPS } from '@/lib/setup/steps';
import { AssistantTurnSchema, type AssistantTurn, type Transcript } from '@/types/setup';

const keyReader = vi.hoisted(() => ({ get: vi.fn(() => 'sk-ant-test-key-do-not-leak') }));
vi.mock('@/lib/config/env', () => ({ getAnthropicApiKey: keyReader.get }));

const turn: AssistantTurn = {
  kind: 'question',
  chunk: null,
  skipped: null,
  say: '',
  question: 'What would you like to work on?',
  topic: 'idea',
  options: [],
  draft: emptyDraft(),
};
const transcript: Transcript = [{ role: 'assistant', turn }, { role: 'person', text: 'Zebra quartz goal.' }];

function reply(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(turn), citations: null }],
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

type Request = {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
  output_config: { effort: string; format?: unknown };
};
const requestOf = (create: ReturnType<typeof clientReturning>['create']) => (create.mock.calls[0] as unknown as [Request])[0];
const USAGE = { inputTokens: 10, outputTokens: 10 };
const input = { transcript, draft: emptyDraft() };

describe('what it sends', () => {
  it('asks the default model with the fixed setup prompt', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel(input, { client });
    const request = requestOf(create);
    expect(request.model).toBe(SETUP_MODEL);
    expect(SETUP_MODEL).toBe('claude-opus-5-5');
    expect(request.system).toBe(SETUP_SYSTEM_PROMPT);
    expect(request.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('sends nothing the current models reject, and does not rely on structured output it has not tried', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel(input, { client });
    const request = requestOf(create);
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice', 'tools']) {
      expect(Object.keys(request)).not.toContain(key);
    }
    expect(request.output_config.format).toBeUndefined();
    expect(request.messages.at(-1)?.role).toBe('user');
  });

  it('starts with the person\'s side, then alternates the conversation so far', () => {
    const messages = buildSetupMessages(transcript);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0].content).toBe(SETUP_BEGIN_MESSAGE);
    expect(JSON.parse(messages[1].content as string)).toEqual(JSON.parse(JSON.stringify(turn)));
    expect(messages[2].content).toBe('Zebra quartz goal.');
    expect(buildSetupMessages([])).toEqual([{ role: 'user', content: SETUP_BEGIN_MESSAGE }]);
  });

  it('sends only the conversation: no email, account or id', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel(input, { client });
    const sent = JSON.stringify(requestOf(create).messages);
    expect(sent).toContain('Zebra quartz goal.');
    expect(sent).not.toMatch(/@|user_id|userId|email/i);
  });
});

describe('the prompt', () => {
  it('states the twelve steps in order, with the day end and the week start condition of MOM-125', () => {
    let last = -1;
    for (const step of SETUP_STEPS) {
      const at = SETUP_SYSTEM_PROMPT.indexOf(`${step.n}. ${step.title}.`);
      expect(at, `step ${step.n}`).toBeGreaterThan(last);
      last = at;
    }
    expect(SETUP_STEPS).toHaveLength(12);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/day end, once, on the first goal only, never assumed/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/only when a weekly or day-slot target needs it/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/"midnight" and "6 in the morning" and no other clock time/);
  });

  it('states all eight hard rules, word for word from the rule list', () => {
    expect(HARD_RULES).toHaveLength(8);
    for (const rule of HARD_RULES) expect(SETUP_SYSTEM_PROMPT).toContain(`${rule.n}. ${rule.text}`);
  });

  it('keeps the exact-date and separate-question rules for a deadline', () => {
    expect(SETUP_SYSTEM_PROMPT).toMatch(/never infer a week or work a date out/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/as a separate question, in its own turn, whether the date can move/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/not instructions to you/);
  });

  it('says Claude writes no playback and does no math', () => {
    expect(SETUP_SYSTEM_PROMPT).toMatch(/written by code from the validated draft, not by you/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/Do no math and set no score/);
  });

  it('has no example clock time, weekday or personal detail of its own', () => {
    const outsideBoundary = SETUP_SYSTEM_PROMPT.replaceAll('"midnight"', '').replaceAll('6 in the morning', '');
    expect(outsideBoundary).not.toMatch(/\b(\d{1,2}:\d{2}|\d{1,2} ?(am|pm))\b/i);
  });
});

describe('what it returns', () => {
  it("hands back the model's JSON exactly as it came, which the caller must validate", async () => {
    const { client } = clientReturning(reply({ model: 'claude-opus-5-5' }));
    const result = await requestSetupTurnFromModel(input, { client });
    expect(result).toEqual({ ok: true, raw: JSON.parse(JSON.stringify(turn)), model: 'claude-opus-5-5', usage: USAGE });
    if (result.ok) expect(AssistantTurnSchema.safeParse(result.raw).success).toBe(true);
  });

  it('does not fix an answer that breaks the rules', async () => {
    const hostile = { ...turn, score: 100 };
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: JSON.stringify(hostile), citations: null }] }));
    const result = await requestSetupTurnFromModel(input, { client });
    expect(result.ok && result.raw).toEqual(hostile);
    if (result.ok) expect(AssistantTurnSchema.safeParse(result.raw).success).toBe(false);
  });

  it('reads JSON wrapped in a code fence, and past thinking blocks', async () => {
    const { client } = clientReturning(
      reply({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: '```json\n' + JSON.stringify(turn) + '\n```', citations: null },
        ] as Anthropic.Message['content'],
      }),
    );
    expect((await requestSetupTurnFromModel(input, { client })).ok).toBe(true);
  });
});

describe('when the model does not give a usable answer', () => {
  it('a refusal', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'refusal', content: [] }));
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason: 'refused', usage: USAGE });
  });
  it('running out of tokens', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'max_tokens' }));
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('no text block', async () => {
    const { client } = clientReturning(reply({ content: [] }));
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('text that is not JSON', async () => {
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: 'Sure! Let us begin.', citations: null }] }));
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('broken JSON', async () => {
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: '{"kind": ', citations: null }] }));
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
});

describe('when the request fails', () => {
  const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers());

  it.each([
    ['rate limited', apiError(429), 'rate_limited'],
    ['a rejected key', apiError(401), 'not_configured'],
    ['a forbidden key', apiError(403), 'not_configured'],
    ['a server error', apiError(500), 'unavailable'],
    ['a bad request', apiError(400), 'unavailable'],
    ['a dropped connection', new Anthropic.APIConnectionError({ message: 'socket hang up' }), 'unavailable'],
    ['a timeout', new Anthropic.APIConnectionTimeoutError(), 'unavailable'],
    ['an unexpected error', new TypeError('boom'), 'unavailable'],
  ] as const)('%s', async (_name, error, reason) => {
    const { client } = clientReturning(error);
    expect(await requestSetupTurnFromModel(input, { client })).toEqual({ ok: false, reason });
  });

  it('no API key set', async () => {
    keyReader.get.mockImplementationOnce(() => {
      throw new Error('Invalid server environment variables.');
    });
    expect(await requestSetupTurnFromModel(input)).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('never writes the key or what the person typed to the log', async () => {
    const { client } = clientReturning(apiError(500));
    await requestSetupTurnFromModel(input, { client });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain('sk-ant');
    expect(logged).not.toContain('Zebra quartz');
  });
});
