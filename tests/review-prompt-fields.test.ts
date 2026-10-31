// Pins, field by field, exactly what one weekly-review line call sends Claude (MOM-113 block 3.3, MOM-102), the same way
// tests/setup-prompt-fields.test.ts pins guided setup: build a fixture that uses every field once, and check its fieldPaths()
// match lib/config/privacy.ts's PROMPTS.review.sends exactly. A field added to what is sent without the notice listing it fails
// here. It also checks the facts are built from the review without a number, a date, an id, a goal title or a priority.
// Pure: no network, no model.

import { describe, expect, it } from 'vitest';
import { buildReviewMessages, reviewPromptFacts } from '@/lib/ai/review';
import { PROMPTS, fieldList } from '@/lib/config/privacy';
import { REFLECTION_MAX_TARGETS, buildReflectionFacts, type ReflectionFacts } from '@/lib/review/reflection';
import type { StoredRecap } from '@/types/review';
import type { Layer1TargetFact, TargetResult } from '@/types/scoreboard';
import { fieldPaths } from './helpers/fieldPaths';

const facts: ReflectionFacts = {
  tone: 'gentle',
  targets: [
    { title: 'Lift weights', level: 'floor met', crossings: ['floor', 'aspiration'], patterns: ['holding'], trend: 'up' },
    { title: 'Read', level: 'partway', crossings: ['block_end'], patterns: ['slipping', 'aspiration_repeated'], trend: 'down' },
  ],
};

describe('what one weekly-review call sends Claude (MOM-113 block 3.3)', () => {
  it('sends exactly the fields the privacy notice lists', () => {
    const sent = reviewPromptFacts(facts, ['Do not ask a question.']);
    expect(fieldPaths(sent)).toEqual(fieldList(PROMPTS.review.sends));
  });

  it('leaves the retry note out when there is none', () => {
    expect(reviewPromptFacts(facts)).not.toHaveProperty('retryFeedback');
    expect(reviewPromptFacts(facts, [])).not.toHaveProperty('retryFeedback');
    expect(fieldPaths(reviewPromptFacts(facts))).toEqual(fieldList(PROMPTS.review.sends).filter((f) => f !== 'retryFeedback'));
  });

  it('writes the same facts into the request, and nothing more', () => {
    const [message] = buildReviewMessages(facts, ['Do not ask a question.']);
    const text = JSON.stringify(message);
    expect(text).toContain('Lift weights');
    expect(text).toContain('Do not ask a question.');
    expect(text).not.toMatch(/@|user_id|userId/);
  });

  it('says in the notice that it is asked for only on a tap, and that nothing is stored', () => {
    expect(PROMPTS.review.note).toContain('Only when you tap');
    expect(PROMPTS.review.note).toContain('not saved');
    expect(PROMPTS.review.leavesOut).toContain('counts');
    expect(PROMPTS.review.leavesOut).toContain('dates');
    expect(PROMPTS.review.leavesOut).toContain('your priorities');
  });
});

// A review whose own data has every kind of thing the notice says is left out: counts, units, dates, a goal title, a priority, ids.
const result = (over: Partial<TargetResult>): TargetResult =>
  ({
    targetId: 't1',
    periodStart: '2026-10-19',
    periodEnd: '2026-10-25',
    status: 'closed',
    judgedBy: 'floor',
    startedPartway: false,
    graded: true,
    measure: 'quantity',
    unit: 'lbs',
    counted: 4120,
    level: 'floor',
    ...over,
  }) as unknown as TargetResult;

const recapTarget = (id: string, title: string) => ({ id, title, crossings: [], status: 'counted', counted: 4120, unit: 'lbs' });

const recap = {
  v: 1,
  window: { start: '2026-10-19', end: '2026-10-25' },
  closedEarly: false,
  goals: [
    { id: 'g1', title: 'Get strong for the summer', targets: [recapTarget('t1', 'Lift weights'), recapTarget('t2', 'Read'), recapTarget('t3', 'Not closed')] },
  ],
  priorities: [{ id: 'p1', label: 'Family time' }],
} as unknown as StoredRecap;

const layer1: Layer1TargetFact[] = [
  {
    targetId: 't1',
    result: result({ targetId: 't1' }),
    crossings: [
      { kind: 'floor', targetId: 't1', periodStart: '2026-10-19', on: '2026-10-21' },
      { kind: 'floor', targetId: 't1', periodStart: '2026-10-19', on: '2026-10-22' },
      { kind: 'aspiration', targetId: 't1', periodStart: '2026-10-19', on: '2026-10-23' },
      { kind: 'step', targetId: 't1', itemId: 'i1', stepId: 's1', on: '2026-10-24' },
    ],
    patterns: [
      { kind: 'holding', targetId: 't1', periods: 3, endingPeriodStart: '2026-10-19' },
      { kind: 'holding', targetId: 't1', periods: 3, endingPeriodStart: '2026-10-19' },
    ],
    trend: { targetId: 't1', counts: [3900, 4000, 4120], direction: 'up' },
  },
  {
    targetId: 't2',
    result: result({ targetId: 't2', level: 'partway', counted: 40, unit: 'pages', graded: true }),
    crossings: [],
    patterns: [],
    trend: { targetId: 't2', counts: [1, 1], direction: 'insufficient' },
  },
  {
    targetId: 't4',
    result: result({ targetId: 't4' }),
    crossings: [],
    patterns: [],
    trend: null,
  },
];

describe('the facts are built from the review without a number, a date or an id', () => {
  const built = buildReflectionFacts(recap, layer1, 'direct');

  it('names each target the review showed, in its order, and none the engine had nothing for', () => {
    expect(built.tone).toBe('direct');
    expect(built.targets.map((t) => t.title)).toEqual(['Lift weights', 'Read']);
  });

  it('turns where a week ended into words', () => {
    expect(built.targets.map((t) => t.level)).toEqual(['floor met', 'partway']);
  });

  it('keeps crossings and patterns as short, sorted, repeat-free names, and a trend as a direction', () => {
    expect(built.targets[0]).toEqual({
      title: 'Lift weights',
      level: 'floor met',
      crossings: ['aspiration', 'floor'],
      patterns: ['holding'],
      trend: 'up',
    });
    // A trend with too little behind it says nothing.
    expect(built.targets[1].trend).toBeNull();
  });

  it('carries no count, unit, date, id, goal title or priority', () => {
    const text = JSON.stringify(built);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/lbs|pages/);
    expect(text).not.toContain('Get strong for the summer');
    expect(text).not.toContain('Family time');
    expect(text).not.toMatch(/"(id|targetId|goalId|on|periodStart|counted|unit)"/);
    expect(fieldPaths(built)).toEqual(['targets.crossings', 'targets.level', 'targets.patterns', 'targets.title', 'targets.trend', 'tone']);
  });

  it('tells Claude about the first few targets only when there are very many', () => {
    const many = {
      ...recap,
      goals: [{ id: 'g1', title: 'G', targets: Array.from({ length: REFLECTION_MAX_TARGETS + 5 }, (_, i) => recapTarget(`m${i}`, `Target ${i}`)) }],
    } as unknown as StoredRecap;
    const manyFacts = Array.from({ length: REFLECTION_MAX_TARGETS + 5 }, (_, i) => ({ ...layer1[2], targetId: `m${i}` }));
    expect(buildReflectionFacts(many, manyFacts, 'middle').targets).toHaveLength(REFLECTION_MAX_TARGETS);
  });

  it('has nothing to say, and says so with an empty list, when no target has a fact', () => {
    expect(buildReflectionFacts(recap, [], 'middle').targets).toEqual([]);
  });
});
