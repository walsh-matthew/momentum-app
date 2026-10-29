'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { casualText } from '@/lib/dates/casual';
import { DATE_TOPICS } from '@/lib/setup/codeTurns';
import { MEANING_LINK, MEANING_TEXT, PROPOSAL_YES_TEXT, pickedDateText } from '@/lib/setup/session';
import type { AssistantTurn } from '@/types/setup';
import { AnswerBox } from './AnswerBox';
import { AnswerChoice } from './AnswerChoice';

interface QuestionCardProps {
  // An asking turn: a question, the offer of ideas, ideas, interpretations or a proposal.
  turn: AssistantTurn;
  busy: boolean;
  onAnswer: (text: string) => void;
  // The person's today (YYYY-MM-DD), so a date in Claude's words reads "Thursday, Oct 29" (MOM-111 finding 7).
  today: string | null;
  // The answer just sent and not yet replied to, shown under the question, so the screen stays on it while Claude thinks or
  // after a reply did not come (finding 10).
  pending?: string | null;
  // Under the pending answer when no reply came: the retry and "Change my answer".
  notice?: ReactNode;
  // Words to put back in the box ("Change my answer").
  initialText?: string;
}

// One question, and nothing else on screen (docs/DOMAIN_MODEL.md §2.1 rule 1). Claude's words come from the validated turn,
// with any written date made casual. In order (MOM-111 findings 1 to 3): the lead-in right above the question, the answers
// the person can tap, the answer box, Send, and a small "Not sure what I mean?" link. Every tap sends the person's own words,
// as they would type them; the rule checks read them like any other answer.
export function QuestionCard({ turn, busy, onAnswer, today, pending = null, notice = null, initialText }: QuestionCardProps) {
  const numbered = turn.kind === 'ideas' || turn.kind === 'interpretations';
  const words = (text: string) => casualText(text, today);
  const [picked, setPicked] = useState('');

  return (
    <section aria-labelledby="setup-question" className="channel-card space-y-4 p-4">
      {turn.skipped && <p className="text-sm text-muted">{words(turn.skipped.line)}</p>}
      <div className="space-y-1">
        {turn.say && <p className="text-lg leading-snug font-normal">{words(turn.say)}</p>}
        {turn.question && (
          <h2 id="setup-question" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
            {words(turn.question)}
          </h2>
        )}
      </div>

      {numbered && turn.options.length > 0 && (
        <ol className="space-y-2">
          {turn.options.map((option, index) => (
            <li key={option}>
              <AnswerChoice disabled={busy} onClick={() => onAnswer(`Option ${index + 1}`)}>
                {index + 1}. {words(option)}
              </AnswerChoice>
            </li>
          ))}
        </ol>
      )}
      {turn.kind === 'proposal' && (
        <div className="space-y-2">
          <AnswerChoice tone="main" disabled={busy} onClick={() => onAnswer(PROPOSAL_YES_TEXT)}>
            Yes
          </AnswerChoice>
          {turn.options.map((option) => (
            <AnswerChoice key={option} disabled={busy} onClick={() => onAnswer(words(option))}>
              {words(option)}
            </AnswerChoice>
          ))}
        </div>
      )}
      {turn.kind === 'offer_ideas' && (
        <AnswerChoice disabled={busy} onClick={() => onAnswer('Yes, some starting ideas would help.')}>
          Some ideas, please
        </AnswerChoice>
      )}
      {turn.topic !== null && DATE_TOPICS.has(turn.topic) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
            Or pick a date
            <input
              type="date"
              value={picked}
              disabled={busy}
              onChange={(event) => setPicked(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-foreground/30 bg-foreground/[0.06] px-3 text-base text-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button variant="outline" disabled={busy || !picked} onClick={() => onAnswer(pickedDateText(picked))}>
            Use this date
          </Button>
        </div>
      )}

      {pending !== null && (
        <div className="space-y-3" aria-live="polite">
          <p className="rounded-2xl bg-foreground/[0.06] px-4 py-3 text-base whitespace-pre-wrap">{pending}</p>
          {busy ? (
            <p role="status" className="text-sm text-muted">
              Thinking…
            </p>
          ) : (
            notice
          )}
        </div>
      )}
      {pending === null && (
        <AnswerBox
          key={initialText ?? ''}
          label="Your answer"
          submitLabel="Send"
          busy={busy}
          onSubmit={onAnswer}
          initialText={initialText}
          help={{ label: MEANING_LINK, onClick: () => onAnswer(MEANING_TEXT) }}
        />
      )}
    </section>
  );
}
