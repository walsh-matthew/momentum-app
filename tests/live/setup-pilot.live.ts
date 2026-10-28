// The LIVE pilot of the setup eval (MOM-128, design record §5.1 and §6.2): ONE full scripted case, run against the real
// model, through runSetupTurn() exactly as the app will call it, so the budget, the 'setup' usage row and the limits are
// all exercised. Run it with `npm run eval:setup:pilot`. It is not part of `npm test` and never runs in CI.
//
// What it does, in order, and refuses to do anything until the first step passes:
// 1. Points the environment at the LOCAL Supabase stack (address and keys from `npx supabase status`, never from .env.local,
//    which points at production) and refuses unless that address is 127.0.0.1 or localhost. The only thing it reads from
//    .env.local is ANTHROPIC_API_KEY. See lib/ai/setupLive.ts, and tests/setup-live.test.ts for the proof.
// 2. Makes one throwaway account on the local stack, runs the case, and deletes the account (and its usage rows) at the end.
// 3. Stops by itself if the estimated cost passes MAX_COST_USD, or at the setup budget's turn and token limits. A reply
//    that is not a valid turn is asked for again up to twice; every such reply is counted in the report.
// 4. Prints a report (turns, tokens, estimated cost, rule violations, final validation) and writes it to a file in the
//    system temp folder. The report goes in the Jira comment; it is not committed.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SETUP_MODEL } from '@/lib/ai/setup';
import { getPublicEnv } from '@/lib/config/env';
import { runSetupEval, violationsOf, type EvalReport, type SetupModelFn } from '@/lib/setup/evals';
import {
  applyLiveEnvironment,
  assertLocalSupabaseUrl,
  estimateCostUsd,
  localStackFromStatus,
  readEnvFileValue,
  topicKeyedReplies,
} from '@/lib/ai/setupLive';
import { SETUP_BUDGET, runSetupTurn } from '@/lib/services/llm';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { AssistantTurnSchema, type AssistantTurn } from '@/types/setup';
import { SETUP_CASES } from '../setup-evals/cases';

// run-h is the longest full case (22 scripted turns, about the 20 to 25 a real setup takes) and the one that sets a goal
// aside with a season, which is the parked-goal path migration 014 exists for.
const CASE_ID = process.env.MOM128_PILOT_CASE ?? 'run-h-two-activities';
// A stop-loss, not a budget: the run ends by itself past this estimated cost.
const MAX_COST_USD = 6;

describe('live setup pilot', () => {
  it(`runs ${CASE_ID} once against ${SETUP_MODEL}`, async () => {
    const c = SETUP_CASES.find((x) => x.id === CASE_ID);
    if (!c || c.expect !== 'clean') throw new Error(`"${CASE_ID}" is not a full conversation in the eval set.`);

    // 1. Local only, whatever .env.local says.
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const status = spawnSync('npx supabase status -o env', { shell: true, encoding: 'utf8' });
    applyLiveEnvironment(process.env, localStackFromStatus(status.stdout ?? ''), readEnvFileValue(envFile, 'ANTHROPIC_API_KEY') ?? '');
    // The exact address the service client will read.
    assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);

    // 2. A throwaway account on the local stack.
    const admin = createSupabaseAdminClient();
    const created = await admin.auth.admin.createUser({
      email: `mom128-live-${Date.now()}@example.invalid`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error('Could not create the throwaway account on the local stack.');
    const userId = created.data.user.id;

    const person = topicKeyedReplies(c.script.map((t) => t.topic), c.person);
    const perCall: Array<{
      call: number;
      turn: number;
      attempt: number;
      kind: string;
      topic: string | null;
      ok: boolean;
      schemaValid: boolean | null;
      input: number;
      output: number;
    }> = [];
    let spentTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let stoppedBy: string | null = null;
    const started = Date.now();

    // A reply that is not a valid turn is asked for again, up to this many times, as a real setup service would (nothing a
    // person said is lost; DOMAIN_MODEL §2.3). Every attempt is a real call and is counted and logged.
    const MAX_SCHEMA_RETRIES = 2;
    const schemaFailures: Array<{ turn: number; attempt: number; problems: string[] }> = [];

    const model: SetupModelFn = async ({ transcript, draft }) => {
      for (let attempt = 0; ; attempt++) {
        const result = await runSetupTurn({ userId, transcript, draft, spentTokens });
        if (result.kind !== 'answered') {
          stoppedBy = result.kind === 'quick_path' ? `quick path (${result.reason})` : 'wait';
          // Not a turn, so the runner records it as malformed and ends the case.
          return { stoppedBy } as unknown as AssistantTurn;
        }
        spentTokens = result.spentTokens;
        const usage = result.result.usage ?? null;
        inputTokens += usage?.inputTokens ?? 0;
        outputTokens += usage?.outputTokens ?? 0;
        const parsed = result.result.ok ? AssistantTurnSchema.safeParse(result.result.raw) : null;
        const raw = result.result.ok ? (result.result.raw as { kind?: string; topic?: string | null }) : null;
        perCall.push({
          call: perCall.length + 1,
          turn: result.turns,
          attempt,
          kind: raw?.kind ?? `failed:${result.result.ok ? '' : result.result.reason}`,
          topic: raw?.topic ?? null,
          ok: result.result.ok,
          schemaValid: parsed ? parsed.success : null,
          input: usage?.inputTokens ?? 0,
          output: usage?.outputTokens ?? 0,
        });
        if ((estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens) ?? Infinity) > MAX_COST_USD) {
          stoppedBy = `stop-loss: estimated cost passed $${MAX_COST_USD}`;
          return { stoppedBy } as unknown as AssistantTurn;
        }
        if (!result.result.ok) {
          stoppedBy = `model call failed: ${result.result.reason}`;
          return { stoppedBy } as unknown as AssistantTurn;
        }
        if (parsed && !parsed.success) {
          // Field names and rules only: the messages name keys and expected types, never what the person said.
          schemaFailures.push({
            turn: result.turns,
            attempt,
            problems: parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`),
          });
          if (attempt < MAX_SCHEMA_RETRIES) continue;
        }
        return result.result.raw as AssistantTurn;
      }
    };

    let report: EvalReport;
    let usageRows: Array<{ feature: string; outcome: string }> = [];
    try {
      report = await runSetupEval(c, model, { reply: (turn) => person.reply(turn) });
      const rows = await admin.from('llm_usage_logs').select('feature, outcome').eq('user_id', userId);
      usageRows = rows.data ?? [];
    } finally {
      // The account takes its usage rows with it (on delete cascade).
      await admin.auth.admin.deleteUser(userId);
    }

    const cost = estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens);
    const summary = {
      case: c.id,
      model: SETUP_MODEL,
      supabase: 'local',
      calls: perCall.length,
      turnsReached: Math.max(0, ...perCall.map((c) => c.turn)),
      repliesFailingTheSchema: schemaFailures.length,
      schemaFailures,
      finished: report.finished,
      stoppedBy,
      malformed: report.malformed,
      ranOutOfPerson: report.ranOutOfPerson,
      finalValidationIssues: report.finalIssues?.map((i) => `${i.path}: ${i.message}`) ?? null,
      ruleViolations: violationsOf(report),
      // The same violation repeated on every later turn (the draft is returned whole each time) is listed once, with the
      // first turn it appeared on and how many turns carried it.
      violationDetails: [
        ...report.turns
          .flatMap((t) => t.violations.map((v) => ({ turn: t.index, rule: v.rule, message: v.message })))
          .reduce((m, v) => {
            const key = `${v.rule}|${v.message}`;
            const seen = m.get(key);
            if (seen) seen.turns += 1;
            else m.set(key, { ...v, turns: 1 });
            return m;
          }, new Map<string, { turn: number; rule: string; message: string; turns: number }>())
          .values(),
      ],
      tokens: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      estimatedCostUsd: cost === null ? null : Number(cost.toFixed(3)),
      budget: SETUP_BUDGET,
      scriptedRepliesUsed: report.transcript.filter((m) => m.role === 'person').length - person.fallbackCount(),
      fillerRepliesUsed: person.fallbackCount(),
      usageRowsLogged: usageRows.length,
      usageRowsBySetupFeature: usageRows.filter((r) => r.feature === 'setup').length,
      usageRowOutcomes: Object.fromEntries(
        [...new Set(usageRows.map((r) => r.outcome))].map((o) => [o, usageRows.filter((r) => r.outcome === o).length]),
      ),
      seconds: Math.round((Date.now() - started) / 1000),
      perCall,
    };
    const path = join(tmpdir(), 'mom128-pilot-report.json');
    writeFileSync(path, JSON.stringify(summary, null, 2));
    process.stdout.write(`\nPILOT REPORT (also written to ${path})\n${JSON.stringify(summary, null, 2)}\n`);

    // The pilot measures; it does not pass or fail the model. It does insist that every call was logged as 'setup'.
    expect(summary.usageRowsBySetupFeature).toBe(summary.calls);
  });
});
