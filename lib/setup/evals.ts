// The setup eval runner (MOM-111, design record §5.1). A case is a scripted person, with details removed, talking to a
// model: here a scripted fake in `npm test`, later the real one in a live run. Every turn of the model's goes through the
// eight hard-rule checks and the draft check; at the end, a finished conversation's draft must pass the final validation
// that the save step will use. The runner knows nothing about where the model comes from. Pure: it makes no call itself.

import { AssistantTurnSchema, type AssistantTurn, type HardRuleId, type SetupDraft, type Transcript } from '@/types/setup';
import { checkTurn, type Violation } from './checks';
import { emptyDraft } from './draft';
import { validateDraft, type DraftIssue } from './validate';

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
}

export interface SetupModelInput {
  transcript: Transcript;
  draft: SetupDraft;
}
export type SetupModelFn = (input: SetupModelInput) => AssistantTurn | Promise<AssistantTurn>;

export interface TurnReport {
  index: number;
  turn: AssistantTurn;
  violations: Violation[];
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

export async function runSetupEval(c: SetupEvalCase, model: SetupModelFn): Promise<EvalReport> {
  const transcript: Transcript = [];
  let draft = emptyDraft();
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
    const raw = await model({ transcript: [...transcript], draft });
    const parsed = AssistantTurnSchema.safeParse(raw);
    if (!parsed.success) {
      report.malformed = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      break;
    }
    const turn = parsed.data;
    turns.push({ index, turn, violations: checkTurn(turn, { transcript: [...transcript], prevDraft: draft, personFits }) });
    transcript.push({ role: 'assistant', turn });
    draft = turn.draft;
    report.draft = draft;

    if (turn.kind === 'final') {
      report.finished = true;
      report.finalIssues = validateDraft(draft, transcript, 'final').issues;
      break;
    }
    const line = c.person[personAt++];
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
