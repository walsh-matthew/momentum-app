// The scoreboard engine (MOM-108): pure functions, no database, no model, no network, no clock. "Today" and the
// person's time anchors are inputs. Services call this; nothing here calls a service.

export { snapshotPeriod, targetInForce } from './baseline';
export { carryForwardSteps } from './carryover';
export { FORECAST_TOLERANCE, PATTERN_DEFAULTS, TREND_PERIODS } from './constants';
export { blockEndCrossing, levelCrossings, stepCompletions } from './crossings';
export { selectEntries, measureTotal } from './entries';
export { evaluateTarget, evaluatePeriod, specProblem } from './evaluate';
export { forecastDeadline } from './forecast';
export { detectPatterns, patternSettings } from './patterns';
export { buildLayer1Facts, closesEarly, compareRecapToLive, reviewAsOf, selectLayerThreeAdjustment, weeklyReviewWindow } from './review';
export { computeScoreboard } from './scoreboard';
export { addDays, assertAnchors, assertDate, canGrade, dayOfWeek, localDay, localNoon, weekRange } from './time';
export { biggestCrossings, crossingKey, entriesPerDay, floorsMet } from './week';
export type { DayCount, FloorTally } from './week';
