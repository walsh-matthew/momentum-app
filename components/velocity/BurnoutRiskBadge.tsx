import type { BurnoutRisk } from '@/lib/utils/velocity';

interface BurnoutRiskBadgeProps {
  risk: BurnoutRisk;
}

// Text carries the meaning; color only reinforces it. The dot is a circle for low, a square for rising and a
// triangle for high, so the level also reads without color (see .burnout-dot in app/globals.css).
const RISK_LABELS: Record<BurnoutRisk, string> = {
  low: 'Burnout risk: low',
  rising: 'Burnout risk: rising',
  high: 'Burnout risk: high',
};

export function BurnoutRiskBadge({ risk }: BurnoutRiskBadgeProps) {
  return (
    <span className="burnout-badge" data-risk={risk}>
      <span className="burnout-dot" aria-hidden="true" />
      {RISK_LABELS[risk]}
    </span>
  );
}
