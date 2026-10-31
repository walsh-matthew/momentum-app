// The LIVE run of the weekly review's one line (MOM-113 block 3.3): real, paid Claude calls, through runReviewLine() exactly as
// the app will call it, so the review's budget, the 'weekly_review' usage row, the limits and the reply checks are all
// exercised. One case per run (MOM113_CASE), at most 2 calls each (the first, and one retry). It is not part of `npm test`
// and never runs in CI.
//
//   MOM113_LIVE=1 MOM113_CASE=floor_met npm run eval:review:line
//
// Without MOM113_LIVE=1 every test here is skipped, so `npm run eval:setup:pilot` (which runs every file in tests/live/)
// can never start it. It uses the same rails as the setup pilot (lib/ai/setupLive.ts, tests/setup-live.test.ts):
// 1. The environment is pointed at the LOCAL Supabase stack (address and keys from `npx supabase status -o env`, never from
//    .env.local, which points at production), and the run refuses unless that address is 127.0.0.1 or localhost. The only
//    thing taken from .env.local is ANTHROPIC_API_KEY.
// 2. The facts are made up for this run (no real person's rows). A throwaway account on the local stack holds the usage rows
//    and is deleted at the end, taking them with it.
// 3. The estimated cost of the run is checked against MAX_COST_USD, and printed. The report goes in the Jira comment.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REVIEW_MODEL, requestReviewLineFromModel } from '@/lib/ai/review';
import { applyLiveEnvironment, assertLocalSupabaseUrl, estimateCostUsd, localStackFromStatus, readEnvFileValue } from '@/lib/ai/setupLive';
import { getPublicEnv } from '@/lib/config/env';
import { checkReflectionLine, readReflectionReply, type ReflectionFacts } from '@/lib/review/reflection';
import { runReviewLine } from '@/lib/services/llm';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// The owner's cap for all of MOM-113's live calls is $0.10 (block 3.4: four cases, at most two calls each). One call is about a fifth of a cent.
const MAX_COST_USD = 0.1;

// Four weeks, made up: one that went well, one slipping (with a title that holds a digit and one that looks like an ask, so the
// exemption is exercised live), and one with nothing judged in the direct tone and again in the gentle one (block 3.4: the warmer prompt).
const CASES: Record<string, ReflectionFacts> = {
  floor_met: {
    tone: 'middle',
    targets: [
      { title: 'Lift weights', level: 'floor met', crossings: ['floor'], patterns: ['holding'], trend: null },
      { title: 'Read', level: 'aspiration reached', crossings: ['floor', 'aspiration'], patterns: [], trend: 'up' },
    ],
  },
  slipping: {
    tone: 'gentle',
    targets: [
      { title: 'Run 5k', level: 'partway', crossings: [], patterns: ['slipping'], trend: 'down' },
      { title: 'Try a new recipe', level: 'not started', crossings: [], patterns: [], trend: null },
    ],
  },
  nothing_judged: {
    tone: 'direct',
    targets: [{ title: 'Study', level: 'tracked, not judged', crossings: [], patterns: [], trend: null }],
  },
  nothing_judged_gentle: {
    tone: 'gentle',
    targets: [{ title: 'Study', level: 'tracked, not judged', crossings: [], patterns: [], trend: null }],
  },
};

const CASE_ID = process.env.MOM113_CASE ?? '';

describe.skipIf(process.env.MOM113_LIVE !== '1')('live weekly review line', () => {
  it(`asks for the line for ${CASE_ID || '(no case named)'} against ${REVIEW_MODEL}`, async () => {
    const facts = CASES[CASE_ID];
    if (!facts) throw new Error(`MOM113_CASE must be one of: ${Object.keys(CASES).join(', ')}.`);
    const titles = facts.targets.map((t) => t.title);

    // 1. Local only, whatever .env.local says.
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const status = spawnSync('npx supabase status -o env', { shell: true, encoding: 'utf8' });
    applyLiveEnvironment(process.env, localStackFromStatus(status.stdout ?? ''), readEnvFileValue(envFile, 'ANTHROPIC_API_KEY') ?? '');
    assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);

    // 2. A throwaway account on the local stack.
    const admin = createSupabaseAdminClient();
    const created = await admin.auth.admin.createUser({
      email: `mom113-live-${Date.now()}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error('Could not create the throwaway account on the local stack.');
    const userId = created.data.user.id;

    const calls: Array<{ call: number; retryNote: string | null; ok: boolean; reason: string | null; replyLine: unknown; checks: string; input: number; output: number }> = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let usageRows: Array<{ feature: string; model: string; outcome: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null }> = [];
    let result: Awaited<ReturnType<typeof runReviewLine>>;
    const started = Date.now();
    try {
      result = await runReviewLine(
        { userId, facts },
        {
          requestLine: async (input, deps) => {
            const reply = await requestReviewLineFromModel(input, deps);
            const usage = reply.usage ?? null;
            inputTokens += usage?.inputTokens ?? 0;
            outputTokens += usage?.outputTokens ?? 0;
            const checked = reply.ok ? readReflectionReply(reply.raw, titles) : null;
            calls.push({
              call: calls.length + 1,
              retryNote: input.retryFeedback && input.retryFeedback.length > 0 ? input.retryFeedback.join(' ') : null,
              ok: reply.ok,
              reason: reply.ok ? null : reply.reason,
              replyLine: reply.ok && reply.raw !== null && typeof reply.raw === 'object' ? (reply.raw as { line?: unknown }).line : null,
              checks: checked === null ? 'no reply' : checked.ok ? 'passed' : `refused: ${checked.problem}`,
              input: usage?.inputTokens ?? 0,
              output: usage?.outputTokens ?? 0,
            });
            return reply;
          },
        },
      );
      const rows = await admin.from('llm_usage_logs').select('feature, model, outcome, input_tokens, output_tokens, latency_ms').eq('user_id', userId);
      usageRows = rows.data ?? [];
    } finally {
      // The account takes its usage rows with it (on delete cascade).
      await admin.auth.admin.deleteUser(userId);
    }

    const cost = estimateCostUsd(REVIEW_MODEL, inputTokens, outputTokens);
    const summary = {
      case: CASE_ID,
      model: REVIEW_MODEL,
      supabase: 'local',
      calls: calls.length,
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost === null ? null : Number(cost.toFixed(5)),
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      result,
      perCall: calls,
      usageRows,
    };
    const text = JSON.stringify(summary, null, 2);
    const file = join(tmpdir(), `mom113-live-${CASE_ID}-${Date.now()}.json`);
    writeFileSync(file, text);
    console.log(`\n${text}\n\nReport written to ${file}\n`);

    // What must hold whatever the model said.
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(cost ?? Infinity).toBeLessThanOrEqual(MAX_COST_USD);
    expect(usageRows).toHaveLength(calls.length);
    for (const row of usageRows) expect(row).toMatchObject({ feature: 'weekly_review', model: REVIEW_MODEL });
    expect(usageRows.every((r) => r.outcome !== 'pending')).toBe(true);
    expect(result.kind).toBe('line');
    if (result.kind === 'line') expect(checkReflectionLine(result.line, titles).ok).toBe(true);
  });
});
