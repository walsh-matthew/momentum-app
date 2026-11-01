// How the layout gets its data and who may see its pages (MOM-77), without a DOM:
// - the sidebar's and the goal cards' progress comes from the page's one snapshot, read through the user's own
//   session, so another user's tasks never count (the in-memory Supabase fake enforces the same per-user scoping
//   as RLS; the real policies are checked in supabase/verify/);
// - /connections and /settings are authenticated routes: the proxy sends a signed-out visitor to /login;
// - no new component reads the database or a secret.
// tests/layout.test.tsx covers what the components do with that data.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlanSnapshot } from '@/lib/services/tasks';
import { summarizeActiveGoalProgress } from '@/lib/utils/progress';
import { OTHER_USER, USER, channelRow, db, resetDb, taskRow } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user }, error: null }) } }),
}));
vi.mock('@/lib/config/env', () => ({
  getPublicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
}));

const NOW = Date.parse('2026-10-23T12:00:00Z');

describe('progress is built from the snapshot, for the signed-in user only', () => {
  beforeEach(() => {
    const mine = channelRow({ user_id: USER, channel_key: 'mine', title: 'Mine' });
    const paused = channelRow({ user_id: USER, channel_key: 'paused', title: 'Paused', status: 'paused' });
    const theirs = channelRow({ user_id: OTHER_USER, channel_key: 'theirs', title: 'Theirs' });
    resetDb([], { id: USER });
    db.channels = [mine, paused, theirs];
    db.tasks = [
      taskRow(1, { goal_channel_id: mine.id, status: 'done', completed_at: '2026-10-22T09:00:00Z' }),
      taskRow(2, { goal_channel_id: mine.id }),
      // Carried over from week 2 to week 3: still one task.
      taskRow(3, { goal_channel_id: mine.id, carried_from_week: 2 }),
      taskRow(1, { goal_channel_id: paused.id, status: 'done', completed_at: '2026-10-22T09:00:00Z' }),
      // Another user's tasks, in their own goal and (planted) in mine: neither is visible to this user.
      taskRow(1, { user_id: OTHER_USER, goal_channel_id: theirs.id, status: 'done', completed_at: '2026-10-22T09:00:00Z' }),
      taskRow(1, { user_id: OTHER_USER, goal_channel_id: mine.id, status: 'done', completed_at: '2026-10-22T09:00:00Z' }),
    ];
  });

  async function progress() {
    const snap = await getPlanSnapshot({ now: () => NOW });
    expect(snap.ok).toBe(true);
    if (!snap.ok) throw new Error('snapshot failed');
    return summarizeActiveGoalProgress(snap.data.goals, snap.data.tasks, snap.data.today);
  }

  it('lists only this user\'s active goals, with only this user\'s tasks counted', async () => {
    const p = await progress();
    expect(p.map((x) => [x.title, x.done, x.total])).toEqual([['Mine', 1, 3]]);
  });

  it('counts the carried-over task once', async () => {
    const [mine] = await progress();
    expect(mine.total).toBe(3);
    expect(mine.remaining).toBe(2);
  });

  it('does not read anything a second time to get it', async () => {
    const snap = await getPlanSnapshot({ now: () => NOW });
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    // The snapshot is the three reads the page already made (goals, tasks, history). Counting is pure.
    const afterSnapshot = db.reads;
    expect(afterSnapshot).toBe(3);
    summarizeActiveGoalProgress(snap.data.goals, snap.data.tasks, snap.data.today);
    expect(db.reads).toBe(afterSnapshot);
  });
});

describe('the pages and the page source', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the home page reads its one snapshot and builds no goal progress: the sidebar list and goal cards that showed it are gone (MOM-115)', () => {
    const page = strip(read('app', 'page.tsx'));
    expect(page).not.toContain('summarizeActiveGoalProgress');
    expect(page).not.toContain('progress=');
    expect(page).not.toMatch(/listGoalProgress/);
    expect([...page.matchAll(/getPlanSnapshot\(/g)]).toHaveLength(1);
  });

  it('/connections and /settings exist, are not public paths, and render the existing components', () => {
    const proxy = strip(read('lib', 'supabase', 'proxy.ts'));
    const publicPaths = /const PUBLIC_PATHS = \[([^\]]*)\]/.exec(proxy)?.[1] ?? '';
    expect(publicPaths).toContain('/login');
    expect(publicPaths).not.toMatch(/connections|settings/);

    const connections = strip(read('app', 'connections', 'page.tsx'));
    expect(connections).toContain('<IntegrationCardList');
    expect(connections).toContain("redirect('/login')");
    const settings = strip(read('app', 'settings', 'page.tsx'));
    expect(settings).toContain('<SignOutButton');
    expect(settings).toContain("redirect('/login')");
  });

  it('every new layout component is a plain component: no database client and no secret', () => {
    const dir = join(process.cwd(), 'components', 'layout');
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    expect(files).toEqual(expect.arrayContaining(['GoalCards.tsx', 'MobileHeader.tsx', 'RebalanceNudge.tsx', 'PageFrame.tsx', 'GoalBuilderBanner.tsx', 'WorkspaceSidebar.tsx']));
    expect(files).not.toContain('MobileTabBar.tsx');
    expect(readdirSync(dir)).not.toContain('panels.ts');
    for (const f of files) {
      const text = strip(read('components', 'layout', f));
      expect(text, f).not.toMatch(/from '@\/lib\/services\/|from '@\/lib\/supabase\/|\.from\(/);
      expect(text, f).toMatch(/interface \w+Props/);
    }
  });

  it('the nudge only opens the drawer: it has no apply path of its own', () => {
    const nudge = strip(read('components', 'layout', 'RebalanceNudge.tsx'));
    expect(nudge).not.toMatch(/applyRebalanceProposal|askClaudeToRebalance|@\/app\/actions/);
    expect(nudge).toContain('onClick={onReview}');
  });
});

describe('the proxy and the new routes', () => {
  async function visit(path: string) {
    const { updateSession } = await import('@/lib/supabase/proxy');
    return updateSession(new NextRequest(`http://localhost:3000${path}`));
  }

  it.each(['/connections', '/settings', '/connections/anything'])('%s sends a signed-out visitor to /login', async (path) => {
    auth.user = null;
    const res = await visit(path);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/login');
  });

  it.each(['/connections', '/settings'])('%s lets a signed-in user through', async (path) => {
    auth.user = { id: USER };
    const res = await visit(path);
    expect(res.headers.get('location')).toBeNull();
  });

  it('/login is still reachable signed out', async () => {
    auth.user = null;
    const res = await visit('/login');
    expect(res.headers.get('location')).toBeNull();
  });

  // MOM-102: the privacy notice must load for someone who has no account yet, and for one who has.
  it.each([false, true])('/privacy is reachable and not redirected (signed in: %s)', async (signedIn) => {
    auth.user = signedIn ? { id: USER } : null;
    const res = await visit('/privacy');
    expect(res.headers.get('location')).toBeNull();
  });
});
