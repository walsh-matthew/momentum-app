'use client';

import { Check, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChannelHint } from '@/types/channelViews';
import type { RebalanceProposalView } from '@/types/rebalance';

interface RebalanceNudgeProps {
  // The selected channel (ALL_CHANNELS or a goal id). Dismissing hides the nudge for this channel only.
  channelId: string;
  // The existing rebalance view for the selected channel (the same one the side card and the drawer show).
  view: RebalanceProposalView | null;
  // Set when there is no proposal on purpose: several goals are active and none is chosen.
  hint?: ChannelHint | null;
  // Opens the rebalance drawer. This is the only action: nothing is applied from here, and the drawer is where
  // the user selects moves and presses Apply (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1).
  onReview: () => void;
}

const STORAGE_KEY = 'momentum.nudge.dismissed';

function readDismissed(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(ids: string[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be blocked (private windows); the nudge is then dismissed until the page reloads.
  }
}

// The Momentum AI nudge: a bottom sheet below 1200px and a card in the right column from 1200px. It shows the
// proposal summary and a Review action, or, with several goals and no channel chosen, says to choose one (as the
// side card does). Dismissing it is per browser session and changes no data. It renders nothing when there is
// nothing to suggest.
//
// It starts hidden and decides after mounting, so the server HTML and the first browser render agree (the
// dismissed list lives in sessionStorage, which the server cannot read).
export function RebalanceNudge({ channelId, view, hint = null, onReview }: RebalanceNudgeProps) {
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  const titleId = useId();

  useEffect(() => setDismissed(readDismissed()), []);

  const moves = view?.proposal.moves.length ?? 0;
  const warnings = view?.proposal.warnings.length ?? 0;
  const hasProposal = view !== null && (moves > 0 || warnings > 0);
  const chooseChannel = view === null && hint === 'choose_channel';

  if (dismissed === null || dismissed.includes(channelId) || (!hasProposal && !chooseChannel)) return null;

  function dismiss() {
    const next = [...(dismissed ?? []), channelId];
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <section aria-labelledby={titleId} className="adaptive-sheet">
      <div className="sheet-handle" aria-hidden="true" />
      <div className="flex items-start gap-3">
        <span className="ai-icon" aria-hidden="true">
          <Sparkles className="size-[17px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="ai-label">MOMENTUM AI</span>
            <span className="ai-new">NUDGE</span>
          </div>
          <h2 id={titleId} className="mt-2 text-[15px] font-semibold leading-[1.35] tracking-[-0.03em]">
            {hasProposal ? 'A little room to rebalance?' : 'One goal at a time'}
          </h2>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">
            {hasProposal && view
              ? view.proposal.summary
              : 'Rebalancing is worked out for one goal at a time. Choose a goal to see what could move.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss suggestion" className="-mr-2 -mt-2 text-muted">
          <X aria-hidden="true" />
        </Button>
      </div>
      {hasProposal && (
        <div className="mt-4">
          <Button onClick={onReview} className="w-full">
            <Check aria-hidden="true" />
            Review
          </Button>
          <p className="mt-3 text-center text-xs text-muted">
            Nothing changes until you choose moves and apply them. If you dismiss this, it stays away for this
            browser session.
          </p>
        </div>
      )}
    </section>
  );
}
