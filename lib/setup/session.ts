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
// Send). It sends MEANING_TEXT as their answer, and Claude explains the question in plainer words (lib/setup/text.ts
// asksMeaning).
export const MEANING_LINK = 'Not sure what I mean?';
export const MEANING_TEXT = 'What do you mean?';

// What a proposal's Yes sends for the person: an acceptance (lib/setup/text.ts acceptsText), so the value it showed counts as
// accepted (MOM-111 finding 8).
export const PROPOSAL_YES_TEXT = 'Yes, that works.';

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
