// The computed scoreboard (docs/DOMAIN_MODEL.md §1.7): every target's results, crossings and patterns, the
// outcome trends, the steps moved forward and the deadline forecasts, as one list of facts. Claude only writes
// words around them; it never scores and never does math (§4.2 principle 9).

import type { Crossing, Pattern, Scoreboard, ScoreboardInput, TargetResult, Trend, TrendDirection } from '@/types/scoreboard';
import { targetInForce } from './baseline';
import { carryForwardSteps } from './carryover';
import { TREND_PERIODS } from './constants';
import { blockEndCrossing, levelCrossings, stepCompletions } from './crossings';
import { evaluatePeriod, periodStarts, type PeriodEvaluation } from './evaluate';
import { forecastDeadline } from './forecast';
import { detectPatterns, patternSettings } from './patterns';
import { assertAnchors, assertDate } from './time';

function trendOf(targetId: string, closed: TargetResult[]): Trend {
  const counts = closed
    .filter((r) => r.status === 'closed' && !r.startedPartway)
    .map((r) => r.counted)
    .slice(-TREND_PERIODS);
  let direction: TrendDirection = 'insufficient';
  if (counts.length >= 2) {
    const [before, latest] = counts.slice(-2);
    direction = latest > before ? 'up' : latest < before ? 'down' : 'flat';
  }
  return { targetId, counts, direction };
}

export function computeScoreboard(input: ScoreboardInput): Scoreboard {
  const { today, anchors } = input;
  assertDate(today);
  const settings = patternSettings(input.patterns);

  const out: Scoreboard = {
    today,
    results: [],
    history: [],
    crossings: [],
    patterns: [],
    trends: [],
    movedSteps: [],
    forecasts: [],
  };

  for (const target of input.targets) {
    const kind = targetInForce(target, today).period.kind;
    assertAnchors(anchors, kind);
    // A target that has not started yet has nothing to show.
    if (today < target.startsOn) continue;

    const evaluations: PeriodEvaluation[] = periodStarts(targetInForce(target, today), target.startsOn, today, anchors).map(
      (periodStart) =>
        evaluatePeriod({ target, periodStart, today, anchors, entries: input.entries, snapshots: input.snapshots }),
    );
    const results = evaluations.map((e) => e.result);
    const latest = evaluations[evaluations.length - 1];
    out.results.push(latest.result);
    out.history.push(...results.slice(0, -1));

    const crossings: Crossing[] = evaluations.flatMap(levelCrossings);
    const blockEnd = blockEndCrossing(target, results, today, kind !== 'deadline');
    if (blockEnd) crossings.push(blockEnd);
    out.crossings.push(...crossings);

    if (kind !== 'deadline') {
      const patterns: Pattern[] = detectPatterns(results, settings);
      out.patterns.push(...patterns);
    }
    if (latest.spec.role === 'outcome') out.trends.push(trendOf(target.id, results));
  }

  out.crossings.push(...stepCompletions(input.steps));
  if (input.steps.some((s) => s.completedOn === null)) {
    out.movedSteps = carryForwardSteps(input.steps, today, anchors).moved;
  }
  out.forecasts = input.forecasts.map((request) => forecastDeadline(request, today));
  return out;
}
