// MOM-111, the quick path's recap (lib/setup/quickRecap.ts) and its time zone words (lib/setup/timeZones.ts). One list, by who it
// is about, in everyday words: what the person said is a line, and what they have not said has no line (the card asks it in place
// instead). What these hold the code to, from the owner's review of the card:
// - the floor reads "Even in a hard week: at least 3 workouts a week.", never "Your goal";
// - a thing counted with no number reads "You'll count workouts each week.", never "Counted each week: Workouts";
// - the day end reads "You check in at 9:00 PM.", or, after midnight, says late entries count toward the day before;
// - a time zone reads "London time", never "Europe/London";
// - a part with nothing in it is left out, and "Nothing in this part yet." is never shown;
// - no goal's text is said twice.

import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/setup/draft';
import { DAYS_STEP_ID, goalStepId, recapSections, targetStepId } from '@/lib/setup/quickRecap';
import { zoneCity, zoneWords } from '@/lib/setup/timeZones';
import type { SetupModel } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

const TODAY = '2026-10-30';
const OPTIONS = { today: TODAY, locale: 'en-US' };

function model(over: (m: SetupModel) => void): SetupModel {
  const m = emptyDraft().model;
  over(m);
  return m;
}
const textOf = (sections: ReturnType<typeof recapSections>): string[] => sections.flatMap((s) => s.lines.map((l) => l.text));

describe('what was said, one line each', () => {
  it('the floor reads as the least that would still count, and never as "Your goal"', () => {
    const g = goal('g1', 'Get stronger', { startDate: TODAY, shape: 'ongoing', targets: [target('t1', 'Workouts', { floor: 3, aspiration: 4 })] });
    const lines = textOf(recapSections(model((m) => m.goals.push(g)), OPTIONS));
    expect(lines).toContain('Even in a hard week: at least 3 workouts a week.');
    expect(lines).toContain("You're hoping for 4 workouts a week.");
    expect(lines.join('\n')).not.toMatch(/Your goal/);
  });

  it('a thing counted with no number says what you will count, and never "Counted each week: Workouts"', () => {
    const g = goal('g1', 'Get stronger', { targets: [target('t1', 'Workouts')] });
    const lines = textOf(recapSections(model((m) => m.goals.push(g)), OPTIONS));
    expect(lines).toEqual(["You'll count workouts each week."]);
  });

  it("a goal's timeframe is one sentence with its name, and says nothing while neither the start nor the shape is set", () => {
    const bare = goal('g1', 'Get stronger', { targets: [target('t1', 'Workouts')] });
    expect(textOf(recapSections(model((m) => m.goals.push(bare)), OPTIONS)).join(' ')).not.toMatch(/starts/);
    const ongoing = goal('g1', 'Get stronger', { startDate: TODAY, shape: 'ongoing' });
    expect(textOf(recapSections(model((m) => m.goals.push(ongoing)), OPTIONS))).toEqual(['Get stronger starts Friday, Oct 30 and keeps going.']);
    const finite = goal('g1', 'Get stronger', { startDate: TODAY, shape: 'finite', endDate: '2026-12-15' });
    expect(textOf(recapSections(model((m) => m.goals.push(finite)), OPTIONS))).toEqual(['Get stronger starts Friday, Oct 30 and ends Tuesday, Dec 15.']);
    const startOnly = goal('g1', 'Get stronger', { startDate: TODAY });
    expect(textOf(recapSections(model((m) => m.goals.push(startOnly)), OPTIONS))).toEqual(['Get stronger starts Friday, Oct 30.']);
  });

  it('says where each thing is tracked, in the person\'s own terms', () => {
    const g = goal('g1', 'Get stronger', {
      targets: [target('t1', 'Workouts', { sources: [{ kind: 'manual' }] }), target('t2', 'Lifts', { sources: [{ kind: 'synced', provider: 'hevy', metric: null }] })],
    });
    const lines = textOf(recapSections(model((m) => m.goals.push(g)), OPTIONS));
    expect(lines).toContain('You log workouts yourself.');
    expect(lines).toContain('Hevy counts lifts for you.');
  });

  it('the day end reads as when you check in, or, after midnight, as when late entries count toward the day before', () => {
    const at = (dayEnd: string) => textOf(recapSections(model((m) => { m.person.dayEnd = dayEnd; }), OPTIONS));
    expect(at('21:00')).toEqual(['You check in at 9:00 PM.']);
    expect(at('02:00')).toEqual(['Your day ends at 2:00 AM, so late entries count toward the day before.']);
    expect(at('00:00')).toEqual(['You check in at 12:00 AM.']);
  });

  it('the time zone reads as the city\'s time, and the week start as a day', () => {
    const lines = textOf(recapSections(model((m) => { m.person.timeZone = 'Europe/London'; m.person.weekStart = 1; }), OPTIONS));
    expect(lines).toEqual(["You're on London time.", 'Your week starts on Monday.']);
    expect(lines.join('\n')).not.toContain('Europe/London');
  });

  it('shows a date as the date itself, never as "today", "tomorrow" or "yesterday", whatever day it is in the person\'s time zone', () => {
    const g = goal('g1', 'Get stronger', {
      startDate: '2026-10-30',
      shape: 'finite',
      endDate: '2026-10-31',
      targets: [target('t1', 'Pages', { period: { kind: 'deadline', dueDate: '2026-10-31' }, floor: 40 })],
      items: [item('sew', 'deadline_task', 'Sew the quilt', { dueDate: '2026-10-30', dateCanMove: true })],
    });
    // A time zone ahead of the device: the person's today can be the 31st when the device's date, and so the start date, is the 30th.
    // Whatever their today is, the dates read as dates.
    for (const today of ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']) {
      const lines = textOf(recapSections(model((m) => m.goals.push(g)), { ...OPTIONS, today }));
      expect(lines.join('\n'), `today is ${today}`).not.toMatch(/\b(today|tomorrow|yesterday)\b/i);
      expect(lines, `today is ${today}`).toContain('Get stronger starts Friday, Oct 30 and ends Saturday, Oct 31.');
      expect(lines.join('\n'), `today is ${today}`).toContain('by Saturday, Oct 31');
      expect(lines, `today is ${today}`).toContain('Due by Friday, Oct 30: Sew the quilt. The date can move.');
    }
  });

  it('a goal that is set aside says when it comes back as a date too', () => {
    const g = goal('g1', 'Learn Spanish', { state: 'parked', returnWhen: { kind: 'date', date: '2026-10-31' } });
    expect(textOf(recapSections(model((m) => m.goals.push(g)), { ...OPTIONS, today: '2026-10-31' }))).toEqual(['Set aside for now. It comes back on Saturday, Oct 31.']);
  });

  it('what matters to the person says Momentum will keep it in mind, never "I\'ll"', () => {
    const lines = textOf(recapSections(model((m) => { m.person.priorities = ['Family time', 'my sleep']; }), OPTIONS));
    expect(lines).toEqual(["Besides your goals, what matters to you: Family time and your sleep. Momentum will keep these in mind so the plan doesn't crowd them out."]);
    expect(lines.join('\n')).not.toMatch(/\bI'll\b|\bI'm\b|\bI\b/);
  });

  it('names each subject, so the card can put its name over what is said and asked about it', () => {
    const g = goal('g1', 'Make the quilt', {
      startDate: TODAY,
      shape: 'ongoing',
      targets: [target('t1', 'Blocks', { floor: 3 })],
      items: [item('sew', 'deadline_task', 'Sew the quilt'), item('walk', 'habit', 'Walk')],
    });
    const [section] = recapSections(model((m) => m.goals.push(g)), OPTIONS, [goalStepId(g)]);
    expect(section.names).toEqual({
      [goalStepId(g)]: 'Make the quilt',
      [targetStepId(g, g.targets[0])]: 'Blocks',
      [`item:g1.sew`]: 'Sew the quilt',
      [`item:g1.walk`]: 'Walk',
    });
    expect(section.subjects).toEqual(Object.keys(section.names));
    const days = recapSections(model((m) => { m.person.weekStart = 1; }), OPTIONS)[0];
    expect(days.names).toEqual({ days: 'Your days' });
  });

  it('a deadline task and a habit each get a line, and a task with no date has none yet', () => {
    const g = goal('g1', 'Make the quilt', {
      items: [item('sew', 'deadline_task', 'Sew the quilt', { dueDate: '2026-12-15', dateCanMove: false }), item('walk', 'habit', 'Walk'), item('cut', 'deadline_task', 'Cut the cloth')],
    });
    expect(textOf(recapSections(model((m) => m.goals.push(g)), OPTIONS))).toEqual(["Due by Tuesday, Dec 15: Sew the quilt. The date can't move.", 'Habit: Walk.']);
  });
});

describe('one list, nothing twice, nothing empty', () => {
  it('each line says which step it belongs to, so the card can show a step on its own', () => {
    const g = goal('g1', 'Get stronger', { startDate: TODAY, shape: 'ongoing', targets: [target('t1', 'Workouts', { floor: 3 })] });
    const sections = recapSections(model((m) => { m.goals.push(g); m.person.weekStart = 1; }), OPTIONS);
    expect(sections.map((s) => s.id)).toEqual([goalStepId(g), DAYS_STEP_ID]);
    expect(sections[0].lines.map((l) => [l.stepId, l.text])).toEqual([
      [goalStepId(g), 'Get stronger starts Friday, Oct 30 and keeps going.'],
      [targetStepId(g, g.targets[0]), 'Even in a hard week: at least 3 workouts a week.'],
    ]);
    expect(sections[0].subjects).toEqual([goalStepId(g), targetStepId(g, g.targets[0])]);
  });

  it('leaves out a part with nothing in it, and never shows the playback\'s "Nothing in this part yet."', () => {
    expect(recapSections(model(() => {}), OPTIONS)).toEqual([]);
    const sections = recapSections(model((m) => { m.person.weekStart = 3; }), OPTIONS);
    expect(sections.map((s) => s.id)).toEqual([DAYS_STEP_ID]);
    expect(textOf(sections).join('\n')).not.toContain('Nothing in this part yet');
    expect(sections.some((s) => s.id === 'talk')).toBe(false);
  });

  it('keeps a part with nothing said yet when a question has to be shown in it', () => {
    const g = goal('g1', 'Get stronger');
    const sections = recapSections(model((m) => m.goals.push(g)), OPTIONS, [goalStepId(g), DAYS_STEP_ID]);
    expect(sections.map((s) => [s.id, s.lines.length])).toEqual([[goalStepId(g), 0], [DAYS_STEP_ID, 0]]);
  });

  it('shows what Momentum was told about how to talk only when something was chosen', () => {
    const sections = recapSections(model((m) => { m.settings.tone = 'gentle'; }), OPTIONS);
    expect(sections.map((s) => s.id)).toEqual(['talk']);
    expect(sections[0].title).toBe('How Momentum talks to you');
    expect(textOf(sections)).toEqual(['Momentum talks to you gently.']);
  });

  it('does not say a goal twice', () => {
    const g = goal('g1', 'Get stronger and keep it up through the whole winter season', { startDate: TODAY, shape: 'ongoing', targets: [target('t1', 'Workouts', { floor: 3 })] });
    const sections = recapSections(model((m) => m.goals.push(g)), OPTIONS);
    const all = textOf(sections).join('\n');
    expect(all.match(/winter season/g)).toHaveLength(1);
    expect(sections[0].title).toBe('Get stronger and keep it up through the whole winter season');
  });
});

describe('a time zone in plain words', () => {
  it('names the city, with the name that is saved kept for small print', () => {
    expect(zoneCity('Europe/London')).toBe('London');
    expect(zoneCity('America/Los_Angeles')).toBe('Los Angeles');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneWords('Europe/London')).toBe('London time');
    expect(zoneWords('America/Los_Angeles')).toBe('Los Angeles time');
  });

  it('keeps a name with no city as it is', () => {
    for (const zone of ['UTC', 'Etc/GMT+5', 'GMT']) {
      expect(zoneCity(zone), zone).toBeNull();
      expect(zoneWords(zone), zone).toBe(zone);
    }
  });
});
