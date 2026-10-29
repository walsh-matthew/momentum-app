import type { CelebrationLevel } from '@/types/database.types';
import type { HomeHero } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';
import { MilestoneRow } from './MilestoneRow';
import { WeekHero } from './WeekHero';

interface HomeHeroCardProps {
  hero: HomeHero;
  celebration: CelebrationLevel;
  // The person's today, for the due dates in the deadlines list (MOM-111 finding 7).
  today?: LocalDate | null;
}

// The card at the top of home. Which one depends on what the person has set up, never on a guess:
// - a week, when they have weekly or day-slot targets and have set the day their week starts;
// - a prompt for the week start, only when they have a weekly or day-slot target and have not set it;
// - their milestones, when they have no weekly or day-slot target at all. Such a person is never asked for a week start
//   (docs/DOMAIN_MODEL.md §2.2 step 10).
export function HomeHeroCard({ hero, celebration, today = null }: HomeHeroCardProps) {
  if (hero.kind === 'week') return <WeekHero hero={hero} celebration={celebration} />;

  if (hero.kind === 'needs_week_start') {
    return (
      <section aria-label="This week" className="home-hero">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">This week</p>
          <h2 className="home-hero-title" data-celebration="quiet">
            Set the day your week starts
          </h2>
          <p className="home-hero-sub">Floors met and entries per day show here once it is set.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your deadlines" className="home-hero home-hero-list">
      <div className="min-w-0 flex-1">
        <p className="eyebrow">Your deadlines</p>
        {hero.items.map((m) => (
          <MilestoneRow key={m.id} milestone={m} showSteps={false} showGoal today={today} />
        ))}
      </div>
    </section>
  );
}
