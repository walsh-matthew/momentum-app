// Facts the privacy notice states (MOM-102). One place, so the page and its tests read the same numbers and
// links. Product-level only: the repo is public, so no tester, household or personal detail belongs here.

// "Ask the operator and it is done within this many days" until a person can delete their own data themselves
// (BACKLOG.md). A promise the operator must keep, so change it here and in the notice together, never one alone.
export const DELETION_WITHIN_DAYS = 14;

// Anthropic's own words, copied from its pages and checked live on TERMS_CHECKED_ON, the same way as
// docs/AGE_TERMS_CHECK.md. Not legal advice. Terms change: re-read a page before relying on a quote later.
export const TERMS_CHECKED_ON = '2026-10-27';

export const ANTHROPIC_TERMS = {
  noTraining: {
    quote: 'Anthropic may not train models on Customer Content from Services.',
    where: 'Commercial Terms, section B (effective Jun 17, 2025)',
    href: 'https://www.anthropic.com/legal/commercial-terms',
  },
  retention: {
    quote: 'we automatically delete inputs and outputs on our backend within 30 days of receipt or generation',
    where: 'Anthropic privacy centre, "How long do you store my organization\'s data?" (page dated July 1, 2026)',
    href: 'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data',
    exceptions:
      'Anthropic says inputs and outputs flagged for a Usage Policy violation can be kept for up to 2 years, and data can be kept where the law requires it.',
  },
} as const;
