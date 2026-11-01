'use client';

import Link from 'next/link';
import { chooseDayKind, clearKindOfDay, copyKindsFromLastWeek, planHabitSetDays, planItem, unplanItem } from '@/app/actions/plan';
import { CHANGE_KIND_TIMES } from '@/components/forecast/wording';
import { formatDay, weekdayLetter } from '@/components/home/wording';
import type { PlanItemView } from '@/types/plan';
import { usePlanAction } from './usePlanAction';
import {
  COPY_KINDS,
  KINDS_HEADING,
  KINDS_NONE_YET,
  KINDS_NOT_SET,
  KINDS_REASON,
  LEFT_OVER,
  LEFT_OVER_HELP,
  NEXT_WEEK,
  NO_ITEMS,
  PREVIOUS_WEEK,
  USE_SET_DAYS,
  WHAT_TO_DO_HEADING,
  WHAT_TO_DO_HELP,
  dayButtonLabel,
  itemChips,
  kindSelectLabel,
  setDaysText,
  windowTitle,
  type ReadyPlan,
} from './wording';

interface PlanScreenProps {
  plan: ReadyPlan;
}

const dayOfMonth = (day: string) => String(Number(day.slice(8, 10)));
const weekHref = (offset: number) => (offset === 0 ? '/plan' : `/plan?week=${offset}`);

// The week plan: the person's own choice of which things to do on which of their days, and which of their own kinds of days
// each date is. Every control is the person's tap and nothing is filled in for them. It shows no time, no slot and no amount
// of free time (docs/DOMAIN_MODEL.md §4.2 principle 12). A day that has passed can be read and not changed.
export function PlanScreen({ plan }: PlanScreenProps) {
  const { pending, error, run } = usePlanAction();
  const itemsByGoal = new Map<string, { title: string; items: PlanItemView[] }>();
  for (const item of plan.items) {
    const group = itemsByGoal.get(item.goalId) ?? { title: item.goalTitle, items: [] };
    group.items.push(item);
    itemsByGoal.set(item.goalId, group);
  }

  return (
    <div className="plan-screen">
      <header className="plan-window">
        <h2>{windowTitle(plan)}</h2>
        {plan.window === 'week' && (
          <nav aria-label="Weeks" className="plan-weeks">
            {plan.hasPrevious ? <Link href={weekHref(plan.offset - 1)}>{PREVIOUS_WEEK}</Link> : <span aria-hidden="true" />}
            {plan.hasNext && <Link href={weekHref(plan.offset + 1)}>{NEXT_WEEK}</Link>}
          </nav>
        )}
      </header>

      {error && (
        <p role="alert" className="plan-error">
          {error}
        </p>
      )}

      <section aria-labelledby="plan-things" className="plan-section">
        <h2 id="plan-things">{WHAT_TO_DO_HEADING}</h2>
        {plan.items.length === 0 ? (
          <p className="plan-note">{NO_ITEMS}</p>
        ) : (
          <>
            <p className="plan-note">{WHAT_TO_DO_HELP}</p>
            {[...itemsByGoal].map(([goalId, group]) => (
              <section key={goalId} aria-label={group.title} className="plan-goal">
                <h3 className="card-title">{group.title}</h3>
                {group.items.map((item) => {
                  const chosen = new Set(plan.days.filter((d) => d.itemIds.includes(item.id)).map((d) => d.date));
                  return (
                    <div key={item.id} className="plan-row">
                      <div className="plan-row-head">
                        <h4>{item.title}</h4>
                        <div className="plan-chips">
                          {item.movedFromLastWeek && <span className="chip chip-warn">{LEFT_OVER}</span>}
                          {itemChips(item, plan.today).map((chip) => (
                            <span key={chip} className="chip">
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      {item.movedFromLastWeek && <p className="plan-note">{LEFT_OVER_HELP}</p>}
                      {item.setDays && (
                        <div className="plan-set-days">
                          <p className="plan-note">{setDaysText(item.setDays)}</p>
                          <button type="button" className="plan-button" disabled={pending} onClick={() => run(() => planHabitSetDays(item.id, plan.offset))}>
                            {USE_SET_DAYS}
                          </button>
                        </div>
                      )}
                      <ul className="plan-days" aria-label={`Days for ${item.title}`}>
                        {plan.days.map((day) => {
                          const on = chosen.has(day.date);
                          return (
                            <li key={day.date}>
                              <button
                                type="button"
                                className="plan-day"
                                aria-pressed={on}
                                aria-label={dayButtonLabel(item.title, day.date, plan.today)}
                                data-today={day.isToday ? 'true' : undefined}
                                disabled={pending || day.isPast}
                                onClick={() => run(() => (on ? unplanItem(item.id, day.date) : planItem(item.id, day.date)))}
                              >
                                <span aria-hidden="true">{weekdayLetter(day.date)}</span>
                                <span aria-hidden="true">{dayOfMonth(day.date)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        )}
      </section>

      <section aria-labelledby="plan-kinds" className="plan-section plan-goal">
        <h2 id="plan-kinds" className="card-title">{KINDS_HEADING}</h2>
        <p className="plan-note">{KINDS_REASON}</p>
        {plan.dayKinds.length === 0 ? (
          <p className="plan-note">{KINDS_NONE_YET}</p>
        ) : (
          <>
            {plan.copyableKinds > 0 && (
              <button type="button" className="plan-button" disabled={pending} onClick={() => run(() => copyKindsFromLastWeek(plan.offset))}>
                {COPY_KINDS}
              </button>
            )}
            <Link href="/plan/kinds" className="review-link">
              {CHANGE_KIND_TIMES}
            </Link>
            <ul className="plan-kinds">
              {plan.days.map((day) => (
                <li key={day.date}>
                  <label>
                    <span>{formatDay(day.date, plan.today, { relative: false })}</span>
                    <select
                      aria-label={kindSelectLabel(day.date, plan.today)}
                      value={day.dayTypeId ?? ''}
                      disabled={pending || day.isPast}
                      onChange={(event) => {
                        const value = event.target.value;
                        run(() => (value === '' ? clearKindOfDay(day.date) : chooseDayKind(day.date, value)));
                      }}
                    >
                      <option value="">{KINDS_NOT_SET}</option>
                      {plan.dayKinds.map((kind) => (
                        <option key={kind.id} value={kind.id}>
                          {kind.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
