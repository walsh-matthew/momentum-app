// The setup draft validator and the draft-to-rows mapping (MOM-111): valid and invalid drafts. The valid drafts are the
// finished drafts of the eval cases, so these tests also show that what the evals approve is what could be saved.

import { describe, expect, it } from 'vitest';
import { runSetupEval } from '@/lib/setup/evals';
import { draftToRows } from '@/lib/setup/rows';
import { validateDraft, isTimeZone } from '@/lib/setup/validate';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { SETUP_CHUNKS, type SetupDraft, type Transcript } from '@/types/setup';
import { goalOf, scriptedModel, targetOf } from './helpers/setupScript';
import { SETUP_CASES } from './setup-evals/cases';

async function finished(id: string): Promise<{ draft: SetupDraft; transcript: Transcript }> {
  const c = SETUP_CASES.find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const report = await runSetupEval(c, scriptedModel(c.script));
  if (!report.finished) throw new Error(`${id} did not finish`);
  return { draft: structuredClone(report.draft), transcript: structuredClone(report.transcript) };
}

const issuesOf = (draft: SetupDraft, transcript: Transcript, mode: 'progress' | 'final' = 'final') =>
  validateDraft(draft, transcript, mode).issues;
const paths = (draft: SetupDraft, transcript: Transcript, mode: 'progress' | 'final' = 'final') =>
  issuesOf(draft, transcript, mode).map((i) => i.path);

describe('a finished draft', () => {
  it.each(['run-a-deadline-only', 'run-b-habit-ideas', 'run-g-relative-deadline', 'run-h-two-activities'])(
    '%s passes the final validation',
    async (id) => {
      const { draft, transcript } = await finished(id);
      expect(issuesOf(draft, transcript)).toEqual([]);
    },
  );

  it('passes the progress validation too', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    expect(issuesOf(draft, transcript, 'progress')).toEqual([]);
  });
});

describe('a deadline task must say whether its date can move', () => {
  it('fails without the answer, in both modes', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    goalOf(draft.model, 'g1').items[0].dateCanMove = null;
    for (const mode of ['progress', 'final'] as const) {
      const issues = issuesOf(draft, transcript, mode);
      expect(issues.map((i) => i.path)).toContain('goals.g1.items.i1.dateCanMove');
      expect(issues.find((i) => i.path === 'goals.g1.items.i1.dateCanMove')?.message).toMatch(/Can the date move/);
    }
  });

  it('fails when the answer was not the person\'s answer to its own question', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    // Point the answer at the message that gave the date, which is not a reply to "Can that date move?".
    const entry = draft.said.find((s) => s.path === 'goals.g1.items.i1.dateCanMove');
    const dateEntry = draft.said.find((s) => s.path === 'goals.g1.items.i1.dueDate');
    entry!.turn = dateEntry!.turn;
    expect(paths(draft, transcript)).toContain('goals.g1.items.i1.dateCanMove');
  });

  it('fails when a deadline task has no date, or another kind of item has one', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    const item = goalOf(draft.model, 'g1').items[0];
    item.dueDate = null;
    expect(paths(draft, transcript)).toContain('goals.g1.items.i1.dueDate');
    item.dueDate = '2027-06-14';
    item.kind = 'milestone';
    expect(paths(draft, transcript)).toEqual(expect.arrayContaining(['goals.g1.items.i1.dueDate', 'goals.g1.items.i1.dateCanMove']));
  });
});

describe('the ordering rule: a saved target needs the person\'s time anchors', () => {
  it('asks for the time zone and the day end before a target is saved', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    draft.model.person.timeZone = null;
    draft.model.person.dayEnd = null;
    draft.said = draft.said.filter((s) => s.path !== 'person.dayEnd');
    expect(paths(draft, transcript)).toEqual(expect.arrayContaining(['person.timeZone', 'person.dayEnd']));
    // While the conversation is still going, targets may come before step 10.
    expect(paths(draft, transcript, 'progress')).toEqual([]);
  });

  it('asks for the week start only when a weekly or day-slot target needs it', async () => {
    const weekly = await finished('run-b-habit-ideas');
    weekly.draft.model.person.weekStart = null;
    weekly.draft.said = weekly.draft.said.filter((s) => s.path !== 'person.weekStart');
    expect(paths(weekly.draft, weekly.transcript)).toContain('person.weekStart');

    // A person whose goals are all deadline goals is never asked (MOM-125).
    const deadline = await finished('run-a-deadline-only');
    expect(deadline.draft.model.person.weekStart).toBeNull();
    expect(paths(deadline.draft, deadline.transcript)).not.toContain('person.weekStart');
  });

  it('needs every part played back and approved', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    draft.approved = draft.approved.filter((c) => c !== 'planning');
    expect(paths(draft, transcript)).toContain('approved.planning');
    expect(SETUP_CHUNKS).toHaveLength(4);
  });
});

describe('every number, date, time and weekday must be the person\'s', () => {
  it('fails a number the person never said', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    targetOf(draft.model, 'g1', 't1').floor = 99;
    const issue = issuesOf(draft, transcript).find((i) => i.path === 'goals.g1.targets.t1.floor');
    expect(issue?.message).toMatch(/does not say 99/);
  });

  it('fails a date nobody gave, such as one worked out from "the week before"', async () => {
    const { draft, transcript } = await finished('run-g-relative-deadline');
    goalOf(draft.model, 'g1').endDate = '2027-05-29';
    expect(paths(draft, transcript)).toContain('goals.g1.endDate');
  });

  it('fails a value with no source at all', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    draft.said = draft.said.filter((s) => s.path !== 'goals.g1.targets.t1.floor');
    expect(issuesOf(draft, transcript).find((i) => i.path === 'goals.g1.targets.t1.floor')?.message).toMatch(/no source/);
  });

  it('accepts a value from a suggestion the person accepted, and rejects it when they did not', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    expect(issuesOf(draft, transcript)).toEqual([]);
    const entry = draft.said.find((s) => s.path === 'goals.g1.targets.t1.floor')!;
    expect(entry.how).toBe('accepted');
    const reply = transcript[entry.turn];
    if (reply.role !== 'person') throw new Error('expected a person message');
    reply.text = 'No, not those.';
    expect(issuesOf(draft, transcript).find((i) => i.path === 'goals.g1.targets.t1.floor')?.message).toMatch(/did not accept/);
  });

  it('rejects an accepted value that the suggestion never contained', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    targetOf(draft.model, 'g1', 't1').floor = 7;
    expect(issuesOf(draft, transcript).find((i) => i.path === 'goals.g1.targets.t1.floor')?.message).toMatch(/does not contain 7/);
  });

  it('reads hours as minutes for a time target, and nothing else', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    const t = targetOf(draft.model, 'g1', 't1');
    t.measure = 'time';
    t.unit = null;
    t.floor = 720; // "Twelve blocks" is not twelve hours
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.floor');
  });

  it('fails a day or time word in the person\'s own words that they never said', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    goalOf(draft.model, 'g1').title = 'Evening sewing';
    expect(issuesOf(draft, transcript).find((i) => i.path === 'goals.g1.title')?.message).toMatch(/evening/);
  });
});

describe('the rules of migration 013 that a draft can break', () => {
  it('needs a unit for a quantity and none for anything else', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    const t = targetOf(draft.model, 'g1', 't1');
    t.unit = null;
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.unit');
    t.unit = 'blocks';
    t.measure = 'count';
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.unit');
  });

  it('needs a floor for an effort target and a floor beneath an aspiration', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    const t = targetOf(draft.model, 'g1', 't1');
    t.aspiration = 20;
    t.floor = 30;
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.aspiration');
    t.floor = null;
    expect(paths(draft, transcript)).toEqual(expect.arrayContaining(['goals.g1.targets.t1.floor', 'goals.g1.targets.t1.aspiration']));
  });

  it('keeps an owed shortfall to a deadline, each named day once, and a habit to a repeating target', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    const t = targetOf(draft.model, 'g1', 't1');
    t.carryOver = 'cumulative';
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.carryOver');
    t.carryOver = 'habit';
    t.period = { kind: 'day_slots', weekdays: [1, 3, 3] };
    expect(paths(draft, transcript)).toContain('goals.g1.targets.t1.period');
    t.period = { kind: 'deadline', dueDate: '2027-01-01' };
    expect(paths(draft, transcript)).toContain('goals.g1.items.i1.targetKey');
  });

  it('gives a habit no steps and a target of its own', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    const item = goalOf(draft.model, 'g1').items[0];
    item.steps = ['one'];
    expect(paths(draft, transcript)).toContain('goals.g1.items.i1.steps');
    item.steps = [];
    item.targetKey = null;
    expect(paths(draft, transcript)).toContain('goals.g1.items.i1.targetKey');
  });

  it('matches the end date to the goal\'s shape', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    const g = goalOf(draft.model, 'g1');
    g.endDate = '2027-01-01';
    draft.said.push({ path: 'goals.g1.endDate', turn: 1, how: 'said' });
    expect(paths(draft, transcript)).toContain('goals.g1.endDate');
    g.endDate = null;
    g.shape = 'finite';
    expect(paths(draft, transcript)).toContain('goals.g1.endDate');
    g.shape = 'project';
    expect(paths(draft, transcript)).toContain('goals.g1.blockWeeks');
  });

  it('gives a parked goal a way back and an active goal none', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const parked = goalOf(draft.model, 'g2');
    expect(parked.returnWhen).toEqual({ kind: 'condition', note: 'in the spring' });
    parked.returnWhen = null;
    expect(paths(draft, transcript)).toContain('goals.g2.returnWhen');
    goalOf(draft.model, 'g1').returnWhen = { kind: 'on_request' };
    expect(paths(draft, transcript)).toContain('goals.g1.returnWhen');
  });

  it('takes a season or condition in the person\'s words, not only a date', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    expect(issuesOf(draft, transcript)).toEqual([]);
    goalOf(draft.model, 'g2').returnWhen = { kind: 'condition', note: 'on Saturdays' };
    expect(paths(draft, transcript)).toContain('goals.g2.returnNote');
  });

  it('needs a real time zone, distinct day types, and a capacity as an amount with its unit', async () => {
    const { draft, transcript } = await finished('run-b-habit-ideas');
    draft.model.person.timeZone = 'Mars/Olympus';
    expect(paths(draft, transcript)).toContain('person.timeZone');
    expect(isTimeZone('America/Chicago')).toBe(true);
    expect(isTimeZone('Mars/Olympus')).toBe(false);
    draft.model.person.timeZone = 'America/Denver';
    draft.model.person.dayTypes = [
      { name: 'Work', capacityUnit: null, capacityAmount: null },
      { name: 'work', capacityUnit: 'hours', capacityAmount: null },
    ];
    expect(paths(draft, transcript)).toEqual(expect.arrayContaining(['person.dayTypes.work']));
  });
});

describe('a parked goal needs no shape or start date (migration 014, MOM-128)', () => {
  it('passes the final validation with neither, with the shape only, or with the start date only', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const g2 = goalOf(draft.model, 'g2');
    const { shape, startDate } = g2;
    // The eval fixture still asks a parked goal for both (BACKLOG), so it has them to take away.
    expect(g2.state).toBe('parked');
    expect(shape).not.toBeNull();
    expect(startDate).not.toBeNull();
    for (const [s, d] of [[null, null], [shape, null], [null, startDate]] as const) {
      g2.shape = s;
      g2.startDate = d;
      expect(issuesOf(draft, transcript)).toEqual([]);
    }
  });

  it('maps a parked goal with neither onto a row with a null shape and start date, and an active goal still has both', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const g2 = goalOf(draft.model, 'g2');
    g2.shape = null;
    g2.startDate = null;
    const result = draftToRows(draft, transcript);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.rows.goals[1].row).toMatchObject({ state: 'parked', shape: null, start_date: null, return_kind: 'condition', return_note: 'in the spring' });
    expect(result.rows.goals[0].row.shape).not.toBeNull();
    expect(result.rows.goals[0].row.start_date).not.toBeNull();
  });

  it('still needs both for an active goal, and refuses to save without them', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const g1 = goalOf(draft.model, 'g1');
    const { shape, startDate } = g1;
    g1.startDate = null;
    expect(paths(draft, transcript)).toContain('goals.g1.startDate');
    expect(draftToRows(draft, transcript).ok).toBe(false);
    g1.startDate = startDate;
    g1.shape = null;
    g1.blockWeeks = null;
    expect(paths(draft, transcript)).toContain('goals.g1.shape');
    const refused = draftToRows(draft, transcript);
    expect(refused.ok).toBe(false);
    g1.shape = shape;
  });

  it('gives a goal with no shape no end date and no first block, as the database does', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const g2 = goalOf(draft.model, 'g2');
    g2.shape = null;
    g2.endDate = '2027-01-01';
    expect(paths(draft, transcript)).toContain('goals.g2.endDate');
    g2.endDate = null;
    g2.blockWeeks = 10;
    expect(paths(draft, transcript)).toContain('goals.g2.blockWeeks');
  });

  it('does not ask an active goal for them while setup is still in progress', async () => {
    const { draft, transcript } = await finished('run-h-two-activities');
    const g1 = goalOf(draft.model, 'g1');
    g1.shape = null;
    g1.startDate = null;
    g1.blockWeeks = null;
    const found = paths(draft, transcript, 'progress');
    expect(found).not.toContain('goals.g1.shape');
    expect(found).not.toContain('goals.g1.startDate');
  });
});

describe('the shape of a draft', () => {
  it('rejects a key the model does not have, such as a score', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    (draft.model.goals[0] as Record<string, unknown>).score = 80;
    expect(validateDraft(draft, transcript, 'progress').ok).toBe(false);
  });

  it('rejects something that is not a draft at all', () => {
    const result = validateDraft({ model: 1 }, [], 'progress');
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('draftToRows', () => {
  it('maps a finished deadline draft onto the rows of migration 013', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    const result = draftToRows(draft, transcript);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { rows } = result;
    expect(rows.personSettings).toMatchObject({ time_zone: 'America/Chicago', day_end: '21:00:00', week_start: null, tone: 'gentle' });
    expect(rows.goals).toHaveLength(1);
    expect(rows.goals[0].row).toMatchObject({
      title: 'Finish the quilt',
      start_date: '2026-10-27',
      shape: 'project',
      end_date: '2027-06-14',
      state: 'active',
      return_kind: null,
    });
    expect(rows.targets[0].row).toMatchObject({
      measure: 'quantity',
      unit: 'blocks',
      period_kind: 'deadline',
      due_date: '2027-06-14',
      slot_weekdays: null,
      floor: 12,
      carry_over_kind: 'cumulative',
    });
    expect(rows.workItems[0].row).toMatchObject({ kind: 'deadline_task', due_date: '2027-06-14', date_can_move: false });
    expect(rows.targetSources).toEqual([{ goalKey: 'g1', targetKey: 't1', source: { kind: 'manual' } }]);
  });

  it('maps a weekly habit, a parked goal and a person\'s week start', async () => {
    const habit = await draftToRows(...(await finishedArgs('run-h-two-activities')));
    if (!habit.ok) throw new Error(JSON.stringify(habit.issues));
    expect(habit.rows.personSettings.week_start).toBe(1);
    expect(habit.rows.targets[0].row).toMatchObject({ period_kind: 'weekly', due_date: null, floor: 2, carry_over_kind: 'habit' });
    expect(habit.rows.goals.map((g) => g.row.state)).toEqual(['active', 'parked']);
    expect(habit.rows.goals[1].row).toMatchObject({ return_kind: 'condition', return_note: 'in the spring', return_date: null });
    expect(habit.rows.workItems[0]).toMatchObject({ goalKey: 'g1', targetKey: 't1' });
  });

  it('refuses a draft that does not pass, and returns the reasons', async () => {
    const { draft, transcript } = await finished('run-a-deadline-only');
    goalOf(draft.model, 'g1').items[0].dateCanMove = null;
    const result = draftToRows(draft, transcript);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.path)).toContain('goals.g1.items.i1.dateCanMove');
  });
});

async function finishedArgs(id: string): Promise<[SetupDraft, Transcript]> {
  const f = await finished(id);
  return [f.draft, f.transcript];
}

describe('playback is rendered from the draft', () => {
  it('renders only what is set, in plain words and the second person, for each part', async () => {
    const { draft } = await finished('run-b-habit-ideas');
    const lines = (c: (typeof SETUP_CHUNKS)[number]) => renderPlayback(draft.model, c).join('\n');
    expect(lines('goals')).toBe('Goal: Run more, because it clears your head.');
    expect(lines('targets')).toContain('Sessions: at least 3 each week.');
    expect(lines('planning')).toContain('Your day ends at 21:00, the time you check in; your day still runs from midnight to midnight.');
    expect(lines('planning')).toContain('Your week starts on Monday.');
    expect(lines('talk')).toContain('Momentum talks to you gently.');
  });

  it('keeps the final confirmation to a few lines however many goals there are', async () => {
    const { draft } = await finished('run-h-two-activities');
    expect(renderFinal(draft.model).length).toBeLessThanOrEqual(6);
    const many = structuredClone(draft.model);
    for (let i = 3; i < 12; i++) many.goals.push({ ...structuredClone(many.goals[0]), key: `g${i}` });
    expect(renderFinal(many).length).toBeLessThanOrEqual(6);
  });
});
