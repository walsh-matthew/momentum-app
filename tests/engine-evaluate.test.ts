// One target's result for one period (lib/engine/evaluate.ts, docs/DOMAIN_MODEL.md §1.3: levels, partial credit,
// outcome targets, carry-over by kind).

import { describe, expect, it } from 'vitest';
import { evaluateTarget } from '@/lib/engine';
import { anchors, entry, target } from './helpers/engineFixtures';
import type { ScoreboardEntry, ScoreboardTarget, TargetResult, TimeAnchors } from '@/types/scoreboard';

function evaluate(
  t: ScoreboardTarget,
  periodStart: string,
  today: string,
  entries: ScoreboardEntry[] = [],
  a: TimeAnchors = anchors(),
): TargetResult {
  return evaluateTarget({ target: t, periodStart, today, anchors: a, entries, snapshots: [] });
}

describe('a period is open until its last day has passed', () => {
  it('is open on the last day and closed the day after, with today as an input', () => {
    expect(evaluate(target(), '2026-10-12', '2026-10-18').status).toBe('open');
    expect(evaluate(target(), '2026-10-12', '2026-10-19').status).toBe('closed');
  });
});

describe('levels and partial credit', () => {
  const week = (n: number) => Array.from({ length: n }, (_, i) => entry(`2026-10-${String(12 + (i % 7)).padStart(2, '0')}`));

  it('a period with no entries has nothing yet, which is not a fail', () => {
    const r = evaluate(target(), '2026-10-12', '2026-10-14');
    expect(r).toMatchObject({ counted: 0, level: 'none', fractionOfFloor: 0, remainingToFloor: 3, owed: 0 });
  });

  it('partway to the floor is partial credit', () => {
    const r = evaluate(target(), '2026-10-12', '2026-10-14', week(1));
    expect(r).toMatchObject({ counted: 1, level: 'partway', remainingToFloor: 2 });
    expect(r.fractionOfFloor).toBeCloseTo(1 / 3);
  });

  it('reaches the floor, then the aspiration, and does not cap the fraction', () => {
    expect(evaluate(target(), '2026-10-12', '2026-10-18', week(3)).level).toBe('floor');
    expect(evaluate(target(), '2026-10-12', '2026-10-18', week(5)).level).toBe('aspiration');
    expect(evaluate(target(), '2026-10-12', '2026-10-18', week(7)).fractionOfFloor).toBeCloseTo(7 / 3);
  });

  it('an entry with a larger value moves the count by that value', () => {
    expect(evaluate(target(), '2026-10-12', '2026-10-18', [entry('2026-10-12', { value: 3 })]).level).toBe('floor');
  });

  it('lists a below-threshold entry on the result without counting it', () => {
    const t = target({}, { qualifyingThreshold: 20 });
    const r = evaluate(t, '2026-10-12', '2026-10-18', [entry('2026-10-12', { id: 'short', size: 10 })]);
    expect(r).toMatchObject({ counted: 0, belowThreshold: ['short'] });
  });
});

describe('a target that starts partway through a week', () => {
  const t = target({ startsOn: '2026-10-08' }); // a Thursday

  it('shows the first week, counts nothing before the start day, and does not grade it', () => {
    const r = evaluate(t, '2026-10-05', '2026-10-14', [entry('2026-10-06'), entry('2026-10-08')]);
    expect(r).toMatchObject({ periodStart: '2026-10-05', counted: 1, startedPartway: true, graded: false });
  });

  it('grades the next whole week', () => {
    expect(evaluate(t, '2026-10-12', '2026-10-14')).toMatchObject({ startedPartway: false, graded: true });
  });
});

describe('outcome targets', () => {
  it('show the count and no level unless the person named a number', () => {
    const t = target({}, { role: 'outcome', levels: null });
    const r = evaluate(t, '2026-10-12', '2026-10-18', [entry('2026-10-13'), entry('2026-10-14')]);
    expect(r).toMatchObject({ counted: 2, level: null, floor: null, fractionOfFloor: null, graded: false });
  });

  it('get a level when the person set one', () => {
    const t = target({}, { role: 'outcome', levels: { floor: 2, aspiration: null } });
    expect(evaluate(t, '2026-10-12', '2026-10-18', [entry('2026-10-13'), entry('2026-10-14')]).level).toBe('floor');
  });
});

describe('a spec that contradicts the model is refused', () => {
  const bad = (specOver: Parameters<typeof target>[1]) => () => evaluate(target({}, specOver), '2026-10-12', '2026-10-14');

  it('an effort target with no floor', () => expect(bad({ levels: null })).toThrow(/floor/));
  it('a floor of 0', () => expect(bad({ levels: { floor: 0, aspiration: null } })).toThrow(/more than 0/));
  it('an aspiration below the floor', () => expect(bad({ levels: { floor: 3, aspiration: 2 } })).toThrow(/aspiration/));
  it('a cumulative target without a deadline', () => expect(bad({ carryOver: 'cumulative' })).toThrow(/deadline period/));
  it('a habit with a deadline period', () =>
    expect(bad({ period: { kind: 'deadline', due: '2026-12-18' } })).toThrow(/habit repeats/));
  it('a checklist with no steps', () => expect(bad({ measure: 'checklist' })).toThrow(/steps/));
  it('day slots with no days', () => expect(bad({ period: { kind: 'day_slots', days: [] } })).toThrow(/at least one day/));
});

describe('carry-over by kind', () => {
  it('a habit shortfall is never owed, and catch-up inside the week counts', () => {
    const entries = [entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-11')]; // the third on the last day
    expect(evaluate(target(), '2026-10-05', '2026-10-12', entries.slice(0, 2))).toMatchObject({ remainingToFloor: 1, owed: 0 });
    expect(evaluate(target(), '2026-10-05', '2026-10-12', entries).level).toBe('floor');
  });

  describe('a cumulative target is owed until its deadline', () => {
    const t = target({}, { period: { kind: 'deadline', due: '2026-12-18' }, carryOver: 'cumulative', levels: { floor: 15, aspiration: null } });
    const six = Array.from({ length: 6 }, (_, i) => entry(`2026-10-${String(6 + i).padStart(2, '0')}`));

    it('owes the shortfall while the deadline is ahead, and less as entries arrive', () => {
      expect(evaluate(t, '2026-10-05', '2026-11-02', six)).toMatchObject({ counted: 6, remainingToFloor: 9, owed: 9, status: 'open' });
      const more = [...six, entry('2026-11-01', { value: 9 })];
      expect(evaluate(t, '2026-10-05', '2026-11-02', more)).toMatchObject({ counted: 15, owed: 0, level: 'floor' });
    });

    it('is final once the deadline has passed: the gap is shown, nothing is owed, later entries do not count', () => {
      const r = evaluate(t, '2026-10-05', '2026-12-19', [...six, entry('2026-12-19')]);
      expect(r).toMatchObject({ status: 'closed', counted: 6, remainingToFloor: 9, owed: 0, level: 'partway' });
    });

    it('needs no week start, because a deadline period does not use one', () => {
      expect(() => evaluate(t, '2026-10-05', '2026-11-02', six, anchors({ weekStartsOn: null }))).not.toThrow();
    });
  });
});

describe('named day slots', () => {
  it('reports slots filled out of slots named, with extras', () => {
    const t = target({}, { period: { kind: 'day_slots', days: [1, 3, 5] }, levels: { floor: 3, aspiration: null } });
    const entries = [entry('2026-10-05'), entry('2026-10-05'), entry('2026-10-06'), entry('2026-10-07')];
    const r = evaluate(t, '2026-10-05', '2026-10-09', entries);
    expect(r).toMatchObject({ counted: 2, level: 'partway', slots: { filled: 2, total: 3, extraEntries: 1 } });
  });
});

describe('weeks and zones other than the default', () => {
  it('counts by a week that starts on a Wednesday', () => {
    const t = target({ startsOn: '2026-10-07' });
    const a = anchors({ weekStartsOn: 3 });
    const entries = [entry('2026-10-07'), entry('2026-10-13'), entry('2026-10-14')];
    expect(evaluate(t, '2026-10-07', '2026-10-20', entries, a)).toMatchObject({ periodEnd: '2026-10-13', counted: 2 });
    expect(() => evaluate(t, '2026-10-05', '2026-10-20', entries, a)).toThrow(/first day/);
  });

  it('puts the same instant in different weeks for a person far from UTC', () => {
    // 23:30 on Sunday the 11th in Los Angeles is 20:30 on Monday the 12th in Kiritimati (UTC+14).
    const e = entry('2026-10-11', { occurredAt: '2026-10-11T23:30:00-07:00' });
    expect(evaluate(target(), '2026-10-05', '2026-10-20', [e]).counted).toBe(1);
    const far = anchors({ timeZone: 'Pacific/Kiritimati' });
    expect(evaluate(target(), '2026-10-05', '2026-10-20', [e], far).counted).toBe(0);
    expect(evaluate(target(), '2026-10-12', '2026-10-20', [e], far).counted).toBe(1);
  });

  it('puts a late entry on the day before when the day end is early', () => {
    const late = entry('2026-10-12', { occurredAt: '2026-10-12T01:30:00-07:00' }); // 01:30 Monday
    const early = anchors({ dayEndMinutes: 120 });
    expect(evaluate(target(), '2026-10-05', '2026-10-20', [late], early).counted).toBe(1); // Sunday's week
    expect(evaluate(target(), '2026-10-05', '2026-10-20', [late]).counted).toBe(0);
  });
});
