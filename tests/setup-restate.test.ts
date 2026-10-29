// The playback restates the person's words in the second person, by code (MOM-111): the owner's live setup read back "Goal:
// Physical fitness, because To stay healthy for my family..", their words pasted in as typed. These are the rules, each part's
// playback, and the fail-safe: words the rules cannot restate are shown as said, in quotes, never guessed at.

import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@/lib/setup/draft';
import { renderFinal, renderPlayback, spelledDate, spokenTimes } from '@/lib/setup/playback';
import { listOf, restate } from '@/lib/setup/restate';
import type { SetupModel, Transcript } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

describe('restating the person\'s words', () => {
  it('restates the owner\'s why the way a person would', () => {
    expect(restate('To stay healthy for my family.', 'clause')).toBe('you want to stay healthy for your family');
  });

  it.each([
    ['I want more energy', 'you want more energy'],
    ['i want more energy', 'you want more energy'],
    ['My doctor told me to', 'your doctor told you to'],
    ["I'm tired of being tired", "you're tired of being tired"],
    ['I am stuck', 'you are stuck'],
    ['I was a runner once', 'you were a runner once'],
    ["We've talked about it for years", "you've talked about it for years"],
    ['it clears my head', 'it clears your head'],
    ['So I can keep up with my kids', 'so you can keep up with your kids'],
    ['Because I want to', 'you want to'],
    ['because I want to', 'you want to'],
    ["It's good for me", "it's good for you"],
    ['The doctor said so', 'the doctor said so'],
  ])('"%s" reads "%s" after "because"', (said, restated) => {
    expect(restate(said, 'clause')).toBe(restated);
  });

  it('keeps the capital of any other first word, because it may be a name', () => {
    expect(restate("Emma's recitals", 'item')).toBe("Emma's recitals");
    expect(restate('Grandma needs me around', 'clause')).toBe('Grandma needs you around');
    expect(restate('Family time', 'item')).toBe('Family time');
  });

  it('never doubles a full stop or a "because"', () => {
    expect(restate('my health...', 'clause')).toBe('your health');
    expect(restate('Because because', 'clause')).toBe('because');
  });

  it('puts the person first when they name someone with themselves: "you and your wife", never "your wife and you"', () => {
    expect(restate('My wife and I want to travel', 'clause')).toBe('you and your wife want to travel');
    expect(restate('Sam and I', 'item')).toBe('you and Sam');
    expect(restate('time with my kids and me', 'item')).toBe('time with you and your kids');
    expect(restate('Me and my wife', 'item')).toBe('you and your wife');
  });

  it('gives up, rather than read oddly, when "and I" cannot be moved or "you" ends up twice in a row', () => {
    expect(restate('I run and I lift', 'clause')).toBeNull();
    expect(restate('Me, myself and I', 'item')).toBeNull();
  });

  it('gives up on words it cannot restate safely: "you", a question, quotes, or more than one sentence', () => {
    for (const words of ['you only live once', 'ur gonna love it', 'why not?', 'my "me time"', 'I want energy. Also my kids.', 'sleep; family']) {
      expect(restate(words, 'clause'), words).toBeNull();
    }
  });

  it('leaves "US" the country alone', () => {
    expect(restate('Travel the US with my wife', 'title')).toBe('Travel the US with your wife');
  });

  it('starts a title with a capital when the restated word comes first', () => {
    expect(restate('My degree', 'title')).toBe('Your degree');
    expect(restate('I run a 10k', 'title')).toBe('You run a 10k');
  });

  it('joins a list the way a person says it', () => {
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

function model(): SetupModel {
  return emptyDraft().model;
}

describe('each part, played back in the second person', () => {
  it('goals: restated, with the fail-safe in quotes', () => {
    const m = model();
    m.goals.push(goal('g1', 'Physical fitness', { why: 'To stay healthy for my family.' }));
    m.goals.push(goal('g2', 'Read more', { why: 'you only live once' }));
    expect(renderPlayback(m, 'goals')).toEqual([
      'Goal: Physical fitness, because you want to stay healthy for your family.',
      'Goal: Read more. Why, in your words: "you only live once"',
    ]);
  });

  it('set-aside goals: a way back restated after "It comes back", or shown as said', () => {
    const m = model();
    m.goals.push(goal('g1', 'Cook at home', { state: 'parked', returnWhen: { kind: 'condition', note: 'when my knee heals' } }));
    m.goals.push(goal('g2', 'Paint', { state: 'parked', returnWhen: { kind: 'condition', note: 'spring' } }));
    m.goals.push(goal('g3', 'Learn guitar', { state: 'parked', returnWhen: { kind: 'on_request' } }));
    m.goals.push(goal('g4', 'Garden', { state: 'parked', returnWhen: { kind: 'date', date: '2027-03-01' } }));
    expect(renderPlayback(m, 'goals')).toEqual([
      'Set aside for now: Cook at home. It comes back when your knee heals.',
      'Set aside for now: Paint. It comes back, in your words: "spring"',
      'Set aside for now: Learn guitar. It comes back when you ask.',
      'Set aside for now: Garden. It comes back on March 1, 2027.',
    ]);
  });

  it('what else matters: every item follows the same capital rule, in a plain sentence', () => {
    const m = model();
    m.person.priorities = ['Family time', 'my sleep', 'The garden', 'whatever u think'];
    expect(renderPlayback(m, 'targets')[0]).toBe(
      'Besides your goals, what matters to you: Family time, your sleep, the garden and "whatever u think". I\'ll keep these in mind so the plan doesn\'t crowd them out.',
    );
  });

  it('what you\'ll count: no internal words, dates spelled out', () => {
    const m = model();
    const g = goal('g1', 'Get fit', { shape: 'ongoing', startDate: '2026-10-27', blockWeeks: 10 });
    g.targets.push(target('t1', 'Gym sessions', { floor: 2, aspiration: 4 }));
    g.targets.push(target('t2', 'Interviews', { role: 'outcome' }));
    g.targets.push(target('t3', 'Practice', { measure: 'time', floor: 90, qualifyingThreshold: 20 }));
    m.goals.push(g, goal('g2', 'Quilt', { shape: 'project', endDate: '2027-06-14', startDate: '2026-10-27' }));
    expect(renderPlayback(m, 'targets')).toEqual([
      'Get fit keeps going, starting October 27, 2026, with a first stretch of 10 weeks.',
      '  Gym sessions: at least 2 each week, aiming for 4.',
      "  Interviews: counted each week. It isn't fully in your hands, so it's shown to you, never judged.",
      '  Practice: at least 90 minutes each week. Only entries of 20 minutes or more count.',
      'Quilt has a deadline of June 14, 2027, starting October 27, 2026.',
    ]);
  });

  it('your days and weeks: times in the person\'s locale, an early day end explained', () => {
    const m = model();
    m.person.timeZone = 'America/Denver';
    m.person.dayEnd = '02:00';
    m.person.weekStart = 1;
    m.person.dayTypes = [{ name: 'my office days', capacityUnit: 'hours', capacityAmount: 2 }];
    m.person.planning = { weekday: 7, time: '18:30' };
    const g = goal('g1', 'Quilt');
    g.items.push(item('i1', 'deadline_task', 'Quilt finished', { dueDate: '2027-06-14', dateCanMove: false }));
    g.targets.push(target('t1', 'Blocks sewn', { sources: [{ kind: 'manual' }] }));
    m.goals.push(g);
    expect(renderPlayback(m, 'planning', { locale: 'en-US' })).toEqual([
      "You're in the America/Denver time zone.",
      'Your day ends at 2:00 AM, so anything you log before then counts toward the day before.',
      'Your week starts on Monday.',
      'Your kinds of days: your office days (2 hours).',
      "You'll plan your week on Sunday at 6:30 PM.",
      "Due by June 14, 2027: Quilt finished. The date can't move.",
      'Blocks sewn: you log it yourself.',
    ]);
    // Another locale writes times its own way.
    const german = renderPlayback(m, 'planning', { locale: 'de-DE' });
    expect(german[1]).toBe('Your day ends at 2:00, so anything you log before then counts toward the day before.');
    expect(german[4]).toBe("You'll plan your week on Sunday at 18:30.");
  });

  it('a time falls back to the person\'s own words without a usable locale, and to the saved time without those', () => {
    const draft = emptyDraft();
    draft.model.person.dayEnd = '21:00';
    draft.said.push({ path: 'person.dayEnd', turn: 1, how: 'said' });
    const transcript: Transcript = [
      { role: 'assistant', turn: { kind: 'question', chunk: null, skipped: null, say: '', question: 'When does your day end?', topic: 'day_end', options: [], draft: emptyDraft() } },
      { role: 'person', text: 'I check in around 9 at night.' },
    ];
    const spoken = spokenTimes(draft, transcript);
    const line = (locale: string | null) => renderPlayback(draft.model, 'planning', { locale, spokenTime: spoken })[0];
    expect(line(null)).toBe('Your day ends at 9 at night, the time you check in; your day still runs from midnight to midnight.');
    expect(line('not a locale!')).toBe('Your day ends at 9 at night, the time you check in; your day still runs from midnight to midnight.');
    expect(renderPlayback(draft.model, 'planning')[0]).toBe('Your day ends at 21:00, the time you check in; your day still runs from midnight to midnight.');
  });

  it('how Momentum talks to you: one plain line per choice', () => {
    const m = model();
    m.settings = {
      tone: 'gentle',
      reminders: 'off',
      checkIns: 'end_of_week',
      celebrations: 'low_key',
      balanceMentions: 'weekly_planning',
      reviewDepth: 'recap_offer',
      reviewPlanning: 'one_sitting',
      quietTimes: ['my mornings off'],
    };
    expect(renderPlayback(m, 'talk')).toEqual([
      'Momentum talks to you gently.',
      'No reminders.',
      'At the end of your week, Momentum asks how it went for the things you log yourself.',
      'Wins get a low-key celebration.',
      'When one goal is taking time from the rest, Momentum mentions it when you plan your week.',
      'Your weekly look-back: a short recap, with an offer to go deeper.',
      'You look back on your week and plan the next one in one sitting.',
      'Quiet times, when Momentum stays silent: your mornings off.',
    ]);
  });

  it('the final confirmation counts things, not "targets"', () => {
    const m = model();
    const g = goal('g1', 'My degree');
    g.targets.push(target('t1', 'Credits'));
    m.goals.push(g, goal('g2', 'Paint', { state: 'parked' }));
    expect(renderFinal(m)).toEqual([
      "Your degree: 1 thing you'll count.",
      '1 goal set aside for now, with a way back.',
      'Everything can be changed on your settings page.',
    ]);
  });

  it('spells dates out', () => {
    expect(spelledDate('2027-06-05')).toBe('June 5, 2027');
    expect(spelledDate('not a date')).toBe('not a date');
  });
});
