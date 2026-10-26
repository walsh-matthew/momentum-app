// Patterns in both directions (lib/engine/patterns.ts, docs/DOMAIN_MODEL.md §1.7, §3.2).

import { describe, expect, it } from 'vitest';
import { computeScoreboard, detectPatterns, patternSettings, PATTERN_DEFAULTS } from '@/lib/engine';
import { entry, input, periodResult } from './helpers/engineFixtures';
import type { Level } from '@/types/scoreboard';

const run = (levels: Level[], settings = PATTERN_DEFAULTS) =>
  detectPatterns(levels.map((l) => periodResult(l)), settings).map((p) => [p.kind, p.periods]);

describe('slipping', () => {
  it('is the floor missed in two closed periods running, by default', () => {
    expect(PATTERN_DEFAULTS.slippingRun).toBe(2);
    expect(run(['floor', 'partway', 'none'])).toEqual([['slipping', 2]]);
  });

  it('a single bad week is not a pattern', () => {
    expect(run(['floor', 'floor', 'partway'])).toEqual([]);
  });

  it('is broken by a week that met the floor', () => {
    expect(run(['partway', 'floor', 'partway'])).toEqual([]);
  });

  it('follows the person’s own run length', () => {
    expect(run(['partway', 'none'], { slippingRun: 3, holdingRun: 3 })).toEqual([]);
    expect(run(['partway', 'none', 'none'], { slippingRun: 3, holdingRun: 3 })).toEqual([['slipping', 3]]);
    expect(run(['floor', 'partway'], { slippingRun: 1, holdingRun: 3 })).toEqual([['slipping', 1]]);
  });
});

describe('holding and an aspiration hit repeatedly', () => {
  it('holding is the floor met three periods running, by default', () => {
    expect(run(['floor', 'floor'])).toEqual([]);
    expect(run(['partway', 'floor', 'floor', 'floor'])).toEqual([['holding', 3]]);
  });

  it('a miss breaks the run', () => {
    expect(run(['floor', 'floor', 'partway', 'floor'])).toEqual([]);
  });

  it('an aspiration hit three periods running is both held and repeated', () => {
    expect(run(['aspiration', 'aspiration', 'aspiration'])).toEqual([
      ['holding', 3],
      ['aspiration_repeated', 3],
    ]);
  });

  it('floor-only weeks do not count as aspiration hits, though the floor is still held', () => {
    expect(run(['aspiration', 'floor', 'aspiration', 'aspiration'])).toEqual([['holding', 4]]);
  });
});

describe('what is left out of a run', () => {
  it('skips periods that were not graded, such as a partial first week', () => {
    const results = [
      periodResult('none', { startedPartway: true, graded: false }),
      periodResult('partway'),
      periodResult('none'),
    ];
    expect(detectPatterns(results, PATTERN_DEFAULTS).map((p) => p.kind)).toEqual(['slipping']);
    expect(detectPatterns(results.slice(0, 2), PATTERN_DEFAULTS)).toEqual([]);
  });

  it('judges nothing for an outcome target with no level', () => {
    expect(detectPatterns([periodResult(null), periodResult(null)], PATTERN_DEFAULTS)).toEqual([]);
  });

  it('ignores an open period', () => {
    const results = [periodResult('partway'), periodResult('none', { status: 'open' })];
    expect(detectPatterns(results, PATTERN_DEFAULTS)).toEqual([]);
  });

  it('reports the period the run ends at', () => {
    const results = [periodResult('none', { periodStart: '2026-10-05' }), periodResult('none', { periodStart: '2026-10-12' })];
    expect(detectPatterns(results, PATTERN_DEFAULTS)).toEqual([
      { kind: 'slipping', targetId: 't1', periods: 2, endingPeriodStart: '2026-10-12' },
    ]);
  });
});

describe('settings', () => {
  it('fills what the person did not set from the defaults', () => {
    expect(patternSettings(undefined)).toEqual({ slippingRun: 2, holdingRun: 3 });
    expect(patternSettings({ slippingRun: 4 })).toEqual({ slippingRun: 4, holdingRun: 3 });
  });

  it('refuses a run that is not a whole number of periods', () => {
    expect(() => patternSettings({ slippingRun: 0 })).toThrow(/slippingRun/);
    expect(() => patternSettings({ holdingRun: 2.5 })).toThrow(/holdingRun/);
  });
});

describe('through the scoreboard', () => {
  it('finds slipping after two weeks under the floor and nothing for a person who changes the run', () => {
    const entries = [entry('2026-10-05'), entry('2026-10-12')]; // one a week, floor 3
    const board = computeScoreboard(input({ today: '2026-10-21', entries }));
    expect(board.patterns).toEqual([{ kind: 'slipping', targetId: 't1', periods: 2, endingPeriodStart: '2026-10-12' }]);
    expect(computeScoreboard(input({ today: '2026-10-21', entries, patterns: { slippingRun: 3 } })).patterns).toEqual([]);
  });
});
