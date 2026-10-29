// Ways of looking into a SetupModel that several checks share (MOM-111): which values must have come from the person,
// which free text to scan, what each approved part of the draft holds, and which topics the draft already answers.
// Paths use keys, not positions, so a reordered list does not change what a path means. Pure.

import type { Provenance, SetupChunk, SetupDraft, SetupModel, SetupTopic } from '@/types/setup';

// number: a plain amount. minutes: an amount the person may have said in hours or minutes. date, time, weekday: as named.
// flag: a yes/no the person answered (whether a deadline date can move).
export type LeafKind = 'number' | 'minutes' | 'date' | 'time' | 'weekday' | 'weekdays' | 'flag';

export interface Leaf {
  path: string;
  kind: LeafKind;
  value: number | string | boolean | number[];
}

// The forms a provenance path takes, written out for the setup prompt (MOM-128): the model must name each value it records
// in `said` by exactly these paths, and nothing else tells it how. <goalKey>, <targetKey> and <itemKey> are the "key" the
// model gave that goal, target or work item; <name> is a day type's name in lowercase. tests/setup-prompt-schema.test.ts
// checks that every path provenanceLeaves() produces matches one of them, so adding a leaf below without adding its form
// here fails a test.
export const PROVENANCE_PATH_FORMS: readonly string[] = [
  'person.dayEnd',
  'person.weekStart',
  'person.planning.weekday',
  'person.planning.time',
  'person.dayTypes.<name>.capacityAmount',
  'goals.<goalKey>.startDate',
  'goals.<goalKey>.endDate',
  'goals.<goalKey>.blockWeeks',
  'goals.<goalKey>.returnDate',
  'goals.<goalKey>.targets.<targetKey>.floor',
  'goals.<goalKey>.targets.<targetKey>.aspiration',
  'goals.<goalKey>.targets.<targetKey>.qualifyingThreshold',
  'goals.<goalKey>.targets.<targetKey>.dueDate',
  'goals.<goalKey>.targets.<targetKey>.slotWeekdays',
  'goals.<goalKey>.items.<itemKey>.dueDate',
  'goals.<goalKey>.items.<itemKey>.dateCanMove',
  'goals.<goalKey>.items.<itemKey>.estimateMinutes',
];

// Every value in the model that must have come from the person: numbers, dates, clock times, weekdays and yes/no
// answers. Null values are not leaves: nothing was assumed.
export function provenanceLeaves(model: SetupModel): Leaf[] {
  const out: Leaf[] = [];
  const add = (path: string, kind: LeafKind, value: Leaf['value'] | null) => {
    if (value !== null) out.push({ path, kind, value });
  };
  const { person } = model;
  add('person.dayEnd', 'time', person.dayEnd);
  add('person.weekStart', 'weekday', person.weekStart);
  add('person.planning.weekday', 'weekday', person.planning.weekday);
  add('person.planning.time', 'time', person.planning.time);
  for (const d of person.dayTypes) add(`person.dayTypes.${d.name.toLowerCase()}.capacityAmount`, 'number', d.capacityAmount);

  for (const g of model.goals) {
    const base = `goals.${g.key}`;
    add(`${base}.startDate`, 'date', g.startDate);
    add(`${base}.endDate`, 'date', g.endDate);
    add(`${base}.blockWeeks`, 'number', g.blockWeeks);
    if (g.returnWhen?.kind === 'date') add(`${base}.returnDate`, 'date', g.returnWhen.date);
    for (const t of g.targets) {
      const tb = `${base}.targets.${t.key}`;
      // A time target's levels are in minutes (entries.value is minutes for time), so "5 hours" is a conversion code checks.
      const levelKind: LeafKind = t.measure === 'time' ? 'minutes' : 'number';
      add(`${tb}.floor`, levelKind, t.floor);
      add(`${tb}.aspiration`, levelKind, t.aspiration);
      add(`${tb}.qualifyingThreshold`, levelKind, t.qualifyingThreshold);
      if (t.period.kind === 'deadline') add(`${tb}.dueDate`, 'date', t.period.dueDate);
      if (t.period.kind === 'day_slots') add(`${tb}.slotWeekdays`, 'weekdays', t.period.weekdays);
    }
    for (const i of g.items) {
      const ib = `${base}.items.${i.key}`;
      add(`${ib}.dueDate`, 'date', i.dueDate);
      add(`${ib}.dateCanMove`, 'flag', i.dateCanMove);
      add(`${ib}.estimateMinutes`, 'minutes', i.estimateMinutes);
    }
  }
  return out;
}

// Where a value came from, when the draft names it more than once: the entry at the highest turn, the first one on a tie.
// The newest answer is the one that counts (rule 7), so a value the person said after accepting a suggestion is theirs.
// The validator and the marks of accepted values (lib/setup/startingPoints.ts) both read it here, so they cannot differ.
export function latestProvenance(said: readonly Provenance[], path: string): Provenance | undefined {
  let latest: Provenance | undefined;
  for (const entry of said) {
    if (entry.path === path && (latest === undefined || entry.turn > latest.turn)) latest = entry;
  }
  return latest;
}

// Every string the person's words end up in, to scan for a day or time word nobody said.
export function freeTextLeaves(model: SetupModel): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const add = (path: string, text: string | null | undefined) => {
    if (text) out.push({ path, text });
  };
  model.person.dayTypes.forEach((d) => add(`person.dayTypes.${d.name.toLowerCase()}.name`, d.name));
  model.person.priorities.forEach((p, i) => add(`person.priorities.${i}`, p));
  model.settings.quietTimes?.forEach((q, i) => add(`settings.quietTimes.${i}`, q));
  for (const g of model.goals) {
    add(`goals.${g.key}.title`, g.title);
    add(`goals.${g.key}.why`, g.why);
    if (g.returnWhen?.kind === 'condition') add(`goals.${g.key}.returnNote`, g.returnWhen.note);
    for (const t of g.targets) {
      add(`goals.${g.key}.targets.${t.key}.title`, t.title);
      add(`goals.${g.key}.targets.${t.key}.unit`, t.unit);
    }
    for (const i of g.items) {
      add(`goals.${g.key}.items.${i.key}.title`, i.title);
      i.steps.forEach((s, n) => add(`goals.${g.key}.items.${i.key}.steps.${n}`, s));
    }
  }
  return out;
}

// The free-text values Claude may give a clean version of (MOM-111 finding 11), as path forms for the setup prompt. A day
// type's name and a target's unit are left out: other values are found by them (a capacity's path, the unit the log shows).
export const PLAIN_PATH_FORMS: readonly string[] = [
  'goals.<goalKey>.title',
  'goals.<goalKey>.why',
  'goals.<goalKey>.returnNote',
  'goals.<goalKey>.targets.<targetKey>.title',
  'goals.<goalKey>.items.<itemKey>.title',
  'goals.<goalKey>.items.<itemKey>.steps.<n>',
  'person.priorities.<n>',
  'settings.quietTimes.<n>',
];

// The model with each listed free-text value replaced by `text(path, value)`, at the paths PLAIN_PATH_FORMS names. Pure:
// returns a copy.
export function withFreeText(model: SetupModel, text: (path: string, value: string) => string): SetupModel {
  const m = structuredClone(model);
  m.person.priorities = m.person.priorities.map((p, i) => text(`person.priorities.${i}`, p));
  if (m.settings.quietTimes) m.settings.quietTimes = m.settings.quietTimes.map((q, i) => text(`settings.quietTimes.${i}`, q));
  for (const g of m.goals) {
    g.title = text(`goals.${g.key}.title`, g.title);
    if (g.why) g.why = text(`goals.${g.key}.why`, g.why);
    if (g.returnWhen?.kind === 'condition') g.returnWhen.note = text(`goals.${g.key}.returnNote`, g.returnWhen.note);
    for (const t of g.targets) t.title = text(`goals.${g.key}.targets.${t.key}.title`, t.title);
    for (const i of g.items) {
      i.title = text(`goals.${g.key}.items.${i.key}.title`, i.title);
      i.steps = i.steps.map((s, n) => text(`goals.${g.key}.items.${i.key}.steps.${n}`, s));
    }
  }
  return m;
}

// The model with every clean version Claude gave put in place, checked or not. A change to one changes what a part showed,
// so the approval check compares parts through this (rule 7).
export const withAllPlain = (draft: SetupDraft): SetupModel => {
  const plain = new Map(draft.plain.map((p) => [p.path, p.text]));
  return withFreeText(draft.model, (path, value) => plain.get(path) ?? value);
};

// What each approved part holds, so a change after approval can be seen and the part played back again (rule 7).
// Steps 1 to 3 are goals; 4 to 7 are priorities, timeframe and targets; 8 to 10 are work items, sources and person
// facts; 11 is settings. The clean versions of the person's words count: they are what the playback showed.
export function chunkSlice(draft: SetupDraft, chunk: SetupChunk): unknown {
  const model = withAllPlain(draft);
  switch (chunk) {
    case 'goals':
      return model.goals.map((g) => ({ key: g.key, title: g.title, why: g.why, state: g.state, returnWhen: g.returnWhen }));
    case 'targets':
      return {
        priorities: model.person.priorities,
        goals: model.goals.map((g) => ({
          key: g.key,
          startDate: g.startDate,
          shape: g.shape,
          endDate: g.endDate,
          blockWeeks: g.blockWeeks,
          completionMode: g.completionMode,
          tone: g.tone,
          targets: g.targets.map(({ sources: _sources, ...rest }) => rest),
        })),
      };
    case 'planning':
      return {
        person: { ...model.person, priorities: undefined },
        goals: model.goals.map((g) => ({
          key: g.key,
          items: g.items,
          sources: g.targets.map((t) => ({ key: t.key, sources: t.sources })),
        })),
      };
    case 'talk':
      return model.settings;
  }
}

// Which topics the draft already answers, so a question about one is a question that should have been skipped (rule 5).
export function answeredTopics(model: SetupModel): Set<SetupTopic> {
  const topics = new Set<SetupTopic>();
  const { person, settings } = model;
  if (person.timeZone) topics.add('time_zone');
  if (person.dayEnd) topics.add('day_end');
  if (person.weekStart !== null) topics.add('week_start');
  if (person.dayTypes.length > 0) topics.add('day_types');
  if (person.dayTypes.some((d) => d.capacityAmount !== null)) topics.add('capacity');
  if (person.priorities.length > 0) topics.add('priorities');
  if (person.planning.weekday !== null || person.planning.time !== null) topics.add('planning_moment');
  if (settings.tone) topics.add('tone');
  if (settings.reminders) topics.add('reminders');
  if (settings.checkIns) topics.add('check_ins');
  if (settings.celebrations) topics.add('celebrations');
  if (settings.quietTimes) topics.add('quiet_times');
  if (settings.balanceMentions) topics.add('balance_mentions');
  if (settings.reviewDepth) topics.add('review_depth');
  if (settings.reviewPlanning) topics.add('review_planning');
  if (model.goals.length > 0) {
    topics.add('idea');
    if (model.goals.some((g) => g.why)) topics.add('why');
  }
  return topics;
}

// Paths of provenance values that existed before and now hold a different value: what this turn changed. A value that
// is new is not a change; it may rest on something the person said earlier. A change is the person's newer answer
// replacing an older one, so it has to rest on their newest message.
export function changedLeafPaths(prev: SetupModel, next: SetupModel): string[] {
  const before = new Map(provenanceLeaves(prev).map((l) => [l.path, JSON.stringify(l.value)]));
  return provenanceLeaves(next)
    .filter((l) => before.has(l.path) && before.get(l.path) !== JSON.stringify(l.value))
    .map((l) => l.path);
}
