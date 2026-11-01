// The LIVE run of the returning conversations (MOM-132 part 2): one run per mode against the real model, through takeAddTurn() and the two
// add saves exactly as the app calls them, so the mode note, the returning checks, the retries and the saves are all exercised. Run it with
//   MOM132_LIVE_MODE=add_goal   npm run eval:setup:add
//   MOM132_LIVE_MODE=add_target npm run eval:setup:add
// It is not part of `npm test` and never runs in CI (tests/live/ is reached only by vitest.live.config.mts).
//
// Safety, the same as the setup pilot (lib/ai/setupLive.ts): the environment is pointed at the LOCAL Supabase stack, whatever .env.local
// says, and the run refuses unless that address is 127.0.0.1 or localhost; the only thing read from .env.local is ANTHROPIC_API_KEY. The
// run makes one throwaway account with a finished setup (written as that person, through row level security, as the home browser spec
// does), stops by itself when the estimated cost passes MAX_COST_USD, and deletes the account at the end.
//
// What it reports, per run: the cost, whether a skipped topic was asked (in a turn that was shown, and in a reply that a check threw
// away), every check that caught a reply and caused a retry (rule and code names only, never text), and whether the save matched what was
// approved, with every row that was already saved compared before and after. The report is printed and written to the system temp folder.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SETUP_MODEL } from '@/lib/ai/setup';
import { applyLiveEnvironment, assertLocalSupabaseUrl, estimateCostUsd, localStackFromStatus, readEnvFileValue, topicKeyedReplies } from '@/lib/ai/setupLive';
import { getPublicEnv } from '@/lib/config/env';
import { dateInZone } from '@/lib/dates/casual';
import { runSetupTurn } from '@/lib/services/llm';
import { addApprovedGoals, addApprovedTargets, takeAddTurn } from '@/lib/services/setup';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runSetupEval } from '@/lib/setup/evals';
import { RETURNING_MODES, SAVED_GOAL_KEY, returningDraft, skippedTopics, type ReturningMode } from '@/lib/setup/returning';
import { renderFinal } from '@/lib/setup/playback';
import { draftToRows } from '@/lib/setup/rows';
import { withAssistantTurn, withPersonMessage } from '@/lib/setup/session';
import type { Database } from '@/types/database.types';
import type { SetupSession } from '@/types/setup';
import { RETURNING_CASES, RETURNING_SAVED, addTargetCase } from '../setup-evals/cases';
import { scriptedModel } from '../helpers/setupScript';

// The per-run stop-loss the owner set: stop at $1 estimated, so two runs cost at most $2.
const MAX_COST_USD = 1;
const ZONE = 'America/Chicago';
const GOAL_TITLE = 'Run more';

// The signed-in client the services get in place of the cookie-based one (a vitest run has no request, so no cookies).
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => holder.client }));

type Db = SupabaseClient<Database>;
const shiftDays = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

class StopLoss extends Error {}

const MODE = process.env.MOM132_LIVE_MODE;
const modeOk = (m: string | undefined): m is ReturningMode => RETURNING_MODES.includes(m as ReturningMode);

describe('live returning conversation', () => {
  it.skipIf(!modeOk(MODE))(`runs one conversation (${MODE}) against ${SETUP_MODEL}`, async () => {
    const mode = MODE as ReturningMode;

    // 1. Local only, whatever .env.local says.
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    const status = spawnSync('npx supabase status -o env', { shell: true, encoding: 'utf8' });
    const local = localStackFromStatus(status.stdout ?? '');
    applyLiveEnvironment(process.env, local, readEnvFileValue(envFile, 'ANTHROPIC_API_KEY') ?? '');
    const url = assertLocalSupabaseUrl(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);

    // 2. A throwaway account with a finished setup, made as that person.
    const admin = createSupabaseAdminClient();
    const email = `mom132-live-${Date.now()}@example.invalid`;
    const password = crypto.randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error('Could not create the throwaway account on the local stack.');
    const userId = created.data.user.id;
    const db: Db = createClient<Database>(url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    holder.client = db;

    const warns: { category?: string; rules?: string[]; codes?: string[]; topic?: string | null; skippedTopic?: string | null }[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (args[0] === '[setup] a reply was thrown away' && typeof args[1] === 'object' && args[1] !== null) warns.push(args[1] as (typeof warns)[number]);
      else realWarn(...args);
    };

    let inputTokens = 0;
    let outputTokens = 0;
    let calls = 0;
    let stoppedBy: string | null = null;
    const started = Date.now();
    const shown: { turn: number; kind: string; topic: string | null }[] = [];
    let session: SetupSession | null = null;
    let finalLines: string[] | null = null;
    let saveResult: unknown = null;
    let saved: { matched: boolean; problems: string[] } | null = null;
    let untouched: { matched: boolean; problems: string[] } | null = null;
    let fillerCount: () => number = () => 0;

    try {
      const signedIn = await db.auth.signInWithPassword({ email, password });
      if (signedIn.error) throw new Error('Could not sign the throwaway account in.');
      const must = <T>(result: { data: T; error: { code?: string } | null }, what: string): NonNullable<T> => {
        if (result.error || result.data === null || result.data === undefined) throw new Error(`Could not seed ${what} (code ${result.error?.code ?? 'no row'}).`);
        return result.data as NonNullable<T>;
      };
      const today = dateInZone(ZONE) ?? '';
      const mondayThisWeek = shiftDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
      must(
        await db.from('person_settings').insert({ user_id: userId, time_zone: RETURNING_SAVED.timeZone, week_start: RETURNING_SAVED.weekStart, day_end: '21:00:00' }).select('user_id').single(),
        'the person',
      );
      const goal = must(
        await db.from('goals').insert({ user_id: userId, title: GOAL_TITLE, start_date: mondayThisWeek, shape: 'ongoing', sort_order: 0 }).select('id, start_date').single(),
        'a goal',
      );
      must(
        await db
          .from('targets')
          .insert({ user_id: userId, goal_id: goal.id, title: 'Runs', measure: 'count', role: 'effort', period_kind: 'weekly', floor: 2, carry_over_kind: 'habit', sort_order: 0 })
          .select('id')
          .single(),
        'a target',
      );

      // What the person already had: compared before and after, row by row.
      const snapshot = async () => {
        const [settings, goals, targets] = await Promise.all([
          db.from('person_settings').select('*'),
          db.from('goals').select('*').order('id'),
          db.from('targets').select('*').order('id'),
        ]);
        return structuredClone({ settings: settings.data ?? [], goals: goals.data ?? [], targets: targets.data ?? [] });
      };
      const before = await snapshot();

      // 3. The conversation. The scripted person is the returning eval case for this mode; a live model asks in its own order, so the
      //    person's lines are looked up by the topic of the question.
      const c =
        mode === 'add_goal'
          ? RETURNING_CASES.find((x) => x.id === 'return-g-reading')!
          : addTargetCase({
              id: 'live-add-target',
              goalTitle: GOAL_TITLE,
              counted: { reply: 'Miles.', title: 'Miles', word: 'miles', itemTitle: 'Go for a run' },
              unit: 'miles',
              floor: { reply: 'Six a week.', value: 6 },
            });
      const person = topicKeyedReplies(c.script.map((t) => t.topic), c.person);
      fillerCount = person.fallbackCount;
      const addition = mode === 'add_goal' ? { mode } : { mode, goalId: goal.id };
      session = { transcript: [], draft: returningDraft(mode, mode === 'add_target' ? GOAL_TITLE : null), spentTokens: 0 };

      // Every model call goes through the one real path (runSetupTurn); this only adds up what it cost and stops the run at the cap.
      const counting: typeof runSetupTurn = async (args, deps) => {
        const result = await runSetupTurn(args, deps);
        calls += 1;
        if (result.kind === 'answered') {
          inputTokens += result.result.usage?.inputTokens ?? 0;
          outputTokens += result.result.usage?.outputTokens ?? 0;
        }
        if ((estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens) ?? Infinity) > MAX_COST_USD) {
          throw new StopLoss(`stop-loss: estimated cost passed $${MAX_COST_USD}`);
        }
        return result;
      };

      let finished = false;
      // MOM132_LIVE_REPLAY=1: the same account, seeding, save and read-back, but the conversation is the scripted one and no model is called.
      // It costs nothing, and checks the save for a mode whose paid run did not reach it.
      if (process.env.MOM132_LIVE_REPLAY === '1') {
        const replay = await runSetupEval(c, scriptedModel(c.script));
        session = { transcript: replay.transcript, draft: replay.draft, spentTokens: 0 };
        finished = replay.finished;
        shown.push(...replay.turns.map((t) => ({ turn: t.index, kind: t.turn.kind, topic: t.turn.topic })));
      }
      for (let step = 0; step < 45 && !finished && stoppedBy === null; step++) {
        const view = await takeAddTurn({ ...session, addition }, { runTurn: counting });
        if (!view.ok) {
          stoppedBy = `refused: ${view.error}`;
          break;
        }
        const v = view.data;
        if (v.kind === 'wait') {
          await new Promise((r) => setTimeout(r, (v.retryAfterSeconds + 1) * 1000));
          continue;
        }
        if (v.kind !== 'turn') {
          stoppedBy = v.kind === 'quick_path' ? `quick path (${v.reason})` : `failed (${v.reason})`;
          break;
        }
        session = withAssistantTurn(session, v.turn, v.spentTokens);
        shown.push({ turn: shown.length, kind: v.turn.kind, topic: v.turn.topic });
        if (v.turn.kind === 'final') {
          finished = true;
          break;
        }
        session = withPersonMessage(session, person.reply(v.turn).say);
      }

      // 4. The save, through the real add services, then the rows read back.
      if (finished && session) {
        const startDate = today;
        const submissionId = crypto.randomUUID();
        const approved = mode === 'add_goal' ? addApprovedGoals(session, { submissionId }) : addApprovedTargets(session, { submissionId, goalId: goal.id, startDate });
        const result = await approved;
        saveResult = result.ok ? { ok: true, ...result.data } : { ok: false, error: result.error };
        const rows = draftToRows(session.draft, session.transcript, {
          saved: RETURNING_SAVED,
          existingGoalKey: mode === 'add_target' ? SAVED_GOAL_KEY : undefined,
          sayings: mode === 'add_target' ? [GOAL_TITLE] : [],
        });
        finalLines = rows.ok ? renderFinal(session.draft.model, { adding: true, savedGoalKey: mode === 'add_target' ? SAVED_GOAL_KEY : undefined }) : null;

        const problems: string[] = [];
        const after = await snapshot();
        if (!rows.ok) problems.push('the approved draft did not pass the final validation');
        else if (!result.ok) problems.push(`the save refused: ${result.error}`);
        else {
          const newGoals = after.goals.filter((g) => !before.goals.some((b) => b.id === g.id));
          const expectedGoals = mode === 'add_goal' ? rows.rows.goals : [];
          if (newGoals.length !== expectedGoals.length) problems.push(`new goals: saved ${newGoals.length}, approved ${expectedGoals.length}`);
          for (const e of expectedGoals) {
            const g = newGoals.find((x) => x.title === e.row.title);
            if (!g) problems.push(`goal "${e.row.title}" was not saved`);
            else {
              if (g.shape !== e.row.shape || g.start_date !== e.row.start_date || g.state !== e.row.state) problems.push(`goal "${e.row.title}" fields differ`);
              if (g.sort_order !== 1) problems.push(`goal "${e.row.title}" place is ${String(g.sort_order)}, expected 1`);
            }
          }
          const newTargets = after.targets.filter((t) => !before.targets.some((b) => b.id === t.id));
          if (newTargets.length !== rows.rows.targets.length) problems.push(`new targets: saved ${newTargets.length}, approved ${rows.rows.targets.length}`);
          for (const e of rows.rows.targets) {
            const t = newTargets.find((x) => x.title === e.row.title);
            if (!t) problems.push(`target "${e.row.title}" was not saved`);
            else {
              if (t.floor !== e.row.floor || t.period_kind !== e.row.period_kind || t.measure !== e.row.measure || t.unit !== e.row.unit) problems.push(`target "${e.row.title}" fields differ`);
              // A target made with its goal counts from the goal's start; one added to a goal that had started stores the person's own start.
              if (mode === 'add_target' && t.start_date !== startDate) problems.push(`target "${e.row.title}" start is ${String(t.start_date)}, expected ${startDate}`);
              if (mode === 'add_goal' && t.start_date !== null) problems.push(`target "${e.row.title}" stored its own start on a new goal`);
              if (mode === 'add_target' && t.goal_id !== goal.id) problems.push(`target "${e.row.title}" is on another goal`);
            }
          }
          const items = await db.from('work_items').select('title, kind');
          for (const e of rows.rows.workItems) if (!items.data?.some((i) => i.title === e.row.title && i.kind === e.row.kind)) problems.push(`work item "${e.row.title}" was not saved`);
          // target_sources has no id column (its key is the target and the source): read what links the new targets to a source.
          const links = await db.from('target_sources').select('target_id, source_id');
          if (links.error) problems.push(`could not read the target sources (code ${links.error.code})`);
          else {
            const linked = links.data.filter((l) => newTargets.some((t) => t.id === l.target_id)).length;
            if (linked !== rows.rows.targetSources.length) problems.push(`target sources: saved ${linked}, approved ${rows.rows.targetSources.length}`);
          }
        }
        saved = { matched: problems.length === 0, problems };

        const kept: string[] = [];
        for (const table of ['settings', 'goals', 'targets'] as const) {
          for (const b of before[table]) {
            const a = after[table].find((x) => (x as { id?: string }).id === (b as { id?: string }).id || table === 'settings');
            if (JSON.stringify(a) !== JSON.stringify(b)) kept.push(`${table} row changed`);
          }
        }
        untouched = { matched: kept.length === 0, problems: kept };
      }
    } catch (error) {
      stoppedBy = error instanceof StopLoss ? error.message : `error: ${error instanceof Error ? error.message : 'unknown'}`;
    } finally {
      console.warn = realWarn;
      await admin.auth.admin.deleteUser(userId);
    }

    const forbidden = new Set<string>(skippedTopics(mode));
    const cost = estimateCostUsd(SETUP_MODEL, inputTokens, outputTokens);
    const report = {
      mode,
      model: process.env.MOM132_LIVE_REPLAY === '1' ? 'none (scripted replay, no model call)' : SETUP_MODEL,
      supabase: 'local',
      finished: finalLines !== null || shown.at(-1)?.kind === 'final',
      stoppedBy,
      modelCalls: calls,
      turnsShown: shown.length,
      tokens: { input: inputTokens, output: outputTokens },
      estimatedCostUsd: cost === null ? null : Number(cost.toFixed(3)),
      capUsd: MAX_COST_USD,
      skippedTopicAskedInAShownTurn: shown.filter((s) => s.topic !== null && forbidden.has(s.topic) && s.kind !== 'playback' && s.kind !== 'final').length,
      repliesThrownAway: warns.length,
      throwawayDetails: warns.map((w) => ({ category: w.category, rules: w.rules, codes: w.codes, topic: w.topic ?? null })),
      skippedTopicAskedAndCaught: warns.filter((w) => w.codes?.includes('returning.topic')).length,
      returningChecksThatCaught: [...new Set(warns.flatMap((w) => (w.codes ?? []).filter((x) => x.startsWith('returning.'))))],
      shownTurns: shown,
      fillerRepliesUsed: fillerCount(),
      finalLines,
      saveResult,
      saveMatchedWhatWasApproved: saved,
      alreadySavedRowsUnchanged: untouched,
      seconds: Math.round((Date.now() - started) / 1000),
    };
    const path = join(tmpdir(), `mom132-live-${mode}${process.env.MOM132_LIVE_REPLAY === '1' ? '-replay' : ''}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2));
    process.stdout.write(`\nLIVE REPORT ${mode} (also written to ${path})\n${JSON.stringify(report, null, 2)}\n`);
    // The run measures; it does not pass or fail the model.
    expect(session).not.toBeNull();
  });
});
