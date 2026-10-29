import type { Tone } from '@/types/database.types';
import type { GoalCardView } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';
import { MilestoneRow } from './MilestoneRow';
import { TargetRow } from './TargetRow';

interface GoalScoreboardCardProps {
  goal: GoalCardView;
  tone: Tone;
  // The person's today, for the dates on the card (MOM-111 finding 7).
  today?: LocalDate | null;
}

const SHAPE_LABEL = { ongoing: 'Ongoing', finite: 'Finite', project: 'Project' } as const;

// One goal with its targets and milestones, each with its scoreboard (docs/DOMAIN_MODEL.md §1.3, §1.4). The goal's and
// the targets' titles are the person's own words.
export function GoalScoreboardCard({ goal, tone, today = null }: GoalScoreboardCardProps) {
  const empty = goal.targets.length === 0 && goal.milestones.length === 0;
  return (
    <section className="home-goal" aria-label={goal.title}>
      <header>
        <h3>{goal.title}</h3>
        <span className="chip">{SHAPE_LABEL[goal.shape]}</span>
      </header>
      {goal.targets.map((card) => (
        <TargetRow key={card.id} card={card} tone={tone} today={today} />
      ))}
      {goal.milestones.map((m) => (
        <MilestoneRow key={m.id} milestone={m} today={today} />
      ))}
      {empty && <p className="home-note">Nothing to measure on this goal yet.</p>}
    </section>
  );
}
