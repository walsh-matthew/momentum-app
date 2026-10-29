'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { askSetupTurn, saveSetup } from '@/app/actions/setup';
import { Button } from '@/components/ui/button';
import { shownModel } from '@/lib/setup/paraphrase';
import { renderFinal, renderPlayback, spokenTimes } from '@/lib/setup/playback';
import { awaitsClaude, newSession, withAssistantTurn, withPersonMessage, withoutLastAnswer } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { SetupSaved, SetupTurnView } from '@/types/setupScreen';
import { FinalCard } from './FinalCard';
import { PlaybackCard } from './PlaybackCard';
import { QuestionCard } from './QuestionCard';
import { QuickPathCard } from './QuickPathCard';
import { RetryNotice } from './RetryNotice';
import { clearStoredSession, loadStoredSession, storeSession } from './setupStorage';

const NETWORK_ERROR = 'Could not reach the server. What you have said is kept. Try again.';
// After a reload (a phone can drop a background tab while Claude thinks), the answer is still there, waiting for a reply.
const STILL_WAITING = 'Your answer is kept. It has not had a reply yet.';

// The date on this device, as YYYY-MM-DD. Sent with each request as a suggestion for a start date (the server does not
// know the person's time zone before setup has asked for it).
function localDate(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

// The browser's locale, so a clock time in the playback reads the way the person writes times. This screen renders only
// after it has mounted (phase 'loading' renders nothing), so the server never needs it; it is sent with each turn for the
// quick path, which the server writes.
function browserLocale(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language || undefined;
}

// Claude's newest turn anywhere in the conversation, or null before it has spoken.
function lastAssistantTurn(session: SetupSession): AssistantTurn | null {
  for (let i = session.transcript.length - 1; i >= 0; i--) {
    const message = session.transcript[i];
    if (message.role === 'assistant') return message.turn;
  }
  return null;
}

// The person's last answer, when they spoke last and nothing has replied yet.
function unansweredText(session: SetupSession): string | null {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'person' ? last.text : null;
}

type Phase = 'loading' | 'intro' | 'running' | 'saved';

interface SetupConversationProps {
  // The signed-in person's id (their own, from the server's session). It only names this tab's copy of their setup in
  // progress, so another person signing in in the same tab does not see it.
  userId: string;
}

// The guided setup conversation (MOM-111, docs/DOMAIN_MODEL.md §2): one question on screen at a time. The conversation and
// the draft live in this component (and this tab's session storage); nothing is stored on the server before the person
// saves. Claude is asked only when the person taps: never on page load.
//
// The question never leaves the screen while its answer is waiting (MOM-111 finding 10). In Matt's phone run the screen went
// back to "You have a setup in progress" mid-setup: a phone drops a background tab while Claude thinks, the page reloads,
// and the old resume screen stood between the person and their question. A reload now opens straight on the question, with
// the answer still waiting and a way to send it again or change it; a reply that does not come shows the same.
export function SetupConversation({ userId }: SetupConversationProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<SetupSession>(newSession);
  // Why the last request produced no turn (the wait, a failed reply, the quick path), when it did not.
  const [view, setView] = useState<Exclude<SetupTurnView, { kind: 'turn' }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SetupSaved | null>(null);
  // The answer put back in the box by "Change my answer".
  const [draftAnswer, setDraftAnswer] = useState<string | undefined>(undefined);
  // "Start again" asks first: on a phone a stray tap would otherwise clear a long conversation.
  const [confirmStartOver, setConfirmStartOver] = useState(false);

  // Read this tab's stored conversation after the first render, so the server and the browser render the same thing first.
  useEffect(() => {
    const stored = loadStoredSession(userId);
    if (stored) {
      setSession(stored);
      setPhase('running');
    } else {
      setPhase('intro');
    }
  }, [userId]);

  const ask = async (next: SetupSession) => {
    setBusy(true);
    setError(null);
    setView(null);
    try {
      const result = await askSetupTurn({ ...next, today: localDate(), locale: browserLocale() });
      if (!result.ok) {
        setError(result.error);
      } else if (result.data.kind === 'turn') {
        const updated = withAssistantTurn(next, result.data.turn, result.data.spentTokens);
        setSession(updated);
        storeSession(userId, updated);
      } else {
        setView(result.data);
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    const fresh = newSession();
    setSession(fresh);
    setPhase('running');
    void ask(fresh);
  };

  const answer = (text: string) => {
    const next = withPersonMessage(session, text);
    setDraftAnswer(undefined);
    setSession(next);
    storeSession(userId, next);
    void ask(next);
  };

  // "Change my answer": the last answer goes back in the box, and the question is asked as it was.
  const changeAnswer = () => {
    const taken = withoutLastAnswer(session);
    if (!taken) return;
    setSession(taken.session);
    storeSession(userId, taken.session);
    setDraftAnswer(taken.text);
    setView(null);
    setError(null);
  };

  const save = async (quickPath: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveSetup(session, quickPath);
      if (result.ok) {
        clearStoredSession(userId);
        setSaved(result.data);
        setPhase('saved');
      } else {
        setError(result.error);
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  };

  const startOver = () => {
    clearStoredSession(userId);
    setSession(newSession());
    setView(null);
    setError(null);
    setDraftAnswer(undefined);
    setConfirmStartOver(false);
    setPhase('intro');
  };

  if (phase === 'loading') return null;

  if (phase === 'saved' && saved) {
    return (
      <section aria-labelledby="setup-saved" className="channel-card space-y-4 p-4">
        <h2 id="setup-saved" className="text-lg font-semibold tracking-[-0.02em]">
          Your setup is saved
        </h2>
        <p className="text-base">
          {saved.goals} {saved.goals === 1 ? 'goal' : 'goals'} and {saved.targets} {saved.targets === 1 ? 'thing' : 'things'} to
          count are ready. You can log your progress now.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/log" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground">
            Log an entry
          </Link>
          <Link href="/" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-input px-5 text-sm font-medium">
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'intro') {
    return (
      <section aria-labelledby="setup-intro" className="channel-card space-y-4 p-4">
        <h2 id="setup-intro" className="text-lg font-semibold tracking-[-0.02em]">
          Let&apos;s set up your goals
        </h2>
        <p className="text-base">
          A short conversation with Claude, one question at a time. If a question isn&apos;t clear, just ask what it means. Nothing
          is saved until you approve it at the end. What you
          type is sent to Claude (Anthropic); the{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy notice
          </Link>{' '}
          has the details.
        </p>
        <Button size="lg" onClick={start} disabled={busy} className="w-full sm:w-auto">
          {busy ? 'Starting…' : 'Start'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    );
  }

  // The quick path: Claude is no longer used for this setup.
  if (view?.kind === 'quick_path') {
    return (
      <QuickPathCard
        message={view.message}
        sections={view.sections}
        missing={view.missing}
        canSave={view.canSave}
        saving={saving}
        error={error}
        onSave={() => void save(true)}
        onStartOver={startOver}
      />
    );
  }

  const turn = lastAssistantTurn(session);
  const waiting = awaitsClaude(session);
  const failed = Boolean(error || view);
  const retry = () => void ask(session);

  // Nothing has been asked yet and no reply came (the very first one): there is no question to stay on.
  if (turn === null) {
    if (busy) {
      return (
        <p role="status" className="text-base text-muted">
          Starting…
        </p>
      );
    }
    return (
      <section aria-labelledby="setup-retry" className="channel-card space-y-4 p-4">
        <h2 id="setup-retry" className="text-lg font-semibold tracking-[-0.02em]">
          That did not come through
        </h2>
        <RetryNotice message={error ?? view?.message ?? STILL_WAITING} failed={failed} onRetry={retry} />
      </section>
    );
  }

  // The person's answer waiting on a reply, and, when nothing is running, what they can do about it.
  const pending = waiting ? unansweredText(session) : null;
  const notice =
    waiting && !busy ? (
      <RetryNotice message={error ?? view?.message ?? STILL_WAITING} failed={failed} onRetry={retry} onChangeAnswer={changeAnswer} />
    ) : null;
  const today = localDate();
  const playbackOptions = { locale: browserLocale(), spokenTime: spokenTimes(turn.draft, session.transcript), today };

  return (
    <div className="space-y-3">
      {error && !waiting && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {turn.kind === 'playback' && turn.chunk !== null ? (
        <PlaybackCard
          chunk={turn.chunk}
          lines={renderPlayback(shownModel(turn.draft, session.transcript), turn.chunk, playbackOptions)}
          busy={busy || waiting}
          onApprove={answer}
          onChange={answer}
        />
      ) : turn.kind === 'final' ? (
        <FinalCard
          lines={renderFinal(shownModel(turn.draft, session.transcript))}
          saving={saving || busy || waiting}
          error={null}
          onSave={() => void save(false)}
          onChange={answer}
        />
      ) : (
        <QuestionCard turn={turn} busy={busy} onAnswer={answer} today={today} pending={pending} notice={notice} initialText={draftAnswer} />
      )}
      {/* A question card shows these itself, under the answer it is waiting on. */}
      {(turn.kind === 'playback' || turn.kind === 'final') && (
        <>
          {busy && (
            <p role="status" className="text-sm text-muted">
              Thinking…
            </p>
          )}
          {notice}
        </>
      )}
      {confirmStartOver ? (
        <div className="space-y-2">
          <p className="text-sm">Start again? What you have said so far will be cleared.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={startOver} className="w-full sm:w-auto">
              Yes, start again
            </Button>
            <Button variant="outline" onClick={() => setConfirmStartOver(false)} className="w-full sm:w-auto">
              Keep going
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmStartOver(true)}
          disabled={busy}
          className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          Start again
        </button>
      )}
    </div>
  );
}
