// The Claude call for one turn of guided setup (MOM-111, docs/DOMAIN_MODEL.md §2). Server-side only: it reads
// ANTHROPIC_API_KEY, and `server-only` fails the build if a Client Component ever imports it (CLAUDE.md, Architectural
// Directive 1). Same shape as lib/ai/taskPlan.ts and the same official SDK.
//
// This module only asks and returns what the model said. It does not decide whether the answer can be trusted: the caller
// (a setup service, in the next block) runs the raw output through AssistantTurnSchema and checkTurn() from lib/setup/,
// and only then shows the person anything. The app calls this only through runSetupTurn() in lib/services/llm.ts (MOM-128),
// which applies the setup limits and the per-setup budget and logs the call; a call made any other way would be uncounted.
//
// The reply is plain JSON that the strict schema checks afterwards. It does not use the API's structured-output
// constraint: the draft schema has unions and bounds that constraint may not accept, and that has not been tried against
// the real API (no live call has been approved). Whether to move to it is for the live-run block.
//
// What it sends: only what the person typed in this setup, Claude's own earlier turns, the current draft once, and the
// date on their device as a suggested start date. No other goals, tasks, ids or email. Pinned field by field in
// `lib/config/privacy.ts`'s `PROMPTS.setup`, against `setupPromptFacts()` below (MOM-111 block 3, MOM-102).
//
// Since MOM-128 it is called through runSetupTurn() in lib/services/llm.ts, which counts the call, applies the setup limits
// and the per-setup budget, and logs it under 'setup'. The default model is still this file's SETUP_MODEL.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/lib/config/env';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import type { AssistantTurn, SetupDraft, Transcript } from '@/types/setup';
import { readUsage, type ModelUsage } from './usage';

// Claude Opus 5.5, the default model. One constant, so changing it is a one-line decision. The smaller-model trial
// (design record §6.2 step 3) passes another model in `deps.model` and keeps it only if it passes the same eval set.
export const SETUP_MODEL = 'claude-opus-5-5';

// Output includes the model's thinking, and the reply carries the whole draft, so leave room.
const MAX_OUTPUT_TOKENS = 16000;
const REQUEST_TIMEOUT_MS = 60_000;

// Why a model answer was not used. The caller turns each into a plain-words message.
export type ModelSetupFailure = 'not_configured' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_output';

export type ModelSetupResult =
  | { ok: true; raw: unknown; model: string; usage: ModelUsage | null }
  | { ok: false; reason: ModelSetupFailure; usage?: ModelUsage | null };

export interface ModelSetupDeps {
  // Swappable in tests so no network call is made.
  client?: Pick<Anthropic, 'messages'>;
  // The smaller-model trial (design record §6.2 step 3) runs the same eval set on another model. Defaults to SETUP_MODEL.
  model?: string;
}

// The first message the API sees is always the person's side; this stands in before they have said anything.
export const SETUP_BEGIN_MESSAGE = 'Begin setup.';

// What an earlier draft is replaced with in the history (MOM-128). Every reply of Claude's carries the whole draft, so
// sending each one back made the request grow with the square of the number of turns. Only the newest draft matters: it
// is the one Claude starts from, and it already holds everything the older ones did.
export const SETUP_DRAFT_PLACEHOLDER = 'Earlier draft left out. The current draft is at the end of the newest message.';

// An earlier assistant turn, as it is actually sent: everything but its own (placeholdered) draft.
export type SentAssistantTurn = Omit<AssistantTurn, 'draft'>;

// Exactly what one setup call sends Claude, as a plain object rather than the API's wire format (MOM-111, MOM-102): the
// person's own words so far, Claude's own earlier turns (without their drafts), the current draft once, and the device
// date. `lib/config/privacy.ts`'s `PROMPTS.setup` is pinned against this by `fieldPaths()`, the same way `buildModelFacts`
// backs the rebalance notice. Pure: no network, no model.
export interface SetupPromptFacts {
  personMessages: string[];
  assistantTurns: SentAssistantTurn[];
  draft: SetupDraft;
  today?: string;
}

export function setupPromptFacts(transcript: Transcript, draft: SetupDraft, today?: string): SetupPromptFacts {
  const personMessages: string[] = [];
  const assistantTurns: SentAssistantTurn[] = [];
  for (const m of transcript) {
    if (m.role === 'person') personMessages.push(m.text);
    else {
      const { draft: _draft, ...rest } = m.turn;
      assistantTurns.push(rest);
    }
  }
  return today === undefined ? { personMessages, assistantTurns, draft } : { personMessages, assistantTurns, draft, today };
}

// The conversation as the API takes it: the person's words as user messages, Claude's earlier turns as assistant messages
// with their draft replaced by the placeholder, and the current draft once, at the end of the newest message. Everything
// else in an earlier turn (what it said and asked, its kind, topic and options) is sent unchanged.
//
// `today` is the date on the person's own device, sent by the browser as a SUGGESTION for a goal's start date (the server
// does not know their time zone before setup has asked it). It is one extra line after the draft, labelled as a
// suggestion, and is left out when the browser did not send one (MOM-111).
export function buildSetupMessages(transcript: Transcript, draft: SetupDraft, today?: string): Anthropic.MessageParam[] {
  const facts = setupPromptFacts(transcript, draft, today);
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: SETUP_BEGIN_MESSAGE }];
  let personIndex = 0;
  let assistantIndex = 0;
  for (const m of transcript) {
    messages.push(
      m.role === 'person'
        ? { role: 'user', content: facts.personMessages[personIndex++] }
        : { role: 'assistant', content: JSON.stringify({ ...facts.assistantTurns[assistantIndex++], draft: SETUP_DRAFT_PLACEHOLDER }) },
    );
  }
  const suggestion = facts.today ? `\nSuggested start date (today's date on the person's device, a suggestion only): ${facts.today}` : '';
  const current = `Current draft, to start from:\n${JSON.stringify(facts.draft)}${suggestion}`;
  const last = messages[messages.length - 1];
  if (last.role === 'user' && typeof last.content === 'string') {
    // Two blocks in the one message, so the person's own words stay apart from the draft.
    last.content = [
      { type: 'text', text: last.content },
      { type: 'text', text: current },
    ];
  } else {
    messages.push({ role: 'user', content: current });
  }
  return messages;
}

// The JSON object in a reply, whether or not it came wrapped in a code fence.
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

// Asks Claude for the next turn. Returns the model's raw JSON, parsed but otherwise untouched.
export async function requestSetupTurnFromModel(
  input: { transcript: Transcript; draft: SetupDraft; today?: string },
  deps: ModelSetupDeps = {},
): Promise<ModelSetupResult> {
  let client: Pick<Anthropic, 'messages'>;
  try {
    client = deps.client ?? new Anthropic({ apiKey: getAnthropicApiKey(), timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  } catch {
    // ANTHROPIC_API_KEY is not set in this environment.
    return { ok: false, reason: 'not_configured' };
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: deps.model ?? SETUP_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: 'medium' },
      system: SETUP_SYSTEM_PROMPT,
      messages: buildSetupMessages(input.transcript, input.draft, input.today),
    });
  } catch (error) {
    // Most specific first. Log the kind of failure, never the message body or anything about the key.
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate_limited' };
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('[setup-ai] the API key was rejected', { httpCode: error.status });
      return { ok: false, reason: 'not_configured' };
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[setup-ai] request failed', { httpCode: error.status });
    } else {
      console.error('[setup-ai] request failed', { name: error instanceof Error ? error.name : 'unknown' });
    }
    return { ok: false, reason: 'unavailable' };
  }

  const usage = readUsage(response);

  // Check the stop reason before reading content. A refusal (HTTP 200) carries no usable answer.
  if (response.stop_reason === 'refusal') return { ok: false, reason: 'refused', usage };
  if (response.stop_reason === 'max_tokens') return { ok: false, reason: 'bad_output', usage };

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
  if (!text) return { ok: false, reason: 'bad_output', usage };
  try {
    return { ok: true, raw: extractJson(text.text), model: response.model, usage };
  } catch {
    return { ok: false, reason: 'bad_output', usage };
  }
}
