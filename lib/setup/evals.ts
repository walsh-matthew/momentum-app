// The setup eval runner (MOM-111, design record §5.1). A case is a scripted person, with details removed, talking to a
// model: here a scripted fake in `npm test`, later the real one in a live run. Every turn of the model's goes through the
// eight hard-rule checks and the draft check; at the end, a finished conversation's draft must pass the final validation
// that the save step will use. The runner knows nothing about where the model comes from. Pure: it makes no call itself.

import { AssistantTurnSchema, type AssistantTurn, type HardRuleId, type SetupDraft, type Transcript } from '@/types/setup';
import { checkTurn, type Violation } from './checks';
import { answerSettings, answerTimeZone, isSettingsCard, isTimeZoneCard, zoneOfTurn, type SettingsAnswers } from './cards';
import { cardStep, cardViolations, weekCardInPlaceOf } from './cardTurns';
import { answerWeekCard, isWeekCard, type WeekAnswer } from './weekCards';
import { answerGoalCard, goalCardInPlaceOf, isGoalCard } from './goalCards';
import { dateStep } from './codeTurns';
import { emptyDraft } from './draft';
import { SAVED_GOAL_KEY, returningDraft, type ReturningContext } from './returning';
import { validateDraft, type DraftIssue, type SavedFacts } from './validate';

export interface PersonLine {
  say: string;
  // false: this answer does not fit the question just asked, so the next turn must offer interpretations (rule 6).
  fits?: boolean;
  // The settings card, which code writes (lib/setup/cards.ts): what the person taps on it. The card takes no typed words, so `say` is
  // unused there. Nothing tapped leaves the setting unset.
  settings?: SettingsAnswers;
  // The time zone card: a different zone the person picks from the list. Without it, their answer is yes to the zone the card showed.
  zone?: string;
  // A week card, which code writes (lib/setup/weekCards.ts): what the person taps on it. Without it, `say` is typed in the card's answer box and goes
  // to the model, as the card's "Type your answer" does.
  week?: WeekAnswer;
  // A goal card, which code writes (lib/setup/goalCards.ts): the words of the person's tap ("It keeps going.", "4 weeks.", "Yes, that works.", a picked day).
  // Without it, `say` is typed in the card's answer box and goes to the model.
  goal?: string;
}

export interface SetupEvalCase {
  id: string;
  title: string;
  // The hard rules this case exercises, for the coverage check: every rule appears in at least one case.
  rules: HardRuleId[];
  person: PersonLine[];
  // 'clean': no turn violates anything and the final draft validates. Otherwise the exact violations that must be found.
  expect: 'clean' | { violations: { turn: number; rule: Violation['rule'] }[] };
  // The person's today, for a case where code answers a relative date itself (lib/setup/codeTurns.ts, MOM-111 finding 8).
  today?: string;
  // A person adding to a finished setup (MOM-132 part 2): the conversation starts from the returning draft, every turn is also held to
  // the returning checks, and the final validation reads `saved` for the anchors the draft does not hold.
  returning?: ReturningContext & { saved: SavedFacts };
}

export interface SetupModelInput {
  transcript: Transcript;
  draft: SetupDraft;
  // What code read a relative date in the person's newest message as (lib/setup/codeTurns.ts), as the app sends it.
  dateHint?: string;
}
export type SetupModelFn = (input: SetupModelInput) => AssistantTurn | Promise<AssistantTurn>;

export interface TurnReport {
  index: number;
  turn: AssistantTurn;
  violations: Violation[];
  // Written by code, not the model: the person's answer was only a relative date (MOM-111 finding 8).
  byCode: boolean;
}

export interface EvalReport {
  caseId: string;
  turns: TurnReport[];
  transcript: Transcript;
  draft: SetupDraft;
  // True when the model ended the conversation with its final confirmation.
  finished: boolean;
  // Final validation of the draft, when the conversation finished; null otherwise.
  finalIssues: DraftIssue[] | null;
  // Set when the model's output was not a turn at all.
  malformed: string | null;
  // The person had no more lines but the model had not finished.
  ranOutOfPerson: boolean;
}

const MAX_TURNS = 60;

export interface RunSetupEvalOptions {
  // Who answers each of the model's turns. By default the case's scripted lines, in order, which fit a scripted model whose
  // questions come in a fixed order. A live model asks in its own order, so the live run answers by what the question is
  // about instead (lib/ai/setupLive.ts). Return null when the person has nothing more to say.
  reply?: (turn: AssistantTurn, index: number) => PersonLine | null;
  // The person's today, YYYY-MM-DD. With it, an answer that is only a relative date is answered by code, exactly as the app
  // does (lib/setup/codeTurns.ts), and the model is not asked; a scripted model still has a turn at that position, which is
  // skipped. Without it, every turn is the model's.
  today?: string;
  // The zone the person's phone reports, which the time zone card shows (null: it reports none). Default America/Denver.
  deviceZone?: string | null;
}

export async function runSetupEval(c: SetupEvalCase, model: SetupModelFn, options: RunSetupEvalOptions = {}): Promise<EvalReport> {
  const transcript: Transcript = [];
  const returning = c.returning ? { mode: c.returning.mode, goalTitle: c.returning.goalTitle } : undefined;
  let draft = returning ? returningDraft(returning.mode, returning.goalTitle) : emptyDraft();
  const turns: TurnReport[] = [];
  let personAt = 0;
  let personFits: boolean | undefined;
  const report: EvalReport = {
    caseId: c.id,
    turns,
    transcript,
    draft,
    finished: false,
    finalIssues: null,
    malformed: null,
    ranOutOfPerson: false,
  };

  const deviceZone = options.deviceZone === undefined ? 'America/Denver' : options.deviceZone;
  for (let index = 0; index < MAX_TURNS; index++) {
    // The cards code writes (MOM-178), as the app does: never for a person adding to a finished setup, and only when the turn passes.
    const card = returning ? null : cardStep(transcript, draft, deviceZone);
    const cardOk = card !== null && cardViolations(card, { transcript: [...transcript], prevDraft: draft, personFits, returning }).length === 0;
    const step = cardOk ? null : dateStep(transcript, draft, options.today ?? c.today);
    const byCode = cardOk || step?.kind === 'turn';
    const raw = cardOk ? card : step?.kind === 'turn' ? step.turn : await model({ transcript: [...transcript], draft, dateHint: step?.kind === 'hint' ? step.hint : undefined });
    const parsed = AssistantTurnSchema.safeParse(raw);
    if (!parsed.success) {
      report.malformed = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      break;
    }
    // A question of the model's on a week topic goes out as the card for it, as the app does (lib/setup/cardTurns.ts); the model's own turn is
    // still the one held to the rules.
    const ctx = { transcript: [...transcript], prevDraft: draft, personFits, returning };
    const own = (cardOk ? cardViolations : checkTurn)(parsed.data, ctx);
    const today = options.today ?? c.today ?? null;
    const weekCard = !byCode && !returning ? (weekCardInPlaceOf(parsed.data, transcript) ?? goalCardInPlaceOf(parsed.data, transcript, today)) : null;
    const swapped = weekCard !== null && cardViolations(weekCard, ctx).length === 0;
    const turn: AssistantTurn = swapped && weekCard ? weekCard : parsed.data;
    turns.push({ index, turn, violations: own, byCode: byCode || swapped });
    transcript.push({ role: 'assistant', turn });
    draft = turn.draft;
    report.draft = draft;

    if (turn.kind === 'final') {
      report.finished = true;
      report.finalIssues = validateDraft(draft, transcript, 'final', c.returning
          ? {
              saved: c.returning.saved,
              existingGoalKey: c.returning.mode === 'add_target' ? SAVED_GOAL_KEY : undefined,
              sayings: c.returning.goalTitle ? [c.returning.goalTitle] : [],
            }
          : {},
      ).issues;
      break;
    }
    let line = options.reply ? options.reply(turn, index) : c.person[personAt++];
    if (line && isTimeZoneCard(turn)) {
      // The person's tap is applied to the draft here, as the screen does, so the model's next turn starts from a draft that holds it.
      const shown = zoneOfTurn(turn);
      const picked = line.zone ?? shown;
      const how = line.zone === undefined && shown !== null ? 'accepted' : 'said';
      const next = picked === null ? null : answerTimeZone({ transcript: [...transcript], draft, spentTokens: 0 }, picked, how);
      if (!next) {
        report.malformed = 'the time zone card could not be answered';
        break;
      }
      transcript.push(next.transcript[next.transcript.length - 1]);
      draft = next.draft;
      report.draft = draft;
      personFits = line.fits;
      continue;
    }
    if (line && isSettingsCard(turn)) {
      // The settings card answered by taps, and the part played back by code at once: two more turns, no model.
      const next = answerSettings({ transcript: [...transcript], draft, spentTokens: 0 }, line.settings ?? {});
      if (!next) {
        report.malformed = 'the settings card could not be answered';
        break;
      }
      const [said, played] = next.transcript.slice(-2);
      transcript.push(said);
      if (played.role === 'assistant') {
        index += 1;
        turns.push({ index, turn: played.turn, violations: checkTurn(played.turn, { transcript: [...transcript], prevDraft: draft, personFits, returning }), byCode: true });
        transcript.push(played);
        draft = next.draft;
        report.draft = draft;
        line = options.reply ? options.reply(played.turn, index) : c.person[personAt++];
      }
    }
    // The week cards answered by taps, each followed by whatever code writes next (another card, or the playback of the planning part):
    // no model, as the screen does it. When the next thing is the model's, its turn comes on the next pass.
    let shownTurn: AssistantTurn = turn;
    let modelNext = false;
    while (line && ((line.week && isWeekCard(shownTurn)) || (line.goal !== undefined && isGoalCard(shownTurn)))) {
      const session = { transcript: [...transcript], draft, spentTokens: 0 };
      const next = line.week && isWeekCard(shownTurn) ? answerWeekCard(session, line.week) : answerGoalCard(session, line.goal ?? '', today);
      if (!next) {
        report.malformed = 'a card could not be answered';
        return report;
      }
      const [said, follow] = next.transcript.slice(transcript.length);
      transcript.push(said);
      draft = next.draft;
      report.draft = draft;
      personFits = line.fits;
      if (follow?.role !== 'assistant') {
        modelNext = true;
        line = null;
        break;
      }
      index += 1;
      const ctxNext = { transcript: [...transcript], prevDraft: draft, personFits, returning };
      turns.push({ index, turn: follow.turn, violations: isWeekCard(follow.turn) || isGoalCard(follow.turn) ? cardViolations(follow.turn, ctxNext) : checkTurn(follow.turn, ctxNext), byCode: true });
      transcript.push(follow);
      shownTurn = follow.turn;
      line = options.reply ? options.reply(follow.turn, index) : c.person[personAt++];
    }
    if (modelNext) continue;
    if (!line) {
      report.ranOutOfPerson = true;
      break;
    }
    transcript.push({ role: 'person', text: line.say });
    personFits = line.fits;
  }
  return report;
}

// Everything that went wrong in a report, flattened: per-turn violations, a malformed turn, and a final draft that
// does not validate.
export function violationsOf(report: EvalReport): { turn: number; rule: Violation['rule'] }[] {
  return report.turns.flatMap((t) => t.violations.map((x) => ({ turn: t.index, rule: x.rule })));
}
