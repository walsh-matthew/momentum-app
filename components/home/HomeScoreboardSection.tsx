import type { HomeScoreboard } from '@/types/home';
import type { HomePlanView } from '@/types/plan';
import { GoalScoreboardCard } from './GoalScoreboardCard';
import { HomeHeroCard } from './HomeHeroCard';
import { YourPlanCard } from './YourPlanCard';

interface HomeScoreboardSectionProps {
  // null means the scoreboard could not be read (an error or a throw), which is not the same as having no goals.
  home: HomeScoreboard | null;
  // The person's own plan for their days (MOM-112 block 2), shown after the hero. undefined or null shows nothing: the plan
  // is read on its own, so a failure there never touches the scoreboard.
  plan?: HomePlanView | null;
}

const ANCHOR_NAME = { time_zone: 'time zone', day_end: 'day end' } as const;

// The new home, above today's feed (MOM-112): the week's hero and each goal with its scoreboard, read from the goal
// model. The old feed below it is untouched until MOM-115 retires the old model, so for now both show. Nothing here
// reads or computes anything: it lays out what the server built from the engine's output.
export function HomeScoreboardSection({ home, plan }: HomeScoreboardSectionProps) {
  if (home === null) {
    return (
      <p role="status" className="home-notice">
        Could not load your scoreboard. The rest of your page is below.
      </p>
    );
  }
  if (home.state === 'no_goals') return null;
  if (home.state === 'needs_day_anchors') {
    const what = ANCHOR_NAME[home.anchor];
    return (
      <section aria-label="Your week" className="home-notice">
        <p className="eyebrow">Your week</p>
        <p className="mt-1.5 text-sm">
          {home.reason === 'not_set'
            ? `Set your ${what} to see your week. Nothing is graded until you do, and nothing is guessed.`
            : `The ${what} you saved is not one Momentum can use. Set it again to see your week.`}
        </p>
      </section>
    );
  }
  return (
    <section aria-label="Your week" className="home-scoreboard">
      {home.hero && <HomeHeroCard hero={home.hero} celebration={home.celebration} today={home.today} />}
      <YourPlanCard plan={plan} />
      {home.goals.map((goal) => (
        <GoalScoreboardCard key={goal.id} goal={goal} tone={home.tone} today={home.today} />
      ))}
    </section>
  );
}
