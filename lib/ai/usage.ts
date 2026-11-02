// What a Claude call cost, as the API reports it (MOM-73, cache tokens MOM-165). Just numbers: no prompt, no answer. The
// service in @/lib/services/llm.ts records them in llm_usage_logs; this module only reads them off a response.

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  // Tokens the API read from its prompt cache, and tokens it wrote to it, for this call. Null when the response did not
  // report them: "not reported" is never guessed as 0. Anthropic counts both OUTSIDE inputTokens, so they are not part of
  // the per-setup token budget (SETUP_BUDGET.maxTokens, input plus output). Caching is off today; whoever turns it on
  // decides whether the budget should include them.
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}

interface UsageBlock {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// The usage block of a Messages API response, or null when input and output are missing or not numbers. Never throws: a
// response that is odd in this one respect must not turn a good answer into a failure. The two cache counts are kept
// together or not at all, as the database check requires: if either is missing or odd, both are null.
export function readUsage(response: { usage?: UsageBlock | null }): ModelUsage | null {
  const input = response.usage?.input_tokens;
  const output = response.usage?.output_tokens;
  if (!isCount(input) || !isCount(output)) return null;
  const read = response.usage?.cache_read_input_tokens;
  const write = response.usage?.cache_creation_input_tokens;
  const cached = isCount(read) && isCount(write);
  return { inputTokens: input, outputTokens: output, cacheReadTokens: cached ? read : null, cacheWriteTokens: cached ? write : null };
}
