// MOM-167 part 3: the screen's automatic resend after an app switch waits past the server's minimum gap between one person's setup calls,
// so it is not refused as "too soon". The gap is read from SETUP_LIMITS (lib/services/llm.ts, 1 second; migration 011's 20 seconds is the
// old model's LLM_LIMITS, not setup's) and checked against reserve_llm_call's rule as tests/helpers/fakeLlmUsage.ts follows it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLM_LIMITS, REVIEW_LIMITS, SETUP_LIMITS, runWithinBudget } from '@/lib/services/llm';
import { RESEND_AFTER_MS, RESEND_MARGIN_MS } from '@/lib/setup/session';
import { resetUsage, seedUsage } from './helpers/fakeLlmUsage';
import { USER } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/admin', async () => {
  const { createSupabaseAdminClient } = await import('./helpers/fakeLlmUsage');
  return { createSupabaseAdminClient };
});

const ok = { ok: true as const, raw: {}, model: 'claude-opus-5-5', usage: { inputTokens: 1, outputTokens: 1 } };
const resend = () =>
  runWithinBudget({
    userId: USER,
    feature: 'setup',
    model: 'claude-opus-5-5',
    limits: SETUP_LIMITS,
    call: async () => ok,
    report: () => ({ outcome: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }),
  });

beforeEach(() => resetUsage());

describe('the gap between setup calls', () => {
  it('is the function’s one second, not the old model’s twenty', () => {
    expect(SETUP_LIMITS.minIntervalSeconds).toBe(1);
    expect(REVIEW_LIMITS.minIntervalSeconds).toBe(1);
    expect(LLM_LIMITS.minIntervalSeconds).toBe(20);
  });

  it('the resend waits longer than the gap, with a margin', () => {
    expect(RESEND_AFTER_MS).toBeGreaterThan(SETUP_LIMITS.minIntervalSeconds * 1000);
    expect(RESEND_AFTER_MS - SETUP_LIMITS.minIntervalSeconds * 1000).toBeGreaterThanOrEqual(RESEND_MARGIN_MS);
  });

  it('a resend that comes RESEND_AFTER_MS after the cut-off call began is not refused as too soon', async () => {
    seedUsage(USER, RESEND_AFTER_MS);
    const result = await resend();
    expect(result.kind).toBe('answered');
  });

  it('a resend sent at once would have been refused, and told to wait', async () => {
    seedUsage(USER, 400);
    const result = await resend();
    expect(result).toMatchObject({ kind: 'limited', limit: 'too_soon' });
  });
});
