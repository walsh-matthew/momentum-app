'use client';

import { useState } from 'react';
import { GoalBuilderWizard } from '@/components/goals/GoalBuilderWizard';

interface NavSidebarProps {
  className?: string;
  onNavigate?: () => void;
  onAdjustPace: () => void;
}

// Placeholder items until goal channels are wired to @/lib/services/goals (MOM-11).
const NAV_ITEMS = ['Today', 'Career Pivot', 'Health', 'Finances'] as const;

export function NavSidebar({ className = '', onNavigate, onAdjustPace }: NavSidebarProps) {
  const [selected, setSelected] = useState<string>(NAV_ITEMS[0]);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <aside
      aria-label="Goal channels"
      className={`min-h-0 flex-1 flex-col gap-1 overflow-y-auto border-border bg-panel p-4 lg:flex-none lg:border-r ${className}`}
    >
      <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Goal Channels
      </h2>
      {NAV_ITEMS.map((item) => (
        <button
          key={item}
          type="button"
          aria-current={selected === item ? 'page' : undefined}
          onClick={() => {
            setSelected(item);
            onNavigate?.();
          }}
          className={`min-h-11 rounded-md px-3 text-left text-sm ${
            selected === item ? 'bg-accent/10 font-medium text-accent' : 'hover:bg-foreground/5'
          }`}
        >
          {item}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setWizardOpen(true)}
        className="mt-2 min-h-11 rounded-md border border-dashed border-border px-3 text-left text-sm text-muted hover:bg-foreground/5"
      >
        + New Goal Wizard
      </button>
      {/* docs/NINETY_DAY_PLAN_CONTEXT.md §9: opens the rebalance drawer, which uses the carry-over language of §5 rule 1. */}
      <button
        type="button"
        onClick={onAdjustPace}
        className="min-h-11 rounded-md border border-dashed border-border px-3 text-left text-sm text-muted hover:bg-foreground/5"
      >
        Adjust Weekly Pace
      </button>
      <GoalBuilderWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </aside>
  );
}
