'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { applyRebalanceProposal, askClaudeToRebalance } from '@/app/actions/tasks';
import { REBALANCE_ACTION_LABELS, TASK_TYPE_LABELS, TIMELINE_WARNING_LABELS } from '@/lib/tasks/labels';
import { describeMoveChain } from '@/lib/utils/rebalance';
import type {
  RebalanceApplyResult,
  RebalanceProposalView,
  TaskMoveChains,
  TimelineWarning,
} from '@/types/rebalance';

interface RebalanceDrawerProps {
  open: boolean;
  onClose: () => void;
  view: RebalanceProposalView | null;
  // Each task's earlier moves, from the page's single history query (no per-task fetch here).
  moveChains: TaskMoveChains;
}

interface WarningCardProps {
  warning: TimelineWarning;
  view: RebalanceProposalView;
}

// "Can't hold" is the one the user has to decide on, so it reads as the stronger of the two. Neither
// offers to cut anything: the work stays where it is (docs/NINETY_DAY_PLAN_CONTEXT.md §5 rule 1).
function WarningCard({ warning, view }: WarningCardProps) {
  const blocking = warning.kind === 'cannot_hold';
  const stuck = blocking ? warning.taskIds.map((id) => view.tasks[id]?.title).filter(Boolean) : [];
  return (
    <li
      className={`rounded-lg border p-3 text-sm ${
        blocking ? 'border-red-600/40 bg-red-600/5' : 'border-amber-600/40 bg-amber-500/10'
      }`}
    >
      <p
        className={`font-medium ${
          blocking ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
        }`}
      >
        {TIMELINE_WARNING_LABELS[warning.kind]}
      </p>
      <p className="mt-1">{warning.message}</p>
      {stuck.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-muted">
          {stuck.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

interface DrawerBodyProps {
  view: RebalanceProposalView;
  // Called with the proposal Claude wrote (or the rule-based one, with a notice, if Claude's failed).
  onModelView: (view: RebalanceProposalView) => void;
  moveChains: TaskMoveChains;
  titleId: string;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}

// Mounted only while the drawer is open, so every open starts from a clean state.
function DrawerBody({ view, onModelView, moveChains, titleId, onClose, onPendingChange }: DrawerBodyProps) {
  const { proposal } = view;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(proposal.moves.map((m) => m.taskId)));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RebalanceApplyResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [asking, startAsking] = useTransition();
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => onPendingChange(pending || asking), [pending, asking, onPendingChange]);

  // The only way a model is ever called: this click. It changes nothing in the plan; it only swaps
  // the suggestion on screen, and every change still needs the user to select it and press Apply.
  function askClaude() {
    setAskError(null);
    startAsking(async () => {
      const answer = await askClaudeToRebalance();
      if (answer.ok) onModelView(answer.data);
      else setAskError(answer.error);
    });
  }

  const titleOf = (taskId: string) => view.tasks[taskId]?.title ?? 'A task';
  const chosen = proposal.moves.filter((m) => selected.has(m.taskId));

  function toggle(taskId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  // The only thing that changes the plan, and only on the user's click. Unticked moves are simply
  // left out; the proposal still goes through the server-side schema before anything is written.
  function apply() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await applyRebalanceProposal({ ...proposal, moves: chosen });
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        setResult(outcome.data);
      } catch {
        // A thrown action (server unreachable, misconfigured) must not take the page down.
        setError('Could not apply the changes. Your plan is unchanged; try again.');
      }
    });
  }

  if (result) {
    const nothingMoved = result.moved.length === 0;
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:px-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {nothingMoved ? 'Nothing moved' : `Moved ${result.moved.length} ${result.moved.length === 1 ? 'task' : 'tasks'}`}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {nothingMoved
              ? 'Your plan is unchanged.'
              : 'Each task keeps a note of the week it came from. Nothing was deleted or marked done.'}
          </p>
          {result.skipped.length > 0 && (
            <section aria-label="Tasks that did not move" className="mt-4">
              <h3 className="text-sm font-medium">Left where they were</h3>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {result.skipped.map((s) => (
                  <li key={s.taskId} className="rounded-lg border border-border p-3">
                    <p className="font-medium">{titleOf(s.taskId)}</p>
                    <p className="text-muted">{s.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-border p-4 lg:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background"
          >
            Done
          </button>
        </footer>
      </div>
    );
  }

  const hasMoves = proposal.moves.length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 lg:px-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            Rebalance your plan
          </h2>
          <p className="mt-1 text-xs text-muted">
            {view.source === 'model'
              ? `Suggested by Claude (${view.model ?? 'model'}) · checked against your plan`
              : 'Rule-based suggestion'}
            {' · '}week {view.currentWeek} of the plan
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          aria-label="Close without changing anything"
          className="-mr-2 -mt-1 flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl text-muted hover:bg-foreground/5 disabled:opacity-50"
        >
          <span aria-hidden>×</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:px-6">
        <p className="text-sm">{proposal.summary}</p>

        {view.notice && (
          <p role="status" className="mt-3 rounded-md border border-border bg-foreground/5 p-3 text-xs">
            {view.notice}
          </p>
        )}

        <div className="mt-3">
          <button
            type="button"
            disabled={pending || asking}
            onClick={askClaude}
            className="min-h-11 rounded-md border border-border px-3 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
          >
            {asking ? 'Asking Claude…' : view.source === 'model' ? 'Ask Claude again' : 'Ask Claude to review'}
          </button>
          <p className="mt-1 text-xs text-muted">
            Claude sees task ids, weeks and types, never your task titles. You approve every change.
          </p>
          {askError && (
            <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {askError}
            </p>
          )}
        </div>

        {proposal.warnings.length > 0 && (
          <ul aria-label="Timeline warnings" className="mt-4 flex flex-col gap-2">
            {proposal.warnings.map((w, i) => (
              <WarningCard key={`${w.kind}-${i}`} warning={w} view={view} />
            ))}
          </ul>
        )}

        {hasMoves && (
          <section aria-label="Proposed task shifts" className="mt-5">
            <h3 className="text-sm font-medium">
              Proposed shifts ({chosen.length} of {proposal.moves.length} selected)
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {proposal.moves.map((move) => {
                const task = view.tasks[move.taskId];
                const isOn = selected.has(move.taskId);
                const earlier = moveChains[move.taskId] ?? [];
                return (
                  <li key={move.taskId}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        isOn ? 'border-accent/60' : 'border-border opacity-70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        disabled={pending}
                        onChange={() => toggle(move.taskId)}
                        className="mt-0.5 size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{task?.title ?? 'A task'}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
                            {REBALANCE_ACTION_LABELS[move.action]}
                          </span>
                          <span className="text-muted">
                            {task ? `${TASK_TYPE_LABELS[task.taskType]} · ${task.minutes} min` : ''}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs font-medium">
                          <span className="sr-only">
                            From week {move.fromWeek} to week {move.toWeek}.
                          </span>
                          <span aria-hidden>
                            Week {move.fromWeek} → Week {move.toWeek}
                          </span>
                        </span>
                        {earlier.length > 0 && (
                          <span className="mt-1 block text-xs text-muted">
                            Already moved: {describeMoveChain(earlier)}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-muted">{move.reason}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!hasMoves && proposal.warnings.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            Nothing is behind, so there is nothing to rebalance.
          </p>
        )}

      </div>

      {/* The error sits with the buttons, not at the end of the list: Apply is pinned here, so an error
          rendered below a long list would be out of sight. */}
      <footer className="shrink-0 border-t border-border p-4 lg:px-6">
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="min-h-11 rounded-md border border-border px-4 text-sm disabled:opacity-50"
          >
            {hasMoves ? 'Keep my plan' : 'Close'}
          </button>
          {hasMoves && (
            <button
              type="button"
              disabled={pending || chosen.length === 0}
              onClick={apply}
              className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? 'Applying…' : `Apply ${chosen.length} ${chosen.length === 1 ? 'shift' : 'shifts'}`}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

// A right-hand slide-out on a native <dialog>, like the goal wizard: focus trapping, Escape and the
// backdrop come for free. Closing it, by any route, changes nothing.
export function RebalanceDrawer({ open, onClose, view, moveChains }: RebalanceDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  // What the user asked Claude for in this open drawer. Starts empty each time it opens, so a new open
  // always shows the page's own (rule-based) suggestion first.
  const [modelView, setModelView] = useState<RebalanceProposalView | null>(null);
  const [askCount, setAskCount] = useState(0);
  const titleId = useId();

  useEffect(() => {
    if (!open) setModelView(null);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !busy) onClose();
      }}
      className="ml-auto mr-0 h-dvh max-h-none w-[min(26rem,100vw)] max-w-none border-l border-border bg-panel p-0 text-foreground backdrop:bg-black/50 open:animate-[drawer-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {open &&
        (view ? (
          <DrawerBody
            // A new proposal starts with every move selected again.
            key={modelView ? `model-${askCount}` : 'page'}
            view={modelView ?? view}
            onModelView={(next) => {
              setModelView(next);
              setAskCount((n) => n + 1);
            }}
            moveChains={moveChains}
            titleId={titleId}
            onClose={onClose}
            onPendingChange={setBusy}
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex-1 p-4 lg:px-6">
              <h2 id={titleId} className="text-lg font-semibold">
                Rebalance your plan
              </h2>
              <p className="mt-2 text-sm text-muted">
                There is no plan to rebalance yet. Create a goal and this will show any unfinished work that
                can be carried over.
              </p>
            </div>
            <footer className="flex shrink-0 justify-end border-t border-border p-4 lg:px-6">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-md border border-border px-4 text-sm"
              >
                Close
              </button>
            </footer>
          </div>
        ))}
    </dialog>
  );
}
