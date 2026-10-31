import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import type { ConnectedAppPublic } from '@/types/database.types';

interface ConnectedStackPanelProps {
  connectedApps: ConnectedAppPublic[];
  className?: string;
}

// The right-hand card from 1200px (below that the Connected Apps page replaces it): the connected apps' switches. Its second tab, the
// AI assistant that held the old rebalance card and "Assistant chat coming soon", is gone from home (MOM-115, trial subset), so a
// single list needs no tabs.
export function ConnectedStackPanel({ connectedApps, className = '' }: ConnectedStackPanelProps) {
  const activeCount = connectedApps.filter((a) => a.is_active).length;

  return (
    <aside aria-label="Connected stack" className={`connected-stack hidden min-[1200px]:block ${className}`}>
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <p className="right-panel-eyebrow">Your everyday tools</p>
          <p className="mt-1.5 text-lg font-semibold tracking-[-0.04em]">Connected stack</p>
        </div>
        {/* A plain count, and only when something is connected: "00" tells a tester nothing. */}
        {activeCount > 0 && (
          <span className="effort-tag" aria-label={`${activeCount} connected`}>
            {activeCount}
          </span>
        )}
      </div>
      <div className="border-t border-border p-4 text-sm text-muted">
        <IntegrationCardList connectedApps={connectedApps} />
      </div>
    </aside>
  );
}
