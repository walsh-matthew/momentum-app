import { Sparkles } from 'lucide-react';
import { BurnoutRiskBadge } from './BurnoutRiskBadge';
import type { BurnoutRisk, VelocitySnapshot, VelocityTrend } from '@/lib/utils/velocity';

interface VelocityHeroProps {
  velocity: VelocitySnapshot;
}

const TREND_LABELS: Record<VelocityTrend, string> = {
  up: '▲ Up on last week',
  down: '▼ Down on last week',
  flat: '■ Steady vs last week',
};

// Carry-over language from docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1: unfinished work moves, it is
// never cut.
function riskMessage(risk: BurnoutRisk, streak: number): string {
  if (risk === 'high') {
    return `Carry-over has built up for ${streak} weeks in a row. Nothing is cut; consider a lighter week or moving dates later.`;
  }
  if (risk === 'rising') {
    return `Carry-over has built up for ${streak} weeks in a row. Unfinished work moves forward, so watch the load.`;
  }
  return 'Carry-over is under control.';
}

// The ring is decoration (aria-hidden); the score is real text in its middle, which is its text alternative.
const RING_RADIUS = 51;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface ScoreRingProps {
  score: number;
}

function ScoreRing({ score }: ScoreRingProps) {
  const shown = Math.min(100, Math.max(0, score));
  return (
    <div className="score-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="score-ring-track" cx="60" cy="60" r={RING_RADIUS} />
        <circle
          className="score-ring-progress"
          cx="60"
          cy="60"
          r={RING_RADIUS}
          style={{ strokeDasharray: RING_LENGTH, strokeDashoffset: RING_LENGTH * (1 - shown / 100) }}
        />
      </svg>
      <p className="absolute inset-0 flex items-center justify-center text-[32px] font-semibold leading-none tracking-[-0.06em] tabular-nums">
        {score}
        <span className="mt-2 text-[15px] tracking-normal text-muted">/100</span>
      </p>
    </div>
  );
}

export function VelocityHero({ velocity }: VelocityHeroProps) {
  const { score, trend, risk, pressureStreak, weeks, currentWeek } = velocity;
  const latest = weeks[0];

  if (score === null || risk === null || !latest) {
    return (
      <section aria-label="Velocity" className="score-card">
        <div className="relative z-10 min-w-0">
          <p className="eyebrow">Velocity</p>
          <p className="mt-2 text-sm text-muted">
            Your velocity appears once this week has tasks due. It is based on the tasks you tick off.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Velocity" className="score-card">
      <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-2 py-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="eyebrow text-accent">
            Velocity · Week {latest.week}
            {latest.week !== currentWeek && ` (week ${currentWeek} not planned yet)`}
          </p>
        </div>
        <div>
          <BurnoutRiskBadge risk={risk} />
        </div>
        {trend && <p className="text-sm font-medium">{TREND_LABELS[trend]}</p>}
        <p className="text-sm text-muted">
          {latest.done} of {latest.planned} tasks ticked
          {latest.carriedIn > 0 && ` · ${latest.carriedIn} carried over (${latest.carriedInOpen} still open)`}
        </p>
        <p className={`text-sm ${risk === 'low' ? 'text-muted' : 'text-foreground'}`}>
          {riskMessage(risk, pressureStreak)}
        </p>
      </div>
      <ScoreRing score={score} />
    </section>
  );
}
