import { TargetRow } from '@/components/home/TargetRow';
import { formatDay } from '@/components/home/wording';
import type { Tone } from '@/types/database.types';
import type { RecapChange, StoredRecap } from '@/types/review';
import { changeLine, crossingLine } from './wording';

interface RecapBodyProps {
  recap: StoredRecap;
  tone: Tone;
}

// Layer 1 of the weekly review (docs/DOMAIN_MODEL.md §3.1): each goal with its targets as the week ended, what crossed in
// it, and the priorities the person named in their own words with no score. Every number is the engine's, laid out by
// the same card home uses; the recap asks for nothing, so a celebration is never next to a request.
export function RecapBody({ recap, tone }: RecapBodyProps) {
  return (
    <div className="home-scoreboard">
      {recap.goals.length === 0 && (
        <p className="home-notice">No target finished a week in this period, so there is nothing to recap. Nothing here is a miss.</p>
      )}
      {recap.goals.map((goal) => (
        <section key={goal.id} className="home-goal" aria-label={goal.title}>
          <header>
            <h3>{goal.title}</h3>
          </header>
          {goal.targets.map((target) => (
            <TargetRow key={target.id} card={target} tone={tone} settled>
              {target.crossings.length > 0 && (
                <ul className="review-crossings">
                  {target.crossings.map((c) => (
                    <li key={`${c.kind}-${c.on}`}>{crossingLine(c)}</li>
                  ))}
                </ul>
              )}
            </TargetRow>
          ))}
        </section>
      ))}
      {recap.priorities.length > 0 && (
        <section className="home-goal" aria-label="Priorities you named">
          <header>
            <h3>Priorities you named</h3>
          </header>
          <ul className="review-priorities">
            {recap.priorities.map((p) => (
              <li key={p.id}>{p.label}</li>
            ))}
          </ul>
          <p className="home-note">In your own words. They have no score.</p>
        </section>
      )}
    </div>
  );
}

interface ChangesSinceProps {
  changes: RecapChange[];
}

// A later entry changed a week whose recap is already stored (RAID R-26): said in plain words beside the record, which is
// never rewritten. Nothing is shown when nothing changed.
export function ChangesSince({ changes }: ChangesSinceProps) {
  if (changes.length === 0) return null;
  const weeks = [...new Set(changes.map((c) => c.weekStart))].sort().reverse();
  return (
    <section className="home-notice review-changes">
      <h2 className="section-title">Since this recap</h2>
      {weeks.map((weekStart) => (
        <div key={weekStart}>
          <p className="eyebrow">Week of {formatDay(weekStart)}</p>
          <ul>
            {changes
              .filter((c) => c.weekStart === weekStart)
              .map((c) => (
                <li key={c.targetId}>{changeLine(c)}</li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
