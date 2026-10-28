'use client';

import { Button } from '@/components/ui/button';
import type { AssistantTurn } from '@/types/setup';
import { AnswerBox } from './AnswerBox';

interface QuestionCardProps {
  // An asking turn: a question, the offer of ideas, ideas, interpretations or a proposal.
  turn: AssistantTurn;
  busy: boolean;
  onAnswer: (text: string) => void;
}

// What the card offers beside the text box, by kind of turn. These are the person's own words, sent as they would type
// them; the rule checks read them like any other answer.
const OFFER_IDEAS_YES = [{ label: 'Some ideas, please', text: 'Yes, some starting ideas would help.' }];
const PROPOSAL_YES = [{ label: 'Yes, use that', text: 'Yes, that works.' }];

// One question, and nothing else on screen (docs/DOMAIN_MODEL.md §2.1 rule 1). Claude's words come from the validated turn;
// the numbered choices of an `ideas` or `interpretations` turn are numbered here, and tapping one sends "Option N".
export function QuestionCard({ turn, busy, onAnswer }: QuestionCardProps) {
  const numbered = turn.kind === 'ideas' || turn.kind === 'interpretations';
  const quickAnswers = turn.kind === 'offer_ideas' ? OFFER_IDEAS_YES : turn.kind === 'proposal' ? PROPOSAL_YES : [];

  return (
    <section aria-labelledby="setup-question" className="channel-card space-y-4 p-4">
      {turn.skipped && <p className="text-sm text-muted">{turn.skipped.line}</p>}
      {turn.say && <p className="text-base">{turn.say}</p>}
      {turn.question && (
        <h2 id="setup-question" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
          {turn.question}
        </h2>
      )}
      {numbered && turn.options.length > 0 && (
        <ol className="space-y-2">
          {turn.options.map((option, index) => (
            <li key={option}>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onAnswer(`Option ${index + 1}`)}
                className="h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left"
              >
                {index + 1}. {option}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <AnswerBox
        label="Your answer"
        submitLabel="Send"
        placeholder={numbered ? 'Or say it in your own words' : undefined}
        busy={busy}
        onSubmit={onAnswer}
        quickAnswers={quickAnswers}
      />
    </section>
  );
}
