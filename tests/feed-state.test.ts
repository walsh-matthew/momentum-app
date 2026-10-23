// MOM-18: which screen the main feed shows is decided once, in the pure buildChannelViews, from the tasks
// themselves, and by app/page.tsx for the signed-out case. The UI never infers it from an empty list
// (tests/empty-states.test.tsx covers what each state renders). The builder never completes, reopens or moves
// a task (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): "all done" only reports the user's own ticks.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChannelViews, resolveChannel } from '@/lib/utils/channelViews';
import { ALL_CHANNELS, EMPTY_CHANNEL_VIEWS, SIGNED_OUT_CHANNEL_VIEWS } from '@/types/channelViews';
import type { MicroTask } from '@/types/database.types';
import { taskRow, type TaskRow } from './helpers/fakeSupabase';

const TODAY = '2026-10-23';
const mt = (r: TaskRow): MicroTask => ({ ...r, updated_at: r.created_at }) as unknown as MicroTask;
const goal = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Goal ${id}`,
  status: 'active' as const,
  start_date: '2026-09-23', // 30 days before TODAY: plan week 5
  ...over,
});
const task = (goalId: string, week: number, over: Partial<TaskRow> = {}) =>
  mt(taskRow(week, { goal_channel_id: goalId, ...over }));
const done = (goalId: string, week: number, over: Partial<TaskRow> = {}) =>
  task(goalId, week, { status: 'done', completed_at: '2026-10-22T09:00:00Z', ...over });

type Views = ReturnType<typeof buildChannelViews>;
const stateOf = (v: Views, id: string) => v.byChannel[id].feedState;

describe('the feed state of each view', () => {
  it('no active goal is no_goals, and is the only view', () => {
    const v = buildChannelViews([], [], [], TODAY);
    expect(stateOf(v, ALL_CHANNELS)).toBe('no_goals');
    expect(Object.keys(v.byChannel)).toEqual([ALL_CHANNELS]);
    expect(EMPTY_CHANNEL_VIEWS.byChannel[ALL_CHANNELS].feedState).toBe('no_goals');
  });

  it('tasks that belong to no active goal do not turn no_goals into anything else', () => {
    const v = buildChannelViews([], [task('A', 1), done('A', 1)], [], TODAY);
    expect(stateOf(v, ALL_CHANNELS)).toBe('no_goals');
  });

  it('a paused goal is not a channel: with only paused goals it is no_goals, whatever its tasks', () => {
    const paused = goal('P', { status: 'paused' });
    expect(stateOf(buildChannelViews([paused], [task('P', 1)], [], TODAY), ALL_CHANNELS)).toBe('no_goals');
    expect(stateOf(buildChannelViews([paused], [done('P', 1)], [], TODAY), ALL_CHANNELS)).toBe('no_goals');
  });

  it('a paused goal\'s unfinished tasks do not keep an otherwise finished all channels view on tasks', () => {
    const v = buildChannelViews([goal('A'), goal('P', { status: 'paused' })], [done('A', 5), task('P', 1)], [], TODAY);
    expect(stateOf(v, 'A')).toBe('all_done');
    expect(stateOf(v, ALL_CHANNELS)).toBe('all_done');
    expect(v.byChannel.P).toBeUndefined();
  });

  it('a goal with no tasks is no_tasks, in its channel and in all channels', () => {
    const v = buildChannelViews([goal('A')], [], [], TODAY);
    expect(stateOf(v, 'A')).toBe('no_tasks');
    expect(stateOf(v, ALL_CHANNELS)).toBe('no_tasks');
  });

  it('several goals and no tasks at all is no_tasks everywhere', () => {
    const v = buildChannelViews([goal('A'), goal('B')], [], [], TODAY);
    expect(['A', 'B', ALL_CHANNELS].map((id) => stateOf(v, id))).toEqual(['no_tasks', 'no_tasks', 'no_tasks']);
  });

  it('finished tasks and nothing left to do is all_done, with the finished tasks kept for the undo', () => {
    const v = buildChannelViews([goal('A')], [done('A', 5), done('A', 4)], [], TODAY);
    expect(stateOf(v, 'A')).toBe('all_done');
    expect(stateOf(v, ALL_CHANNELS)).toBe('all_done');
    expect(v.byChannel.A.feed.focus).toBeNull();
    expect(v.byChannel.A.feed.recentlyDone).toHaveLength(2);
  });

  it('all_done follows the tasks, not the feed\'s cap on how many finished tasks it lists', () => {
    const many = Array.from({ length: 8 }, (_, i) => done('A', 1 + (i % 4)));
    const v = buildChannelViews([goal('A')], many, [], TODAY);
    expect(stateOf(v, 'A')).toBe('all_done');
    expect(v.byChannel.A.feed.recentlyDone.length).toBeLessThan(many.length);
  });

  it('any unfinished task is tasks, with or without finished ones', () => {
    expect(stateOf(buildChannelViews([goal('A')], [task('A', 5)], [], TODAY), 'A')).toBe('tasks');
    expect(stateOf(buildChannelViews([goal('A')], [done('A', 5), task('A', 5)], [], TODAY), 'A')).toBe('tasks');
  });

  it('a channel looks only at its own tasks: finished here while another channel still has work', () => {
    const v = buildChannelViews([goal('A'), goal('B')], [done('A', 5), done('A', 5), task('B', 5)], [], TODAY);
    expect(stateOf(v, 'A')).toBe('all_done');
    expect(stateOf(v, 'B')).toBe('tasks');
    // All channels still has work, so it is tasks even though channel A is finished.
    expect(stateOf(v, ALL_CHANNELS)).toBe('tasks');
  });

  it('a channel with no tasks beside one with work is no_tasks, and all channels is tasks', () => {
    const v = buildChannelViews([goal('A'), goal('empty')], [task('A', 5)], [], TODAY);
    expect(stateOf(v, 'empty')).toBe('no_tasks');
    expect(stateOf(v, 'A')).toBe('tasks');
    expect(stateOf(v, ALL_CHANNELS)).toBe('tasks');
  });

  it('a channel with no tasks beside a finished one: all channels is all_done', () => {
    const v = buildChannelViews([goal('A'), goal('empty')], [done('A', 5)], [], TODAY);
    expect(stateOf(v, 'empty')).toBe('no_tasks');
    expect(stateOf(v, 'A')).toBe('all_done');
    expect(stateOf(v, ALL_CHANNELS)).toBe('all_done');
  });

  it('reopening the last finished task moves the channel from all_done back to tasks', () => {
    const last = done('A', 5);
    expect(stateOf(buildChannelViews([goal('A')], [last], [], TODAY), 'A')).toBe('all_done');
    const reopened = { ...last, status: 'todo' as const, completed_at: null };
    expect(stateOf(buildChannelViews([goal('A')], [reopened], [], TODAY), 'A')).toBe('tasks');
  });

  it('every view carries a state, and the builder never produces signed_out', () => {
    const v = buildChannelViews([goal('A'), goal('B')], [done('A', 5), task('B', 5)], [], TODAY);
    for (const view of Object.values(v.byChannel)) expect(['no_tasks', 'all_done', 'tasks']).toContain(view.feedState);
  });

  it('does not change the tasks it is given', () => {
    const goals = [goal('A')];
    const tasks = [done('A', 5)];
    const before = JSON.stringify({ goals, tasks });
    buildChannelViews(goals, tasks, [], TODAY);
    expect(JSON.stringify({ goals, tasks })).toBe(before);
  });
});

describe('SIGNED_OUT_CHANNEL_VIEWS', () => {
  const view = SIGNED_OUT_CHANNEL_VIEWS.byChannel[ALL_CHANNELS];

  it('is a single empty all-channels view in the signed_out state, with nothing of anyone\'s plan', () => {
    expect(SIGNED_OUT_CHANNEL_VIEWS.channels).toEqual([]);
    expect(Object.keys(SIGNED_OUT_CHANNEL_VIEWS.byChannel)).toEqual([ALL_CHANNELS]);
    expect(view.feedState).toBe('signed_out');
    expect(view.feed).toEqual({ focus: null, upNext: [], recentlyDone: [] });
    expect(view.velocity).toBeNull();
    expect(view.rebalance).toBeNull();
    expect(view.rebalanceChannelId).toBeNull();
  });

  it('differs from the signed-in empty views only in its state', () => {
    expect({ ...view, feedState: 'no_goals' }).toEqual(EMPTY_CHANNEL_VIEWS.byChannel[ALL_CHANNELS]);
  });

  it('resolves any selection to all channels and can be sent to the browser as plain data', () => {
    expect(resolveChannel(SIGNED_OUT_CHANNEL_VIEWS, 'anything')).toBe(ALL_CHANNELS);
    expect(JSON.parse(JSON.stringify(SIGNED_OUT_CHANNEL_VIEWS))).toEqual(SIGNED_OUT_CHANNEL_VIEWS);
  });
});

describe('the home page and the empty states (source)', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the page asks getCurrentUser first and, with no session, passes the signed-out views without reading anything', () => {
    const page = strip(read('app', 'page.tsx'));
    expect(page).toContain("import { getCurrentUser } from '@/lib/services/auth'");
    expect(page).toContain('getCurrentUser()');
    expect(page).toContain('SIGNED_OUT_CHANNEL_VIEWS');
    const check = page.indexOf('await hasSession()');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(page.indexOf('Promise.all'));
    expect(check).toBeLessThan(page.indexOf('buildChannelViews('));
    // Between the check and the reads there is only the signed-out return.
    const branch = page.slice(check, page.indexOf('Promise.all'));
    expect(branch).toContain('SIGNED_OUT_CHANNEL_VIEWS');
    expect(branch).not.toMatch(/getPlanSnapshot|listConnectedApps|loadSnapshot|loadConnectedApps/);
  });

  it('proxy.ts still sends a signed-out visitor to /login (the signed-out state is only the fallback)', () => {
    expect(strip(read('lib', 'supabase', 'proxy.ts'))).toContain("redirectKeepingCookies(request, response, '/login')");
  });

  it('no component imports a service, a Supabase client or a server-only secret', () => {
    const base = join(process.cwd(), 'components');
    for (const dir of readdirSync(base)) {
      const folder = join(base, dir);
      if (!existsSync(folder) || !readdirSync(folder).length) continue;
      for (const file of readdirSync(folder).filter((f) => /\.tsx?$/.test(f))) {
        const text = strip(read('components', dir, file));
        const where = `components/${dir}/${file}`;
        expect(text, where).not.toMatch(/from '@\/lib\/services\//);
        expect(text, where).not.toMatch(/from '@\/lib\/supabase\//);
        expect(text, where).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|HEVY_API_KEY/);
      }
    }
  });

  it('MainFeed has no placeholder or Phase 2 tag left and chooses by feedState, not by emptiness', () => {
    const raw = read('components', 'layout', 'MainFeed.tsx');
    expect(raw).not.toContain('TODO(MOM-Phase2)');
    expect(raw).not.toContain('No tasks yet.');
    expect(raw).not.toContain('Your execution feed will appear here');
    const feed = strip(raw);
    expect(feed).not.toMatch(/\.length\s*[>=!<]/);
    expect(feed).toContain("feedState === 'signed_out'");
    expect(feed).toContain("feedState === 'no_goals'");
    expect(feed).toContain("feedState === 'no_tasks'");
    expect(feed).toContain("feedState === 'all_done'");
    expect(feed).toContain("feedState === 'tasks'");
  });

  it('the wizard is rendered once, in AppShell, not in the sidebar or the feed', () => {
    expect([...strip(read('components', 'layout', 'AppShell.tsx')).matchAll(/<GoalBuilderWizard/g)]).toHaveLength(1);
    expect(strip(read('components', 'layout', 'NavSidebar.tsx'))).not.toContain('GoalBuilderWizard');
    expect(strip(read('components', 'layout', 'MainFeed.tsx'))).not.toContain('GoalBuilderWizard');
  });
});
