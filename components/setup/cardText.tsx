import type { ReactNode } from 'react';

// The type on every setup card (MOM-111 round 3c, finding 1). In the reviewers' screenshots a card went mid-bold, heavy-bold,
// then light-bold, so the eye read the middle, then the top, then the bottom. Now exactly one line on a card is bold: its
// lead, the line the person most needs to read, which carries the context (the question, an ideas card's line in code's
// words, a playback's title, an error card's headline). Everything else is regular weight, with muted colour for what is
// secondary, and nothing is heavier than the lead. The browser sweep (tests/e2e/setup-cards.spec.ts) checks every card kind.
export const CARD_TEXT = {
  // The one bold line.
  lead: 'text-lg leading-snug font-semibold tracking-[-0.02em]',
  // The card's own words: a recap line, the line under an ideas card's lead, a question no longer leading.
  body: 'text-base leading-snug font-normal',
  // Secondary words: Claude's lead-in, a question's detail line.
  secondary: 'text-base leading-snug font-normal text-foreground/80',
  // Small notes: a skipped question, "Nothing is saved until you tap Save", a section label.
  note: 'text-sm leading-snug font-normal text-muted',
} as const;

// The data-slot the lead carries, so a test can find the one bold line on a card.
export const LEAD_SLOT = 'card-lead';

interface CardLeadProps {
  children: ReactNode;
  id?: string;
  // 'h2' when the lead is the card's heading (its id names the card), 'p' otherwise.
  as?: 'h2' | 'p';
  // False when something else on the card leads instead (an error card under the question): the line keeps its place and
  // its heading role, in regular weight.
  leads?: boolean;
}

// A card's lead line: bold when it leads, regular weight when an error card under it does.
export function CardLead({ children, id, as: Tag = 'h2', leads = true }: CardLeadProps) {
  return (
    <Tag id={id} data-slot={leads ? LEAD_SLOT : undefined} className={leads ? CARD_TEXT.lead : CARD_TEXT.body}>
      {children}
    </Tag>
  );
}
