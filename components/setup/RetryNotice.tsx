'use client';

import { CHANGE_ANSWER, SEND_AGAIN, TRY_AGAIN } from '@/lib/setup/session';
import { SetupButton } from './SetupButton';

// Why no reply came (MOM-111 round 2, findings 12 and 14; round 3, finding 6):
// - 'stuck': the replies were thrown away because the answer could not be understood. Saying it another way is the fix, so
//   the card shows only "Change my answer".
// - 'unreachable': a technical failure (the network, Claude busy or not answering, the time limit). The answer is fine, so
//   the card shows only "Try again", and its message says which failure it was.
// - 'not_configured': setup cannot go on; trying again is all there is.
// - 'waiting': not a failure. After a reload the answer is still there, waiting to be sent: only "Send it again".
export type RetryKind = 'stuck' | 'unreachable' | 'not_configured' | 'waiting';

interface RetryNoticeProps {
  kind: RetryKind;
  // What happened, in plain words.
  message: string;
  onRetry: () => void;
  // Puts the person's last answer back in the box, focused, to edit. Absent when there is no answer to change.
  onChangeAnswer?: () => void;
}

// Shown under the card the person was answering when their answer got no reply (MOM-111 finding 10): the card stays on
// screen, so they never lose the question. One button, never two (round 3, finding 6): what to do depends on why.
export function RetryNotice({ kind, message, onRetry, onChangeAnswer }: RetryNoticeProps) {
  const changing = kind === 'stuck' && onChangeAnswer !== undefined;
  return (
    <div className="space-y-3" data-retry-kind={kind}>
      <p role={kind === 'waiting' ? 'status' : 'alert'} className="text-base">
        {message}
      </p>
      {changing ? (
        <SetupButton tone="main" onClick={onChangeAnswer}>
          {CHANGE_ANSWER}
        </SetupButton>
      ) : (
        <SetupButton tone="main" onClick={onRetry}>
          {kind === 'waiting' ? SEND_AGAIN : TRY_AGAIN}
        </SetupButton>
      )}
    </div>
  );
}
