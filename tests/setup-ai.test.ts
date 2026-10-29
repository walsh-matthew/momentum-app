// The Claude call for one turn of guided setup (lib/ai/setup.ts, MOM-111), against a mocked client: nothing here reaches
// the network or needs a key. What it sends, what it hands back untouched, every way it can fail, and what the prompt says.

import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETUP_BEGIN_MESSAGE,
  SETUP_DRAFT_PLACEHOLDER,
  SETUP_MODEL,
  buildSetupMessages,
  requestSetupTurnFromModel,
} from '@/lib/ai/setup';
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
    const messages = buildSetupMessages(transcript, emptyDraft());
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0].content).toBe(SETUP_BEGIN_MESSAGE);
    // The earlier turn is sent whole except for its draft.
    expect(JSON.parse(messages[1].content as string)).toEqual({ ...JSON.parse(JSON.stringify(turn)), draft: SETUP_DRAFT_PLACEHOLDER });
    // The person's own words stay in a block of their own, ahead of the current draft.
    expect(messages[2].content).toEqual([
      { type: 'text', text: 'Zebra quartz goal.' },
      { type: 'text', text: `Current draft, to start from:\n${JSON.stringify(emptyDraft())}` },
    ]);
    // Before anything has been said there is only the opening message, and the (empty) draft after it.
    expect(buildSetupMessages([], emptyDraft())).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: SETUP_BEGIN_MESSAGE },
          { type: 'text', text: `Current draft, to start from:\n${JSON.stringify(emptyDraft())}` },
        ],
      },
    ]);
  });

  it('puts a draft after a transcript that ends on Claude\'s turn in a message of its own', () => {
    const messages = buildSetupMessages([{ role: 'assistant', turn }], emptyDraft());
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[2].content).toMatch(/^Current draft, to start from:/);
  });

  it('sends only the conversation: no email, account or id', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel(input, { client });
    const sent = JSON.stringify(requestOf(create).messages);
    expect(sent).toContain('Zebra quartz goal.');
    expect(sent).not.toMatch(/@|user_id|userId|email/i);
  });

  it('asks another model when told to, for the smaller-model trial', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel(input, { client, model: 'claude-sonnet-5-5' });
    expect(requestOf(create).model).toBe('claude-sonnet-5-5');
  });
});

describe('the draft is sent once (MOM-128)', () => {
  // Each turn of Claude's carries a different draft, marked by the title of its one goal.
  const draftTitled = (title: string) => {
    const d = emptyDraft();
    d.model.goals.push({
      key: 'g1', title, why: null, startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'active',
      returnWhen: null, completionMode: null, tone: null, targets: [], items: [],
    });
    return d;
  };
  const longTranscript = (turns: number): Transcript =>
    Array.from({ length: turns }, (_, i) => [
      { role: 'assistant' as const, turn: { ...turn, say: `say ${i}`, draft: draftTitled(`OldDraft${i}`) } },
      { role: 'person' as const, text: `reply ${i}` },
    ]).flat();
  const sizeOf = (turns: number) => JSON.stringify(buildSetupMessages(longTranscript(turns), draftTitled('CurrentDraft'))).length;

  it('replaces every earlier draft by the placeholder and sends the current one exactly once', () => {
    const sent = JSON.stringify(buildSetupMessages(longTranscript(12), draftTitled('CurrentDraft')));
    expect(sent).not.toContain('OldDraft');
    expect(sent.match(/CurrentDraft/g)).toHaveLength(1);
    expect(sent.match(new RegExp(SETUP_DRAFT_PLACEHOLDER, 'g'))).toHaveLength(12);
  });

  it('keeps everything else about an earlier turn, so the conversation still reads the same', () => {
    const messages = buildSetupMessages(longTranscript(3), draftTitled('CurrentDraft'));
    const assistant = messages.filter((m) => m.role === 'assistant').map((m) => JSON.parse(m.content as string));
    expect(assistant.map((a) => a.say)).toEqual(['say 0', 'say 1', 'say 2']);
    for (const a of assistant) {
      expect(a).toMatchObject({ kind: 'question', topic: 'idea', question: 'What would you like to work on?', draft: SETUP_DRAFT_PLACEHOLDER });
    }
    expect(messages.filter((m) => m.role === 'user').length).toBeGreaterThan(3);
  });

  it('grows by the same amount each turn, not by more each time', () => {
    const [a, b, c, d] = [sizeOf(5), sizeOf(10), sizeOf(20), sizeOf(40)];
    const perTurn = (b - a) / 5;
    expect((c - b) / 10).toBeCloseTo(perTurn, -1);
    expect((d - c) / 20).toBeCloseTo(perTurn, -1);
  });

  it('is smaller than sending every draft whole, by more the longer the setup goes', () => {
    const whole = (turns: number) => JSON.stringify(longTranscript(turns).map((m) => (m.role === 'person' ? m.text : m.turn))).length;
    const saved = (turns: number) => whole(turns) - (sizeOf(turns) - JSON.stringify(draftTitled('CurrentDraft')).length);
    expect(saved(20)).toBeGreaterThan(saved(10));
    expect(saved(10)).toBeGreaterThan(0);
  });

  it('is what the API receives', async () => {
    const { client, create } = clientReturning();
    await requestSetupTurnFromModel({ transcript: longTranscript(4), draft: draftTitled('CurrentDraft') }, { client });
    const sent = JSON.stringify(requestOf(create).messages);
    expect(sent).not.toContain('OldDraft');
    expect(sent.match(/CurrentDraft/g)).toHaveLength(1);
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
    expect(SETUP_SYSTEM_PROMPT).toMatch(/only when a weekly or day-slot target \(something counted each week or on set days\) needs it/);
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

  it('explains the placeholder and the current draft, and how positions are counted (MOM-128)', () => {
    expect(SETUP_SYSTEM_PROMPT).toMatch(/earlier replies appear in this conversation with "draft" replaced by a short note/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/newest message ends with "Current draft"/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/reply with the whole updated draft as an object in "draft", never with that note/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/Positions count from 0 with your own first reply/);
    // The words the prompt promises are the words the code sends.
    expect(buildSetupMessages([], emptyDraft()).at(-1)?.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: expect.stringMatching(/^Current draft/) })]),
    );
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
