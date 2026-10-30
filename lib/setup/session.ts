// A setup conversation as the screen holds it between turns (MOM-111). The browser keeps the whole conversation and sends
// it with every turn; nothing is stored on the server before the person approves (the owner's 2026-10-27 decision). These
// are the small pure steps the screen takes, so each can be tested without a browser. The transcript only ever grows by
// appending: a draft's provenance points at positions in it, so editing or removing a message would break the draft.

import { emptyDraft } from './draft';
import { SetupSessionSchema, type AssistantTurn, type SetupSession } from '@/types/setup';

// What the Approve button says for the person. It is an ordinary message of theirs: rule 7 only accepts an approval that
// follows a playback and a message that accepts it (lib/setup/text.ts acceptsText).
export const APPROVE_TEXT = 'Yes, that is right.';

// The change box on a playback and on the final confirmation: what it asks, and its way out (MOM-111). On a playback the
// way out approves the part as shown; on the final confirmation it only closes the box.
export const CHANGE_PROMPT = 'What would you like to change?';
export const KEEP_IT = 'Keep it as it is';

// The question card's link for a person who is not sure what a question means (MOM-111 finding 1: a small muted link under
// Send; round 3, finding 4: the same words on every card). It sends MEANING_TEXT as their answer, and Claude explains the
// question in plainer words (lib/setup/text.ts asksMeaning).
export const MEANING_LINK = 'What does this mean?';
export const MEANING_TEXT = 'What do you mean?';

// What a proposal's Yes sends for the person: an acceptance (lib/setup/text.ts acceptsText), so the value it showed counts as
// accepted (MOM-111 finding 8).
export const PROPOSAL_YES_TEXT = 'Yes, that works.';

// The date layout's choices (MOM-111 round 2, findings 4 and 9): Yes for a suggested date, the picker opened in place, and a
// small link to type it instead.
export const PICK_DATE = 'Pick a date';
export const PICK_OTHER_DATE = 'Pick a different date';
export const TYPE_INSTEAD = 'Type it instead';

// Under the lead line of a card of starting ideas or readings of an answer, in regular weight (MOM-111 round 3c, finding 2).
export const PICK_ONE = 'Pick one or write your own.';

// The error card's one button (MOM-111 round 3, finding 6).
export const CHANGE_ANSWER = 'Change my answer';
export const TRY_AGAIN = 'Try again';
// After a reload, the answer is still waiting to be sent: nothing went wrong.
export const SEND_AGAIN = 'Send it again';

// Why no reply came, for the error card (MOM-111 round 2, findings 12 and 14; round 3, finding 6; round 3b, findings 5 to 7):
// - 'stuck': every reply to the answer was thrown away, so the answer could not be followed. The fix is saying it another way.
// - 'network': the request never reached the server. 'busy': the model was rate limited. 'wait': two requests landed within
//   a second. 'no_answer': the model call failed. 'timed_out': the turn ran out of time. Each is technical: try again.
// - 'not_configured': setup cannot run on this server.
// - 'unsent': after a reload, the answer is still waiting to be sent. Nothing went wrong.
export const RETRY_CAUSES = ['stuck', 'network', 'busy', 'wait', 'no_answer', 'timed_out', 'not_configured', 'unsent'] as const;
export type RetryCause = (typeof RETRY_CAUSES)[number];

export interface ErrorCopy {
  // The problem, as a short headline at the top of the card.
  headline: string;
  // One line on what to do, or null when the button says it.
  line: string | null;
  // The card's one button.
  action: 'change' | 'retry' | 'send';
  // What "What does this mean?" shows on the card: what happened, and why the button fixes it (round 3b, finding 7).
  why: string;
}

// Soft words that never blame the person and never name the model (round 3b, finding 6). "Your answer is saved." is said only
// where the answer is kept: the browser keeps it until a reply comes, and errorCopy() drops it when there is no answer.
export const SAVED = 'Your answer is saved.';
export const ERROR_COPY: Record<RetryCause, ErrorCopy> = {
  stuck: {
    headline: "Sorry, I didn't follow that",
    line: 'Could you say it a different way?',
    action: 'change',
    why: "Every reply is checked before you see it, and none of the replies to this answer passed, usually because the answer could be read more than one way. Saying it a different way almost always fixes it.",
  },
  network: {
    headline: "Couldn't connect",
    line: `${SAVED} Check your connection, then try again.`,
    action: 'retry',
    why: "Your answer didn't reach Momentum, so nothing was lost: it's kept on this device. Once you're connected, Try again sends it.",
  },
  busy: {
    headline: 'Things are busy right now',
    line: `${SAVED} Give it a moment, then try again.`,
    action: 'retry',
    why: 'A lot is being asked at once, so this answer had to wait its turn. Nothing is wrong with your answer; trying again in a moment usually works.',
  },
  wait: {
    headline: 'Things are busy right now',
    line: `${SAVED} Give it a moment, then try again.`,
    action: 'retry',
    why: 'Two answers arrived almost together, so this one had to wait. Trying again in a few seconds sends it.',
  },
  no_answer: {
    headline: "That didn't go through",
    line: `${SAVED} Try again.`,
    action: 'retry',
    why: "The reply didn't come back this time, which happens now and then. Nothing is wrong with your answer; trying again usually works.",
  },
  timed_out: {
    headline: 'That took too long',
    line: `${SAVED} Try again.`,
    action: 'retry',
    why: 'The reply took longer than setup waits for one answer, so it stopped waiting. Nothing is wrong with your answer; trying again usually comes back quicker.',
  },
  not_configured: {
    headline: "Setup isn't available right now",
    line: 'Nothing was saved. Try again later.',
    action: 'retry',
    why: "Setup needs a part of Momentum that isn't switched on yet. Nothing you did caused it; it will work once that part is on.",
  },
  unsent: {
    headline: "Your last answer wasn't sent",
    line: null,
    action: 'send',
    why: 'The page reloaded before your answer got a reply, so it was never answered. Sending it again picks up right where you left off.',
  },
};

// The card's words for a cause. Without an answer waiting (the very first turn), "Your answer is saved." is left out.
export function errorCopy(cause: RetryCause, hasAnswer: boolean): ErrorCopy {
  const copy = ERROR_COPY[cause];
  if (hasAnswer || copy.line === null) return copy;
  const line = copy.line.replace(`${SAVED} `, '').replace(SAVED, '').trim();
  return { ...copy, line: line || null };
}

// The headline and line as one text, for a log or a test.
export const errorText = (cause: RetryCause, hasAnswer = true): string => {
  const c = errorCopy(cause, hasAnswer);
  return c.line ? `${c.headline}. ${c.line}` : `${c.headline}.`;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A date picked on the date picker, as the person's answer: "Monday, November 2, 2026". Spelled with its year, so it is an
// exact date they said (lib/setup/text.ts datesIn reads it) and can never be read in the wrong order.
export function pickedDateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
  return `${weekday}, ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// The key under which the browser tab keeps the conversation in progress (components/setup/setupStorage.ts). It carries the
// signed-in person's id, so a different person who signs in in the same tab is never offered, or sent on with, someone else's
// half-finished setup.
export const SETUP_STORAGE_PREFIX = 'momentum.setup.session.';
export const setupStorageKey = (userId: string): string => `${SETUP_STORAGE_PREFIX}${userId}`;

export function newSession(): SetupSession {
  return { transcript: [], draft: emptyDraft(), spentTokens: 0 };
}

// The person said something. Appended as it is, trimmed.
export function withPersonMessage(session: SetupSession, text: string): SetupSession {
  return { ...session, transcript: [...session.transcript, { role: 'person', text: text.trim() }] };
}

// Claude's checked turn. Its draft becomes the conversation's draft: the latest answer wins because the draft is always the
// newest whole one, never a merge of older ones.
export function withAssistantTurn(session: SetupSession, turn: AssistantTurn, spentTokens: number): SetupSession {
  return { transcript: [...session.transcript, { role: 'assistant', turn }], draft: turn.draft, spentTokens };
}

// "Change my answer" (MOM-111 finding 10): the person's last answer, taken back so they can edit it, when nothing has
// answered it yet. This is the one exception to "only ever append": no draft can point at a message Claude never replied to,
// because a draft comes only with a reply. Null when the person did not speak last.
export function withoutLastAnswer(session: SetupSession): { session: SetupSession; text: string } | null {
  const last = session.transcript[session.transcript.length - 1];
  if (last?.role !== 'person') return null;
  return { session: { ...session, transcript: session.transcript.slice(0, -1) }, text: last.text };
}

// True when the conversation is waiting on Claude: it is empty (nothing asked yet) or the person spoke last.
export function awaitsClaude(session: SetupSession): boolean {
  const last = session.transcript[session.transcript.length - 1];
  return last === undefined || last.role === 'person';
}

// Claude's newest turn, or null when it has not spoken or the person has spoken since.
export function currentTurn(session: SetupSession): AssistantTurn | null {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'assistant' ? last.turn : null;
}

// What the tab stored, if it is still a valid conversation. Anything else (an older shape, a damaged value) is dropped, so
// the person starts again instead of the screen breaking.
export function parseStoredSession(raw: string | null): SetupSession | null {
  if (!raw) return null;
  try {
    const parsed = SetupSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.transcript.length > 0 ? parsed.data : null;
  } catch {
    return null;
  }
}
