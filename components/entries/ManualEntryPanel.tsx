import type { LogDay, LogPanel, LogTarget } from '@/types/entries';
import { ChecklistControl } from './ChecklistControl';
import { EntryList } from './EntryList';
import { NumberControl } from './NumberControl';
import { TapControl } from './TapControl';
import { TimerControl } from './TimerControl';

interface ManualEntryPanelProps {
  panel: LogPanel;
}

// The control a target's measure calls for (docs/DOMAIN_MODEL.md §1.3): a count is a tap, a quantity is one number,
// time is a timer, a checklist is a tick per step.
function ControlFor({ target, days }: { target: LogTarget; days: LogDay[] | null }) {
  switch (target.measure) {
    case 'count':
      return <TapControl target={target} days={days} />;
    case 'quantity':
      return <NumberControl target={target} days={days} />;
    case 'time':
      return <TimerControl target={target} days={days} />;
    case 'checklist':
      return <ChecklistControl target={target} days={days} />;
  }
}

// Every target the person can log against, each with its control, then their latest entries. The panel adds
// nothing up and judges nothing: it logs, removes and restores what the person says.
export function ManualEntryPanel({ panel }: ManualEntryPanelProps) {
  return (
    <div className="mt-5 max-w-xl space-y-6">
      {panel.timeZone === null && (
        <p role="status" className="channel-card text-sm text-muted">
          No time zone is set yet, so logging will refuse until you set one. Nothing is assumed for you.
        </p>
      )}

      {panel.timeZone !== null && panel.days === null && (
        <p role="status" className="channel-card text-sm text-muted">
          No day end is set yet, so you can only log for now. Set your day end to log on another day. Nothing is assumed for you.
        </p>
      )}

      {panel.targets.length === 0 ? (
        <p className="channel-card text-sm text-muted">No targets yet. Set up a goal first, and its targets will appear here.</p>
      ) : (
        panel.targets.map((target) => (
          <section key={target.id} aria-labelledby={`target-${target.id}`} className="channel-card space-y-3 p-4">
            <div>
              <h2 id={`target-${target.id}`} className="text-base font-semibold tracking-[-0.02em]">
                {target.title}
              </h2>
              <p className="text-sm text-muted">{target.goalTitle}</p>
            </div>
            <ControlFor target={target} days={panel.days} />
          </section>
        ))
      )}

      <section aria-labelledby="recent-entries">
        <h2 id="recent-entries" className="section-title mb-3">
          Recent entries
        </h2>
        <EntryList entries={panel.recent} timeZone={panel.timeZone} />
      </section>
    </div>
  );
}
