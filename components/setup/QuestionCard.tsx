'use client';

import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { casualText } from '@/lib/dates/casual';
import { DATE_TOPICS } from '@/lib/setup/codeTurns';
import { numberHelp } from '@/lib/setup/numbers';
import { MEANING_TEXT, PROPOSAL_YES_TEXT, TYPE_INSTEAD } from '@/lib/setup/session';
import type { AssistantTurn } from '@/types/setup';
import { AnswerBox } from './AnswerBox';
import { AnswerChoice } from './AnswerChoice';
import { DateAnswer } from './DateAnswer';
import { HelpLink } from './HelpLink';

interface QuestionCardProps {
  // An asking turn: a question, the offer of ideas, ideas, interpretations or a proposal.
  turn: AssistantTurn;
  busy: boolean;
  onAnswer: (text: string) => void;
  // The person's today (YYYY-MM-DD), so a date in Claude's words reads "today" or "Thursday, Oct 29" (MOM-111 finding 7,
  // round 2 finding 3).
  today: string | null;
  // The answer just sent and not yet replied to, shown under the question, so the screen stays on it while Claude thinks or
  // after a reply did not come (finding 10).
  pending?: string | null;
  // Under the pending answer when no reply came: the error card's words and buttons.
  notice?: ReactNode;
  // Words to put back in the box ("Change my answer"): it opens with them selected, focused (round 2, finding 13).
  initialText?: string;
}

// One question, and nothing else on screen (docs/DOMAIN_MODEL.md §2.1 rule 1). Claude's words come from the validated turn,
// with any written date made casual. In order: the lead-in right above the question; the question itself in bold, the core
// ask only; under it, in regular weight, the detail line with its examples and its reason (round 2, finding 1); the answers
// the person can tap; and the answer box with its one Send (round 2, finding 8). A date question or a date confirmation uses
// the one date layout (components/setup/DateAnswer.tsx, round 2 findings 4 and 9). Every tap sends the person's own words,
// as they would type them; the rule checks read them like any other answer.
export function QuestionCard({ turn, busy, onAnswer, today, pending = null, notice = null, initialText }: QuestionCardProps) {
  const numbered = turn.kind === 'ideas' || turn.kind === 'interpretations';
  const words = (text: string) => casualText(text, today);
  // Nothing can be tapped while an answer waits on its reply, so a second answer can never follow the first.
  const locked = busy || pending !== null;
  const isDate = turn.topic !== null && DATE_TOPICS.has(turn.topic) && (turn.kind === 'question' || turn.kind === 'proposal');
  // A proposal shows Yes first; the text box opens from a small link, so the card keeps one main button.
  const [typing, setTyping] = useState(initialText !== undefined);

  // "What does this mean?": on a number question, code's own words on the fewest and the aim, with the person's counted thing
  // (round 3b, finding 1); on any other card, it asks Claude to explain.
  const help = { explain: numberHelp(turn.draft, turn.topic, today), onAsk: () => onAnswer(MEANING_TEXT) };

  return (
    <section aria-labelledby="setup-question" className="channel-card min-w-0 space-y-4 p-4">
      {turn.skipped && <p className="text-sm text-muted">{words(turn.skipped.line)}</p>}
      <div className="space-y-1">
        {turn.say && <p className="text-lg leading-snug font-normal">{words(turn.say)}</p>}
        {turn.question && (
          <h2 id="setup-question" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
            {words(turn.question)}
          </h2>
        )}
        {turn.detail && (
          <p data-slot="question-detail" className="text-base leading-snug font-normal text-foreground/80">
            {words(turn.detail)}
          </p>
        )}
      </div>

      {isDate && pending === null ? (
        <DateAnswer
          suggests={turn.kind === 'proposal'}
          others={turn.kind === 'proposal' ? turn.options.map((o) => ({ shown: words(o), sends: o })) : []}
          locked={locked}
          busy={busy}
          onAnswer={onAnswer}
          initialText={initialText}
        />
      ) : (
        <>
          {numbered && turn.options.length > 0 && (
            <ol className="space-y-2">
              {turn.options.map((option, index) => (
                <li key={option}>
                  <AnswerChoice disabled={locked} onClick={() => onAnswer(`Option ${index + 1}`)}>
                    {index + 1}. {words(option)}
                  </AnswerChoice>
                </li>
              ))}
            </ol>
          )}
          {turn.kind === 'proposal' && (
            <div className="space-y-2">
              <AnswerChoice tone={typing ? 'answer' : 'main'} disabled={locked} onClick={() => onAnswer(PROPOSAL_YES_TEXT)}>
                Yes
              </AnswerChoice>
              {turn.options.map((option) => (
                // The option's own words are sent, so a date in it stays readable to the checks; the screen shows it casually.
                <AnswerChoice key={option} disabled={locked} onClick={() => onAnswer(option)}>
                  {words(option)}
                </AnswerChoice>
              ))}
            </div>
          )}
          {turn.kind === 'offer_ideas' && (
            <AnswerChoice disabled={locked} onClick={() => onAnswer('Yes, some starting ideas would help.')}>
              Some ideas, please
            </AnswerChoice>
          )}

          {pending === null &&
            (turn.kind === 'proposal' && !typing ? (
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => flushSync(() => setTyping(true))}
                  className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  {TYPE_INSTEAD}
                </button>
                <HelpLink disabled={locked} explain={help.explain} onAsk={help.onAsk} />
              </div>
            ) : (
              <AnswerBox
                key={initialText ?? ''}
                label="Your answer"
                submitLabel="Send"
                busy={busy}
                onSubmit={onAnswer}
                initialText={initialText}
                focusOnOpen={initialText !== undefined || turn.kind === 'proposal'}
                help={help}
              />
            ))}
        </>
      )}

      {pending !== null && (
        <div className="space-y-3" aria-live="polite">
          <p className="rounded-2xl bg-foreground/[0.06] px-4 py-3 text-base whitespace-pre-wrap">{words(pending)}</p>
          {busy ? (
            <p role="status" className="text-sm text-muted">
              Thinking…
            </p>
          ) : (
            notice
          )}
        </div>
      )}
    </section>
  );
}
