// A week plan as the server builds it, for the component tests (MOM-112 block 2). Thursday 2026-10-29, week from Monday.

import type { HomePlanView, PlanItemView, WeekPlanView } from '@/types/plan';

export type ReadyPlan = Extract<WeekPlanView, { state: 'ready' }>;

export const WEEK = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
export const TODAY = '2026-10-29';

export const HABIT: PlanItemView = {
  id: 'habit-1',
  goalId: 'goal-1',
  goalTitle: 'Stay fit',
  title: 'Go for a run',
  kind: 'habit',
  dueOn: null,
  setDays: null,
  movedFromLastWeek: false,
};

export const STEP: PlanItemView = {
  id: 'step-1',
  goalId: 'goal-1',
  goalTitle: 'Stay fit',
  title: 'Book the room',
  kind: 'milestone',
  dueOn: '2026-12-01',
  setDays: null,
  movedFromLastWeek: false,
};

export const KINDS = [
  { id: 'kind-work', name: 'Work day' },
  { id: 'kind-rest', name: 'Rest day' },
];

export function readyPlan(over: Partial<ReadyPlan> = {}): ReadyPlan {
  return {
    state: 'ready',
    today: TODAY,
    window: 'week',
    offset: 0,
    hasPrevious: false,
    hasNext: true,
    start: WEEK[0],
    end: WEEK[6],
    days: WEEK.map((date) => ({ date, isToday: date === TODAY, isPast: date < TODAY, dayTypeId: null, itemIds: [] })),
    items: [HABIT, STEP],
    dayKinds: KINDS,
    copyableKinds: 0,
    ...over,
  };
}

export function readyCard(over: Partial<Extract<HomePlanView, { state: 'ready' }>> = {}): Extract<HomePlanView, { state: 'ready' }> {
  return { state: 'ready', today: TODAY, todayItems: [], plannedLater: false, moved: [], ...over };
}
