'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export interface SetupButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // 'main': the one thing the card suggests doing next, filled. 'second': any other choice, with a full-contrast border and
  // text so it never looks disabled (MOM-111 round 2, finding 14).
  tone: 'main' | 'second';
}

// The buttons on every setup card (MOM-111 round 2, findings 8 and 14): at most one main button on a card, and second
// choices that read as choices you can tap. `data-tone` lets the tests count main buttons on every card. Same 48px touch
// target as the rest of setup, full width on a phone. It writes its own classes rather than layering on the shared Button:
// cn() does not merge classes, so the outline variant's own border colour would win over a second choice's. Its words are
// regular weight: the card's lead is its one bold line (round 3c, finding 1).
export function SetupButton({ tone, className, type = 'button', ...props }: SetupButtonProps) {
  return <button type={type} data-slot="button" data-tone={tone} className={cn(setupButtonClasses(tone), className)} {...props} />;
}

// The look of a setup button, for a control that must look like one without being a <button> (the date picker trigger in
// components/setup/DateAnswer.tsx).
export function setupButtonClasses(tone: SetupButtonProps['tone']): string {
  return cn(
    'inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-normal whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 sm:w-auto',
    tone === 'main'
      ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/85'
      : 'border-foreground/60 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.12]',
  );
}
