import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIMELINE_WARNING_LABELS } from '@/lib/tasks/labels';
import type { ChannelHint } from '@/types/channelViews';
import type { RebalanceProposalView } from '@/types/rebalance';

interface RebalanceSideCardProps {
  // The proposal for the selected goal channel (MOM-87).
  view: RebalanceProposalView | null;
  // Set when there is no proposal on purpose: several goals are active and none is selected.
  hint?: ChannelHint | null;
  onOpen: () => void;
}

// The at-a-glance version of the proposal. It only opens the drawer; applying happens there, on the
// user's say-so (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1).
export function RebalanceSideCard({ view, hint = null, onOpen }: RebalanceSideCardProps) {
  const moves = view?.proposal.moves.length ?? 0;
  const warnings = view?.proposal.warnings ?? [];
  const needsAttention = moves > 0 || warnings.length > 0;

  return (
    <section aria-labelledby="rebalance-card-title" className="score-card flex-col items-stretch gap-0 p-4 text-foreground">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <h3 id="rebalance-card-title" className="eyebrow text-accent">
          Rebalance
        </h3>
      </div>

      {view === null ? (
        <p className="mt-2 text-sm text-muted">
          {hint === 'choose_channel'
            ? "Rebalancing is worked out for one goal at a time. Choose a channel in the sidebar to see what could move."
            : 'Rebalancing appears once you have a plan with tasks.'}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">{view.proposal.summary}</p>

          {needsAttention && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {moves > 0 && <li className="chip chip-accent">{moves} to carry over</li>}
              {warnings.map((w, i) => (
                <li key={`${w.kind}-${i}`} className={`chip ${w.kind === 'cannot_hold' ? 'chip-danger' : 'chip-warn'}`}>
                  {TIMELINE_WARNING_LABELS[w.kind]}
                </li>
              ))}
            </ul>
          )}

          {needsAttention && (
            <Button onClick={onOpen} className="mt-4 w-full">
              Review proposal
            </Button>
          )}
        </>
      )}
    </section>
  );
}
