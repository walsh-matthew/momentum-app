import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ReviewPlanningMode } from '@/types/database.types';
import type { WeeklyReviewFacts } from '@/types/review';
import { adjustmentView } from './adjustmentWording';
import { ChangesSince, RecapBody } from './RecapBody';
import { ReviewSitting } from './ReviewSitting';
import { PLAN_HEADING, PLAN_LINK, PLAN_NEXT, PLAN_SEPARATE, PLAN_SEPARATE_LINK } from './sittingWording';
import { closedEarlyLine, closedEarlyReviewedLine, finishedWhen, fullWeekdayName, weekLabel } from './wording';

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

// What follows a finished review (docs/DOMAIN_MODEL.md §3, §4.1 "Review and planning"): planning in the same sitting by default,
// which is a link to the week plan, or one quiet line when the person chose to plan separately. Nothing is planned for them.
function PlanNext({ mode }: { mode: ReviewPlanningMode }) {
  return (
    <section aria-label="Plan your week" className="home-notice review-card">
      {mode === 'one_sitting' ? (
        <>
          <h2 className="card-title">{PLAN_HEADING}</h2>
          <p className="home-note">{PLAN_NEXT}</p>
          <Link href="/plan" className="review-link">
            {PLAN_LINK}
          </Link>
        </>
      ) : (
        <>
          <p className="home-note">{PLAN_SEPARATE}</p>
          <Link href="/plan" className="review-link">
            {PLAN_SEPARATE_LINK}
          </Link>
        </>
      )}
    </section>
  );
}

// The weekly review (MOM-113). Layer 1's recap is what the server built from the engine's facts and the person's own record;
// on a review that is due, layer 2's one-line look back (only when they tap for it), layer 3's one question and the finish
// follow it (components/review/ReviewSitting.tsx). It decides nothing itself: no review appears before the person has set the
// day their week starts and the day they plan it in, and nothing is guessed.
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
              <p className="eyebrow">{weekLabel(facts.last.window, facts.today)}</p>
              <p className="home-note">You finished it {finishedWhen(facts.last.finishedOn, facts.today)}.</p>
              <RecapBody recap={facts.last.recap} tone={facts.tone} today={facts.today} />
            </section>
          )}
          <ChangesSince changes={facts.changes} today={facts.today} />
        </>
      );
    case 'reviewed':
      return (
        <>
          <section aria-label="This week's review">
            <p className="eyebrow">{weekLabel(facts.review.window, facts.today)}</p>
            <p className="home-notice">You finished this review {finishedWhen(facts.review.finishedOn, facts.today)}. It stays as it was said.</p>
            {facts.review.recap.closedEarly && <p className="home-note">{closedEarlyReviewedLine(facts.review.window)}</p>}
            <RecapBody recap={facts.review.recap} tone={facts.tone} today={facts.today} />
          </section>
          <ChangesSince changes={facts.changes} today={facts.today} />
          <PlanNext mode={facts.planning} />
        </>
      );
    case 'ready': {
      const titles = new Map(facts.recap.goals.flatMap((g) => g.targets.map((t) => [t.id, t.title] as const)));
      const adjustment =
        facts.adjustment === null
          ? null
          : adjustmentView(facts.adjustment, { target: (id) => titles.get(id) ?? null, item: () => null });
      // A line needs something to look back on: a recap with no target in it has nothing to say.
      const offerLine = facts.offerReflection && titles.size > 0;
      return (
        <>
          <section aria-label="This week's recap">
            <p className="eyebrow">{weekLabel(facts.window, facts.today)}</p>
            {facts.recap.closedEarly && <p className="home-notice">{closedEarlyLine(facts.window.end)}</p>}
            <RecapBody recap={facts.recap} tone={facts.tone} today={facts.today} />
          </section>
          <ChangesSince changes={facts.changes} today={facts.today} />
          <ReviewSitting offerLine={offerLine} adjustment={adjustment} edit={facts.edit} />
        </>
      );
    }
  }
}
