'use client';

import { useState, useTransition } from 'react';
import { toggleConnectedApp } from '@/app/actions/integrations';
import { INTEGRATION_CATALOG, type IntegrationCatalogEntry } from '@/lib/integrations/catalog';
import type { ConnectedAppPublic } from '@/types/database.types';

interface IntegrationCardListProps {
  connectedApps: ConnectedAppPublic[];
}

interface IntegrationCardProps {
  entry: IntegrationCatalogEntry;
  active: boolean;
}

function IntegrationCard({ entry, active }: IntegrationCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labelId = `integration-${entry.provider}`;

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleConnectedApp(entry.provider, !active);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={labelId} className="font-medium text-foreground">
            {entry.name}
          </h3>
          <p className="mt-1 text-sm text-muted">{entry.description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-labelledby={labelId}
          disabled={pending}
          onClick={onToggle}
          className={`relative h-11 w-14 shrink-0 rounded-full disabled:opacity-60`}
        >
          <span
            aria-hidden
            className={`absolute left-0 top-1/2 h-7 w-14 -translate-y-1/2 rounded-full border ${
              active ? 'border-accent bg-accent' : 'border-border bg-foreground/10'
            }`}
          />
          <span
            aria-hidden
            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow transition-[left] ${
              active ? 'left-8' : 'left-1'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{pending ? 'Saving…' : active ? 'Connected' : 'Not connected'}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

// Phase 1: a toggle only records the choice in connected_apps. No sign-in to the provider and no
// request to it happens (docs/INTEGRATIONS_SPEC.md §4).
export function IntegrationCardList({ connectedApps }: IntegrationCardListProps) {
  const activeProviders = new Set(connectedApps.filter((a) => a.is_active).map((a) => a.provider));

  return (
    <ul className="flex flex-col gap-3">
      {INTEGRATION_CATALOG.map((entry) => (
        <IntegrationCard key={entry.provider} entry={entry} active={activeProviders.has(entry.provider)} />
      ))}
    </ul>
  );
}
