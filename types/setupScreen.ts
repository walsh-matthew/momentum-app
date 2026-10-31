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

// One line of what the person has told us, and the step it belongs to (a goal, one thing counted, a work item, or their days), so
// the quick-path card can show a step on its own, or put a missing item's question in place right after the step's lines.
export interface RecapLine {
  text: string;
  stepId: string;
}

// One part of the recap: a goal, "Your days", or "How Momentum talks to you". Written by code from the validated draft.
export interface RecapSection {
  id: string;
  title: string;
  lines: RecapLine[];
  // The steps whose lines (or questions) belong here, in the order they read: the goal itself, then each thing it counts, then each
  // work item.
  subjects: string[];
  // What each subject is called, by its step id: the goal, a thing it counts, a work item, "Your days". The card shows a name as a
  // heading over what is said and asked about it.
  names: Record<string, string>;
}

// One thing the quick path card lets the person answer (MOM-111, DOMAIN_MODEL §2.3). `id` is the path of the draft value it
// sets; `line` is its question in plain words, the same words the transcript records. `kind` picks the control. `suggestion`
// names the one suggestion code can show for it, or null for none (the floor, the day end, the week start, the unit and the
// source never get one: they are the person's to set). `answered` is true for one the person already answered on the card, which
// they can change; `answer` is the value it holds then, in the form the control uses.
export type FillInKind = 'timeZone' | 'time' | 'weekday' | 'number' | 'text' | 'date' | 'choice' | 'yesNo';
export type FillInSuggestion = 'device_time_zone' | 'today';
export interface FillInChoice {
  value: string;
  label: string;
}
export interface FillInItem {
  id: string;
  line: string;
  // A short note under the question, when the question needs one.
  hint: string | null;
  kind: FillInKind;
  choices: FillInChoice[];
  suggestion: FillInSuggestion | null;
  answered: boolean;
  answer: string | null;
}

// One step of the quick path: everything about one subject the person is asked. Time zone, day end and week start share "Your days".
export interface QuickStep {
  id: string;
  // The section its lines are in.
  sectionId: string;
  title: string;
  items: FillInItem[];
}

// What the quick path card shows, besides why setup stopped: what the person has said, the steps (answered and not), the
// missing items alone, what only Claude could ask for, and whether it can be saved as it is.
export interface QuickPathState {
  sections: RecapSection[];
  steps: QuickStep[];
  // The missing items, in step order. A step is done when it holds none.
  items: FillInItem[];
  // What is missing and no control on the card can supply (a goal to add), in plain words. Setup has to start again.
  stuck: string[];
  // The same missing items as plain lines (lib/setup/quickPath.ts describeMissing), for the log and the tests.
  missing: string[];
  canSave: boolean;
}

export type SetupTurnView =
  // Claude's next turn, already checked. A playback or final turn carries none of Claude's words: the screen writes it with
  // renderPlayback()/renderFinal() from the turn's validated draft (the same pure functions the server checked it with, so a
  // tab that resumes shows the same text). `rejected` is how many replies were thrown away before this one (unusable, or
  // against a hard rule); the person saw none of them.
  | { kind: 'turn'; turn: AssistantTurn; spentTokens: number; rejected: number }
  // Claude is no longer used for this setup: what was collected so far (all written by code), what is still missing, and
  // whether it can be saved as it is. Nothing is saved until the person taps.
  | ({ kind: 'quick_path'; reason: QuickPathReason; message: string } & QuickPathState)
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
