// Everything the privacy notice states (MOM-102), in one place. The notice (components/privacy/PrivacyNotice.tsx) is
// drawn from this file and from nothing else, and tests/privacy-sync.test.ts, tests/rebalance-model.test.ts,
// tests/task-plan-ai.test.ts and tests/privacy-notice.test.tsx fail when the code and this file disagree. So a change
// to what is stored, what is sent to Claude or what a provider keeps has to change this file, and with it the notice.
//
// Product-level only: the repo is public, so no tester, household or personal detail belongs here.

// "Ask the operator and it is done within this many days" until a person can delete their own data themselves
// (BACKLOG.md). A promise the operator must keep, so change it here and the notice follows.
export const DELETION_WITHIN_DAYS = 14;

export const NOTICE_CHANGE_LINE = 'If this notice changes, trial members are told before the change applies.';

// ---------------------------------------------------------------------------
// What is stored: every table in supabase/migrations belongs to exactly one group, or to INTERNAL_TABLES.
// ---------------------------------------------------------------------------

export interface StoredGroup {
  id: string;
  // The notice line, in plain words.
  words: string;
  tables: readonly string[];
}

export const STORED_GROUPS: readonly StoredGroup[] = [
  {
    id: 'account',
    words: 'Your account: your email address and a scrambled form of your password.',
    tables: ['users'],
  },
  {
    id: 'settings',
    words:
      'Facts and settings you give it: your time zone, when your day ends, the time you have available, your priorities and how you want things handled.',
    tables: ['person_settings', 'person_day_types', 'person_priorities', 'person_handling_rules'],
  },
  {
    id: 'goals',
    words: 'Your goals and the targets you set under them.',
    tables: ['goals', 'targets', 'goal_channels'],
  },
  {
    id: 'work',
    words: 'Your work items and their steps.',
    tables: ['work_items', 'work_item_steps'],
  },
  {
    id: 'sources',
    words: 'Which sources count toward which target.',
    tables: ['sources', 'target_sources'],
  },
  {
    id: 'entries',
    words: 'Each thing you log (a workout, a timer, a tap, a tick), and anything you hide or fix.',
    tables: ['entries', 'entry_corrections'],
  },
  {
    id: 'snapshots',
    words:
      "A snapshot of each target when a week or period ends, so changing a target later doesn't re-grade the past.",
    tables: ['period_snapshots'],
  },
  {
    id: 'starting_points',
    words:
      'Which setup values you took from a suggestion instead of saying them yourself, so your first weekly review can ask whether they are still right. It holds which value, never what you said.',
    tables: ['starting_points'],
  },
  {
    id: 'weekly_reviews',
    words:
      'A copy of each weekly recap you finish, as it was shown: each target, what crossed that week, and the priorities you named in your own words. It is never rewritten, so a later entry shows beside it in words instead of changing it.',
    tables: ['weekly_reviews'],
  },
  {
    id: 'week_plan',
    words:
      'How you plan your week: which of your steps and habits you put on which day, and which of your kinds of days a date is. You choose both, and you can change or clear either.',
    tables: ['week_plan_picks', 'week_plan_day_types'],
  },
  {
    id: 'plan',
    words: "Your current plan's tasks, and where you have moved them.",
    tables: ['micro_tasks', 'task_rebalance_history'],
  },
  {
    id: 'connections',
    words: 'Which services you have connected, and the key or sign-in token for each, kept on the server.',
    tables: ['connected_apps', 'integration_credentials'],
  },
  {
    id: 'usage',
    words:
      'How many times you have asked Claude for help, and when (a count, with no questions or answers). These counts are kept until your account is deleted.',
    tables: ['llm_usage_logs'],
  },
];

// Tables that hold no personal data and so need no line in the notice. Empty today: every table holds something
// about a person. Add a name here only with a comment saying why it holds nothing about anyone.
export const INTERNAL_TABLES: readonly string[] = [];

// ---------------------------------------------------------------------------
// What is sent to Claude. `field` is a path into the facts object a prompt is built from; the tests compare the
// list with what the code really sends, and the notice prints `words`.
// ---------------------------------------------------------------------------

export interface FieldWords {
  field: string;
  words: string;
}

export interface PromptNotice {
  title: string;
  sends: readonly FieldWords[];
  // What a reader might expect to be sent and is not, as a phrase after "Not".
  leavesOut: string | null;
  // A sentence of advice after the list, or null.
  note: string | null;
}

export const PROMPTS = {
  rebalance: {
    title: 'Rebalancing a plan',
    sends: [
      { field: 'currentWeek', words: 'which week you are in' },
      { field: 'planWeeks', words: 'how many weeks the plan has' },
      { field: 'today', words: "today's date" },
      { field: 'weeks.week', words: "each week's number" },
      { field: 'weeks.finished', words: 'how many tasks you finished in it' },
      { field: 'weeks.unfinished', words: 'how many are still unfinished' },
      { field: 'tasks.id', words: "each unfinished task's id" },
      { field: 'tasks.week', words: 'its week' },
      { field: 'tasks.type', words: 'its type' },
      { field: 'tasks.dueDate', words: 'its due date' },
    ],
    leavesOut: 'task titles, minutes or scores',
    note: null,
  },
  weekPlan: {
    title: 'Writing a first-week plan',
    sends: [
      { field: 'title', words: 'the title of your goal, as you typed it' },
      { field: 'goalType', words: 'the goal type you picked' },
      { field: 'constraints.key', words: 'the constraints you picked' },
      { field: 'constraints.label', words: 'the constraints you picked' },
      { field: 'pace.key', words: 'the pace you chose' },
      { field: 'pace.label', words: 'the pace you chose' },
      { field: 'reviewQuestions.key', words: 'the review questions you chose' },
      { field: 'reviewQuestions.label', words: 'the review questions you chose' },
    ],
    leavesOut: null,
    note: 'Anything you type there goes to Anthropic, so leave out anything you would not want them to receive.',
  },
  // Guided setup (MOM-111 block 3): field by field, against what lib/ai/setup.ts's setupPromptFacts() really sends
  // (tests/setup-prompt-fields.test.ts). Every field here is part of the conversation itself: there was nothing to
  // leave out beyond what is already excluded (no ids, no email, no other saved goal or task).
  setup: {
    title: 'Guided setup',
    sends: [
      { field: 'personMessages', words: "what you've typed in the setup so far" },
      { field: 'assistantTurns.kind', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.chunk', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.skipped.topic', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.skipped.line', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.say', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.question', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.topic', words: 'its own earlier turns in this setup' },
      { field: 'assistantTurns.options', words: 'its own earlier turns in this setup' },
      {
        field: 'draft.model.person.timeZone',
        words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)",
      },
      { field: 'draft.model.person.dayEnd', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.weekStart', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.dayTypes.name', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.dayTypes.capacityUnit', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.dayTypes.capacityAmount', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.priorities', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.planning.weekday', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.person.planning.time', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.tone', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.reminders', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.checkIns', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.celebrations', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.balanceMentions', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.reviewDepth', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.reviewPlanning', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.settings.quietTimes', words: "the facts and settings you've given so far (time zone, day end, week start, day types, priorities, planning time, and how you want things handled)" },
      { field: 'draft.model.goals.key', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.title', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.why', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.startDate', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.shape', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.endDate', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.blockWeeks', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.state', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.returnWhen.kind', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.returnWhen.date', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.returnWhen.note', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.completionMode', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.tone', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.key', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.title', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.measure', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.unit', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.role', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.period.kind', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.period.dueDate', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.period.weekdays', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.floor', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.aspiration', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.qualifyingThreshold', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.carryOver', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.completionMode', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.tone', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.sources.kind', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.sources.provider', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.targets.sources.metric', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.key', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.kind', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.title', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.targetKey', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.dueDate', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.dateCanMove', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.estimateMinutes', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.model.goals.items.steps', words: "the goals, targets and work items you've described so far, including where each target is tracked" },
      { field: 'draft.said.path', words: "which answers you've already given and approved" },
      { field: 'draft.said.turn', words: "which answers you've already given and approved" },
      { field: 'draft.said.how', words: "which answers you've already given and approved" },
      { field: 'draft.approved', words: "which answers you've already given and approved" },
      { field: 'draft.plain.path', words: "Claude's tidied-up wording of what you've said, for you to approve" },
      { field: 'draft.plain.text', words: "Claude's tidied-up wording of what you've said, for you to approve" },
      { field: 'today', words: "today's date on your device, as a suggested start date" },
      // MOM-111: two notes written by code, never anything new from the person: why its last try at a turn was not used, in
      // fixed words, and the date a day you named ("Monday") works out to.
      { field: 'retryFeedback', words: 'when its last try at a reply was not usable, which setup rule it broke' },
      { field: 'dateHint', words: 'the date a day you named (like "Monday") works out to' },
    ],
    leavesOut: 'other saved goals or tasks, their ids, or your email',
    note: null,
  },
} as const satisfies Record<string, PromptNotice>;

export const NEVER_SENT = "your email, your passwords or tokens, other people's data, or workout and calendar details";

// ---------------------------------------------------------------------------
// What is kept from each connected service: the fields of the activity the adapter produces
// (lib/adapters/*.ts, the InboundActivityPayload), by path. Keyed by the provider ids in lib/integrations/catalog.ts.
// ---------------------------------------------------------------------------

export interface ProviderNotice {
  name: string;
  // The thing one record is called in the notice.
  record: string;
  stores: readonly FieldWords[];
  leavesOut: string;
}

export const PROVIDER_NOTICES = {
  hevy: {
    name: 'Hevy (workouts)',
    record: 'workout',
    stores: [
      { field: 'externalId', words: 'its id in Hevy' },
      { field: 'provider', words: 'which service and goal it counts toward' },
      { field: 'targetGoalChannel', words: 'which service and goal it counts toward' },
      { field: 'activityType', words: 'which service and goal it counts toward' },
      { field: 'title', words: 'its name' },
      { field: 'timestamp', words: 'when it ended' },
      { field: 'durationMinutes', words: 'how long it lasted' },
      { field: 'metrics.volumeLbs', words: 'the total weight lifted' },
      { field: 'metrics.setsCompleted', words: 'the number of sets, warm-up sets and exercises' },
      { field: 'metrics.metadata.exerciseCount', words: 'the number of sets, warm-up sets and exercises' },
      { field: 'metrics.metadata.warmupSets', words: 'the number of sets, warm-up sets and exercises' },
    ],
    leavesOut: 'exercise names, individual sets, notes or body measurements',
  },
  google_calendar: {
    name: 'Google Calendar',
    record: 'timed event',
    stores: [
      { field: 'externalId', words: 'its id in Google' },
      { field: 'provider', words: 'which service and goal it counts toward' },
      { field: 'targetGoalChannel', words: 'which service and goal it counts toward' },
      { field: 'activityType', words: 'which service and goal it counts toward' },
      { field: 'title', words: 'a fixed label, "Calendar event", in place of its real title' },
      { field: 'timestamp', words: 'when it ended' },
      { field: 'durationMinutes', words: 'how long it lasted' },
      { field: 'metrics.eventCompleted', words: 'whether it has happened (it is over and was not cancelled)' },
    ],
    leavesOut: 'the real title, guests, description or place',
  },
} as const satisfies Record<string, ProviderNotice>;

export const GOOGLE_TESTING_LINE =
  "While Momentum's Google access is in the provider's testing mode, it expires about every week and you will need to connect again.";

// ---------------------------------------------------------------------------
// Other services that handle data for Momentum. Keyed by id.
// ---------------------------------------------------------------------------

export const SERVICES = {
  vercel: { name: 'Vercel', does: 'hosting' },
  supabase: { name: 'Supabase', does: 'database and sign-in email' },
  turnstile: {
    name: 'Cloudflare Turnstile',
    does: 'checks sign-up, sign-in and password-reset requests for bots, and sees details of your browser and network connection',
  },
} as const satisfies Record<string, { name: string; does: string }>;

// Sign-up bot checks the code can run (NEXT_PUBLIC_CAPTCHA_PROVIDER in lib/config/env.ts) that are not in use, and
// so have no line in the notice. A provider in the code that is in neither SERVICES nor here fails a test.
export const UNUSED_CAPTCHA_OPTIONS: readonly string[] = ['hcaptcha'];

// ---------------------------------------------------------------------------
// What is kept on the person's own device.
// ---------------------------------------------------------------------------

export const DEVICE_STORAGE = {
  now: [
    'a cookie that keeps you signed in',
    'which rebalance reminders you have dismissed, kept only until you close the tab',
    "a running timer's start time, kept in this browser until you stop it",
    'a setup conversation in progress, kept in this browser tab until you save it or close the tab',
  ],
  // The only source files allowed to use browser storage (localStorage, sessionStorage, indexedDB, document.cookie).
  // A file not listed here that uses it fails tests/privacy-sync.test.ts until it is listed and described above.
  filesUsingBrowserStorage: ['components/entries/timerStorage.ts', 'components/layout/RebalanceNudge.tsx', 'components/setup/setupStorage.ts'],
} as const;

// ---------------------------------------------------------------------------
// Anthropic's own words, copied from its pages and checked live on TERMS_CHECKED_ON, the same way as
// docs/AGE_TERMS_CHECK.md. Not legal advice. Terms change: re-read a page before relying on a quote later.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers shared by the notice and the tests.
// ---------------------------------------------------------------------------

// The distinct phrases, in order, joined as "a, b and c".
export function joinWords(items: readonly FieldWords[]): string {
  const phrases = [...new Set(items.map((item) => item.words))];
  if (phrases.length <= 1) return phrases.join('');
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

export const fieldList = (items: readonly FieldWords[]): string[] => items.map((item) => item.field).sort();
