'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { askSetupTurn, fillQuickPathItemAction, saveSetup } from '@/app/actions/setup';
import { shownModel } from '@/lib/setup/paraphrase';
import { renderFinal, renderPlayback, spokenTimes } from '@/lib/setup/playback';
import { personWords } from '@/lib/setup/said';
import { ERROR_COPY, awaitsClaude, newSession, withAssistantTurn, withPersonMessage, withoutLastAnswer, type RetryCause } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { FillInItem, SetupSaved, SetupTurnView } from '@/types/setupScreen';
import { FinalCard } from './FinalCard';
import { PlaybackCard } from './PlaybackCard';
import { QuestionCard } from './QuestionCard';
import { QuickPathCard } from './QuickPathCard';
import type { FillHow } from './QuickPathFillIn';
import { RetryNotice } from './RetryNotice';
import { SetupAlert } from './SetupAlert';
import { SetupButton, setupButtonClasses } from './SetupButton';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { CARD_TEXT, CardLead } from './cardText';
import { clearStoredSession, loadStoredSession, storeSession } from './setupStorage';

// A save that never reached the server (MOM-111 round 2, finding 12), in the error card's words (round 3b, finding 6).
const SAVE_NETWORK_ERROR = `${ERROR_COPY.network.headline}. Nothing was saved yet. Check your connection, then try again.`;

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

// The time zone this device reports, offered on the quick path as the one suggestion for the person's time zone.
function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
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
  // A save that did not go through.
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // An item being set on the quick path card, and why one was refused.
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SetupSaved | null>(null);
  // The answer put back in the box by "Change my answer".
  const [draftAnswer, setDraftAnswer] = useState<string | undefined>(undefined);
  // Why the last request got no answer at all, for the error card (MOM-111 round 2, findings 12, 14; round 3b): the network,
  // or the server's own refusal (signed out, a conversation it could not read), whose words are its headline.
  const [failure, setFailure] = useState<{ cause: RetryCause; headline?: string } | null>(null);
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
    setFailure(null);
    setView(null);
    try {
      const result = await askSetupTurn({ ...next, today: localDate(), locale: browserLocale() });
      if (!result.ok) {
        setFailure({ cause: 'no_answer', headline: result.error });
      } else if (result.data.kind === 'turn') {
        const updated = withAssistantTurn(next, result.data.turn, result.data.spentTokens);
        setSession(updated);
        storeSession(userId, updated);
      } else {
        setView(result.data);
      }
    } catch {
      setFailure({ cause: 'network' });
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

  // "Change my answer": the last answer goes back in the box, selected, and the question is asked as it was. The change is
  // committed inside the tap (flushSync), so the box can take focus there and a phone shows its keyboard (round 2, finding 13).
  const changeAnswer = () => {
    const taken = withoutLastAnswer(session);
    if (!taken) return;
    flushSync(() => {
      setSession(taken.session);
      setDraftAnswer(taken.text);
      setView(null);
      setFailure(null);
    });
    storeSession(userId, taken.session);
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
      setError(SAVE_NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  };

  // Sets one missing item on the quick path card (MOM-111). The server works out the new session and the card's new state, so a
  // refused value changes nothing; the answer is kept in this tab exactly like any other.
  const fill = async (item: FillInItem, value: string, how: FillHow) => {
    setFilling(true);
    setFillError(null);
    try {
      const result = await fillQuickPathItemAction({ session, itemId: item.id, value, how, today: localDate(), locale: browserLocale() });
      if (result.ok) {
        const { session: updated, ...state } = result.data;
        setSession(updated);
        storeSession(userId, updated);
        setView((current) => (current?.kind === 'quick_path' ? { ...current, ...state } : current));
      } else {
        setFillError(result.error);
      }
    } catch {
      setFillError(QUICK_PATH_WORDS.fillFailed);
    } finally {
      setFilling(false);
    }
  };

  const startOver = () => {
    clearStoredSession(userId);
    setSession(newSession());
    setView(null);
    setError(null);
    setFailure(null);
    setFillError(null);
    setDraftAnswer(undefined);
    setConfirmStartOver(false);
    setPhase('intro');
  };

  if (phase === 'loading') return null;

  if (phase === 'saved' && saved) {
    return (
      <section aria-labelledby="setup-saved" className="channel-card space-y-4 p-4">
        <CardLead id="setup-saved">Your setup is saved</CardLead>
        <p className={CARD_TEXT.body}>
          {saved.goals} {saved.goals === 1 ? 'goal' : 'goals'} and {saved.targets} {saved.targets === 1 ? 'thing' : 'things'} to
          count are ready. You can log your progress now.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/log" className={setupButtonClasses('main')}>
            Log an entry
          </Link>
          <Link href="/" className={setupButtonClasses('second')}>
            Back to home
          </Link>
        </div>
      </section>
    );
  }

  if (phase === 'intro') {
    return (
      <section aria-labelledby="setup-intro" className="channel-card space-y-4 p-4">
        <CardLead id="setup-intro">Let&apos;s set up your goals</CardLead>
        <p className={CARD_TEXT.body}>
          A short conversation with Claude, one question at a time. If a question isn&apos;t clear, just ask what it means. Nothing
          is saved until you approve it at the end. What you
          type is sent to Claude (Anthropic); the{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy notice
          </Link>{' '}
          has the details.
        </p>
        <SetupButton tone="main" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start'}
        </SetupButton>
      </section>
    );
  }

  // The quick path: Claude is no longer used for this setup.
  if (view?.kind === 'quick_path') {
    return (
      <QuickPathCard
        reason={view.reason}
        message={view.message}
        sections={view.sections}
        missing={view.missing}
        canSave={view.canSave}
        saving={saving}
        error={error}
        onSave={() => void save(true)}
        onStartOver={startOver}
        items={view.items}
        deviceZone={deviceTimeZone()}
        today={localDate()}
        filling={filling}
        fillError={fillError}
        onFill={(item, value, how) => void fill(item, value, how)}
      />
    );
  }

  const turn = lastAssistantTurn(session);
  const waiting = awaitsClaude(session);
  const retry = () => void ask(session);
  // Which error card: the server's reason for a failed turn, 'wait' for the spacing limit, the network or the server's
  // refusal, and 'unsent' after a reload, when nothing went wrong (round 2, findings 12 and 14). Each card shows one button
  // (round 3, finding 6, owner decisions D1 and D2) and the shared alert look (round 3b).
  const cause: RetryCause = view?.kind === 'failed' ? view.reason : view?.kind === 'wait' ? 'wait' : (failure?.cause ?? 'unsent');

  // Nothing has been asked yet and no reply came (the very first one): there is no question to stay on, and no answer to
  // change, so the card offers only Try again.
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
        <RetryNotice cause={cause === 'stuck' || cause === 'unsent' ? 'no_answer' : cause} headline={failure?.headline} onRetry={retry} headingId="setup-retry" />
      </section>
    );
  }

  // The person's answer waiting on a reply, and, when nothing is running, what they can do about it. It shows under the
  // question it belongs to, which stays on screen (round 3b, finding 7).
  const pending = waiting ? unansweredText(session) : null;
  const notice =
    waiting && !busy ? <RetryNotice cause={cause} headline={failure?.headline} onRetry={retry} onChangeAnswer={changeAnswer} /> : null;
  const today = localDate();
  const playbackOptions = { locale: browserLocale(), spokenTime: spokenTimes(turn.draft, session.transcript), today, said: personWords(session.transcript) };

  return (
    <div className="space-y-3">
      {error && !waiting && <SetupAlert headline={error} />}
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
          lines={renderFinal(shownModel(turn.draft, session.transcript), playbackOptions)}
          saving={saving || busy || waiting}
          error={null}
          onSave={() => void save(false)}
          onChange={answer}
        />
      ) : (
        // Keyed so "Change my answer" opens the card afresh, with the old answer in the box.
        <QuestionCard
          key={`${session.transcript.length}:${draftAnswer === undefined ? '' : 'edit'}`}
          turn={turn}
          busy={busy}
          onAnswer={answer}
          today={today}
          pending={pending}
          notice={notice}
          initialText={draftAnswer}
          said={playbackOptions.said}
        />
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
            <SetupButton tone="second" onClick={startOver}>
              Yes, start again
            </SetupButton>
            <SetupButton tone="main" onClick={() => setConfirmStartOver(false)}>
              Keep going
            </SetupButton>
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
