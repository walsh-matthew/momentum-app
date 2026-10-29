// Pins, field by field, exactly what one guided-setup call sends Claude (MOM-111 block 3, MOM-102), the same way
// tests/rebalance-model.test.ts pins the rebalance call: build a fixture that uses every field once, and check its
// fieldPaths() match lib/config/privacy.ts's PROMPTS.setup.sends exactly. Adding a field to the draft or the sent
// turn shape without approving it in PROMPTS.setup fails this test. Pure: no network, no model.

import { describe, expect, it } from 'vitest';
import { setupPromptFacts } from '@/lib/ai/setup';
import { PROMPTS, fieldList } from '@/lib/config/privacy';
import type { AssistantTurn, SetupDraft, Transcript } from '@/types/setup';
import { fieldPaths } from './helpers/fieldPaths';

// One draft that uses every field of the draft once, in a shape that exercises every variant (every goal has at
// least one target and one item, and every target at least one source, so no empty array of objects leaks a bare
// path where a field-by-field one belongs; see tests/helpers/fieldPaths.ts).
const draft: SetupDraft = {
  model: {
    person: {
      timeZone: 'America/Chicago',
      dayEnd: '21:00',
      weekStart: 1,
      dayTypes: [{ name: 'Work day', capacityUnit: 'hours', capacityAmount: 2 }],
      priorities: ['Family'],
      planning: { weekday: 7, time: '18:00' },
    },
    settings: {
      tone: 'gentle',
      reminders: 'off',
      checkIns: 'end_of_week',
      celebrations: 'low_key',
      balanceMentions: 'weekly_planning',
      reviewDepth: 'recap_offer',
      reviewPlanning: 'one_sitting',
      quietTimes: ['Sunday mornings'],
    },
    goals: [
      {
        key: 'a', title: 'Lift more', why: 'to feel strong', startDate: '2026-10-29', shape: 'ongoing', endDate: null,
        blockWeeks: 10, state: 'active', returnWhen: { kind: 'on_request' }, completionMode: 'manual', tone: 'gentle',
        targets: [
          {
            key: 'a1', title: 'Volume', measure: 'quantity', unit: 'lbs', role: 'outcome', period: { kind: 'weekly' },
            floor: null, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null,
            sources: [{ kind: 'manual' }, { kind: 'synced', provider: 'hevy', metric: 'volume_lbs' }],
          },
        ],
        items: [{ key: 'ai1', kind: 'habit', title: 'Go lift', targetKey: 'a1', dueDate: null, dateCanMove: null, estimateMinutes: null, steps: [] }],
      },
      {
        key: 'b', title: 'Cook at home', why: null, startDate: null, shape: null, endDate: null, blockWeeks: null,
        state: 'parked', returnWhen: { kind: 'condition', note: 'in the spring' }, completionMode: null, tone: null,
        targets: [
          {
            key: 'b1', title: 'Focus blocks', measure: 'count', unit: null, role: 'effort', period: { kind: 'day_slots', weekdays: [1, 3] },
            floor: 3, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null,
            sources: [{ kind: 'synced', provider: 'google_calendar', metric: null }],
          },
        ],
        items: [{ key: 'bi1', kind: 'milestone', title: 'Plan meals', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Pack', 'Plan'] }],
      },
      {
        key: 'd', title: 'Finish the course', why: null, startDate: '2026-10-29', shape: 'finite', endDate: '2027-01-01',
        blockWeeks: null, state: 'active', returnWhen: { kind: 'on_request' }, completionMode: null, tone: null,
        targets: [
          {
            key: 'd1', title: 'Study time', measure: 'time', unit: null, role: 'effort', period: { kind: 'deadline', dueDate: '2027-01-01' },
            floor: 60, aspiration: null, qualifyingThreshold: null, carryOver: 'cumulative', completionMode: null, tone: null,
            sources: [{ kind: 'manual' }],
          },
        ],
        items: [{ key: 'di1', kind: 'deadline_task', title: 'Register', targetKey: null, dueDate: '2026-11-15', dateCanMove: false, estimateMinutes: 60, steps: [] }],
      },
      {
        key: 'e', title: 'Learn piano', why: null, startDate: null, shape: null, endDate: null, blockWeeks: null,
        state: 'parked', returnWhen: { kind: 'date', date: '2027-03-01' }, completionMode: null, tone: null,
        targets: [
          {
            key: 'e1', title: 'Prep', measure: 'checklist', unit: null, role: 'effort', period: { kind: 'weekly' },
            floor: 1, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null,
            sources: [{ kind: 'manual' }],
          },
        ],
        items: [{ key: 'ei1', kind: 'milestone', title: 'Find a teacher', targetKey: 'e1', dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Step A'] }],
      },
    ],
  },
  said: [
    { path: 'goals.a.startDate', turn: 1, how: 'said' },
    { path: 'goals.a.blockWeeks', turn: 3, how: 'accepted' },
  ],
  approved: ['goals', 'targets'],
};

const turn = (over: Partial<AssistantTurn>): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  skipped: { topic: 'idea', line: "You told me the idea, so I'll skip that." },
  say: 'Thanks.',
  question: 'What else matters to you?',
  topic: 'priorities',
  options: [],
  draft,
  ...over,
});

const transcript: Transcript = [
  { role: 'assistant', turn: turn({}) },
  { role: 'person', text: 'Family comes first.' },
  { role: 'assistant', turn: turn({ kind: 'playback', chunk: 'goals' }) },
  { role: 'person', text: 'Yes, that is right.' },
];

describe('what one setup call sends Claude (MOM-111 block 3)', () => {
  it('sends exactly the fields the privacy notice lists', () => {
    const facts = setupPromptFacts(transcript, draft, '2026-10-29');
    expect(fieldPaths(facts)).toEqual(fieldList(PROMPTS.setup.sends));
  });

  it('never sends a goal id, a task id or an email address', () => {
    const facts = setupPromptFacts(transcript, draft, '2026-10-29');
    expect(JSON.stringify(facts)).not.toMatch(/@|user_id|userId/);
  });
});
