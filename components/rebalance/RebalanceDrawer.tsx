'use client';

import { OctagonAlert, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { applyRebalanceProposal, askClaudeToRebalance } from '@/app/actions/tasks';
import { Button } from '@/components/ui/button';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { REBALANCE_ACTION_LABELS, TASK_TYPE_LABELS, TIMELINE_WARNING_LABELS } from '@/lib/tasks/labels';
import { describeMoveChain } from '@/lib/utils/rebalance';
import type { ChannelHint } from '@/types/channelViews';
import type {
  RebalanceApplyResult,
  RebalanceProposalView,
  TaskMoveChains,
  TimelineWarning,
} from '@/types/rebalance';

interface RebalanceDrawerProps {
  open: boolean;
  onClose: () => void;
  // The proposal for the selected goal channel (MOM-87), or null when there is none to show.
  view: RebalanceProposalView | null;
  // The goal the proposal is for. "Ask Claude" sends it, and the server checks it against the user's own goals.
  channelId: string | null;
  // Set when there is no proposal on purpose: several goals are active and none is selected.
  hint?: ChannelHint | null;
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
      className={`rounded-xl border p-3 text-sm ${
        blocking ? 'border-danger/40 bg-destructive/10' : 'border-warn/40 bg-warn/10'
      }`}
    >
      <p className={`flex items-center gap-1.5 font-medium ${blocking ? 'text-danger' : 'text-warn'}`}>
        {blocking ? <OctagonAlert className="size-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />}
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
  channelId: string | null;
  // Called with the proposal Claude wrote (or the rule-based one, with a notice, if Claude's failed).
  onModelView: (view: RebalanceProposalView) => void;
  moveChains: TaskMoveChains;
  titleId: string;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}

// Mounted only while the drawer is open, so every open starts from a clean state.
function DrawerBody({ view, channelId, onModelView, moveChains, titleId, onClose, onPendingChange }: DrawerBodyProps) {
  const { proposal } = view;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(proposal.moves.map((m) => m.taskId)));
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const shifts = useRef<HTMLElement>(null);
  const [result, setResult] = useState<RebalanceApplyResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [asking, startAsking] = useTransition();
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => onPendingChange(pending || asking), [pending, asking, onPendingChange]);

  // The only way a model is ever called: this click. It changes nothing in the plan; it only swaps
  // the suggestion on screen, and every change still needs the user to select it and press Apply.
  function askClaude() {
    if (channelId === null) return;
    setAskError(null);
    startAsking(async () => {
      const answer = await askClaudeToRebalance(channelId);
      // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
      startAsking(() => {
        if (answer.ok) onModelView(answer.data);
        else setAskError(answer.error);
      });
    });
  }

  const titleOf = (taskId: string) => view.tasks[taskId]?.title ?? 'A task';
  const chosen = proposal.moves.filter((m) => selected.has(m.taskId));

  function toggle(taskId: string) {
    setMissing(false);
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
    // Apply is always there and solid; with nothing chosen a tap says so and moves to the shifts (MOM-145).
    if (chosen.length === 0) {
      setMissing(true);
      shifts.current?.querySelector<HTMLElement>('input[type="checkbox"]')?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const outcome = await applyRebalanceProposal({ ...proposal, moves: chosen });
        // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
        startTransition(() => {
          if (!outcome.ok) {
            setError(outcome.error);
            return;
          }
          setResult(outcome.data);
        });
      } catch {
        // A thrown action (server unreachable, misconfigured) must not take the page down.
        startTransition(() => setError('Could not apply the changes. Your plan is unchanged; try again.'));
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
                  <li key={s.taskId} className="channel-card">
                    <p className="font-medium">{titleOf(s.taskId)}</p>
                    <p className="text-muted">{s.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-border p-4 lg:px-6">
          <Button onClick={onClose}>Done</Button>
        </footer>
      </div>
    );
  }

  const hasMoves = proposal.moves.length > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 lg:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="ai-icon" aria-hidden="true">
            <Sparkles className="size-[17px]" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-[-0.03em]">
              Rebalance your plan
            </h2>
            <p className="mt-1 text-xs text-muted">
              {view.source === 'model'
                ? `Suggested by Claude (${view.model ?? 'model'}) · checked against your plan`
                : 'Rule-based suggestion'}
              {' · '}week {view.currentWeek} of the plan
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          onClick={onClose}
          aria-label="Close without changing anything"
          className="-mr-2 -mt-1 text-muted"
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:px-6">
        <p className="text-sm">{proposal.summary}</p>

        {view.notice && (
          <p role="status" className="card-surface mt-3 rounded-xl p-3 text-xs">
            {view.notice}
          </p>
        )}

        <div className="mt-3">
          <Button variant="outline" disabled={pending || asking || channelId === null} onClick={askClaude}>
            {asking ? 'Asking Claude…' : view.source === 'model' ? 'Ask Claude again' : 'Ask Claude to review'}
          </Button>
          <p className="mt-1 text-xs text-muted">
            Claude sees task ids, weeks and types, never your task titles. You approve every change.
          </p>
          {askError && (
            <p role="alert" className="mt-2 text-sm text-danger">
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
          <section ref={shifts} aria-label="Proposed task shifts" className="mt-5">
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
                      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                        isOn ? 'border-accent/50 bg-accent/5' : 'ctl-border opacity-80'
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
                          <span className="chip chip-accent">{REBALANCE_ACTION_LABELS[move.action]}</span>
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
          <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            Nothing is behind, so there is nothing to rebalance.
          </p>
        )}

      </div>

      {/* The error sits with the buttons, not at the end of the list: Apply is pinned here, so an error
          rendered below a long list would be out of sight. */}
      <footer className="shrink-0 border-t border-border p-4 lg:px-6">
        {missing && (
          <div className="mb-3">
            <MissingCallout message="Choose at least one shift." />
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {hasMoves ? 'Keep my plan' : 'Close'}
          </Button>
          {hasMoves && (
            <MainButton busy={pending} busyLabel="Applying…" onClick={apply}>
              {chosen.length === 0 ? 'Apply shifts' : `Apply ${chosen.length} ${chosen.length === 1 ? 'shift' : 'shifts'}`}
            </MainButton>
          )}
        </div>
      </footer>
    </div>
  );
}

// A right-hand slide-out on a native <dialog>, like the goal wizard: focus trapping, Escape and the
// backdrop come for free. Closing it, by any route, changes nothing.
export function RebalanceDrawer({ open, onClose, view, channelId, hint = null, moveChains }: RebalanceDrawerProps) {
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
      className="sheet-surface ml-auto mr-0 h-dvh max-h-none w-[min(26rem,100vw)] max-w-none rounded-none border-y-0 border-r-0 p-0 text-foreground backdrop:bg-black/60 open:animate-[drawer-in_200ms_ease-out] motion-reduce:animate-none"
    >
      {open &&
        (view ? (
          <DrawerBody
            // A new proposal, or another channel's, starts with every move selected again.
            key={`${channelId}-${modelView ? `model-${askCount}` : 'page'}`}
            view={modelView ?? view}
            channelId={channelId}
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
                {hint === 'choose_channel'
                  ? "Rebalancing is worked out for one goal at a time, because each goal's weeks count from its own start date. Choose a channel in the sidebar, then open this again."
                  : 'There is no plan to rebalance yet. Create a goal and this will show any unfinished work that can be carried over.'}
              </p>
            </div>
            <footer className="flex shrink-0 justify-end border-t border-border p-4 lg:px-6">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </footer>
          </div>
        ))}
    </dialog>
  );
}
