// What the setup screen is told by the server (MOM-111): the next turn with its playback already written by code, the
// quick path when Claude is no longer used, or a plain reason nothing came back. Kept apart from types/setup.ts, which is
// the pure contract of the draft and must not know about services.

import type { AssistantTurn, SetupChunk } from './setup';

// Why setup stopped using Claude (the same words as lib/services/llm.ts SetupQuickPathReason).
export type QuickPathReason = 'over_turns' | 'over_tokens' | 'shared_cap' | 'person_cap' | 'unchecked';

// One part of the draft, played back by code from the validated draft.
export interface PlaybackSection {
  chunk: SetupChunk;
  title: string;
  lines: string[];
}

export type SetupTurnView =
  // Claude's next turn, already checked. A playback or final turn carries none of Claude's words: the screen writes it with
  // renderPlayback()/renderFinal() from the turn's validated draft (the same pure functions the server checked it with, so a
  // tab that resumes shows the same text). `rejected` is how many replies were thrown away before this one (unusable, or
  // against a hard rule); the person saw none of them.
  | { kind: 'turn'; turn: AssistantTurn; spentTokens: number; rejected: number }
  // Claude is no longer used for this setup: what was collected so far (all written by code), what is still missing, and
  // whether it can be saved as it is. Nothing is saved until the person taps.
  | { kind: 'quick_path'; reason: QuickPathReason; message: string; sections: PlaybackSection[]; missing: string[]; canSave: boolean }
  // Two requests landed within a second of each other: ask again.
  | { kind: 'wait'; message: string; retryAfterSeconds: number }
  // Claude could not give a usable reply. What the person said is kept. `reason` picks the error card's words and its one
  // button (lib/setup/session.ts ERROR_COPY; MOM-111 round 3, finding 6; round 3b): 'stuck' (the replies were thrown away:
  // the answer could not be followed) shows only "Change my answer"; the technical ones ('busy', 'no_answer', 'timed_out')
  // and 'not_configured' show only "Try again". `message` is the same words as one text, for the log.
  | { kind: 'failed'; reason: SetupFailedReason; message: string; rejected: number };

export type SetupFailedReason = 'stuck' | 'busy' | 'no_answer' | 'timed_out' | 'not_configured';

export interface SetupSaved {
  goals: number;
  targets: number;
}
