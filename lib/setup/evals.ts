// The setup eval runner (MOM-111, design record §5.1). A case is a scripted person, with details removed, talking to a
// model: here a scripted fake in `npm test`, later the real one in a live run. Every turn of the model's goes through the
// eight hard-rule checks and the draft check; at the end, a finished conversation's draft must pass the final validation
// that the save step will use. The runner knows nothing about where the model comes from. Pure: it makes no call itself.

import { AssistantTurnSchema, type AssistantTurn, type HardRuleId, type SetupDraft, type Transcript } from '@/types/setup';
import { checkTurn, type Violation } from './checks';
import { dateStep } from './codeTurns';
import { emptyDraft } from './draft';
import { SAVED_GOAL_KEY, returningDraft, type ReturningContext } from './returning';
import { validateDraft, type DraftIssue, type SavedFacts } from './validate';

export interface PersonLine {
  say: string;
  // false: this answer does not fit the question just asked, so the next turn must offer interpretations (rule 6).
  fits?: boolean;
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

  for (let index = 0; index < MAX_TURNS; index++) {
    const step = dateStep(transcript, draft, options.today ?? c.today);
    const byCode = step?.kind === 'turn';
    const raw = step?.kind === 'turn' ? step.turn : await model({ transcript: [...transcript], draft, dateHint: step?.kind === 'hint' ? step.hint : undefined });
    const parsed = AssistantTurnSchema.safeParse(raw);
    if (!parsed.success) {
      report.malformed = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      break;
    }
    const turn = parsed.data;
    turns.push({ index, turn, violations: checkTurn(turn, { transcript: [...transcript], prevDraft: draft, personFits, returning }), byCode });
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
    const line = options.reply ? options.reply(turn, index) : c.person[personAt++];
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
