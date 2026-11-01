// Every word on the screens for adding a goal or a target after first setup (MOM-132 part 2), in one place. These are the owner's words,
// approved on 2026-11-01 and written into MOM-132's Jira comment on 2026-11-02; tests/setup-add-words.test.ts pins them. A date is
// filled in by the caller in the one casual way (lib/dates/casual.ts), never as YYYY-MM-DD.

export const ADD_WORDS = {
  // Home, and /setup's title for a person who has finished setup.
  homeLink: 'Add to your goals',
  pageTitle: 'Add to your goals',

  // The chooser that replaces "Setup is already done".
  chooseLead: 'What would you like to add?',
  chooseDetail: "Nothing you've already set up changes. Nothing is saved until you check it.",
  newGoal: 'A new goal',
  newTarget: 'A target for a goal I already have',
  backHome: 'Back to home',
  // Said when the person has no active goal to put a target on, in place of the second button.
  noActiveGoal: 'You have no active goal to add a target to.',

  // Which goal.
  whichLead: 'Which goal is it for?',
  whichDetail: 'Pick one. You can add to another goal after.',

  // The title of the "planning" playback in an addition. In a first setup that part is "Your days and weeks", but here it holds only the new
  // work items and where each new target is tracked, and nothing about the person's days. NOT in the owner's approved list of 2026-11-01:
  // flagged at the screenshot review.
  planningTitle: "How you'll track it",

  // The card before the conversation, in returning mode. The body is first setup's own intro, word for word.
  introHeading: "Let's add to your goals",

  // The start question for a target.
  startLead: 'When should this target start counting?',
  startDetail: (goal: string, date: string): string => `Weeks before this date won't count for it. Your goal "${goal}" keeps its own start of ${date}.`,
  partWay: "If that's partway through a week, that first week is shown but never counted as a miss.",
  startToday: (date: string): string => `Start today, ${date}?`,
  yesToday: 'Yes, start today',
  nextWeek: (date: string): string => `Start next week, ${date}`,
  pickAnother: 'Pick another date',
  tooEarly: (date: string): string => `That's before your goal started on ${date}. Pick a day on or after it.`,
  tooLate: (date: string): string => `That's after your goal ends on ${date}. Pick a day on or before it.`,

  // The final cards.
  goalHeading: 'Add this goal?',
  goalDetail: "Your other goals and everything you've logged stay exactly as they are.",
  targetHeading: (goal: string): string => `Add this target to "${goal}"?`,
  targetDetail: (date: string): string => `It starts counting on ${date}. Weeks before that aren't counted. Everything else on this goal stays as it is.`,
  add: 'Add it',
  adding: 'Adding…',
  change: 'Change something',

  // Saved.
  added: 'Added.',
  addedTarget: (goal: string, date: string): string => `Added to "${goal}". It starts counting on ${date}.`,
  addedDetail: "Nothing you'd already saved changed.",

  // A save that never reached the server.
  noNetwork: "Couldn't connect. Nothing was added yet. Check your connection, then try again.",
} as const;

// The words of the quick-path card when it finishes an addition (the card that shows when Claude can no longer be used). The button and the
// ready heading are the owner's (2026-11-02): "Add it" and "Here's what will be added". The "almost done" line is not in the approved list: it
// is first setup's line with "your setup is saved" said as what is true here. Flagged for the owner.
export const ADD_QUICK_WORDS = {
  save: ADD_WORDS.add,
  saving: ADD_WORDS.adding,
  readyTop: "Here's what will be added",
  topLine: (steps: number): string => `Almost done: ${steps} quick ${steps === 1 ? 'step' : 'steps'} and it is ready to add`,
} as const;
