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

export function VelocityHero({ velocity }: VelocityHeroProps) {
  const { score, trend, risk, pressureStreak, weeks, currentWeek } = velocity;
  const latest = weeks[0];

  if (score === null || risk === null || !latest) {
    return (
      <section aria-label="Velocity" className="rounded-lg border border-border bg-panel p-4 lg:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Velocity</p>
        <p className="mt-2 text-sm text-muted">
          Your velocity appears once this week has tasks due. It is based on the tasks you tick off.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Velocity" className="rounded-lg border border-border bg-panel p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Velocity · Week {latest.week}
          {latest.week !== currentWeek && ` (week ${currentWeek} not planned yet)`}
        </p>
        <BurnoutRiskBadge risk={risk} />
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-4xl font-semibold tabular-nums">
          {score}
          <span className="text-lg text-muted">/100</span>
        </p>
        {trend && <p className="text-sm text-muted">{TREND_LABELS[trend]}</p>}
      </div>

      <p className="mt-2 text-sm text-muted">
        {latest.done} of {latest.planned} tasks ticked
        {latest.carriedIn > 0 && ` · ${latest.carriedIn} carried over (${latest.carriedInOpen} still open)`}
      </p>
      <p className={`mt-1 text-sm ${risk === 'low' ? 'text-muted' : 'text-foreground'}`}>
        {riskMessage(risk, pressureStreak)}
      </p>
    </section>
  );
}
