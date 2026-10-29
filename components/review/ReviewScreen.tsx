import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDay } from '@/components/home/wording';
import type { WeeklyReviewFacts } from '@/types/review';
import { ChangesSince, RecapBody } from './RecapBody';
import { closedEarlyLine, closedEarlyReviewedLine, fullWeekdayName, weekLabel } from './wording';

interface ReviewScreenProps {
  facts: WeeklyReviewFacts;
}

const ANCHOR_NAME = { time_zone: 'time zone', day_end: 'day end' } as const;

function Message({ children, to }: { children: ReactNode; to?: { href: string; label: string } }) {
  return (
    <section aria-label="Weekly review" className="home-notice">
      <p className="text-sm">{children}</p>
      {to && (
        <p className="mt-2">
          <Link href={to.href} className="review-link">
            {to.label}
          </Link>
        </p>
      )}
    </section>
  );
}

// The weekly review's layer 1 recap, read only (MOM-113 block 3.2). It shows what the server built from the engine's facts
// and the person's own record, and decides nothing itself: no review appears before the person has set the day their week
// starts and the day they plan it in, and nothing is guessed. Layer 2's offer and layer 3's one adjustment are block 3.3.
export function ReviewScreen({ facts }: ReviewScreenProps) {
  switch (facts.state) {
    case 'no_goals':
      return (
        <Message to={{ href: '/', label: 'Back to home' }}>
          Your weekly review starts once you have a goal. Nothing to look back on yet.
        </Message>
      );
    case 'needs_day_anchors': {
      const what = ANCHOR_NAME[facts.anchor];
      return (
        <Message to={{ href: '/settings', label: 'Open settings' }}>
          {facts.reason === 'not_set'
            ? `Set your ${what} to get a weekly review. Nothing is graded until you do, and nothing is guessed.`
            : `The ${what} you saved is not one Momentum can use. Set it again to get a weekly review.`}
        </Message>
      );
    }
    case 'needs_planning_setup':
      return (
        <Message to={{ href: '/settings', label: 'Open settings' }}>
          Choose the day your week starts and the day you plan it, and your weekly review will come on that day. Nothing is guessed.
        </Message>
      );
    case 'not_due':
      return (
        <>
          <Message to={{ href: '/', label: 'Back to home' }}>
            Your weekly review comes on {fullWeekdayName(facts.planningWeekday)}s, the day you chose to plan your week.
          </Message>
          {facts.last && (
            <section aria-label="Your last review">
              <h2 className="section-title">Your last review</h2>
              <p className="eyebrow">{weekLabel(facts.last.window)}</p>
              <p className="home-note">You finished it on {formatDay(facts.last.finishedOn)}.</p>
              <RecapBody recap={facts.last.recap} tone={facts.tone} />
            </section>
          )}
          <ChangesSince changes={facts.changes} />
        </>
      );
    case 'reviewed':
      return (
        <>
          <section aria-label="This week's review">
            <p className="eyebrow">{weekLabel(facts.review.window)}</p>
            <p className="home-notice">You finished this review on {formatDay(facts.review.finishedOn)}. It stays as it was said.</p>
            {facts.review.recap.closedEarly && <p className="home-note">{closedEarlyReviewedLine(facts.review.window)}</p>}
            <RecapBody recap={facts.review.recap} tone={facts.tone} />
          </section>
          <ChangesSince changes={facts.changes} />
        </>
      );
    case 'ready':
      return (
        <>
          <section aria-label="This week's recap">
            <p className="eyebrow">{weekLabel(facts.window)}</p>
            {facts.recap.closedEarly && <p className="home-notice">{closedEarlyLine(facts.window.end)}</p>}
            <RecapBody recap={facts.recap} tone={facts.tone} />
          </section>
          <ChangesSince changes={facts.changes} />
        </>
      );
  }
}
