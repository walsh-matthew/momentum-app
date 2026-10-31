// The Claude call for layer 2 of the weekly review: one plain line about the week (MOM-113 block 3.3, docs/DOMAIN_MODEL.md
// §3). Server-side only: it reads ANTHROPIC_API_KEY, and `server-only` fails the build if a Client Component ever imports it
// (CLAUDE.md, Architectural Directive 1). Same shape as lib/ai/setup.ts and the same official SDK.
//
// This module only asks and returns what the model said. It does not decide whether the line can be shown: the caller
// (runReviewLine in lib/services/llm.ts) runs the raw reply through lib/review/reflection.ts's checks, and a line that fails
// is asked for again once and then replaced by a line written by code. The app calls this only through runReviewLine(), which
// applies the review's limits and budget and logs the call under 'weekly_review'; a call made any other way would be uncounted.
//
// What it sends is `reviewPromptFacts()` below, pinned field by field in lib/config/privacy.ts's PROMPTS.review
// (tests/review-prompt-fields.test.ts): the person's own target titles, where each week ended as a word, what crossed, the
// pattern kinds, the trend direction, the tone setting, and, on a retry, code's fixed note about the rule the last try broke.
// No counts, dates, units, goal titles, priorities, ids or email.
//
// Thinking is off (`between_tools`, the way Sonnet 5.5 turns it off; `disabled` is refused by the API) because one short
// sentence needs none, and thinking tokens would count against the small output limit.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from '@/lib/config/env';
import { REFLECTION_MAX_CHARS, type ReflectionFacts } from '@/lib/review/reflection';
import { readUsage, type ModelUsage } from './usage';

// Words only, so the smaller model. One constant, so changing it is a one-line decision. Price per million tokens (checked
// against the Claude API price table cached 2026-10-06, see docs/LLM_GOVERNANCE.md): $2 in, $10 out.
export const REVIEW_MODEL = 'claude-sonnet-5-5';

// A sentence under 200 characters is well under 100 tokens; this is the ceiling, not the aim.
export const REVIEW_MAX_OUTPUT_TOKENS = 400;
export const REVIEW_REQUEST_TIMEOUT_MS = 30_000;

export const REVIEW_SYSTEM_PROMPT = `You write one short line for a person's weekly review in Momentum, a goal-tracking app. You are given facts about the week they just finished: for each of their own targets, where the week ended (in words), what they reached, any pattern, and which way the trend is going, plus how they like to be spoken to (tone).

Write ONE plain sentence, under ${REFLECTION_MAX_CHARS} characters, that says how the week went. Use everyday words and speak to the person as "you". When you name a target, use its title exactly as given.

Rules:
- No numbers at all: no digits and no number words (not "two", "twice", "first", "half"). No percentages, scores, grades or ratings.
- No question, and nothing the person must answer or do. Do not suggest, advise, remind or ask. Do not mention next week or what to change.
- Say only what the facts say. Add no activity, reason, feeling, date or weekday that the facts do not give. A target "tracked, not judged" was not graded: do not call it good or bad.
- Never call a week a failure or a miss.
- A celebration stands alone. If something is worth being glad about, say only that.
- Tone: "gentle" is soft and warm, "middle" is calm and plain, "direct" is brief and matter-of-fact. Tone changes your words, never the facts.
- Reply with only a JSON object: {"line": "<your one sentence>"}. If a note says your last try was not usable, fix exactly that.`;

// Why a model answer was not used.
export type ModelReviewFailure = 'not_configured' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_output';

export type ModelReviewResult =
  | { ok: true; raw: unknown; model: string; usage: ModelUsage | null }
  | { ok: false; reason: ModelReviewFailure; usage?: ModelUsage | null };

export interface ModelReviewDeps {
  // Swappable in tests so no network call is made.
  client?: Pick<Anthropic, 'messages'>;
  model?: string;
}

// Exactly what one review-line call sends Claude, as a plain object rather than the API's wire format: the facts, and on a retry
// code's note about the rule the last try broke (fixed words, nothing the person typed). The privacy notice is pinned against
// this by fieldPaths().
export interface ReviewPromptFacts extends ReflectionFacts {
  retryFeedback?: string[];
}

export function reviewPromptFacts(facts: ReflectionFacts, retryFeedback: string[] = []): ReviewPromptFacts {
  const sent: ReviewPromptFacts = { tone: facts.tone, targets: facts.targets };
  if (retryFeedback.length > 0) sent.retryFeedback = retryFeedback;
  return sent;
}

export const REVIEW_RETRY_HEADER = 'Your last try could not be used. Fix this and answer again:';

export function buildReviewMessages(facts: ReflectionFacts, retryFeedback: string[] = []): Anthropic.MessageParam[] {
  const sent = reviewPromptFacts(facts, retryFeedback);
  const blocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: `Facts about the week, as JSON:\n${JSON.stringify({ tone: sent.tone, targets: sent.targets })}` },
  ];
  if (sent.retryFeedback) blocks.push({ type: 'text', text: [REVIEW_RETRY_HEADER, ...sent.retryFeedback.map((line) => `- ${line}`)].join('\n') });
  return [{ role: 'user', content: blocks }];
}

// The JSON object in a reply, whether or not it came wrapped in a code fence.
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

// Asks Claude for the line. Returns the model's raw JSON, parsed but otherwise untouched. The SDK does not retry on its own, so a
// hidden retry cannot double the cost without the budget knowing.
export async function requestReviewLineFromModel(
  input: { facts: ReflectionFacts; retryFeedback?: string[]; timeoutMs?: number },
  deps: ModelReviewDeps = {},
): Promise<ModelReviewResult> {
  const timeout = Math.max(1_000, Math.min(input.timeoutMs ?? REVIEW_REQUEST_TIMEOUT_MS, REVIEW_REQUEST_TIMEOUT_MS));
  let client: Pick<Anthropic, 'messages'>;
  try {
    client = deps.client ?? new Anthropic({ apiKey: getAnthropicApiKey(), maxRetries: 0 });
  } catch {
    // ANTHROPIC_API_KEY is not set in this environment.
    return { ok: false, reason: 'not_configured' };
  }

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model: deps.model ?? REVIEW_MODEL,
        max_tokens: REVIEW_MAX_OUTPUT_TOKENS,
        thinking: { type: 'between_tools' },
        output_config: { effort: 'low' },
        system: REVIEW_SYSTEM_PROMPT,
        messages: buildReviewMessages(input.facts, input.retryFeedback),
      },
      { timeout, maxRetries: 0 },
    );
  } catch (error) {
    // Most specific first. Log the kind of failure, never the message body or anything about the key.
    if (error instanceof Anthropic.RateLimitError) return { ok: false, reason: 'rate_limited' };
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('[review-ai] the API key was rejected', { httpCode: error.status });
      return { ok: false, reason: 'not_configured' };
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[review-ai] request failed', { httpCode: error.status });
    } else {
      console.error('[review-ai] request failed', { name: error instanceof Error ? error.name : 'unknown' });
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
