// lib/services/goals.ts against the in-memory Supabase fake (tests/helpers/fakeSupabase.ts): the
// wizard's goal type, constraints and pace are stored on the goal and reload with it, the starting
// criteria come from the goal type and are never ticked, and one user never sees another's goals.
// The database side (the real CHECKs, the insert trigger, RLS) is supabase/verify/008_goal_preferences.sql.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criteriaFor } from '@/lib/goals/criteria';
import { GOAL_TYPES } from '@/lib/goals/vocabulary';
import { createGoalChannel, listGoalChannels } from '@/lib/services/goals';
import { OTHER_USER, USER, channelRow, createSupabaseServerClient, db, resetDb } from './helpers/fakeSupabase';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSupabase');
  return { createSupabaseServerClient };
});

const signedIn = { id: USER };
const input = (over: Record<string, unknown> = {}) => ({
  title: 'Get my first certification',
  goalType: 'get_certified',
  constraints: ['flexible_hours', 'dont_track_hours'],
  pace: 'lighter',
  reviewPrompts: ['took_longer'],
  ...over,
});

beforeEach(() => resetDb([], signedIn));

describe('createGoalChannel: the three answers persist', () => {
  it('stores goal type, constraints and pace on the new row', async () => {
    const r = await createGoalChannel(input());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.goal_type).toBe('get_certified');
    expect(r.data.preferences).toEqual({ constraints: ['flexible_hours', 'dont_track_hours'], pace: 'lighter' });
    expect(db.channels).toHaveLength(1);
    expect(db.channels[0]).toMatchObject({ goal_type: 'get_certified', user_id: USER, is_default: false });
  });

  it('reloads with the goal', async () => {
    const created = await createGoalChannel(input());
    const listed = await listGoalChannels();
    expect(created.ok && listed.ok).toBe(true);
    if (!created.ok || !listed.ok) return;
    const reloaded = listed.data.find((g) => g.id === created.data.id);
    expect(reloaded?.goal_type).toBe('get_certified');
    expect(reloaded?.preferences).toEqual({ constraints: ['flexible_hours', 'dont_track_hours'], pace: 'lighter' });
  });

  it('stores only the answers given: no pace key, no constraints key', async () => {
    const r = await createGoalChannel(input({ constraints: [], pace: null }));
    expect(r.ok && r.data.preferences).toEqual({});
  });

  it('stores a pace alone, and constraints alone', async () => {
    const paceOnly = await createGoalChannel(input({ title: 'A', constraints: [], pace: 'behind' }));
    const constraintsOnly = await createGoalChannel(input({ title: 'B', constraints: ['flexible_dates'], pace: null }));
    expect(paceOnly.ok && paceOnly.data.preferences).toEqual({ pace: 'behind' });
    expect(constraintsOnly.ok && constraintsOnly.data.preferences).toEqual({ constraints: ['flexible_dates'] });
  });

  it('de-duplicates constraints, keeping the order picked', async () => {
    const r = await createGoalChannel(input({ constraints: ['flexible_dates', 'flexible_hours', 'flexible_dates'], pace: null }));
    expect(r.ok && r.data.preferences).toEqual({ constraints: ['flexible_dates', 'flexible_hours'] });
  });

  it('does not store review prompts', async () => {
    const r = await createGoalChannel(input({ reviewPrompts: ['took_longer', 'skipped'] }));
    expect(r.ok && JSON.stringify(r.data)).not.toMatch(/took_longer|skipped/);
  });

  it('records every goal type it offers', async () => {
    for (const goalType of GOAL_TYPES) {
      const r = await createGoalChannel(input({ title: `Goal ${goalType}`, goalType }));
      expect(r.ok && r.data.goal_type).toBe(goalType);
    }
  });
});

describe('createGoalChannel: starting criteria', () => {
  it.each(GOAL_TYPES)('%s starts with its template, every criterion unticked', async (goalType) => {
    const r = await createGoalChannel(input({ goalType }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.criteria.length).toBeGreaterThan(0);
    expect(r.data.criteria).toEqual(criteriaFor(goalType));
    expect(r.data.criteria.every((c) => c.done === false)).toBe(true);
  });

  it('refuses criteria passed in by the caller, ticked or not, and writes nothing', async () => {
    const ticked = [{ key: 'exam_booked', label: 'The exam is booked', done: true }];
    for (const criteria of [ticked, [{ ...ticked[0], done: false }]]) {
      const r = await createGoalChannel({ ...input(), criteria });
      expect(r.ok).toBe(false);
    }
    expect(db.inserts).toHaveLength(0);
    expect(db.channels).toHaveLength(0);
  });

  it('the database refuses a new goal with a ticked criterion, even from code that skips the service', async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('goal_channels')
      .insert({ user_id: USER, channel_key: 'sneaky', title: 'Sneaky', criteria: [{ key: 'a', label: 'A', done: true }] })
      .select()
      .single();
    expect(error?.message).toMatch(/unticked/);
    expect(db.channels).toHaveLength(0);
  });
});

describe('createGoalChannel: bad input and signed out', () => {
  it.each([
    ['an unknown goal type', { goalType: 'become_a_wizard' }],
    ['an unknown constraint', { constraints: ['work_weekends'] }],
    ['an unknown pace', { pace: 'turbo' }],
    ['a blank title', { title: '   ' }],
  ])('rejects %s and writes nothing', async (_name, over) => {
    const r = await createGoalChannel(input(over));
    expect(r.ok).toBe(false);
    expect(db.inserts).toHaveLength(0);
  });

  it('refuses when signed out and writes nothing', async () => {
    resetDb([], null);
    const r = await createGoalChannel(input());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Sign in/);
    expect(db.inserts).toHaveLength(0);
  });

  it('passes a database error back without creating a goal', async () => {
    db.failNextInsert = 'boom';
    const r = await createGoalChannel(input());
    expect(r.ok).toBe(false);
    expect(db.channels).toHaveLength(0);
  });
});

describe('createGoalChannel: keys', () => {
  it('gives a second goal with the same title a numbered key', async () => {
    const a = await createGoalChannel(input());
    const b = await createGoalChannel(input());
    expect(a.ok && a.data.channel_key).toBe('get_my_first_certification');
    expect(b.ok && b.data.channel_key).toBe('get_my_first_certification_2');
  });
});

describe('listGoalChannels: one user never sees another\'s goals', () => {
  it('returns only the signed-in user\'s goals, seeded and wizard, with their answers', async () => {
    db.channels = [
      channelRow({ channel_key: 'career_pivot', is_default: true, goal_type: 'career_pivot' }),
      channelRow({ user_id: OTHER_USER, channel_key: 'theirs', title: 'Theirs', goal_type: 'grow_network' }),
    ];
    await createGoalChannel(input());
    const listed = await listGoalChannels();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.data.map((g) => g.user_id)).toEqual([USER, USER]);
    expect(listed.data[0]).toMatchObject({ channel_key: 'career_pivot', goal_type: 'career_pivot', preferences: {} });
  });

  it('shows a goal created before goal types were recorded as having none', async () => {
    db.channels = [channelRow({ channel_key: 'older_goal', goal_type: null })];
    const listed = await listGoalChannels();
    expect(listed.ok && listed.data[0].goal_type).toBeNull();
  });

  it('a user cannot create a goal for another user', async () => {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('goal_channels')
      .insert({ user_id: OTHER_USER, channel_key: 'planted', title: 'Planted' })
      .select()
      .single();
    expect((error as { code?: string } | null)?.code).toBe('42501');
    expect(db.channels).toHaveLength(0);
  });
});
