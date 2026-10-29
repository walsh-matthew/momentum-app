'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { MEANING_LINK, MEANING_TEXT, PICK_DATE, PICK_OTHER_DATE, PROPOSAL_YES_TEXT, TYPE_INSTEAD, pickedDateText } from '@/lib/setup/session';
import { AnswerBox } from './AnswerBox';
import { AnswerChoice } from './AnswerChoice';
import { SetupButton } from './SetupButton';

interface DateAnswerProps {
  // Whether the question suggests a date (a proposal: "Start Monday, Nov 2?"), so Yes answers it.
  suggests: boolean;
  // A proposal's other answers ("Today"), already in casual words for the screen, with what each one sends.
  others: { shown: string; sends: string }[];
  // Nothing can be tapped: a reply is loading, or an answer is waiting on one.
  locked: boolean;
  busy: boolean;
  onAnswer: (text: string) => void;
  // Words put back by "Change my answer": the box opens with them, selected.
  initialText?: string;
}

// The one layout for every date question and every date confirmation (MOM-111 round 2, findings 4, 5 and 9): a main Yes for
// the suggested date (or "Pick a date" when nothing is suggested), "Pick a different date", which opens the date picker in
// place, so picking a date answers the question, and a small "Type it instead" link that shows the text box. There is no
// second date field and no "Use this date" button. The picker fits a phone's width (finding 5).
export function DateAnswer({ suggests, others, locked, busy, onAnswer, initialText }: DateAnswerProps) {
  const [picking, setPicking] = useState(false);
  const [typing, setTyping] = useState(initialText !== undefined);
  const input = useRef<HTMLInputElement>(null);

  // Opened inside the tap, so the browser lets the picker show: the input is put on screen synchronously first.
  const openPicker = () => {
    flushSync(() => setPicking(true));
    const el = input.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  const openTyping = () => {
    flushSync(() => setTyping(true));
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2">
        {suggests && (
          <SetupButton tone={typing ? 'second' : 'main'} disabled={locked} onClick={() => onAnswer(PROPOSAL_YES_TEXT)}>
            Yes
          </SetupButton>
        )}
        {others.map((o) => (
          <AnswerChoice key={o.sends} disabled={locked} onClick={() => onAnswer(o.sends)}>
            {o.shown}
          </AnswerChoice>
        ))}
        <SetupButton tone={suggests || typing ? 'second' : 'main'} disabled={locked} onClick={openPicker}>
          {suggests ? PICK_OTHER_DATE : PICK_DATE}
        </SetupButton>
        {picking && (
          <label className="block min-w-0 text-sm text-muted">
            <span className="sr-only">Pick a date</span>
            <input
              ref={input}
              type="date"
              disabled={locked}
              onChange={(event) => {
                if (event.target.value) onAnswer(pickedDateText(event.target.value));
              }}
              className="block min-h-11 w-full max-w-full min-w-0 appearance-none rounded-lg border border-foreground/30 bg-foreground/[0.06] px-3 text-base text-foreground focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        )}
      </div>
      {typing ? (
        <AnswerBox
          key={initialText ?? ''}
          label="Your answer"
          submitLabel="Send"
          busy={busy}
          onSubmit={onAnswer}
          initialText={initialText}
          focusOnOpen
          submitTone="main"
          help={{ label: MEANING_LINK, onClick: () => onAnswer(MEANING_TEXT) }}
        />
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={locked}
            onClick={openTyping}
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {TYPE_INSTEAD}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => onAnswer(MEANING_TEXT)}
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {MEANING_LINK}
          </button>
        </div>
      )}
    </div>
  );
}
