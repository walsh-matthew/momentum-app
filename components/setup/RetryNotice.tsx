'use client';

import { CHANGE_ANSWER, SEND_AGAIN, TRY_AGAIN, errorCopy, type RetryCause } from '@/lib/setup/session';
import { HelpLink } from './HelpLink';
import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';

interface RetryNoticeProps {
  // Why no reply came (lib/setup/session.ts RETRY_CAUSES).
  cause: RetryCause;
  onRetry: () => void;
  // Puts the person's last answer back in the box, focused, to edit. Absent when there is no answer to change (the very first
  // turn): then the card offers Try again, and never says the answer is saved.
  onChangeAnswer?: () => void;
  // When the card stands alone (nothing was asked yet), its headline is the card's heading.
  headingId?: string;
  // The server's own words when it refused the request (signed out, a conversation it could not read): they replace the
  // headline, and the cause's line is left out.
  headline?: string;
}

// Shown under the question the person was answering when their answer got no reply (MOM-111 finding 10; round 3b, finding
// 7): the question stays on screen above it, so they know where they are. One shared alert look (finding 5), soft words
// (finding 6), one button (round 3, finding 6), and "What does this mean?" saying what happened and why the button fixes it.
export function RetryNotice({ cause, onRetry, onChangeAnswer, headingId, headline }: RetryNoticeProps) {
  const hasAnswer = onChangeAnswer !== undefined;
  const copy = errorCopy(cause, hasAnswer);
  const change = copy.action === 'change' && onChangeAnswer !== undefined;
  return (
    <div data-retry-cause={cause}>
      <SetupAlert
        headline={headline ?? copy.headline}
        line={headline ? null : copy.line}
        headingId={headingId}
        role={cause === 'unsent' ? 'status' : 'alert'}
      >
        {change ? (
          <SetupButton tone="main" onClick={onChangeAnswer}>
            {CHANGE_ANSWER}
          </SetupButton>
        ) : (
          <SetupButton tone="main" onClick={onRetry}>
            {copy.action === 'send' ? SEND_AGAIN : TRY_AGAIN}
          </SetupButton>
        )}
        <HelpLink explain={copy.why} />
      </SetupAlert>
    </div>
  );
}
