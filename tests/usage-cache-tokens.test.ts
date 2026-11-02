// What a response's usage block turns into (lib/ai/usage.ts; MOM-165 added the two cache counts). Pure: no network, no database.

import { describe, expect, it } from 'vitest';
import { readUsage } from '@/lib/ai/usage';

describe('readUsage', () => {
  it('reads input, output, cache-read and cache-write tokens when the API reports all four', () => {
    expect(
      readUsage({ usage: { input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 1500, cache_creation_input_tokens: 400 } }),
    ).toEqual({ inputTokens: 2000, outputTokens: 300, cacheReadTokens: 1500, cacheWriteTokens: 400 });
  });

  it('keeps a reported 0 as 0', () => {
    expect(readUsage({ usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })).toEqual({
      inputTokens: 5,
      outputTokens: 6,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('gives null for both cache counts when the response did not report them, never 0', () => {
    expect(readUsage({ usage: { input_tokens: 5, output_tokens: 6 } })).toEqual({ inputTokens: 5, outputTokens: 6, cacheReadTokens: null, cacheWriteTokens: null });
    expect(readUsage({ usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: null, cache_creation_input_tokens: null } })).toMatchObject({
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
  });

  it('keeps the pair together: if either is missing or odd, both are null (the database check needs both or neither)', () => {
    for (const odd of [{ cache_read_input_tokens: 7 }, { cache_creation_input_tokens: 7 }, { cache_read_input_tokens: -1, cache_creation_input_tokens: 0 }, { cache_read_input_tokens: 1.5, cache_creation_input_tokens: 0 }, { cache_read_input_tokens: '7', cache_creation_input_tokens: 0 }]) {
      expect(readUsage({ usage: { input_tokens: 5, output_tokens: 6, ...odd } }), JSON.stringify(odd)).toEqual({
        inputTokens: 5,
        outputTokens: 6,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      });
    }
  });

  it('gives null when input or output is missing or odd, whatever the cache counts say', () => {
    expect(readUsage({})).toBeNull();
    expect(readUsage({ usage: null })).toBeNull();
    expect(readUsage({ usage: { input_tokens: 5, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 } })).toBeNull();
    expect(readUsage({ usage: { input_tokens: -5, output_tokens: 6 } })).toBeNull();
  });
});
