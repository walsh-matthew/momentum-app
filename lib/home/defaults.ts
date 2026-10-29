// The starting values home uses when the person has not chosen one in "How Momentum talks to me" (docs/DOMAIN_MODEL.md
// §4.1). Their stored choice always wins; null in the database means "not chosen yet", and these fill in only for
// display. The values are the ones in the table in §4.1: tone middle, celebrations low-key. Kept in one place so a new default can never overwrite a choice (MOM-114 owns the settings page).

import type { CelebrationLevel, ReviewDepth, Tone } from '@/types/database.types';

export const DEFAULT_TONE: Tone = 'middle';
export const DEFAULT_CELEBRATION: CelebrationLevel = 'low_key';
export const DEFAULT_REVIEW_DEPTH: ReviewDepth = 'recap_offer';
