'use client';

import { useActionState, useState, useTransition } from 'react';
import { disconnectApp, saveHevyApiKey } from '@/app/actions/integrations';
import { Button } from '@/components/ui/button';
import { MainButton } from '@/components/ui/MainButton';
import type { IntegrationCatalogEntry } from '@/lib/integrations/catalog';
import type { ConnectFormState, ConnectionStatus, IntegrationAccount } from '@/types/integrations';
import { HevySyncControl } from './HevySyncControl';

interface ConnectionControlsProps {
  entry: IntegrationCatalogEntry;
  // What the card may know about the connection: status and fixed wording, never a token or a key.
  account: IntegrationAccount;
}

// The words for each status. They carry the meaning; the dot's colour only repeats it.
const STATUS_TEXT: Record<ConnectionStatus, string> = {
  not_connected: 'Not connected',
  connected: 'Connected',
  needs_reauth: 'Needs reconnect',
  error: 'Connection problem',
};

const NO_STATE: ConnectFormState = { error: null, notice: null };

interface HevyKeyFormProps {
  // True when a key is already stored but no longer works, so the button says Reconnect.
  reconnect: boolean;
}

// The Hevy key form. The key is typed into a password field and submitted to a Server Action; it is not kept in
// React state, not echoed back, and the field is emptied after every submit.
function HevyKeyForm({ reconnect }: HevyKeyFormProps) {
  const [state, action, pending] = useActionState(saveHevyApiKey, NO_STATE);
  // Only whether there is a key, never the key itself: the button shows once the field has something in it (MOM-145).
  const [hasKey, setHasKey] = useState(false);
  return (
    <form action={action} onReset={() => setHasKey(false)} className="mt-3 flex flex-col gap-2">
      <label htmlFor="hevy-api-key" className="text-xs font-medium">
        Hevy API key
      </label>
      <input
        id="hevy-api-key"
        name="apiKey"
        type="password"
        autoComplete="off"
        spellCheck={false}
        required
        minLength={8}
        aria-describedby="hevy-key-help"
        onChange={(event) => setHasKey(event.target.value.length > 0)}
        className="min-h-11 rounded-lg border ctl-45 bg-background px-3 text-base text-foreground"
      />
      <p id="hevy-key-help" className="text-xs text-muted">
        Paste your key here. It is stored on the server and never shown again.
      </p>
      {hasKey && (
        <MainButton type="submit" busy={pending} busyLabel="Saving…" className="self-start">
          {reconnect ? 'Reconnect Hevy' : 'Connect Hevy'}
        </MainButton>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-sm text-muted">
          {state.notice}
        </p>
      )}
    </form>
  );
}

// Status, and the connect, reconnect and disconnect actions for one provider. Google connects by a form that
// posts to the start route (a full-page redirect to Google); Hevy by the key form; disconnecting asks for a second
// click, because it deletes the stored credential.
export function ConnectionControls({ entry, account }: ConnectionControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { status } = account;
  const connected = status === 'connected';

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await disconnectApp(entry.provider);
        // Wrapped again: a state update after an await is not part of the transition (React 19; MOM-147, F-072).
        if (result.ok) startTransition(() => setConfirming(false));
        else startTransition(() => setError(result.error));
      } catch {
        startTransition(() => setError('Could not reach the server. Nothing was changed. Try again.'));
      }
    });
  }

  return (
    <div className="mt-3 w-full">
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span className={`sync-dot${connected ? ' synced' : ''}`} aria-hidden="true" />
        <span>{STATUS_TEXT[status]}</span>
      </p>
      {(status === 'needs_reauth' || status === 'error') && (
        <p className="mt-1 text-xs text-warn">
          {account.lastError ?? 'This connection stopped working.'} Connect it again to continue.
        </p>
      )}

      {!connected && entry.provider === 'google_calendar' && (
        <form method="post" action="/api/integrations/google/start" className="mt-3">
          <Button type="submit">
            {status === 'not_connected' ? 'Connect Google Calendar' : 'Reconnect Google Calendar'}
          </Button>
          <p className="mt-2 text-xs text-muted">Read-only access to your calendar events. You leave this page to approve it.</p>
        </form>
      )}
      {!connected && entry.provider === 'hevy' && <HevyKeyForm reconnect={status !== 'not_connected'} />}

      {connected && entry.provider === 'hevy' && <HevySyncControl />}

      {(connected || status === 'needs_reauth' || status === 'error') && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <Button variant="destructive" disabled={pending} onClick={disconnect}>
                {pending ? 'Disconnecting…' : `Disconnect ${entry.name}`}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
                Keep it connected
              </Button>
              <p className="basis-full text-xs text-muted">This deletes the stored connection. You can connect again later.</p>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              Disconnect
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
