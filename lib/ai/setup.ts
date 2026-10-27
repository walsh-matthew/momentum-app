// The Claude call for one turn of guided setup (MOM-111, docs/DOMAIN_MODEL.md §2). Server-side only: it reads
// ANTHROPIC_API_KEY, and `server-only` fails the build if a Client Component ever imports it (CLAUDE.md, Architectural
// Directive 1). Same shape as lib/ai/taskPlan.ts and the same official SDK.
//
// This module only asks and returns what the model said. It does not decide whether the answer can be trusted: the caller
// (a setup service, in the next block) runs the raw output through AssistantTurnSchema and checkTurn() from lib/setup/,
// and only then shows the person anything. Nothing here is wired to lib/services/llm.ts yet, so nothing calls it in the
// app: the per-setup budget, the usage-log feature name and the limits come with the budget block, and a call made before
// that would be uncounted. Until then the only callers are tests, against a fake client.
//
// The reply is plain JSON that the strict schema checks afterwards. It does not use the API's structured-output
// constraint: the draft schema has unions and bounds that constraint may not accept, and that has not been tried against
// the real API (no live call has been approved). Whether to move to it is for the live-run block.
//
// What it sends: only what the person typed in this setup, and Claude's own earlier turns. No other goals, tasks, ids or
// email.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/lib/config/env';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import type { SetupDraft, Transcript } from '@/types/setup';
import { readUsage, type ModelUsage } from './usage';

// Claude Opus 5.5, the default model. One constant, so changing it is a one-line decision. The smaller-model trial is a
// later block's job (design record §6.2 step 3).
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
}

// The first message the API sees is always the person's side; this stands in before they have said anything.
export const SETUP_BEGIN_MESSAGE = 'Begin setup.';

// The conversation as the API takes it: the person's words as user messages, Claude's earlier turns as assistant messages.
export function buildSetupMessages(transcript: Transcript): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: SETUP_BEGIN_MESSAGE }];
  for (const m of transcript) {
    messages.push(
      m.role === 'person' ? { role: 'user', content: m.text } : { role: 'assistant', content: JSON.stringify(m.turn) },
    );
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
  input: { transcript: Transcript; draft: SetupDraft },
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
      model: SETUP_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: 'medium' },
      system: SETUP_SYSTEM_PROMPT,
      messages: buildSetupMessages(input.transcript),
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
