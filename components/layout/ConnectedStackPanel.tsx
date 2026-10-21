'use client';

import { useState } from 'react';
import { IntegrationCardList } from '@/components/integrations/IntegrationCardList';
import type { ConnectedAppPublic } from '@/types/database.types';

interface ConnectedStackPanelProps {
  connectedApps: ConnectedAppPublic[];
  className?: string;
}

type PanelTab = 'stack' | 'assistant';

const PANEL_TABS: Record<PanelTab, string> = {
  stack: 'Connected Stack',
  assistant: 'AI Assistant',
};

export function ConnectedStackPanel({ connectedApps, className = '' }: ConnectedStackPanelProps) {
  const [tab, setTab] = useState<PanelTab>('stack');

  return (
    <aside
      aria-label="Connected stack and AI assistant"
      className={`min-h-0 flex-1 flex-col border-border bg-panel lg:flex-none lg:border-l ${className}`}
    >
      <div role="tablist" className="grid shrink-0 grid-cols-2 border-b border-border">
        {(Object.keys(PANEL_TABS) as PanelTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 text-sm font-medium ${tab === t ? 'text-accent' : 'text-muted'}`}
          >
            {PANEL_TABS[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4 text-sm text-muted">
        {tab === 'stack' ? <IntegrationCardList connectedApps={connectedApps} /> : 'Assistant coming soon.'}
      </div>
    </aside>
  );
}
