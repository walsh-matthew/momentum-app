// Two cards code writes in guided setup, with no Claude call (MOM-178, docs/DOMAIN_MODEL.md §2.2): the time zone, asked as soon as
// the "what counts" part is approved, and "how Momentum talks to you", asked as soon as the planning part is approved. Both follow the
// pattern of the quick path (lib/setup/fillIn.ts) and the date turns (lib/setup/codeTurns.ts): code writes the question, the
// person's tap is their answer, and the draft records it as theirs. Nothing is chosen for the person: no row has a choice
// pre-selected, a row left alone stays unset, and the device's zone is only ever a suggestion the person taps.
//
// Only the settings something reads are asked (§4.1): tone, celebrations, how much the weekly look-back covers, and whether the
// look-back and planning the next week happen in one sitting. Reminders, check-ins, quiet times and balance mentions are not asked
// until something uses them; they stay unset.
//
// The server decides when a card comes (lib/setup/cardTurns.ts); the screen answers it with the functions here, which are pure and small.
// The conversation keeps strictly taking turns, so a card is one assistant turn, the person's answer is one message, and the
// settings card is followed by a playback of the part, written by code too. Pure: no database, no model, no network.

import { CELEBRATION_LEVELS, REVIEW_DEPTHS, REVIEW_PLANNING_MODES, TONES } from '@/types/database.types';
import { SetupSessionSchema, type AssistantTurn, type SetupDraft, type SetupSession, type SetupSettings, type SetupTopic } from '@/types/setup';
import { PROPOSAL_YES_TEXT } from './session';
import { plainZoneName, zoneCity } from './timeZones';
import { isTimeZone } from './validate';

// Every card turn code writes carries one of these in its detail line, so the screen can tell it from one of Claude's, and Claude,
// reading the conversation, sees what it is.
export const SETTINGS_CARD_MARK = 'Settings card, written by code.';
export const TIME_ZONE_CARD_MARK = 'Time zone card, written by code.';

// The settings card's words (the owner's, written into the MOM-178 Jira comment before the build).
export const SETTINGS_HEADING = 'How should Momentum talk to you?';
export const SETTINGS_SKIP_LINE = "Skip any you like. You can't change these after setup yet.";
export const SETTINGS_NEXT = 'Next';
// What the person's message says when they chose nothing.
export const SETTINGS_NONE_SAID = "I'll skip these for now.";

export const TIME_ZONE_ASK = 'Which time zone are you in?';
export const TIME_ZONE_YES = 'Yes';
export const TIME_ZONE_OTHER = 'A different one';

export type SettingsTopic = 'tone' | 'celebrations' | 'review_depth' | 'review_planning';
type SettingsField = 'tone' | 'celebrations' | 'reviewDepth' | 'reviewPlanning';

export interface SettingsChoice {
  value: string;
  label: string;
}

export interface SettingsRow {
  topic: SettingsTopic;
  field: SettingsField;
  // How the row reads in the person's own message ("Tone: Gentle.").
  short: string;
  question: string;
  reason: string;
  choices: readonly SettingsChoice[];
}

// The four settings something reads today (lib/services/review.ts, scoreboard.ts, scoreboardRows.ts), in the order they are shown.
export const SETTINGS_ROWS: readonly SettingsRow[] = [
  {
    topic: 'tone',
    field: 'tone',
    short: 'Tone',
    question: 'How direct should Momentum be?',
    reason: 'Your progress and weekly look-back are worded that way.',
    choices: [
      { value: TONES[0], label: 'Gentle' },
      { value: TONES[1], label: 'Plain' },
      { value: TONES[2], label: 'Direct' },
    ],
  },
  {
    topic: 'celebrations',
    field: 'celebrations',
    short: 'Celebrations',
    question: 'How big should a celebration be?',
    reason: 'Used when you pass a number you set.',
    choices: [
      { value: CELEBRATION_LEVELS[0], label: 'Low-key' },
      { value: CELEBRATION_LEVELS[1], label: 'Medium' },
      { value: CELEBRATION_LEVELS[2], label: 'Big' },
    ],
  },
  {
    topic: 'review_depth',
    field: 'reviewDepth',
    short: 'Look-back',
    question: 'How much should your weekly look-back cover?',
    reason: 'It decides what you see when you look back on your week.',
    choices: [
      { value: REVIEW_DEPTHS[0], label: 'Short recap only' },
      { value: REVIEW_DEPTHS[1], label: 'Recap, with an offer to go deeper' },
      { value: REVIEW_DEPTHS[2], label: 'Recap and a few questions' },
    ],
  },
  {
    topic: 'review_planning',
    field: 'reviewPlanning',
    short: 'Planning',
    question: 'Look back and plan the next week together, or separately?',
    reason: 'It sets whether those two happen in one go.',
    choices: [
      { value: REVIEW_PLANNING_MODES[0], label: 'One sitting' },
      { value: REVIEW_PLANNING_MODES[1], label: 'Separately' },
    ],
  },
];

// The rows still to ask: a setting the person already gave (said earlier in the conversation) is theirs and is not asked again.
export const settingsRowsLeft = (settings: SetupSettings): SettingsRow[] => SETTINGS_ROWS.filter((row) => settings[row.field] === null);

// The time zone question when the device reports a zone, in the words a person knows the zone by, never the IANA id: the platform's plain
// name with the city ("Your phone is set to Mountain Time (Denver). Is that your time zone?"); with no plain name, just the city ("Your
// phone is set to Denver time. ..."). A zone with neither (UTC, an offset zone) has no plain form, so there is no question to ask about it:
// null, and the card asks "Which time zone are you in?" with the search instead.
export function timeZoneQuestion(zone: string): string | null {
  const name = plainZoneName(zone);
  const city = zoneCity(zone);
  const phone = name && city ? `${name} (${city})` : (name ?? (city ? `${city} time` : null));
  return phone === null ? null : `Your phone is set to ${phone}. Is that your time zone?`;
}

// The zone a time zone card was written for: the one answer the proposal carries beside its words, which the screen never shows. Null
// for the card that shows none.
export const zoneOfTurn = (turn: AssistantTurn): string | null => (turn.kind === 'proposal' && turn.options.length === 1 ? turn.options[0] : null);

export const codeTurn = (draft: SetupDraft, over: Pick<AssistantTurn, 'kind' | 'chunk' | 'topic' | 'question' | 'detail'> & { options?: string[] }): AssistantTurn => ({
  skipped: null,
  say: '',
  options: [],
  ...over,
  draft: structuredClone(draft),
});

// Which card the newest turn is, or null for an ordinary one.
export const isSettingsCard = (turn: AssistantTurn): boolean => turn.kind === 'question' && turn.detail === SETTINGS_CARD_MARK;
export const isTimeZoneCard = (turn: AssistantTurn): boolean => (turn.kind === 'question' || turn.kind === 'proposal') && turn.topic === 'time_zone' && turn.detail === TIME_ZONE_CARD_MARK;

const lastAssistant = (session: SetupSession): AssistantTurn | null => {
  const last = session.transcript[session.transcript.length - 1];
  return last?.role === 'assistant' ? last.turn : null;
};

// The conversation with one answer in it, or null when the answer is not one the card offered. The person's answer is a message of
// their own (a yes to the zone shown, or the zone they picked), and the draft records it with the message's position. A zone is
// offered only for a proposal that showed it; the one the person picks from the list is `said`.
export function answerTimeZone(session: SetupSession, zone: string, how: 'said' | 'accepted'): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isTimeZoneCard(turn)) return null;
  if (!isTimeZone(zone) || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone) || zone.length > 64) return null;
  // A yes counts only for the zone the card showed.
  if (how === 'accepted' && (zoneOfTurn(turn) !== zone || turn.question !== timeZoneQuestion(zone))) return null;
  const at = session.transcript.length;
  const model = structuredClone(session.draft.model);
  model.person.timeZone = zone;
  const next: SetupSession = {
    ...session,
    transcript: [...session.transcript, { role: 'person', text: how === 'accepted' ? PROPOSAL_YES_TEXT : zone }],
    draft: {
      ...session.draft,
      model,
      said: [...session.draft.said.filter((s) => s.path !== 'person.timeZone'), { path: 'person.timeZone', turn: at, how }],
    },
  };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

export type SettingsAnswers = Partial<Record<SettingsTopic, string>>;

// The person's own message for what they chose, in the card's words: "Tone: Gentle. Celebrations: Low-key.".
const sentence = (answers: SettingsAnswers): string => {
  const parts = SETTINGS_ROWS.flatMap((row) => {
    const label = row.choices.find((c) => c.value === answers[row.topic])?.label;
    return label ? [`${row.short}: ${label}.`] : [];
  });
  return parts.length > 0 ? parts.join(' ') : SETTINGS_NONE_SAID;
};

// The conversation with the settings card answered: the person's message, the values the card offered (nothing else is accepted, and a
// row left alone stays unset), one `said` entry for each, and the playback of the part, written by code from the new draft. Null when
// the newest turn is not the settings card or an answer is not one of the card's choices.
export function answerSettings(session: SetupSession, answers: SettingsAnswers): SetupSession | null {
  const turn = lastAssistant(session);
  if (!turn || !isSettingsCard(turn)) return null;
  const rows = settingsRowsLeft(session.draft.model.settings);
  const model = structuredClone(session.draft.model);
  const settings = model.settings as Record<string, unknown>;
  const asked: SettingsAnswers = {};
  const said: SetupDraft['said'] = [...session.draft.said];
  const at = session.transcript.length;
  for (const [topic, value] of Object.entries(answers) as [SettingsTopic, string][]) {
    const row = rows.find((r) => r.topic === topic);
    if (!row || !row.choices.some((c) => c.value === value)) return null;
    settings[row.field] = value;
    asked[topic] = value;
    said.push({ path: `settings.${row.field}`, turn: at, how: 'said' });
  }
  const draft: SetupDraft = { ...session.draft, model, said };
  const next: SetupSession = {
    ...session,
    transcript: [
      ...session.transcript,
      { role: 'person', text: sentence(asked) },
      { role: 'assistant', turn: codeTurn(draft, { kind: 'playback', chunk: 'talk', topic: null, question: null, detail: null }) },
    ],
    draft,
  };
  const parsed = SetupSessionSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

// Topics setup no longer asks, because nothing in the app reads what they would save (docs/DOMAIN_MODEL.md §4.1, MOM-178).
export const UNUSED_SETTING_TOPICS: ReadonlySet<SetupTopic> = new Set<SetupTopic>(['reminders', 'check_ins', 'quiet_times', 'balance_mentions']);
