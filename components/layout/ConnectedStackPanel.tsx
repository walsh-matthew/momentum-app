'use client';

import { useState } from 'react';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import { RebalanceSideCard } from '@/components/rebalance/RebalanceSideCard';
import type { ChannelHint } from '@/types/channelViews';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { RebalanceProposalView } from '@/types/rebalance';

interface ConnectedStackPanelProps {
  connectedApps: ConnectedAppPublic[];
  rebalance: RebalanceProposalView | null;
  rebalanceHint?: ChannelHint | null;
  onOpenRebalance: () => void;
  className?: string;
}

type PanelTab = 'stack' | 'assistant';

const PANEL_TABS: Record<PanelTab, string> = {
  stack: 'Connected Stack',
  assistant: 'AI Assistant',
};

// The right-hand card from 1200px (below that the Connected Apps page and the nudge sheet replace it). Two tabs:
// the connected apps' switches, and the assistant, which holds the rebalance side card.
export function ConnectedStackPanel({
  connectedApps,
  rebalance,
  rebalanceHint = null,
  onOpenRebalance,
  className = '',
}: ConnectedStackPanelProps) {
  const [tab, setTab] = useState<PanelTab>('stack');
  const activeCount = connectedApps.filter((a) => a.is_active).length;

  return (
    <aside aria-label="Connected stack and AI assistant" className={`connected-stack hidden min-[1200px]:block ${className}`}>
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <p className="right-panel-eyebrow">Your everyday tools</p>
          <p className="mt-1.5 text-lg font-semibold tracking-[-0.04em]">Connected stack</p>
        </div>
        <span className="effort-tag" aria-label={`${activeCount} connected`}>
          {String(activeCount).padStart(2, '0')}
        </span>
      </div>
      <div role="tablist" className="grid grid-cols-2 border-b border-border">
        {(Object.keys(PANEL_TABS) as PanelTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 border-b-2 text-sm font-medium ${tab === t ? 'border-accent text-accent' : 'border-transparent text-muted'}`}
          >
            {PANEL_TABS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="p-4 text-sm text-muted">
        {tab === 'stack' ? (
          <IntegrationCardList connectedApps={connectedApps} />
        ) : (
          <div className="flex flex-col gap-4">
            <RebalanceSideCard view={rebalance} hint={rebalanceHint} onOpen={onOpenRebalance} />
            <p>Assistant chat coming soon.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
