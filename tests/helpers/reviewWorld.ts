// A person with one weekly target, for the weekly review's service tests (lib/services/review.ts, reviewRecords.ts). Dates
// are from October 2026: 2026-10-05 is a Monday. Built on the in-memory goal model fake (tests/helpers/fakeEntriesModel.ts).

import { add, newId } from './fakeEntriesModel';

// Monday-start week, planning the following Monday (DB value 1 both ways): reviews 10-19..10-25, already closed.
export const CASE_B_NOW = Date.UTC(2026, 9, 26, 19, 0, 0); // Monday 2026-10-26, noon in Los Angeles
// Same week start and planning weekday as DB value 7 (Sunday): reviews the same week on its own last day, 10-25.
export const CASE_A_NOW = Date.UTC(2026, 9, 25, 19, 0, 0); // Sunday 2026-10-25, noon in Los Angeles
// A Wednesday: not the planning day under either setting above.
export const NOT_DUE_NOW = Date.UTC(2026, 9, 21, 19, 0, 0);

export const settingsRow = (userId: string, over: Record<string, unknown> = {}) => ({
  user_id: userId,
  time_zone: 'America/Los_Angeles',
  week_start: 1,
  day_end: '00:00:00',
  planning_weekday: null,
  review_depth: null,
  slipping_periods: null,
  ...over,
});

export function world(userId: string, title: string) {
  const goal = {
    id: newId(),
    user_id: userId,
    title: `${title} goal`,
    state: 'active',
    shape: 'ongoing',
    start_date: '2026-10-05',
    end_date: null,
    created_at: '2026-10-05T00:00:00.000Z',
  };
  add('goals', goal);
  const target = {
    id: newId(),
    user_id: userId,
    goal_id: goal.id,
    title: `${title} workouts`,
    measure: 'count',
    unit: null,
    role: 'effort',
    period_kind: 'weekly',
    due_date: null,
    slot_weekdays: null,
    floor: 3,
    aspiration: 5,
    qualifying_threshold: null,
    carry_over_kind: 'habit',
    created_at: '2026-10-05T00:00:01.000Z',
  };
  add('targets', target);
  const source = { id: newId(), user_id: userId, kind: 'manual', provider: null, label: 'Manual' };
  add('sources', source);
  const log = (day: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      add('entries', {
        id: newId(),
        user_id: userId,
        target_id: target.id,
        source_id: source.id,
        source_record_id: newId(),
        work_item_id: null,
        occurred_at: `${day}T19:00:00+00:00`,
        value: 1,
        evidence: {},
        created_at: '2026-10-29T00:00:00.000Z',
      });
    }
  };
  const priority = (label: string) => add('person_priorities', { id: newId(), user_id: userId, label, sort_order: 0, created_at: '2026-10-01T00:00:00.000Z' });
  return { goal, target, source, log, priority };
}
