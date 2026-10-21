'use client';

import { useState } from 'react';

interface NavSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

// Placeholder items until goal channels are wired to @/lib/services/goals (MOM-11).
const NAV_ITEMS = ['Today', 'Career Pivot', 'Health', 'Finances'] as const;

export function NavSidebar({ className = '', onNavigate }: NavSidebarProps) {
  const [selected, setSelected] = useState<string>(NAV_ITEMS[0]);

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
    </aside>
  );
}
