// The blank draft setup starts from. Every person fact and setting is null: nothing is chosen for the person
// (docs/DOMAIN_MODEL.md §4.2 principle 1). Pure.

import type { SetupDraft } from '@/types/setup';

export function emptyDraft(): SetupDraft {
  return {
    model: {
      person: {
        timeZone: null,
        dayEnd: null,
        weekStart: null,
        dayTypes: [],
        priorities: [],
        planning: { weekday: null, time: null },
      },
      settings: {
        tone: null,
        reminders: null,
        checkIns: null,
        celebrations: null,
        balanceMentions: null,
        reviewDepth: null,
        reviewPlanning: null,
        quietTimes: null,
      },
      goals: [],
    },
    said: [],
    approved: [],
    plain: [],
  };
}
