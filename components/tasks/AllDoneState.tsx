import { CircleCheck } from 'lucide-react';

export interface AllDoneStateProps {
  // The channel that is finished; null for all channels.
  channelTitle?: string | null;
}

// Every task in the channel is finished (FeedState 'all_done'). The state follows the user's own ticks; the
// system never marks a task done (docs/NINETY_DAY_PLAN_CONTEXT.md §3). MainFeed renders the Recently done list
// beneath this, so the last task can still be reopened.
export function AllDoneState({ channelTitle = null }: AllDoneStateProps) {
  return (
    <section aria-labelledby="all-done-heading" className="focus-card is-complete mt-6 items-center p-6">
      <span className="task-check" aria-hidden="true" data-done>
        <CircleCheck className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 id="all-done-heading" className="section-title">
          All done
        </h2>
        <p className="mt-1 text-sm text-muted">
          Everything {channelTitle ? `in ${channelTitle}` : 'on your list'} is done. Reopen a task below if you need to.
        </p>
      </div>
    </section>
  );
}
