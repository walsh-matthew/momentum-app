import Link from 'next/link';
import {
  CARD_CHOOSE_DAY,
  CARD_HEADING,
  CARD_NOTHING_TODAY,
  CARD_NOT_PLANNED,
  CARD_PLANNED_LATER,
  CARD_TODAY,
  LEFT_OVER,
  LEFT_OVER_HELP,
  PLAN_LINK,
} from '@/components/plan/wording';
import type { HomePlanView } from '@/types/plan';

interface YourPlanCardProps {
  // none shows nothing: the person's days are not known yet, or there is nothing they could put on a day.
  plan: HomePlanView | null | undefined;
}

// What the person put on today, and what is left over from last week, with a way into the week plan (MOM-112 block 2).
// These are the person's own choices read back: nothing here picks a thing, a day or a time, and nothing is sent or
// scheduled yet (reminders wait for the settings the person sets). A person who has not planned is told so, calmly, and
// is never nagged.
export function YourPlanCard({ plan }: YourPlanCardProps) {
  if (!plan || plan.state === 'none') return null;
  const { todayItems, moved, plannedLater } = plan;
  return (
    <section aria-label={CARD_HEADING} className="home-goal plan-card">
      <header>
        <h3 className="card-title">{CARD_HEADING}</h3>
        <Link href="/plan" className="review-link">
          {PLAN_LINK}
        </Link>
      </header>

      <div className="home-target">
        <h4>{CARD_TODAY}</h4>
        {todayItems.length > 0 ? (
          <ul className="plan-card-list">
            {todayItems.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <small>{item.goalTitle}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-note">{plannedLater ? `${CARD_NOTHING_TODAY} ${CARD_PLANNED_LATER}` : `${CARD_NOTHING_TODAY} ${CARD_NOT_PLANNED}`}</p>
        )}
      </div>

      {moved.length > 0 && (
        <div className="home-target">
          <h4>{LEFT_OVER}</h4>
          <p className="home-note">{LEFT_OVER_HELP}</p>
          <ul className="plan-card-list">
            {moved.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <Link href="/plan" className="review-link">
                  {CARD_CHOOSE_DAY}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
