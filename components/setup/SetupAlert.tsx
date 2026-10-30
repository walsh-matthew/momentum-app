'use client';

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { CARD_TEXT, CardLead } from './cardText';

interface SetupAlertProps {
  // The problem, short, at the top.
  headline: string;
  // One line on what to do.
  line?: string | null;
  // When the alert stands alone on screen (no question above it), its headline is the card's heading, with this id.
  headingId?: string;
  // 'status' for a notice that is not a failure (the answer after a reload, waiting to be sent).
  role?: 'alert' | 'status';
  // The one button, and anything under it (the help link).
  children?: ReactNode;
}

// The one look for every error card in setup (MOM-111 round 3b, finding 5): a soft amber border and fill, a small info icon,
// the problem as a short headline, one line on what to do, then the one button. Never red, never blaming. The headline and
// line carry the role, so a screen reader announces the problem, not the button. The headline is the card's one bold line
// (round 3c, finding 1): on a card that holds an alert, whatever led before is regular weight.
export function SetupAlert({ headline, line = null, headingId, role = 'alert', children }: SetupAlertProps) {
  return (
    <div data-slot="setup-alert" className="min-w-0 space-y-3 rounded-2xl border border-warn/50 bg-warn/[0.08] p-4">
      <div className="flex items-start gap-3">
        <Info aria-hidden="true" data-slot="setup-alert-icon" className="mt-0.5 size-5 shrink-0 text-warn" />
        <div role={role} className="min-w-0 space-y-1">
          <CardLead as={headingId ? 'h2' : 'p'} id={headingId}>
            {headline}
          </CardLead>
          {line && <p className={CARD_TEXT.body}>{line}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
