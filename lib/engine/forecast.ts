// The deadline forecast (docs/DOMAIN_MODEL.md §1.4, §3.2): whether the work left fits the time left, from rough
// logged time, said plainly. It returns a verdict and counts of steps and days, and nothing that names a slot,
// free minutes or a capacity figure (§4.2 principle 12). The caller says what capacity is available for the
// item; the engine does not split a person's day across goals.

import type { DeadlineForecast, ForecastBasis, ForecastOption, ForecastRequest } from '@/types/scoreboard';
import { FORECAST_TOLERANCE } from './constants';
import { assertDate } from './time';

function assertRequest(r: ForecastRequest): void {
  assertDate(r.dueDate);
  const { total, done } = r.steps;
  if (!Number.isInteger(total) || !Number.isInteger(done) || total < 0 || done < 0 || done > total) {
    throw new Error(`Item ${r.itemId} has steps done and total that do not fit together.`);
  }
  if (!Number.isFinite(r.logged) || r.logged < 0) throw new Error(`Item ${r.itemId} has logged work below 0.`);
  const e = r.estimateRemaining;
  if (e !== null && !(e.low >= 0 && e.high >= e.low)) throw new Error(`Item ${r.itemId} has an estimate that is not low to high.`);
  for (const d of r.availableDays) {
    assertDate(d.date);
    if (!(d.capacity >= 0)) throw new Error(`Item ${r.itemId} has a day with capacity below 0.`);
  }
}

export function forecastDeadline(request: ForecastRequest, today: string): DeadlineForecast {
  assertDate(today);
  assertRequest(request);
  const { steps, dueDate, canMove } = request;
  const stepsRemaining = steps.total - steps.done;
  const window = request.availableDays.filter((d) => d.date >= today && d.date <= dueDate);
  const base = { itemId: request.itemId, stepsRemaining, daysLeft: window.length, canMove };
  const result = (verdict: DeadlineForecast['verdict'], basis: ForecastBasis, options: ForecastOption[] = []) => ({
    ...base,
    verdict,
    basis,
    options,
  });

  if (steps.total > 0 && stepsRemaining === 0) return result('done', 'none');
  if (today > dueDate) return result('past_due', 'none');

  // Rough data: the pace so far, with a margin either side; failing that, the person's own estimate.
  let low: number;
  let high: number;
  let basis: ForecastBasis;
  if (steps.done > 0 && request.logged > 0) {
    const remaining = stepsRemaining * (request.logged / steps.done);
    low = remaining * (1 - FORECAST_TOLERANCE);
    high = remaining * (1 + FORECAST_TOLERANCE);
    basis = 'logged_pace';
  } else if (request.estimateRemaining !== null) {
    ({ low, high } = request.estimateRemaining);
    basis = 'own_estimate';
  } else {
    return result('not_enough_data', 'none');
  }

  const capacity = window.reduce((sum, d) => sum + d.capacity, 0);
  if (high <= capacity) return result('fits', basis);
  if (low > capacity) {
    // "Move the date" is offered only when setup recorded that the date can move (§3.2).
    const options: ForecastOption[] = ['more_time', 'smaller_scope'];
    if (canMove) options.push('move_date');
    options.push('accept_risk');
    return result('does_not_fit', basis, options);
  }
  return result('tight', basis);
}
