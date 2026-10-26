'use client';

import { LayoutDashboard, Target } from 'lucide-react';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { Button } from '@/components/ui/button';
import type { BurnoutRisk } from '@/lib/utils/velocity';
import { ALL_CHANNELS, type ChannelSummary } from '@/types/channelViews';
import type { GoalProgress } from '@/types/progress';

interface NavSidebarProps {
  // The user's active goal channels, in the order the goals service lists them.
  channels: ChannelSummary[];
  // ALL_CHANNELS or the id of one of `channels`.
  selected: string;
  onSelect: (channelId: string) => void;
  onAdjustPace: () => void;
  // Opens the goal wizard, which AppShell renders once.
  onNewGoal: () => void;
  // Each active goal's tasks done and total (summarizeActiveGoalProgress). A goal with no entry shows no count.
  progress?: GoalProgress[];
  burnoutRisk?: BurnoutRisk | null;
  // True while the plan could not be loaded (FeedState 'load_failed'): both actions need data that was not
  // read, so they stay visible but disabled.
  actionsDisabled?: boolean;
  // The signed-in user's email, for the account line at the foot of the sidebar; null when there is no session.
  userEmail?: string | null;
}

// The desktop sidebar of the home page: the workspace navigation plus the goal channels. Choosing a channel is
// a button, not a link, because the page only changes its address (?channel=<goal id>) and shows the view it
// already has. Each button's text is the goal's name only; the count and the bar sit beside it, so its
// accessible name stays the name.
export function NavSidebar({ channels, selected, onSelect, onAdjustPace, onNewGoal, progress = [], burnoutRisk = null, actionsDisabled = false, userEmail = null }: NavSidebarProps) {
  const byGoal = new Map(progress.map((p) => [p.goalId, p]));

  return (
    <WorkspaceSidebar ariaLabel="Goal channels" active="dashboard" burnoutRisk={burnoutRisk} showPace userEmail={userEmail}>
      <section id="active-goals" className="desktop-channel-list" aria-labelledby="active-goals-heading">
        <div className="sidebar-section-heading">
          <h2 id="active-goals-heading" className="sidebar-label">
            Goal Channels
          </h2>
          <span className="sidebar-label" aria-hidden="true">
            {String(channels.length).padStart(2, '0')}
          </span>
        </div>

        <button
          type="button"
          aria-current={selected === ALL_CHANNELS ? 'page' : undefined}
          onClick={() => onSelect(ALL_CHANNELS)}
          className="desktop-nav-link w-full text-left"
        >
          <LayoutDashboard aria-hidden="true" />
          All channels
        </button>

        {channels.map((channel, index) => {
          const active = selected === channel.id;
          const p = byGoal.get(channel.id);
          return (
            <div key={channel.id} className="sidebar-goal" data-active={active}>
              <div className="sidebar-goal-top">
                <span className={`channel-icon ${index % 2 === 0 ? 'career' : 'fitness'}`} aria-hidden="true">
                  <Target className="size-3.5" />
                </span>
                {p && (
                  <span className="sidebar-goal-count">
                    <span aria-hidden="true">
                      {p.done}/{p.total}
                    </span>
                    <span className="sr-only">
                      {p.done} of {p.total} tasks done
                    </span>
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSelect(channel.id)}
                className="sidebar-goal-name"
              >
                {channel.title}
              </button>
              {p && (
                <div
                  className="channel-track"
                  role="progressbar"
                  aria-label={`${channel.title} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={p.percent}
                >
                  <span className={index % 2 === 0 ? 'career' : 'fitness'} style={{ width: `${p.percent}%` }} />
                </div>
              )}
            </div>
          );
        })}

        <Button variant="outline" onClick={onNewGoal} disabled={actionsDisabled} className="mt-1 justify-start border-dashed">
          + New Goal Wizard
        </Button>
        {/* docs/NINETY_DAY_PLAN_CONTEXT.md §9: opens the rebalance drawer, which uses the carry-over language of §5 rule 1. */}
        <Button variant="outline" onClick={onAdjustPace} disabled={actionsDisabled} className="justify-start border-dashed">
          Adjust Weekly Pace
        </Button>
      </section>
    </WorkspaceSidebar>
  );
}
