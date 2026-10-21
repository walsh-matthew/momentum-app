import { TIMELINE_WARNING_LABELS } from '@/lib/tasks/labels';
import type { RebalanceProposalView } from '@/types/rebalance';

interface RebalanceSideCardProps {
  view: RebalanceProposalView | null;
  onOpen: () => void;
}

// The at-a-glance version of the proposal. It only opens the drawer; applying happens there, on the
// user's say-so (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1).
export function RebalanceSideCard({ view, onOpen }: RebalanceSideCardProps) {
  const moves = view?.proposal.moves.length ?? 0;
  const warnings = view?.proposal.warnings ?? [];
  const needsAttention = moves > 0 || warnings.length > 0;

  return (
    <section
      aria-labelledby="rebalance-card-title"
      className="rounded-lg border border-border bg-background p-4 text-foreground"
    >
      <h3 id="rebalance-card-title" className="text-xs font-medium uppercase tracking-wide text-muted">
        Rebalance
      </h3>

      {view === null ? (
        <p className="mt-2 text-sm text-muted">Rebalancing appears once you have a plan with tasks.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">{view.proposal.summary}</p>

          {needsAttention && (
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {moves > 0 && (
                <li className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
                  {moves} to carry over
                </li>
              )}
              {warnings.map((w, i) => (
                <li
                  key={`${w.kind}-${i}`}
                  className={`rounded-full border px-2.5 py-1 font-medium ${
                    w.kind === 'cannot_hold'
                      ? 'border-red-600/40 text-red-700 dark:text-red-300'
                      : 'border-amber-600/40 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {TIMELINE_WARNING_LABELS[w.kind]}
                </li>
              ))}
            </ul>
          )}

          {needsAttention && (
            <button
              type="button"
              onClick={onOpen}
              className="mt-4 min-h-11 w-full rounded-md bg-accent px-4 text-sm font-medium text-background hover:opacity-90"
            >
              Review proposal
            </button>
          )}
        </>
      )}
    </section>
  );
}
