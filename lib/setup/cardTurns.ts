// When code writes the time zone card and the settings card in place of Claude's next turn (MOM-178). Kept apart from lib/setup/cards.ts,
// which the screen imports, so the screen does not carry the checks. Pure.

import type { SetupChunk, SetupDraft, Transcript, AssistantTurn } from '@/types/setup';
import { approvalFollowsPlayback, checkTurn, type Violation } from './checks';
import { SETTINGS_CARD_MARK, SETTINGS_HEADING, TIME_ZONE_ASK, TIME_ZONE_CARD_MARK, codeTurn, isSettingsCard, settingsRowsLeft, timeZoneQuestion } from './cards';
import { personWords } from './said';
import { asksMeaning } from './text';
import { finalTurn, openingTurn, prioritiesCard } from './fixedQuestions';
import { WEEK_CARD_TOPICS, weekCardFrom, type WeekCardTopic } from './weekCards';
import { isTimeZone } from './validate';

// The turn code writes in place of Claude's next one, or null when Claude takes it. Called with a transcript that ends with the
// person's newest message, before any call is made:
// - the person has just accepted the "what counts" playback, and no time zone is known: the time zone card, with the part marked
//   approved (the same acceptance rule 7 applies to Claude's own turns, lib/setup/checks.ts);
// - the person has just accepted a playback that leaves the goals, the targets and the planning approved, and the settings have not been
//   asked: the settings card (or, when every row is already answered, the playback of the settings), with that part marked approved. A
//   part changed and waiting to be played back again keeps Claude's turn until it is approved.
// `deviceZone` is the zone the person's phone reports, or null. Never used for a person adding to a finished setup (the caller).
// MOM-180 B3 adds three more, all written by code with no call:
// - Start, and the person's answer to the idea: the idea question, then the why question (lib/setup/fixedQuestions.ts openingTurn);
// - the person has just accepted the goals playback: "what else matters", with the goals part marked approved (when the draft holds no
//   priorities yet; otherwise Claude takes the turn as before);
// - the person has just accepted the playback of how Momentum talks, with every other part approved: the final card.
// `opening` false leaves the opening to Claude: only the eval runner passes it, for a scripted case written before the screen asked the idea and
// the why itself (lib/setup/evals.ts).
export function cardStep(transcript: Transcript, draft: SetupDraft, deviceZone: string | null, opening = true): AssistantTurn | null {
  const ctx = { transcript, prevDraft: draft };
  const approve = (chunk: SetupChunk): SetupDraft => ({ ...structuredClone(draft), approved: [...draft.approved, chunk] });

  const opened = opening ? openingTurn(transcript, draft) : null;
  if (opened) return opened;

  if (!draft.approved.includes('goals') && approvalFollowsPlayback(ctx, 'goals')) {
    return prioritiesCard(approve('goals'));
  }

  if (
    !draft.approved.includes('talk') &&
    (['goals', 'targets', 'planning'] as const).every((chunk) => draft.approved.includes(chunk)) &&
    approvalFollowsPlayback(ctx, 'talk')
  ) {
    return finalTurn(approve('talk'));
  }

  if (draft.model.person.timeZone === null && !draft.approved.includes('targets') && approvalFollowsPlayback(ctx, 'targets')) {
    const approved = approve('targets');
    // The zone is carried beside the words as the one answer Yes accepts; the words themselves never show it (lib/setup/cards.ts).
    const zone = deviceZone !== null && isTimeZone(deviceZone) ? deviceZone : null;
    const question = zone ? timeZoneQuestion(zone) : null;
    return codeTurn(approved, {
      kind: zone && question ? 'proposal' : 'question',
      chunk: null,
      topic: 'time_zone',
      question: question ?? TIME_ZONE_ASK,
      detail: TIME_ZONE_CARD_MARK,
      options: zone && question ? [zone] : [],
    });
  }

  const accepted = (['goals', 'targets', 'planning'] as const).find((chunk) => !draft.approved.includes(chunk) && approvalFollowsPlayback(ctx, chunk));
  if (accepted && !draft.approved.includes('talk') && !transcript.some((m) => m.role === 'assistant' && isSettingsCard(m.turn))) {
    const approved = approve(accepted);
    if (!(['goals', 'targets', 'planning'] as const).every((chunk) => approved.approved.includes(chunk))) return null;
    const rows = settingsRowsLeft(approved.model.settings);
    if (rows.length === 0) return codeTurn(approved, { kind: 'playback', chunk: 'talk', topic: null, question: null, detail: null });
    return codeTurn(approved, { kind: 'question', chunk: null, topic: rows[0].topic, question: SETTINGS_HEADING, detail: SETTINGS_CARD_MARK });
  }
  return null;
}

// The week card code writes in place of a question of Claude's (MOM-179): when Claude's checked turn is a plain question on one of the topics
// code now asks (day end, week start, time for each kind of day, set days or any day, when to plan), the card for that topic, or for the first
// one after it that has something to ask, goes out instead, carrying Claude's draft. No further call is made for it, and the cards after it
// follow in the browser. Null, so Claude's own turn stands, when:
// - the turn is not a question on one of those topics (the kinds of days are Claude's, and so is an interpretation or an offer of ideas);
// - the person's last message asked what the question means: that turn is the explanation they asked for;
// - the turn asks again the topic of the turn before it: a clarification of a typed answer, which needs Claude's words;
// - no card has anything left to ask (every value is already in the draft). A typed answer that held two values leaves both cards out.
export function weekCardInPlaceOf(turn: AssistantTurn, transcript: Transcript): AssistantTurn | null {
  const topic = turn.topic;
  if (turn.kind !== 'question' || topic === null || !(WEEK_CARD_TOPICS as readonly string[]).includes(topic)) return null;
  const last = transcript[transcript.length - 1];
  if (last?.role !== 'person' || asksMeaning(last.text)) return null;
  const before = [...transcript].reverse().find((m) => m.role === 'assistant');
  if (before?.role === 'assistant' && before.turn.topic === topic) return null;
  const next = weekCardFrom(turn.draft, topic as WeekCardTopic, personWords(transcript));
  return next.kind === 'card' ? next.turn : null;
}

// What stops a card going out. The wording of a card is the owner's and written by code, so the plain-words checks that hold Claude's
// questions to one sentence do not apply to it (the time zone card is two); what does apply is the draft check and rule 7, which
// together say the part it approves was played back and accepted and that the draft is sound.
export function cardViolations(turn: AssistantTurn, ctx: Parameters<typeof checkTurn>[1]): Violation[] {
  return checkTurn(turn, ctx).filter((v) => v.rule === 'chunked_playback' || v.rule === 'draft');
}
