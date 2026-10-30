'use client';

import { useId, useState } from 'react';
import { MEANING_LINK } from '@/lib/setup/session';

interface HelpLinkProps {
  disabled?: boolean;
  // Words code already has for what the card means (a number question's fewest and aim, an error card's what happened and
  // why the button fixes it): the link shows them in place, with no call to Claude.
  explain?: string | null;
  // Otherwise the link asks: it sends "What do you mean?" as the person's answer, and Claude explains the question.
  onAsk?: () => void;
}

// "What does this mean?" on every setup card (MOM-111 round 3, finding 4; round 3b, findings 1 and 7): a small muted link.
export function HelpLink({ disabled = false, explain = null, onAsk }: HelpLinkProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={explain ? open : undefined}
        aria-controls={explain ? id : undefined}
        onClick={() => (explain ? setOpen((o) => !o) : onAsk?.())}
        className="text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        {MEANING_LINK}
      </button>
      {explain && open && (
        <p id={id} data-slot="help-explain" className="text-sm leading-snug text-foreground/80">
          {explain}
        </p>
      )}
    </div>
  );
}
