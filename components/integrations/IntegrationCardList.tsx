'use client';

import { CalendarDays, Dumbbell, type LucideIcon } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toggleConnectedApp } from '@/app/actions/integrations';
import { INTEGRATION_CATALOG, type IntegrationCatalogEntry } from '@/lib/integrations/catalog';
import type { ConnectedAppPublic } from '@/types/database.types';
import type { IntegrationAccount } from '@/types/integrations';
import { ConnectionControls } from './ConnectionControls';

interface IntegrationCardListProps {
  connectedApps: ConnectedAppPublic[];
  // Each supported provider's connection status (listIntegrationAccounts). When given, each card also shows its
  // status and the connect, reconnect and disconnect actions (the Connected Apps page); without it the cards are
  // only the on/off switches (the desktop side panel).
  accounts?: IntegrationAccount[];
}

interface IntegrationCardProps {
  entry: IntegrationCatalogEntry;
  active: boolean;
  account?: IntegrationAccount;
}

const PROVIDER_ICONS: Record<IntegrationCatalogEntry['provider'], LucideIcon> = {
  hevy: Dumbbell,
  google_calendar: CalendarDays,
};

function IntegrationCard({ entry, active, account }: IntegrationCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const labelId = `integration-${entry.provider}`;
  const Icon = PROVIDER_ICONS[entry.provider];
  // With account details the status line is the connection's; the switch then only pauses or resumes a connected app.
  const showSwitch = account === undefined || account.status === 'connected';

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await toggleConnectedApp(entry.provider, !active);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <li className="connected-app-row flex-wrap">
      <span className="connected-app-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <h3 id={labelId} className="text-sm font-semibold text-foreground">
          {entry.name}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted">{entry.description}</p>
        {/* The words say the state; the dot and the switch position only repeat it. */}
        {account === undefined ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <span className={`sync-dot${active ? ' synced' : ''}`} aria-hidden="true" />
            {pending ? 'Saving…' : active ? 'Connected' : 'Not connected'}
          </p>
        ) : (
          showSwitch && (
            <p className="mt-2 text-xs text-muted">{pending ? 'Saving…' : active ? 'Syncing is on' : 'Syncing is paused'}</p>
          )
        )}
      </div>
      {showSwitch && (
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-labelledby={labelId}
          disabled={pending}
          onClick={onToggle}
          className="connection-toggle"
        >
          <span className="pill" aria-hidden="true">
            <span />
          </span>
        </button>
      )}
      {account !== undefined && <ConnectionControls entry={entry} account={account} />}
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

// Phase 1: a toggle only records the choice in connected_apps. No sign-in to the provider and no
// request to it happens (docs/INTEGRATIONS_SPEC.md §4).
export function IntegrationCardList({ connectedApps, accounts }: IntegrationCardListProps) {
  const activeProviders = new Set(connectedApps.filter((a) => a.is_active).map((a) => a.provider));
  const accountOf = new Map((accounts ?? []).map((a) => [a.provider, a]));

  return (
    <ul className="flex flex-col gap-3">
      {INTEGRATION_CATALOG.map((entry) => (
        <IntegrationCard
          key={entry.provider}
          entry={entry}
          active={activeProviders.has(entry.provider)}
          account={accounts ? accountOf.get(entry.provider) : undefined}
        />
      ))}
    </ul>
  );
}
