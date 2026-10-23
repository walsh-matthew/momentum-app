'use client';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { ALL_CHANNELS, type ChannelSummary } from '@/types/channelViews';

interface NavSidebarProps {
  className?: string;
  // The user's active goal channels, in the order the goals service lists them.
  channels: ChannelSummary[];
  // ALL_CHANNELS or the id of one of `channels`.
  selected: string;
  onSelect: (channelId: string) => void;
  onAdjustPace: () => void;
  // Opens the goal wizard, which AppShell renders once.
  onNewGoal: () => void;
}

export function NavSidebar({ className = '', channels, selected, onSelect, onAdjustPace, onNewGoal }: NavSidebarProps) {
  const items: ChannelSummary[] = [{ id: ALL_CHANNELS, title: 'All channels' }, ...channels];

  return (
    <aside
      aria-label="Goal channels"
      className={`min-h-0 flex-1 flex-col gap-1 overflow-y-auto border-border bg-panel p-4 lg:flex-none lg:border-r ${className}`}
    >
      <h2 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Goal Channels
      </h2>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={selected === item.id ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
          className={`min-h-11 rounded-md px-3 text-left text-sm ${
            selected === item.id ? 'bg-accent/10 font-medium text-accent' : 'hover:bg-foreground/5'
          }`}
        >
          {item.title}
        </button>
      ))}
      <button
        type="button"
        onClick={onNewGoal}
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
      <SignOutButton className="mt-auto pt-2" />
    </aside>
  );
}
