'use client';

import { LayoutDashboard, Target } from 'lucide-react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';
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
      <div className="flex items-center gap-2.5 px-2 pb-4" aria-hidden="true">
        <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground">
          <span className="momentum-mark">m</span>
        </span>
        <span className="text-[18px] font-semibold tracking-[-0.055em]">momentum</span>
      </div>
      <h2 className="eyebrow px-2 pb-2">Goal Channels</h2>
      {items.map((item) => {
        const active = selected === item.id;
        const Icon = item.id === ALL_CHANNELS ? LayoutDashboard : Target;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-left text-sm ${
              active
                ? 'border-accent/25 bg-accent/10 font-semibold text-foreground'
                : 'border-transparent text-muted hover:bg-foreground/[0.05] hover:text-foreground'
            }`}
          >
            {/* The filled icon box, the border and the weight mark the selected channel; aria-current says it. */}
            <span
              className={`channel-icon shrink-0 ${active ? 'bg-accent text-primary-foreground' : 'bg-foreground/[0.06]'}`}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 truncate">{item.title}</span>
          </button>
        );
      })}
      <Button variant="outline" onClick={onNewGoal} className="mt-3 justify-start border-dashed">
        + New Goal Wizard
      </Button>
      {/* docs/NINETY_DAY_PLAN_CONTEXT.md §9: opens the rebalance drawer, which uses the carry-over language of §5 rule 1. */}
      <Button variant="outline" onClick={onAdjustPace} className="justify-start border-dashed">
        Adjust Weekly Pace
      </Button>
      <SignOutButton className="mt-auto pt-2" />
    </aside>
  );
}
