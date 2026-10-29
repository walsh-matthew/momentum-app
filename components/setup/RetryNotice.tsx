'use client';

import { CHANGE_ANSWER, TRY_AGAIN } from '@/lib/setup/session';
import { SetupButton } from './SetupButton';

// Why no reply came (MOM-111 round 2, findings 12 and 14):
// - 'stuck': replies were thrown away, or there was no time for another try. Saying it another way is the likely fix, so
//   "Change my answer" is the main button.
// - 'unreachable': Momentum or Claude could not be reached, or was busy. The answer is fine, so "Try again" is the main button.
// - 'not_configured': setup cannot go on; trying again is all there is.
// - 'waiting': not a failure. After a reload the answer is still there, waiting to be sent.
export type RetryKind = 'stuck' | 'unreachable' | 'not_configured' | 'waiting';

interface RetryNoticeProps {
  kind: RetryKind;
  // What happened, in plain words.
  message: string;
  onRetry: () => void;
  // Puts the person's last answer back in the box to edit. Absent when there is no answer to change.
  onChangeAnswer?: () => void;
}

// Shown under the card the person was answering when their answer got no reply (MOM-111 finding 10): the card stays on
// screen, so they never lose the question. Its main button depends on why (round 2), and the other choice never looks
// disabled.
export function RetryNotice({ kind, message, onRetry, onChangeAnswer }: RetryNoticeProps) {
  const retryLabel = kind === 'waiting' ? 'Send it again' : TRY_AGAIN;
  const changeFirst = kind === 'stuck' && onChangeAnswer !== undefined;
  const retry = (
    <SetupButton key="retry" tone={changeFirst ? 'second' : 'main'} onClick={onRetry}>
      {retryLabel}
    </SetupButton>
  );
  const change = onChangeAnswer ? (
    <SetupButton key="change" tone={changeFirst ? 'main' : 'second'} onClick={onChangeAnswer}>
      {CHANGE_ANSWER}
    </SetupButton>
  ) : null;
  return (
    <div className="space-y-3" data-retry-kind={kind}>
      <p role={kind === 'waiting' ? 'status' : 'alert'} className="text-base">
        {message}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">{changeFirst ? [change, retry] : [retry, change]}</div>
    </div>
  );
}
