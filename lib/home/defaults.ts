// The starting values home uses when the person has not chosen one in "How Momentum talks to me" (docs/DOMAIN_MODEL.md
// §4.1). Their stored choice always wins; null in the database means "not chosen yet", and these fill in only for
// display. Kept in one place so a new default can never overwrite a choice (MOM-114 owns the settings page).

import type { CelebrationLevel, Tone } from '@/types/database.types';

export const DEFAULT_TONE: Tone = 'middle';
export const DEFAULT_CELEBRATION: CelebrationLevel = 'medium';
