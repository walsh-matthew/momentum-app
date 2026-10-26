// Input and output types of the scoreboard engine (lib/engine/, MOM-108). They come from docs/DOMAIN_MODEL.md
// §1.3, 1.4, 1.7 and 3.2, not from database rows: MOM-112 maps rows onto them. Everything the engine returns is
// a fact (a number, a date, an id or one of the enums below). Wording for the person is written later, around
// the facts (§4.2 principles 5 and 9).

// A calendar day in the person's own time zone, as YYYY-MM-DD.
export type LocalDate = string;

// 0 is Sunday, as in Date.getUTCDay().
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// The person's time anchors (§1.1). Each is null until the person has set it; the engine never fills one in
// (principle 1). A target asks only for the anchors its period needs: no week start for a deadline target.
export interface TimeAnchors {
  // An IANA zone name such as 'America/Los_Angeles'.
  timeZone: string | null;
  // When the person's day ends, in minutes after midnight (0 to 1439). A time after midnight and before 06:00
  // moves the day boundary to that time (a 02:00 day end puts a 01:30 entry on the day before). Any other
  // time, an evening check-in for example, leaves the boundary at midnight.
  dayEndMinutes: number | null;
  // The weekday a week starts on.
  weekStartsOn: Weekday | null;
}

export type Measure = 'count' | 'quantity' | 'time' | 'checklist';
export type TargetRole = 'effort' | 'outcome';
// habit: a shortfall never rolls into the next period. cumulative: a shortfall stays owed until the deadline,
// so it needs a deadline period (§1.3). Monthly periods are not built (design §6.1).
export type CarryOverKind = 'habit' | 'cumulative';

export type TargetPeriod =
  | { kind: 'weekly' }
  // The person's named days, as weekdays: each is filled by one counting entry on that local day.
  | { kind: 'day_slots'; days: Weekday[] }
  | { kind: 'deadline'; due: LocalDate };
export type PeriodKind = TargetPeriod['kind'];

// Floor is required for an effort target; aspiration is optional. Stretch, ceiling and ramping levels are not
// built (design §6.1). An outcome target has levels only when the person named a number.
export interface Levels {
  floor: number;
  aspiration: number | null;
}

// A target as it was judged, in one version (§1.3).
export interface TargetSpec {
  measure: Measure;
  // The person's own unit text (for example 'km'); null for a plain count.
  unit: string | null;
  role: TargetRole;
  period: TargetPeriod;
  levels: Levels | null;
  // Entries whose size is below this are kept and listed but not counted, unless counted anyway (§1.3).
  qualifyingThreshold: number | null;
  carryOver: CarryOverKind;
  // The checklist's step ids (measure 'checklist' only).
  stepIds: string[] | null;
}

// A re-baseline adds a version; it never edits one (§1.7, §3.2).
export interface TargetVersion {
  // The first day this version applies from: the start of a period for a repeating target.
  effectiveFrom: LocalDate;
  spec: TargetSpec;
}

export interface ScoreboardTarget {
  id: string;
  // The first day the target counts; entries before it are not counted.
  startsOn: LocalDate;
  // The last day of the goal's current block, for an ongoing goal; null when it has none.
  blockEndsOn: LocalDate | null;
  versions: TargetVersion[];
}

// The target a closed period was judged by, stored when the period closed (§1.7). The result itself is never
// stored: it is always recomputed from entries.
export interface PeriodSnapshot {
  targetId: string;
  periodStart: LocalDate;
  spec: TargetSpec;
}

// One raw record after the person's corrections were applied (§1.6); the engine counts or leaves it out.
export interface ScoreboardEntry {
  id: string;
  targetId: string;
  // An instant with an explicit offset or Z, never a bare local time.
  occurredAt: string;
  // What the entry adds to the target: a tap is 1, a quantity is the number, a time session is its minutes.
  value: number;
  // What a qualifying threshold is compared with, such as a workout's minutes. Null when the entry has none.
  size: number | null;
  // For a checklist tick.
  stepId: string | null;
  removed: boolean;
  countAnyway: boolean;
}

// A step of a milestone or deadline task (§1.4).
export interface WorkStep {
  id: string;
  itemId: string;
  // The start of the person's week the step is planned in.
  plannedPeriodStart: LocalDate;
  completedOn: LocalDate | null;
}

export type ResultStatus = 'open' | 'closed';
// none: nothing yet. partway: partial credit. floor and aspiration: reached. Never a "fail" (§1.3).
export type Level = 'none' | 'partway' | 'floor' | 'aspiration';
// snapshot: the stored target the closed period was judged by. history: a closed period with no snapshot,
// judged by the version in force when it started. current: an open period, judged by the version in force.
export type JudgedBy = 'snapshot' | 'history' | 'current';

export interface TargetResult {
  targetId: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  status: ResultStatus;
  judgedBy: JudgedBy;
  // A repeating target that started after its first period began: shown, not graded (never a miss).
  startedPartway: boolean;
  // Has levels and is a whole period. Only graded periods feed patterns.
  graded: boolean;
  measure: Measure;
  unit: string | null;
  // In the measure: the summed values, the distinct steps ticked, or for day slots the slots filled.
  counted: number;
  // Entry ids kept and shown but not counted (below the qualifying threshold).
  belowThreshold: string[];
  floor: number | null;
  aspiration: number | null;
  // counted / floor, not capped; null without a floor.
  fractionOfFloor: number | null;
  remainingToFloor: number | null;
  // Null when the target has no levels (an outcome target the person did not give a number).
  level: Level | null;
  // What a cumulative target still owes until its deadline; always 0 for a habit and after the deadline.
  owed: number;
  // Day-slot targets only.
  slots: { filled: number; total: number; extraEntries: number } | null;
}

export type Crossing =
  | { kind: 'floor' | 'aspiration'; targetId: string; periodStart: LocalDate; on: LocalDate }
  | { kind: 'step'; targetId: string | null; itemId: string | null; stepId: string; on: LocalDate }
  | {
      kind: 'block_end';
      targetId: string;
      on: LocalDate;
      periodsJudged: number;
      floorMet: number;
      aspirationMet: number;
    };

export type PatternKind = 'slipping' | 'holding' | 'aspiration_repeated';

export interface Pattern {
  kind: PatternKind;
  targetId: string;
  // How many closed periods running, ending at the latest one.
  periods: number;
  endingPeriodStart: LocalDate;
}

export interface PatternSettings {
  // Floor missed this many closed periods running is slipping. A single miss is not a pattern.
  slippingRun: number;
  // Floor (or aspiration) met this many closed periods running is holding.
  holdingRun: number;
}

export type TrendDirection = 'up' | 'flat' | 'down' | 'insufficient';

// An outcome target shows its count and trend (§1.3).
export interface Trend {
  targetId: string;
  // The most recent closed whole periods, oldest first.
  counts: number[];
  direction: TrendDirection;
}

export interface MovedStep {
  stepId: string;
  itemId: string;
  from: LocalDate;
  to: LocalDate;
}

export type ForecastVerdict = 'fits' | 'tight' | 'does_not_fit' | 'not_enough_data' | 'past_due' | 'done';
export type ForecastBasis = 'logged_pace' | 'own_estimate' | 'none';
export type ForecastOption = 'more_time' | 'smaller_scope' | 'move_date' | 'accept_risk';

// What the caller knows about one deadline task. Work and capacity are in the one unit the person chose for
// capacity (hours or sessions). Capacity is what the caller says is available for this item on each day: the
// engine never splits a person's day across goals (§4.2 principle 12).
export interface ForecastRequest {
  itemId: string;
  dueDate: LocalDate;
  // Whether setup recorded that the date can move.
  canMove: boolean;
  steps: { total: number; done: number };
  // Everything logged against the item so far, in the capacity unit.
  logged: number;
  // The person's own rough estimate of the work still to do, if they gave one.
  estimateRemaining: { low: number; high: number } | null;
  availableDays: { date: LocalDate; capacity: number }[];
}

// Deliberately no slot, no free time and no capacity figure (principle 12).
export interface DeadlineForecast {
  itemId: string;
  verdict: ForecastVerdict;
  basis: ForecastBasis;
  stepsRemaining: number;
  daysLeft: number;
  canMove: boolean;
  // Offered only when the verdict is does_not_fit; move_date only when canMove (§3.2).
  options: ForecastOption[];
}

export interface ScoreboardInput {
  // Required: the engine reads no clock.
  today: LocalDate;
  anchors: TimeAnchors;
  targets: ScoreboardTarget[];
  entries: ScoreboardEntry[];
  snapshots: PeriodSnapshot[];
  steps: WorkStep[];
  forecasts: ForecastRequest[];
  // Overrides for the pattern run lengths; unset fields use PATTERN_DEFAULTS.
  patterns?: Partial<PatternSettings>;
}

export interface Scoreboard {
  today: LocalDate;
  // The latest period of each started target: the open one, or the closed deadline period.
  results: TargetResult[];
  // Every earlier period, closed, oldest first per target.
  history: TargetResult[];
  crossings: Crossing[];
  patterns: Pattern[];
  trends: Trend[];
  movedSteps: MovedStep[];
  forecasts: DeadlineForecast[];
}
