// Patterns in both directions (docs/DOMAIN_MODEL.md §1.7, §3.2): slipping, holding, and an aspiration hit
// repeatedly. A pattern is a run of closed periods ending at the latest one, so one bad week is never a pattern.

import type { Pattern, PatternSettings, TargetResult } from '@/types/scoreboard';
import { PATTERN_DEFAULTS } from './constants';

export function patternSettings(overrides: Partial<PatternSettings> | undefined): PatternSettings {
  const settings = { ...PATTERN_DEFAULTS, ...overrides };
  for (const [name, run] of Object.entries(settings)) {
    if (!Number.isInteger(run) || run < 1) throw new Error(`${name} must be a whole number of periods, 1 or more.`);
  }
  return settings;
}

// `closed` is one target's closed periods, oldest first. Periods that are not graded (a partial first week, no
// levels) are not part of a run.
export function detectPatterns(closed: TargetResult[], settings: PatternSettings): Pattern[] {
  const graded = closed.filter((r) => r.status === 'closed' && r.graded && r.level !== null);
  if (graded.length === 0) return [];
  const latest = graded[graded.length - 1];

  const runEndingNow = (counts: (r: TargetResult) => boolean) => {
    let run = 0;
    for (let i = graded.length - 1; i >= 0 && counts(graded[i]); i -= 1) run += 1;
    return run;
  };
  const metFloor = (r: TargetResult) => r.level === 'floor' || r.level === 'aspiration';
  const out: Pattern[] = [];
  const add = (kind: Pattern['kind'], periods: number, needed: number) => {
    if (periods >= needed) out.push({ kind, targetId: latest.targetId, periods, endingPeriodStart: latest.periodStart });
  };
  add('slipping', runEndingNow((r) => !metFloor(r)), settings.slippingRun);
  add('holding', runEndingNow(metFloor), settings.holdingRun);
  add('aspiration_repeated', runEndingNow((r) => r.level === 'aspiration'), settings.holdingRun);
  return out;
}
