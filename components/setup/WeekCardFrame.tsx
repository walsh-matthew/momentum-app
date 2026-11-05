'use client';

import { Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { explanationFor } from '@/lib/setup/explain';
import { MEANING_TEXT } from '@/lib/setup/session';
import type { SetupDraft } from '@/types/setup';
import { WEEK_WORDS } from '@/lib/setup/weekCards';
import { AnswerBox } from './AnswerBox';
import { CARD_TEXT, CardLead } from './cardText';
import { HelpLink } from './HelpLink';

interface WeekCardFrameProps {
  // Which question this is, so a test and a screen reader can find the card.
  topic: string;
  // The one bold line.
  question: string;
  // Regular weight under it, when the card has a reason to give; null for none.
  detail?: string | null;
  // Which family of cards this is, for a test and a screen reader: the week cards (MOM-179), the goal cards (MOM-180 B1) or the step cards (B2).
  card?: 'week' | 'goal' | 'step';
  // The draft, for a card whose explanation carries the person's own counted thing (the number cards, lib/setup/numbers.ts).
  draft?: SetupDraft;
  // The person's today, for a number question about a deadline.
  today?: string | null;
  // The card's own controls.
  children: ReactNode;
  // Nothing can be tapped while a reply is on its way.
  busy: boolean;
  // The person's own words, sent to Claude as any typed answer is.
  onType: (text: string) => void;
}

// What every week card shares (MOM-179): the question, an optional reason, the card's controls, and "Type your answer", which opens the
// answer box and sends what the person writes to Claude, exactly as on any other question. "What does this mean?" sits beside it and shows
// code's explanation of the topic in place, with no Claude call (MOM-180); the typed answer box still reaches Claude.
export function WeekCardFrame({ topic, question, detail = null, card = 'week', draft, today = null, children, busy, onType }: WeekCardFrameProps) {
  const [typing, setTyping] = useState(false);
  const explanation = explanationFor(topic, draft ?? null, today);
  const help = { explain: explanation?.text ?? null, askClaude: explanation?.askClaude ?? false, onAsk: () => onType(MEANING_TEXT) };
  return (
    <section aria-labelledby="setup-question" className="channel-card min-w-0 space-y-4 p-4" data-card={card} data-topic={topic}>
      <div className="space-y-1">
        <CardLead id="setup-question">{question}</CardLead>
        {detail && (
          <p data-slot="question-detail" className={CARD_TEXT.secondary}>
            {detail}
          </p>
        )}
      </div>
      {children}
      {typing ? (
        <AnswerBox label="Your answer" submitLabel="Send" busy={busy} onSubmit={onType} focusOnOpen help={help} />
      ) : (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => flushSync(() => setTyping(true))}
            className="block text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {WEEK_WORDS.typeAnswer}
          </button>
          <HelpLink disabled={busy} explain={help.explain} askClaude={help.askClaude} onAsk={help.onAsk} />
        </div>
      )}
    </section>
  );
}

// A missing item, in place, as a plain question or a plain instruction (the quick path's amber look, lib/setup/quickPath.ts): never red, never
// a dimmed button.
export function WeekCallout({ children }: { children: ReactNode }) {
  return (
    <p role="alert" data-slot="week-callout" className="flex min-w-0 items-start gap-2 rounded-2xl border border-warn/50 bg-warn/[0.08] px-4 py-3 text-sm leading-snug text-warn">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
