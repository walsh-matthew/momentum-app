// Starting values the engine uses when the caller gives none, kept in one place so tuning one after use is a
// small change (docs/DOMAIN_MODEL.md §4.1). None of them is a time anchor: those have no default (principle 1).

import type { PatternSettings } from '@/types/scoreboard';

// Slipping is the floor missed in two closed periods running (§3.2); a single bad week is not a pattern.
// Holding, and an aspiration hit repeatedly, is three running: a starting value to tune from use.
export const PATTERN_DEFAULTS: Readonly<PatternSettings> = { slippingRun: 2, holdingRun: 3 };

// How far either side of the pace logged so far the remaining work may sit, because logged time is rough.
// Within the range of what fits and what does not, the forecast says "tight", not a verdict it cannot back.
export const FORECAST_TOLERANCE = 0.25;

// An outcome target's trend looks at this many of the latest closed periods.
export const TREND_PERIODS = 6;

// A day end after midnight and before this many minutes (06:00) moves the day boundary. A later one is the
// person's evening check-in time and the boundary stays at midnight.
export const EARLY_DAY_END_LIMIT = 360;
