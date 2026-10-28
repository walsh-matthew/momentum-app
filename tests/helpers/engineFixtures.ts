// Builders for the scoreboard engine tests (MOM-108). The dates are from October 2026, when Los Angeles is on
// daylight time (UTC-7): 2026-10-05 is a Monday, so the weeks run 05 to 11, 12 to 18 and 19 to 25.

import type {
  Level,
  ScoreboardEntry,
  ScoreboardInput,
  ScoreboardTarget,
  TargetResult,
  TargetSpec,
  TimeAnchors,
} from '@/types/scoreboard';

// Noon (or the given time) on a day, in Los Angeles daylight time.
export const at = (date: string, time = '12:00') => `${date}T${time}:00-07:00`;

export const anchors = (over: Partial<TimeAnchors> = {}): TimeAnchors => ({
  timeZone: 'America/Los_Angeles',
  dayEndMinutes: 0,
  weekStartsOn: 1,
  ...over,
});

// A weekly effort habit, three a week with an aspiration of five.
export const spec = (over: Partial<TargetSpec> = {}): TargetSpec => ({
  measure: 'count',
  unit: null,
  role: 'effort',
  period: { kind: 'weekly' },
  levels: { floor: 3, aspiration: 5 },
  qualifyingThreshold: null,
  carryOver: 'habit',
  stepIds: null,
  ...over,
});

export const target = (over: Partial<ScoreboardTarget> = {}, specOver: Partial<TargetSpec> = {}): ScoreboardTarget => ({
  id: 't1',
  startsOn: '2026-10-05',
  blockEndsOn: null,
  versions: [{ effectiveFrom: '2026-10-05', spec: spec(specOver) }],
  ...over,
});

let counter = 0;
export const entry = (date: string, over: Partial<ScoreboardEntry> = {}): ScoreboardEntry => ({
  id: `e${++counter}`,
  targetId: 't1',
  occurredAt: at(date),
  value: 1,
  size: null,
  stepId: null,
  removed: false,
  countAnyway: false,
  ...over,
});

export const input = (over: Partial<ScoreboardInput> = {}): ScoreboardInput => ({
  today: '2026-10-14',
  anchors: anchors(),
  targets: [target()],
  entries: [],
  snapshots: [],
  steps: [],
  forecasts: [],
  ...over,
});

// A closed, judged period result for the pattern tests; only the level matters to them.
export const periodResult = (level: Level | null, over: Partial<TargetResult> = {}): TargetResult => ({
  targetId: 't1',
  periodStart: '2026-10-05',
  periodEnd: '2026-10-11',
  status: 'closed',
  judgedBy: 'history',
  startedPartway: false,
  graded: level !== null,
  measure: 'count',
  unit: null,
  counted: 0,
  belowThreshold: [],
  floor: level === null ? null : 3,
  aspiration: level === null ? null : 5,
  fractionOfFloor: null,
  remainingToFloor: null,
  remainingToAspiration: null,
  level,
  owed: 0,
  slots: null,
  ...over,
});
