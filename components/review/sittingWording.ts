// The fixed words of the review's sitting that are not about one adjustment (MOM-113 block 3.3). Templates in code, plain
// language (docs/DOMAIN_MODEL.md §2.1, which applies to the review's cards too): what it is, what it is for, and that it asks
// for nothing.

export const LINE_HEADING = 'A one-line look back';
export const LINE_HELP = "Optional. Claude writes one plain sentence about your week. It asks nothing of you and isn't saved.";
export const LINE_BUTTON = 'Get a one-line look back from Claude';
export const ASKING_CLAUDE = 'Asking Claude…';
export const LINE_FAILED = 'Claude could not be reached just now. Your review goes on without it.';

// Who wrote the line shown: Claude, or Momentum when Claude's reply did not pass the checks twice.
export const LINE_SOURCE = {
  claude: 'From Claude.',
  fallback: "From Momentum. Claude's line didn't pass our checks, so this one is plain.",
} as const;

export const FINISH_BUTTON = 'Finish review';
export const FINISHING = 'Saving…';
export const FINISH_HINT = 'Choose one of the three above to finish.';

// After a finished review (docs/DOMAIN_MODEL.md §3, §4.1 "Review and planning"): planning follows in the same sitting by
// default, or is left for the person to open when they have chosen to plan separately. A link only; the plan is its own page.
export const PLAN_HEADING = 'Plan your week';
export const PLAN_NEXT = "Your review is done. Next, choose what you'll do on which days.";
export const PLAN_LINK = 'Plan your week';
export const PLAN_SEPARATE = "You chose to plan your week separately, so it's there when you want it.";
export const PLAN_SEPARATE_LINK = 'Open your week plan';
