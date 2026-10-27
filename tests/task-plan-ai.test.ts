// The Claude call that writes a new goal's week 1 plan (lib/ai/taskPlan.ts, MOM-35), against a mocked
// client: nothing here reaches the network or needs a key. What it sends, what it hands back untouched,
// and every way the call can fail.

import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelTaskPlanOutputSchema,
  TASK_PLAN_MODEL,
  TASK_PLAN_SYSTEM_PROMPT,
  buildPlanFacts,
  requestWeekOnePlanFromModel,
} from '@/lib/ai/taskPlan';
import { parseWizardInput, type WizardInput } from '@/lib/goals/taskPlan';

const keyReader = vi.hoisted(() => ({ get: vi.fn(() => 'sk-ant-test-key-do-not-leak') }));
vi.mock('@/lib/config/env', () => ({ getAnthropicApiKey: keyReader.get }));

function wizard(over: Record<string, unknown> = {}): WizardInput {
  const r = parseWizardInput({
    title: 'Zebra quartz title',
    goalType: 'get_certified',
    constraints: ['dont_track_hours', 'flexible_dates'],
    pace: 'lighter',
    reviewPrompts: ['took_longer'],
    ...over,
  });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const planJson = {
  tasks: [
    { title: 'Pick the certification and book the exam date', taskType: 'certify', minutes: 30, weekOf: 1 },
    { title: 'Friday review: tick tasks and note what took longer', taskType: 'review', minutes: 30, weekOf: 1 },
  ],
};

function reply(over: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(planJson), citations: null }],
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
  output_config: { effort: string; format: { type: string; schema: unknown } };
};
const requestOf = (create: ReturnType<typeof clientReturning>['create']) =>
  (create.mock.calls[0] as unknown as [Request])[0];

// What the test reply reports as used (see reply() above): read off the response and handed back, even on a refusal.
const USAGE = { inputTokens: 10, outputTokens: 10 };

describe('what it sends', () => {
  it('asks the default model, with effort set and the answer constrained by a JSON schema', async () => {
    const { client, create } = clientReturning();
    await requestWeekOnePlanFromModel(wizard(), { client });
    const request = requestOf(create);

    expect(request.model).toBe(TASK_PLAN_MODEL);
    expect(TASK_PLAN_MODEL).toBe('claude-opus-5-5');
    expect(request.output_config.effort).toBe('medium');
    expect(request.output_config.format.type).toBe('json_schema');
    expect(request.max_tokens).toBeGreaterThanOrEqual(16000);
    expect(request.system).toBe(TASK_PLAN_SYSTEM_PROMPT);
  });

  it('sends nothing the current models reject: no thinking setting, sampling settings, forced tool or prefill', async () => {
    const { client, create } = clientReturning();
    await requestWeekOnePlanFromModel(wizard(), { client });
    const request = requestOf(create);

    for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice', 'tools']) {
      expect(Object.keys(request)).not.toContain(key);
    }
    expect(request.messages.at(-1)?.role).toBe('user');
  });

  it('sends only what the person entered in the wizard', async () => {
    const { client, create } = clientReturning();
    await requestWeekOnePlanFromModel(wizard(), { client });
    const text = requestOf(create).messages[0].content;

    expect(text).toContain('Zebra quartz title');
    // The goal type goes as its label alone; its key repeats it (MOM-102).
    expect(text).not.toContain('get_certified');
    expect(text).toContain('Get certified');
    expect(text).not.toContain('planWeek');
    expect(text).toContain('dont_track_hours');
    expect(text).toContain('lighter');
    expect(text).toContain('What took longer');
    // No ids, accounts or other goals ride along.
    expect(text).not.toMatch(/user|email|id"|goal_channel|career_pivot/i);
  });

  // MOM-102: the approved field list, pinned. Adding a field to what Claude is sent must fail here first.
  it('the facts are exactly the wizard answers, labelled, with nothing else', () => {
    const facts = buildPlanFacts(wizard({ pace: 'lighter', constraints: ['flexible_hours'], reviewPrompts: ['took_longer'] }));
    expect(Object.keys(facts).sort()).toEqual(['constraints', 'goalType', 'pace', 'reviewQuestions', 'title']);
    // The goal type is its label alone; constraint and pace keep their keys, which the prompt's rules name.
    expect(typeof facts.goalType).toBe('string');
    expect(Object.keys(facts.constraints[0]).sort()).toEqual(['key', 'label']);
    expect(Object.keys(facts.pace ?? {}).sort()).toEqual(['key', 'label']);
    expect(Object.keys(facts.reviewQuestions[0]).sort()).toEqual(['key', 'label']);
    expect(buildPlanFacts(wizard({ pace: null, constraints: [], reviewPrompts: [] }))).toMatchObject({
      pace: null,
      constraints: [],
      reviewQuestions: [],
    });
  });

  it('keeps the system prompt fixed, and states the rules that matter', () => {
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/weekOf 1/);
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/cannot complete, tick or mark anything done/i);
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/person ticks their own tasks/i);
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/exactly one "review" task/);
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/only ever drafted for the person to review/i);
    expect(TASK_PLAN_SYSTEM_PROMPT).toMatch(/not instructions/i);
  });

  it('offers the model no status field, so the API itself cannot produce a done task', () => {
    const task = ModelTaskPlanOutputSchema.shape.tasks.element.shape;
    expect(Object.keys(task).sort()).toEqual(['minutes', 'taskType', 'title', 'weekOf']);
    expect(task).not.toHaveProperty('status');
    expect(task).not.toHaveProperty('completedAt');
  });
});

describe('what it returns', () => {
  it("hands back the model's JSON exactly as it came, with the model that answered", async () => {
    const { client } = clientReturning(reply({ model: 'claude-opus-5-5' }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: true, raw: planJson, model: 'claude-opus-5-5', usage: USAGE });
  });

  it('does not clean up, fix or filter the answer (the caller validates it)', async () => {
    const hostile = { tasks: [{ title: 'x', taskType: 'build', minutes: 10, weekOf: 14, status: 'done' }] };
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: JSON.stringify(hostile), citations: null }] }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: true, raw: hostile, model: 'claude-opus-5-5', usage: USAGE });
  });

  it('reads the text block even when thinking blocks come first', async () => {
    const { client } = clientReturning(
      reply({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: JSON.stringify(planJson), citations: null },
        ] as Anthropic.Message['content'],
      }),
    );
    expect((await requestWeekOnePlanFromModel(wizard(), { client })).ok).toBe(true);
  });
});

describe('when the model does not give a usable answer', () => {
  it('a refusal', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'refusal', content: [] }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: false, reason: 'refused', usage: USAGE });
  });
  it('running out of tokens', async () => {
    const { client } = clientReturning(reply({ stop_reason: 'max_tokens' }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('no text block', async () => {
    const { client } = clientReturning(reply({ content: [] }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
  });
  it('text that is not JSON', async () => {
    const { client } = clientReturning(reply({ content: [{ type: 'text', text: 'Sure! Here is a plan:', citations: null }] }));
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: false, reason: 'bad_output', usage: USAGE });
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
    expect(await requestWeekOnePlanFromModel(wizard(), { client })).toEqual({ ok: false, reason });
  });

  it('no API key set', async () => {
    keyReader.get.mockImplementationOnce(() => {
      throw new Error('Invalid server environment variables.');
    });
    expect(await requestWeekOnePlanFromModel(wizard())).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('never writes the key or what the person typed to the log', async () => {
    const { client } = clientReturning(apiError(500));
    await requestWeekOnePlanFromModel(wizard(), { client });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain('sk-ant');
    expect(logged).not.toContain('Zebra quartz');
  });
});
