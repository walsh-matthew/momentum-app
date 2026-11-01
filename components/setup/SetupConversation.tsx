'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { addGoalsAction, addTargetsAction, askAddTurn, askSetupTurn, fillQuickPathItemAction, saveSetup } from '@/app/actions/setup';
import { casualDate } from '@/lib/dates/casual';
import { ADD_WORDS } from '@/lib/setup/addWords';
import { startsMidWeek } from '@/lib/setup/addStart';
import { shownModel } from '@/lib/setup/paraphrase';
import { renderFinal, renderPlayback, spokenTimes } from '@/lib/setup/playback';
import { personWords } from '@/lib/setup/said';
import { RETURNING_FIRST_LINE, SAVED_GOAL_KEY, returningDraft, type ReturningMode } from '@/lib/setup/returning';
import { ERROR_COPY, awaitsClaude, newSession, withAssistantTurn, withPersonMessage, withoutLastAnswer, type RetryCause } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { AddGoalOption, FillInItem, QuickPathState, SetupAdded, SetupSaved, SetupTurnView } from '@/types/setupScreen';
import { FIRST_SETUP_WORDS, FinalCard, type FinalCardWords } from './FinalCard';
import { StartQuestion } from './StartQuestion';
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

// A person adding to a setup they have finished (MOM-132 part 2): a new goal, or targets for one goal they have. Left out for a first
// setup, which this component runs exactly as it always has.
export interface AddingConfig {
  mode: ReturningMode;
  // The goal the targets are for; null when adding a goal.
  goal: AddGoalOption | null;
  // Their saved week start, or null when none is saved.
  weekStart: number | null;
  // Their own today, from their saved time zone; null falls back to the date on this device.
  today: string | null;
  // Called once the addition is saved, so the page forgets what the person was in the middle of.
  onSaved: () => void;
}

interface SetupConversationProps {
  // The signed-in person's id (their own, from the server's session). It only names this tab's copy of their setup in
  // progress, so another person signing in in the same tab does not see it.
  userId: string;
  adding?: AddingConfig;
}

// The guided setup conversation (MOM-111, docs/DOMAIN_MODEL.md §2): one question on screen at a time. The conversation and
// the draft live in this component (and this tab's session storage); nothing is stored on the server before the person
// saves. Claude is asked only when the person taps: never on page load.
//
// The question never leaves the screen while its answer is waiting (MOM-111 finding 10). In Matt's phone run the screen went
// back to "You have a setup in progress" mid-setup: a phone drops a background tab while Claude thinks, the page reloads,
// and the old resume screen stood between the person and their question. A reload now opens straight on the question, with
// the answer still waiting and a way to send it again or change it; a reply that does not come shows the same.
export function SetupConversation({ userId, adding }: SetupConversationProps) {
  // An addition keeps its own copy in the tab, per kind of addition and goal, so it never mixes with a first setup's or another goal's.
  const storageId = adding ? `${userId}.add.${adding.mode}.${adding.goal?.id ?? ''}` : userId;
  const freshSession = (): SetupSession =>
    adding ? { transcript: [], draft: returningDraft(adding.mode, adding.goal?.title ?? null), spentTokens: 0 } : newSession();
  // What the server is told about an addition: the kind, and the goal's id. Everything else it reads from the person's own rows.
  const addition = adding ? { mode: adding.mode, ...(adding.goal ? { goalId: adding.goal.id } : {}) } : undefined;

  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<SetupSession>(freshSession);
  // The start the person chose for a target being added, with the length of the conversation it was chosen at: a change after it
  // (another final confirmation) asks again. The quick path has its own, since its answers also lengthen the conversation.
  const [chosenStart, setChosenStart] = useState<{ date: string; at: number } | null>(null);
  const [quickStart, setQuickStart] = useState<string | null>(null);
  const [added, setAdded] = useState<{ result: SetupAdded; start: string | null } | null>(null);
  // The one id of the approval being sent (MOM-132): a second tap on the same approval carries the same id, so the database saves once.
  const approval = useRef<{ key: string; id: string } | null>(null);
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
    const stored = loadStoredSession(storageId);
    if (stored) {
      setSession(stored);
      setPhase('running');
    } else {
      setPhase('intro');
    }
  }, [storageId]);

  const ask = async (next: SetupSession) => {
    setBusy(true);
    setFailure(null);
    setView(null);
    try {
      const request = { ...next, today: localDate(), locale: browserLocale() };
      const result = addition ? await askAddTurn({ ...request, addition }) : await askSetupTurn(request);
      if (!result.ok) {
        setFailure({ cause: 'no_answer', headline: result.error });
      } else if (result.data.kind === 'turn') {
        const updated = withAssistantTurn(next, result.data.turn, result.data.spentTokens);
        setSession(updated);
        storeSession(storageId, updated);
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
    const fresh = freshSession();
    setSession(fresh);
    setPhase('running');
    void ask(fresh);
  };

  const answer = (text: string) => {
    const next = withPersonMessage(session, text);
    setDraftAnswer(undefined);
    setSession(next);
    storeSession(storageId, next);
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
    storeSession(storageId, taken.session);
  };

  const save = async (quickPath: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveSetup(session, quickPath);
      if (result.ok) {
        clearStoredSession(storageId);
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

  // The one id for an approval: made when the approval first appears and kept for as long as it is the same one (the same conversation,
  // the same start, the same way of approving it), so a second tap, or a retry after a lost answer, is the same approval to the database.
  const approvalId = (key: string): string => {
    if (approval.current?.key !== key) approval.current = { key, id: crypto.randomUUID() };
    return approval.current.id;
  };

  // Adds what the person approved to the setup they already have (MOM-132 part 2). A double tap sends the same id, and the database
  // answers the second with the first answer, writing nothing. A state update after the await is plain here (no transition), so nothing
  // needs wrapping (F-072).
  const add = async (quickPath: boolean, start: string | null) => {
    if (!adding) return;
    setSaving(true);
    setError(null);
    try {
      const submissionId = approvalId(`${session.transcript.length}|${start ?? ''}|${quickPath}`);
      const flags = quickPath ? { quickPath: true } : {};
      const result =
        adding.mode === 'add_target' && adding.goal && start
          ? await addTargetsAction(session, { submissionId, goalId: adding.goal.id, startDate: start, ...flags })
          : await addGoalsAction(session, { submissionId, ...flags });
      if (result.ok) {
        clearStoredSession(storageId);
        adding.onSaved();
        setAdded({ result: result.data, start });
        setPhase('saved');
      } else {
        setError(result.error);
      }
    } catch {
      setError(ADD_WORDS.noNetwork);
    } finally {
      setSaving(false);
    }
  };

  // Sets one missing item on the quick path card (MOM-111). The server works out the new session and the card's new state, so a
  // refused value changes nothing; the answer is kept in this tab exactly like any other.
  const fill = async (item: FillInItem, value: string, how: FillHow): Promise<QuickPathState | null> => {
    setFilling(true);
    setFillError(null);
    try {
      const result = await fillQuickPathItemAction({
        session,
        itemId: item.id,
        value,
        how,
        today: localDate(),
        locale: browserLocale(),
        ...(addition ? { addition } : {}),
      });
      if (!result.ok) {
        setFillError(result.error);
        return null;
      }
      const { session: updated, ...state } = result.data;
      setSession(updated);
      storeSession(storageId, updated);
      setView((current) => (current?.kind === 'quick_path' ? { ...current, ...state } : current));
      return state;
    } catch {
      setFillError(QUICK_PATH_WORDS.fillFailed);
      return null;
    } finally {
      setFilling(false);
    }
  };

  const startOver = () => {
    clearStoredSession(storageId);
    setSession(freshSession());
    setChosenStart(null);
    setQuickStart(null);
    setView(null);
    setError(null);
    setFailure(null);
    setFillError(null);
    setDraftAnswer(undefined);
    setConfirmStartOver(false);
    setPhase('intro');
  };

  if (phase === 'loading') return null;

  // The person's own today for anything about a start: from their saved time zone when the server could work it out, else this device's.
  const dayToday = adding?.today ?? localDate();
  const startWords = (iso: string): string => casualDate(iso, dayToday, { relative: false });
  const startTarget = adding?.mode === 'add_target' ? adding.goal : null;

  if (phase === 'saved' && added && adding) {
    return (
      <section aria-labelledby="setup-saved" className="channel-card space-y-4 p-4">
        <CardLead id="setup-saved">{startTarget && added.start ? ADD_WORDS.addedTarget(startTarget.title, startWords(added.start)) : ADD_WORDS.added}</CardLead>
        <p className={CARD_TEXT.body}>{ADD_WORDS.addedDetail}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={setupButtonClasses('main')}>
            {ADD_WORDS.backHome}
          </Link>
        </div>
      </section>
    );
  }

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
        </div>
      </section>
    );
  }

  if (phase === 'intro') {
    return (
      <section aria-labelledby="setup-intro" className="channel-card space-y-4 p-4">
        <CardLead id="setup-intro">{adding ? (startTarget ? ADD_WORDS.introTarget(startTarget.title) : ADD_WORDS.introHeading) : "Let's set up your goals"}</CardLead>
        <p className={CARD_TEXT.body}>
          A short conversation with Claude, one question at a time. If a question isn&apos;t clear, just ask what it means. Nothing
          is saved until you approve it at the end. What you
          type is sent to Claude (Anthropic); the{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy notice
          </Link>{' '}
          has the details.
        </p>
        <SetupButton tone="main" onClick={start} busy={busy}>
          {busy ? 'Starting…' : 'Start'}
        </SetupButton>
      </section>
    );
  }

  // The quick path: Claude is no longer used for this setup.
  if (view?.kind === 'quick_path') {
    // A target needs its start before anything can be added, and the quick path asks no question of its own for it.
    if (startTarget && quickStart === null && adding) {
      return <StartQuestion goal={startTarget} today={dayToday} weekStart={adding.weekStart} onChoose={setQuickStart} />;
    }
    return (
      <QuickPathCard
        reason={view.reason}
        sections={view.sections}
        steps={view.steps}
        stuck={view.stuck}
        saving={saving}
        error={error}
        fillError={fillError}
        filling={filling}
        deviceZone={deviceTimeZone()}
        today={localDate()}
        onFill={fill}
        onSave={() => void (adding ? add(true, quickStart) : save(true))}
        adding={adding !== undefined}
        onStartOver={startOver}
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
  const playbackOptions = {
    locale: browserLocale(),
    spokenTime: spokenTimes(turn.draft, session.transcript),
    today,
    said: personWords(session.transcript),
    savedGoalKey: startTarget ? SAVED_GOAL_KEY : undefined,
    adding: adding !== undefined,
  };
  // The start chosen for the target on this final confirmation. A change after it makes a new final confirmation, which asks again.
  const chosenDate = chosenStart && chosenStart.at === session.transcript.length ? chosenStart.date : null;
  // The final card's words: an addition says what it adds and, for a target, from when it counts; a first setup keeps its own.
  const finalWords: FinalCardWords = !adding
    ? FIRST_SETUP_WORDS
    : startTarget && chosenDate
      ? {
          heading: ADD_WORDS.targetHeading(startTarget.title),
          notes: [ADD_WORDS.targetDetail(startWords(chosenDate)), ...(startsMidWeek(chosenDate, adding.weekStart) ? [ADD_WORDS.partWay] : [])],
          save: ADD_WORDS.add,
          saving: ADD_WORDS.adding,
          change: ADD_WORDS.change,
        }
      : { heading: ADD_WORDS.goalHeading, notes: [ADD_WORDS.goalDetail], save: ADD_WORDS.add, saving: ADD_WORDS.adding, change: ADD_WORDS.change };
  // Code's one line, on the first question of an addition: what is already saved is skipped (names only, never the values).
  // An addition's final card carries its own alert, so the card keeps one bold line: the alert's, with the heading in regular weight.
  const finalCardShown = turn.kind === 'final' && !(startTarget && chosenDate === null);
  const firstLine = adding && turn.kind !== 'playback' && turn.kind !== 'final' && session.transcript.filter((m) => m.role === 'assistant').length === 1;

  return (
    <div className="space-y-3">
      {error && !waiting && !(adding && finalCardShown) && <SetupAlert headline={error} />}
      {firstLine && <p className="text-sm leading-snug text-muted">{RETURNING_FIRST_LINE}</p>}
      {turn.kind === 'playback' && turn.chunk !== null ? (
        <PlaybackCard
          chunk={turn.chunk}
          title={adding && turn.chunk === 'planning' ? ADD_WORDS.planningTitle : undefined}
          lines={renderPlayback(shownModel(turn.draft, session.transcript), turn.chunk, playbackOptions)}
          busy={busy || waiting}
          onApprove={answer}
          onChange={answer}
        />
      ) : turn.kind === 'final' && startTarget && adding && chosenDate === null ? (
        <StartQuestion
          goal={startTarget}
          today={dayToday}
          weekStart={adding.weekStart}
          onChoose={(date) => setChosenStart({ date, at: session.transcript.length })}
        />
      ) : turn.kind === 'final' ? (
        <FinalCard
          lines={renderFinal(shownModel(turn.draft, session.transcript), playbackOptions)}
          saving={saving || busy || waiting}
          error={adding && !waiting ? error : null}
          words={finalWords}
          onSave={() => void (adding ? add(false, chosenDate) : save(false))}
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
