'use client';

import { Button } from '@/components/ui/button';

interface RetryNoticeProps {
  // Why no reply came, in plain words; or, after a reload, that the answer is still waiting for one.
  message: string;
  // Whether something went wrong (an alert), or the answer simply has not been sent on yet.
  failed: boolean;
  onRetry: () => void;
  // Puts the person's last answer back in the box to edit. Absent when there is no answer to change.
  onChangeAnswer?: () => void;
}

// Shown under the card the person was answering when their answer got no reply (MOM-111 finding 10): the card stays on
// screen, so they never lose the question, and they can send the answer again or change it first.
export function RetryNotice({ message, failed, onRetry, onChangeAnswer }: RetryNoticeProps) {
  return (
    <div className="space-y-3">
      <p role={failed ? 'alert' : 'status'} className="text-base">
        {message}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" onClick={onRetry} className="w-full sm:w-auto">
          {failed ? 'Try again' : 'Send it again'}
        </Button>
        {onChangeAnswer && (
          <Button size="lg" variant="outline" onClick={onChangeAnswer} className="w-full sm:w-auto">
            Change my answer
          </Button>
        )}
      </div>
    </div>
  );
}
