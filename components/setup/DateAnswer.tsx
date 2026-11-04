'use client';

import { CalendarDays } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { casualDate } from '@/lib/dates/casual';
import { MEANING_TEXT, PICK_DATE, PICK_OTHER_DATE, PROPOSAL_YES_TEXT, TYPE_INSTEAD, USE_THIS_DATE, pickedDateText } from '@/lib/setup/session';
import { cn } from '@/lib/utils/cn';
import { AnswerBox } from './AnswerBox';
import { AnswerChoice, answerChoiceClasses } from './AnswerChoice';
import { HelpLink } from './HelpLink';
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
  // The person's today (YYYY-MM-DD), so a picked date reads "Thu, Nov 12".
  today?: string | null;
}

// The one layout for every date question and every date confirmation (MOM-111 round 2, findings 4, 5 and 9; round 3,
// findings 2 and 3; round 3b, findings 2 and 3): Yes as the main answer for the suggested date, then "Pick a different date";
// or, when nothing could be suggested, "Pick a date" as the main answer. Each looks like every other answer on a setup card
// (the same shape, width, border and type), inside the card, the picker with a small calendar icon. Either one opens the
// phone's own date picker straight away: nothing opens in place under it, and there is no second date field. A small "Type it
// instead" link shows the text box.
//
// Choosing a date only shows it (test day 1: an iPhone fires `change` the moment the picker opens, with today filled in, so
// answering on change left no way to choose another date). The picker button then reads the date ("Thu, Nov 12") and can be
// tapped again to pick another; a main "Use this date" button, which appears only once a date is chosen and is never dimmed,
// sends it.
export function DateAnswer({ suggests, others, locked, busy, onAnswer, initialText, today = null }: DateAnswerProps) {
  const [typing, setTyping] = useState(initialText !== undefined);
  const [picked, setPicked] = useState<string | null>(null);

  const openTyping = () => {
    flushSync(() => setTyping(true));
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2">
        {suggests && (
          <AnswerChoice tone={typing || picked ? 'answer' : 'main'} disabled={locked} onClick={() => onAnswer(PROPOSAL_YES_TEXT)}>
            Yes
          </AnswerChoice>
        )}
        {others.map((o) => (
          <AnswerChoice key={o.sends} disabled={locked} onClick={() => onAnswer(o.sends)}>
            {o.shown}
          </AnswerChoice>
        ))}
        <PickDateButton
          label={suggests ? PICK_OTHER_DATE : PICK_DATE}
          tone={suggests || typing || picked ? 'answer' : 'main'}
          disabled={locked}
          chosen={picked ? casualDate(picked, today, { relative: false, weekday: 'short' }) : null}
          onPick={setPicked}
        />
        {picked && (
          <SetupButton tone="main" busy={locked} onClick={() => onAnswer(pickedDateText(picked))}>
            {USE_THIS_DATE}
          </SetupButton>
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
          help={{ onAsk: () => onAnswer(MEANING_TEXT) }}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={locked}
            onClick={openTyping}
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            {TYPE_INSTEAD}
          </button>
          <HelpLink disabled={locked} onAsk={() => onAnswer(MEANING_TEXT)} />
        </div>
      )}
    </div>
  );
}

interface PickDateButtonProps {
  label: string;
  tone: 'main' | 'answer';
  disabled: boolean;
  // The date chosen, as it reads on screen ("Thu, Nov 12"), or null before a pick. It replaces the label as the visible words.
  chosen?: string | null;
  // The date chosen, as YYYY-MM-DD. Choosing a date answers nothing: the caller shows it and waits for "Use this date".
  onPick: (iso: string) => void;
}

// An answer that is the date field itself (round 3, finding 3). The field covers the answer, unseen, so a tap on a phone
// lands on it and the phone opens its own date picker; on a computer the tap also asks the browser to open its picker
// (showPicker), since clicking a date field there only focuses it. Choosing a date only reports it (see DateAnswer). Its name
// is the answer's words, so a screen reader says "Pick a date, date picker".
export function PickDateButton({ label, tone, disabled, chosen = null, onPick }: PickDateButtonProps) {
  const open = (event: MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker();
    } catch {
      // Already open (a phone opens it on the tap itself), or the browser has no showPicker: the tap is enough.
    }
  };
  return (
    <label
      data-slot="answer-choice"
      data-tone={tone}
      data-picker="date"
      className={cn(
        answerChoiceClasses(tone, disabled),
        'relative cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-ring',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <CalendarDays aria-hidden="true" data-slot="picker-icon" className="size-4 shrink-0" />
      <span aria-hidden="true">{chosen ?? label}</span>
      <input
        type="date"
        aria-label={label}
        disabled={disabled}
        onClick={open}
        onChange={(event) => {
          if (event.target.value) onPick(event.target.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
      />
    </label>
  );
}
