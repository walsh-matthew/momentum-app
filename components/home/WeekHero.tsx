import type { CelebrationLevel } from '@/types/database.types';
import type { HomeHero } from '@/types/home';
import { celebrationFor, dayName, headlineText, weekdayLetter } from './wording';

type WeekHeroView = Extract<HomeHero, { kind: 'week' }>;

interface WeekHeroProps {
  hero: WeekHeroView;
  // The person's celebration setting (or the code's starting value): how loudly the headline is celebrated.
  celebration: CelebrationLevel;
}

const RADIUS = 53;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// "Your momentum", rebuilt on the goal model (MOM-112): a ring of floors met this week, the week's biggest crossing
// celebrated alone, and the entries on each day of the person's own week. Every number is the engine's. With nothing
// logged yet it is a calm empty state, never 0%. A headline that is a crossing has no second line: the way to the next
// level lives on that target's own card (§4.2 principle 8).
export function WeekHero({ hero, celebration }: WeekHeroProps) {
  const { floorsMet, floorsInPlay, headline, days, empty } = hero;
  const style = headline ? celebrationFor(celebration, headline.kind) : 'quiet';
  const showRing = floorsInPlay > 0;
  const arc = empty || !showRing ? 0 : (floorsMet / floorsInPlay) * CIRCUMFERENCE;
  const max = Math.max(1, ...days.map((d) => d.count));
  const title = empty ? 'A fresh week' : headline ? headlineText(headline) : 'This week so far';
  const ringLabel = empty
    ? `${floorsInPlay} ${floorsInPlay === 1 ? 'floor' : 'floors'} to reach this week`
    : `${floorsMet} of ${floorsInPlay} ${floorsInPlay === 1 ? 'floor' : 'floors'} met this week`;

  return (
    <section aria-label="This week" className="home-hero" data-celebration={style}>
      {showRing && (
        <div className="home-ring" role="img" aria-label={ringLabel}>
          <svg viewBox="0 0 116 116" aria-hidden="true">
            <circle className="home-ring-track" cx="58" cy="58" r={RADIUS} strokeDasharray={empty ? '3 7' : undefined} />
            {arc > 0 && <circle className="home-ring-progress" cx="58" cy="58" r={RADIUS} strokeDasharray={`${arc.toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`} />}
          </svg>
          <div className="home-ring-centre" aria-hidden="true">
            {empty ? (
              <>
                <b>{floorsInPlay}</b>
                <small>{floorsInPlay === 1 ? 'floor' : 'floors'} this week</small>
              </>
            ) : (
              <>
                <b>
                  {floorsMet} of {floorsInPlay}
                </b>
                <small>{floorsInPlay === 1 ? 'floor' : 'floors'} met</small>
              </>
            )}
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="eyebrow">This week</p>
        <h2 className="home-hero-title" data-celebration={style}>
          {title}
        </h2>
        {empty && <p className="home-hero-sub">Nothing logged yet. Your first entry shows up here.</p>}
        <div className="home-bars" role="img" aria-label={`Entries per day: ${days.map((d) => `${dayName(d.day)} ${d.count}`).join(', ')}`}>
          {days.map((d) => (
            <div key={d.day} className="home-bar" data-today={d.isToday ? 'true' : undefined} data-empty={d.isFuture || d.count === 0 ? 'true' : undefined} aria-hidden="true">
              <span className="home-bar-value">{d.isFuture || empty ? '' : d.count}</span>
              <i style={{ height: d.isFuture || d.count === 0 ? 3 : 8 + Math.round((d.count / max) * 30) }} />
              <span className="home-bar-day">{weekdayLetter(d.day)}</span>
            </div>
          ))}
        </div>
        <p className="home-bars-caption">Entries per day</p>
      </div>
    </section>
  );
}
