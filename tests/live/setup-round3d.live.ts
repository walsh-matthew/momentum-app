// The LIVE check of MOM-111 setup round 3d: the owner's path from round 2 (variant 1), against the real model, through
// runCheckedTurn(), the same turn the app takes. It goes as far as the number and ideas cards: on the question about the least
// that counts, and on the one about the number hoped for, the person says they are not sure and asks for ideas, takes the
// offer of ideas, and picks option 2. It stops right after that, so it reports what the number cards, the ideas cards' lead
// line and their buttons looked like (round 3d: "make", the counted thing in each button). It runs only with MOM111_ROUND3D=1,
// so `npm run eval:setup:pilot` alone never starts it, and like the pilot it never runs in `npm test` or CI.
//
//   MOM111_ROUND3D=1 npx vitest run --config vitest.live.config.mts tests/live/setup-round3d.live.ts
//   (MOM111_MAX_COST_USD=1 sets a lower cap; this round's default is $2.)
//
// The same safety rails as the pilot (lib/ai/setupLive.ts): the local Supabase stack only, a throwaway account deleted at the
// end, and a cap: before each turn the run stops itself when the cost so far plus the dearest turn so far could pass
// MAX_COST_USD, and after each turn when it has. It runs from the start to the turn after the source answer.
// The report (each turn's outcome, thrown-away replies with their codes, replies shown after their plain-words retry, seconds,
// tokens and cost) goes to the system temp folder; it holds Claude's questions and the owner's scripted answers, no key and no
// address.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SETUP_MODEL } from '@/lib/ai/setup';
import { applyLiveEnvironment, assertLocalSupabaseUrl, estimateCostUsd, localStackFromStatus, readEnvFileValue } from '@/lib/ai/setupLive';
import { getPublicEnv } from '@/lib/config/env';
import { SETUP_TURN_BUDGET_MS, runCheckedTurn } from '@/lib/services/setup';
import { optionsLead } from '@/lib/setup/optionsLead';
import { personWords } from '@/lib/setup/said';
import { APPROVE_TEXT, PROPOSAL_YES_TEXT, newSession, withAssistantTurn, withPersonMessage } from '@/lib/setup/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { AssistantTurn, SetupSession, SetupTopic } from '@/types/setup';

const RUN = process.env.MOM111_ROUND3D === '1';
const TODAY = '2026-10-30';
const MAX_COST_USD = Number(process.env.MOM111_MAX_COST_USD) > 0 ? Number(process.env.MOM111_MAX_COST_USD) : 2;
const NOT_SURE = "I'm not sure, do you have any ideas?";

// The owner's answers from round 2, by what the question is about, each used once in this order. On the two number questions
// the person asks for ideas first (round 3d), then takes option 2 of the ideas card.
const ANSWERS: Partial<Record<SetupTopic, string[]>> = {
  idea: ['physical fitness'],
  why: ['i wanna be around for my kids'],
  breakup: ['one goal'],
  priorities: ['family time'],
  starting_point: ['dabbled a little'],
  shape: ['habit'],
  start_date: ['next week', 'Monday'],
  block_length: ['any recommendations?', 'two months from now'],
  target: ['workouts'],
  role: ['something I do'],
  floor: [NOT_SURE, '2'],
  aspiration: [NOT_SURE, '3'],
};

interface TurnLog {
  n: number;
  answered: string | null;
  outcome: string;
  kind: string | null;
  topic: string | null;
  say: string | null;
  question: string | null;
  detail: string | null;
  options: string[];
  byCode: boolean;
  calls: number;
  thrownAway: number;
  thrownAwayBy: string[];
  shownAfterPlainRetry: string[];
  seconds: number;
  // What the card showed in code's words (round 3d): the number question, or the ideas card's lead line.
  shownLead: string | null;
}

describe.skipIf(!RUN)("MOM-111 round 3d: the owner's path to the number and ideas cards, live", () => {
  it(`runs variant 1 against ${SETUP_MODEL}`, async () => {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const status = spawnSync('npx supabase status -o env', { shell: true, encoding: 'utf8' });
    applyLiveEnvironment(process.env, localStackFromStatus(status.stdout ?? ''), readEnvFileValue(envFile, 'ANTHROPIC_API_KEY') ?? '');
    assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);

    const admin = createSupabaseAdminClient();
    const created = await admin.auth.admin.createUser({ email: `mom111-r3d-${Date.now()}@example.invalid`, password: crypto.randomUUID(), email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Could not create the throwaway account on the local stack.');
    const userId = created.data.user.id;

    // Names and codes only, by design (lib/services/setup.ts).
    const warnings: { message: string; fields: Record<string, unknown> }[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((message: unknown, fields: unknown) => {
      warnings.push({ message: String(message), fields: (fields ?? {}) as Record<string, unknown> });
    });

    const usage = async () => {
      const { data } = await admin.from('llm_usage_logs').select('input_tokens, output_tokens').eq('user_id', userId);
      const rows = data ?? [];
      const input = rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0);
      const output = rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0);
      return { calls: rows.length, input, output, cost: estimateCostUsd(SETUP_MODEL, input, output) ?? Infinity };
    };

    const turns: TurnLog[] = [];
    let stoppedBy: string | null = null;
    let fillers = 0;

    // One turn, live, logged. Returns the session after it, or null when no turn came.
    let dearestTurn = 0;
    const take = async (session: SetupSession, answered: string | null): Promise<SetupSession | null> => {
      const before = await usage();
      if (before.cost + dearestTurn > MAX_COST_USD) {
        stoppedBy = `cap: the next turn could pass $${MAX_COST_USD}`;
        return null;
      }
      const warnFrom = warnings.length;
      const started = Date.now();
      const view = await runCheckedTurn({ userId, session, today: TODAY, locale: 'en-US', deadlineMs: Date.now() + SETUP_TURN_BUDGET_MS });
      const after = await usage();
      const logged = warnings.slice(warnFrom);
      const thrown = logged.filter((w) => w.message.includes('thrown away'));
      const plainShown = logged.filter((w) => w.message.includes('shown after its plain-words retry'));
      const t = view.kind === 'turn' ? view.turn : null;
      turns.push({
        n: turns.length + 1,
        answered,
        outcome: view.kind === 'failed' ? `failed:${view.reason}` : view.kind,
        kind: t?.kind ?? null,
        topic: t?.topic ?? null,
        say: t?.say || null,
        question: t?.question ?? null,
        detail: t?.detail ?? null,
        options: t?.options ?? [],
        byCode: after.calls === before.calls,
        calls: after.calls - before.calls,
        thrownAway: view.kind === 'turn' || view.kind === 'failed' ? view.rejected : 0,
        thrownAwayBy: thrown.map((w) => [w.fields.category, w.fields.problem, ...((w.fields.codes as string[]) ?? []), ...((w.fields.issues as { path: string; code: string }[]) ?? []).map((i) => `${i.code}@${i.path}`)].filter(Boolean).join(' ')),
        shownAfterPlainRetry: plainShown.flatMap((w) => (w.fields.codes as string[]) ?? []),
        seconds: Math.round((Date.now() - started) / 1000),
        shownLead: t ? (t.kind === 'ideas' || t.kind === 'interpretations' ? optionsLead(t, TODAY, personWords(session.transcript)) : t.question) : null,
      });
      dearestTurn = Math.max(dearestTurn, after.cost - before.cost);
      if (after.cost > MAX_COST_USD) stoppedBy = `stop-loss: estimated cost passed $${MAX_COST_USD}`;
      if (view.kind !== 'turn') {
        stoppedBy ??= `no turn: ${view.kind}${view.kind === 'failed' ? ` (${view.reason})` : ''}`;
        return null;
      }
      return withAssistantTurn(session, view.turn, view.spentTokens);
    };

    const queues = new Map(Object.entries(ANSWERS).map(([k, v]) => [k, [...(v ?? [])]]));
    const numberTopic = (turn: AssistantTurn) => turn.topic === 'floor' || turn.topic === 'aspiration';
    const reply = (turn: AssistantTurn): string => {
      if (turn.kind === 'offer_ideas' && numberTopic(turn)) return 'Yes, some starting ideas would help.';
      if ((turn.kind === 'ideas' || turn.kind === 'interpretations') && numberTopic(turn)) {
        if (turn.topic === 'aspiration') numberCardsDone = true;
        return 'Option 2';
      }
      const next = turn.topic ? queues.get(turn.topic)?.shift() : undefined;
      if (next) return next;
      if (turn.kind === 'playback') return APPROVE_TEXT;
      if (turn.kind === 'proposal') return PROPOSAL_YES_TEXT;
      fillers += 1;
      return 'Whatever you suggest is fine.';
    };

    let numberCardsDone = false;
    let session: SetupSession | null = null;
    try {
      // Variant 1: from the start to the turn after the ideas card about the number hoped for was answered.
      session = await take(newSession(), null);
      for (let i = 0; session && i < 40 && !stoppedBy; i++) {
        const last = session.transcript[session.transcript.length - 1];
        if (last.role !== 'assistant') break;
        if (last.turn.kind === 'final') break;
        if (numberCardsDone) break;
        const text = reply(last.turn);
        session = await take(withPersonMessage(session, text), text);
      }
    } finally {
      warnSpy.mockRestore();
    }

    const total = await usage();
    await admin.auth.admin.deleteUser(userId);

    const report = {
      model: SETUP_MODEL,
      supabase: 'local',
      today: TODAY,
      turns,
      capUsd: MAX_COST_USD,
      thrownAwayTotal: turns.reduce((s, t) => s + t.thrownAway, 0),
      fillerAnswers: fillers,
      stoppedBy,
      reachedNumberAndIdeasCards: numberCardsDone,
      ideasCardsSeen: turns.filter((t) => (t.kind === 'ideas' || t.kind === 'interpretations') && (t.topic === 'floor' || t.topic === 'aspiration')).map((t) => ({ topic: t.topic, lead: t.shownLead, options: t.options })),
      targets: session?.draft.model.goals.map((g) => ({ goal: g.key, targets: g.targets.map((t) => ({ target: t.key, title: t.title, floor: t.floor, aspiration: t.aspiration })) })) ?? null,
      tokens: { calls: total.calls, input: total.input, output: total.output, total: total.input + total.output },
      estimatedCostUsd: Number(total.cost.toFixed(3)),
    };
    const path = join(tmpdir(), 'mom111-round3d-live-report.json');
    writeFileSync(path, JSON.stringify(report, null, 2));
    process.stdout.write(`\nROUND 3D LIVE REPORT (also written to ${path})\n${JSON.stringify(report, null, 2)}\n`);

    // The live check measures; it does not pass or fail the model.
    expect(turns.length).toBeGreaterThan(0);
  });
});
