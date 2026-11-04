'use client';

import { useId, useState } from 'react';
import { ASK_CLAUDE, MEANING_LINK } from '@/lib/setup/session';

interface HelpLinkProps {
  disabled?: boolean;
  // Words code already has for what the card means (the topic's explanation, lib/setup/explain.ts; an error card's what happened and why
  // the button fixes it): the link shows them in place, with no call to Claude.
  explain?: string | null;
  // Under the explanation, "Still not clear? Ask Claude", on the concept topics only. It sends "What do you mean?" as the person's answer.
  askClaude?: boolean;
  // Asks Claude. With no explanation to show, the link itself asks, as it did before code had words for the card.
  onAsk?: () => void;
}

// "What does this mean?" on every setup card (MOM-111 round 3, finding 4; round 3b, findings 1 and 7; MOM-180): a small muted link that
// opens code's explanation in place. Claude is reached only through "Still not clear? Ask Claude" under it (concept topics) or the card's
// typed answer box.
export function HelpLink({ disabled = false, explain = null, askClaude = false, onAsk }: HelpLinkProps) {
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
        // `block`: an inline button inside this div sits on the div's text baseline, a few pixels lower than the "Type it instead"
        // button beside it, which is a flex item itself (test day 1, M2). Both are now boxes of the same height, on one line.
        className="block text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
      >
        {MEANING_LINK}
      </button>
      {explain && open && (
        <div id={id} data-slot="help-explain" className="space-y-2">
          <p className="text-sm leading-snug text-foreground/80">{explain}</p>
          {askClaude && onAsk && (
            <button
              type="button"
              disabled={disabled}
              data-slot="ask-claude"
              onClick={onAsk}
              className="block text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              {ASK_CLAUDE}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
