'use client';

import { LayoutDashboard, Target } from 'lucide-react';
import type { MouseEvent } from 'react';
import { ALL_CHANNELS, type ChannelSummary } from '@/types/channelViews';
import type { GoalProgress } from '@/types/progress';

interface GoalCardsProps {
  channels: ChannelSummary[];
  // ALL_CHANNELS or the id of one of `channels`.
  selected: string;
  // The address that selects a channel (?channel=<goal id>, or none for all channels), so each card is a real
  // link that works without script, opens in a new tab and can be shared.
  hrefFor: (channelId: string) => string;
  // Called on a plain click; the page then changes its address without a request (see AppShell).
  onSelect: (channelId: string) => void;
  // Each active goal's tasks done and total. A goal with no entry shows no count.
  progress?: GoalProgress[];
}

// The goal picker for screens without the sidebar (below 1200px): one card per goal in the scrolling feed, each
// with how far along it is. It leaves the page when there are no goals, because the empty state and the goal
// builder already say what to do.
export function GoalCards({ channels, selected, hrefFor, onSelect, progress = [] }: GoalCardsProps) {
  if (channels.length === 0) return null;
  const byGoal = new Map(progress.map((p) => [p.goalId, p]));
  const done = progress.reduce((n, p) => n + p.done, 0);
  const total = progress.reduce((n, p) => n + p.total, 0);

  function click(event: MouseEvent<HTMLAnchorElement>, id: string) {
    // Let the browser handle a new-tab or new-window click; only a plain click is handled here.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onSelect(id);
  }

  const cards = [
    { id: ALL_CHANNELS, title: 'All channels', done, total, hasProgress: progress.length > 0, percent: total === 0 ? 0 : Math.floor((done * 100) / total) },
    ...channels.map((c) => {
      const p = byGoal.get(c.id);
      return { id: c.id, title: c.title, done: p?.done ?? 0, total: p?.total ?? 0, hasProgress: p !== undefined, percent: p?.percent ?? 0 };
    }),
  ];

  return (
    <section id="goal-cards" aria-labelledby="goal-cards-heading" className="mobile-goal-channels mt-8">
      <h2 id="goal-cards-heading" className="section-title mb-3">
        Your goals
      </h2>
      <ul className="grid grid-cols-2 gap-3">
        {cards.map((card, index) => {
          const active = selected === card.id;
          const Icon = card.id === ALL_CHANNELS ? LayoutDashboard : Target;
          const tone = index % 2 === 1 ? 'career' : 'fitness';
          return (
            <li key={card.id}>
              <a
                href={hrefFor(card.id)}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => click(e, card.id)}
                className="goal-card"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`channel-icon ${tone}`} aria-hidden="true">
                    <Icon className="size-[15px]" />
                  </span>
                  {card.hasProgress && (
                    <span className="goal-count">
                      <span aria-hidden="true">
                        {card.done}
                        <span>/{card.total}</span>
                      </span>
                      <span className="sr-only">
                        {card.done} of {card.total} tasks done
                      </span>
                    </span>
                  )}
                </span>
                <span className="mt-3 block truncate text-[13px] font-semibold tracking-[-0.02em]">{card.title}</span>
                {card.hasProgress && (
                  <span
                    className="channel-track mt-3 block"
                    role="progressbar"
                    aria-label={`${card.title} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={card.percent}
                  >
                    <span className={tone} style={{ width: `${card.percent}%` }} />
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
