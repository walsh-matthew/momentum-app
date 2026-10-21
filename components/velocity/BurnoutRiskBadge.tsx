import type { BurnoutRisk } from '@/lib/utils/velocity';

interface BurnoutRiskBadgeProps {
  risk: BurnoutRisk;
}

// Text carries the meaning; color only reinforces it.
const RISK_BADGES: Record<BurnoutRisk, { label: string; className: string }> = {
  low: {
    label: 'Burnout risk: low',
    className: 'border-border text-muted',
  },
  rising: {
    label: 'Burnout risk: rising',
    className: 'border-amber-600 bg-amber-500/10 text-amber-800 dark:border-amber-400 dark:text-amber-300',
  },
  high: {
    label: 'Burnout risk: high',
    className: 'border-red-600 bg-red-500/10 text-red-800 dark:border-red-400 dark:text-red-300',
  },
};

export function BurnoutRiskBadge({ risk }: BurnoutRiskBadgeProps) {
  const badge = RISK_BADGES[risk];
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}
