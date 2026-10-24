// What a Claude call cost, as the API reports it (MOM-73). Just two numbers: no prompt, no answer. The service in
// @/lib/services/llm.ts records them in llm_usage_logs; this module only reads them off a response.

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

// The usage block of a Messages API response, or null when it is missing or not numbers. Never throws: a response
// that is odd in this one respect must not turn a good answer into a failure.
export function readUsage(response: { usage?: { input_tokens?: unknown; output_tokens?: unknown } | null }): ModelUsage | null {
  const input = response.usage?.input_tokens;
  const output = response.usage?.output_tokens;
  if (typeof input !== 'number' || typeof output !== 'number') return null;
  if (!Number.isInteger(input) || !Number.isInteger(output) || input < 0 || output < 0) return null;
  return { inputTokens: input, outputTokens: output };
}
