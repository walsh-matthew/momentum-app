// @vitest-environment jsdom
//
// The week plan and the "Your plan" card in everyday words (MOM-112 block 2, docs/DOMAIN_MODEL.md §2.1 plain language, which
// PR #62 made binding for setup and which applies here too). Two checks over everything a person can read, in every state:
// 1. the plain-words glossary from setup (lib/setup/plainWords.ts): an internal word may appear only with what it means in
//    the same sentence;
// 2. a stricter ban for this screen, on the words the build uses internally and a person never needs: pick, day type,
//    capacity, slot, target, milestone, floor, aspiration, priority. The screen says "plan your week", "what kind of day
//    is this?" and the person's own names for their kinds of days.
// Readable text is the text, the button names, the labels and the placeholders, like setup's own check.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeScoreboardSection } from '@/components/home/HomeScoreboardSection';
import { YourPlanCard } from '@/components/home/YourPlanCard';
import { PlanScreen } from '@/components/plan/PlanScreen';
import * as wording from '@/components/plan/wording';
import { INTERNAL_TERMS, unexplainedTerms } from '@/lib/setup/plainWords';
import type { HomeScoreboard } from '@/types/home';
import type { WeekPlanView } from '@/types/plan';
import { HABIT, KINDS, STEP, WEEK, readyCard, readyPlan } from './helpers/planFixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/app/actions/plan', () => ({
  planItem: vi.fn(),
  unplanItem: vi.fn(),
  chooseDayKind: vi.fn(),
  clearKindOfDay: vi.fn(),
  copyKindsFromLastWeek: vi.fn(),
  planHabitSetDays: vi.fn(),
}));
afterEach(cleanup);

// The words this screen never uses. "Day type" is the build's word; the person's word is "kind of day".
const NEVER_ON_SCREEN: { word: string; pattern: RegExp }[] = [
  { word: 'pick', pattern: /\bpick(s|ed|ing)?\b/i },
  { word: 'day type', pattern: /\bday[- ]types?\b/i },
  { word: 'capacity', pattern: /\bcapacity\b/i },
  { word: 'slot', pattern: /\bslots?\b/i },
  { word: 'target', pattern: /\btargets?\b/i },
  { word: 'milestone', pattern: /\bmilestones?\b/i },
  { word: 'floor', pattern: /\bfloors?\b/i },
  { word: 'aspiration', pattern: /\baspirations?\b/i },
  { word: 'priority', pattern: /\bpriorit(y|ies)\b/i },
  { word: 'carry over', pattern: /\bcarry[- ]?overs?\b|\bcarries over\b/i },
  { word: 'anchor', pattern: /\banchors?\b/i },
];

// Everything a person can read: each block of text on its own, plus button names, labels and placeholders.
function readable(container: HTMLElement): string[] {
  const attrs = [...container.querySelectorAll('[placeholder], [aria-label]')].flatMap((el) => [el.getAttribute('placeholder') ?? '', el.getAttribute('aria-label') ?? '']);
  const blocks = [...container.querySelectorAll('h1, h2, h3, h4, p, li, button, label, option, a, span')].map((el) => el.textContent ?? '');
  return [...blocks, ...attrs].filter(Boolean);
}

function expectPlain(container: HTMLElement) {
  const texts = readable(container);
  expect(texts.length).toBeGreaterThan(3);
  expect(unexplainedTerms(texts.join('. '))).toEqual([]);
  for (const { word, pattern } of NEVER_ON_SCREEN) expect(texts.filter((t) => pattern.test(t)), word).toEqual([]);
}

describe('the checks themselves', () => {
  it('flag the words this screen must not use', () => {
    for (const { word, pattern } of NEVER_ON_SCREEN) expect(pattern.test(`Pick a ${word} for the day`) || pattern.test(`${word}s`) || pattern.test(`The ${word}`), word).toBe(true);
    expect(unexplainedTerms("Choose a day type for each date. What's your capacity?")).toHaveLength(2);
  });

  it('know the glossary words the plan could be tempted by', () => {
    const terms = INTERNAL_TERMS.map((t) => t.term);
    for (const t of ['capacity', 'day type', 'slot', 'target', 'milestone', 'floor', 'aspiration']) expect(terms).toContain(t);
  });
});

describe('the plan screen says everything in everyday words, in every state', () => {
  const days = (mark: (date: string) => Partial<ReturnType<typeof readyPlan>['days'][number]>) =>
    readyPlan().days.map((d) => ({ ...d, ...mark(d.date) }));

  const states: [string, WeekPlanView & { state: 'ready' }][] = [
    ['a fresh week', readyPlan()],
    [
      'a full week: days chosen, kinds set, a set-days habit, a step left over, and "Same as last week" on offer',
      readyPlan({
        items: [{ ...HABIT, setDays: [1, 3, 5] }, { ...STEP, movedFromLastWeek: true }],
        days: days((date) => ({ itemIds: date === '2026-10-30' ? [HABIT.id] : [], dayTypeId: date === '2026-10-31' ? KINDS[1].id : null })),
        copyableKinds: 2,
      }),
    ],
    ['a later week', readyPlan({ offset: 2, hasPrevious: true, start: '2026-11-09', end: '2026-11-15' })],
    ['no kinds of days described', readyPlan({ dayKinds: [] })],
    ['nothing to plan yet', readyPlan({ items: [] })],
    [
      'no week start: the next 14 days',
      readyPlan({ window: 'next_14_days', hasNext: false, days: [...WEEK, ...WEEK].map((date, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, isToday: i === 0, isPast: false, dayTypeId: null, itemIds: [] })) }),
    ],
  ];

  it.each(states)('%s', (_name, plan) => {
    const { container } = render(<PlanScreen plan={plan} />);
    expectPlain(container);
  });

  it('gives the day-kind row a short reason, and uses the person\'s own names for their kinds of days', () => {
    const { container } = render(<PlanScreen plan={readyPlan()} />);
    expect(container.textContent).toContain('so the forecast knows how much time you have');
    const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain('Work day');
    expect(options).toContain('Rest day');
    expect(wording.KINDS_REASON.split(' ').length).toBeLessThanOrEqual(14);
  });

  it('asks "what kind of day", never "day type"', () => {
    const { container } = render(<PlanScreen plan={readyPlan()} />);
    expect(container.textContent).toContain('What kind of day is each one?');
    expect(readable(container).some((t) => /what kind of day/i.test(t))).toBe(true);
  });
});

describe('the "Your plan" card says everything in everyday words, in every state', () => {
  const states = [
    ['today planned', readyCard({ todayItems: [{ id: 'a', title: 'Go for a run', goalTitle: 'Stay fit' }], plannedLater: true })],
    ['nothing planned yet', readyCard()],
    ['planned ahead, nothing today', readyCard({ plannedLater: true })],
    ['a step left over', readyCard({ moved: [{ id: 'b', title: 'Book the room', goalTitle: 'Stay fit' }] })],
  ] as const;

  it.each(states)('%s', (_name, plan) => {
    const { container } = render(<YourPlanCard plan={plan} />);
    expectPlain(container);
  });

  it('on home beside the rest of the scoreboard', () => {
    const home: HomeScoreboard = { state: 'ready', today: '2026-10-29', hero: { kind: 'needs_week_start' }, goals: [], tone: 'middle', celebration: 'low_key' };
    const { container } = render(<HomeScoreboardSection home={home} plan={readyCard({ moved: [{ id: 'b', title: 'Book the room', goalTitle: 'Stay fit' }] })} />);
    const card = container.querySelector('section[aria-label="Your plan"]') as HTMLElement;
    expect(card).not.toBeNull();
    expectPlain(card);
  });
});

describe('the words around the screen', () => {
  it('say why a plan cannot be made, in everyday words, whichever time setting is missing', () => {
    const states: Extract<WeekPlanView, { state: 'needs_day_anchors' }>[] = [
      { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' },
      { state: 'needs_day_anchors', anchor: 'day_end', reason: 'not_set' },
      { state: 'needs_day_anchors', anchor: 'time_zone', reason: 'invalid' },
    ];
    for (const state of states) {
      const text = wording.needsDaysText(state);
      expect(unexplainedTerms(text), text).toEqual([]);
      for (const { word, pattern } of NEVER_ON_SCREEN) expect(pattern.test(text), `${word}: ${text}`).toBe(false);
    }
  });

  it('every fixed line is plain', () => {
    const lines = Object.entries(wording)
      .filter(([, v]) => typeof v === 'string')
      .map(([k, v]) => [k, v as string] as const);
    expect(lines.length).toBeGreaterThan(20);
    for (const [name, text] of lines) {
      expect(unexplainedTerms(text), name).toEqual([]);
      for (const { word, pattern } of NEVER_ON_SCREEN) expect(pattern.test(text), `${name} uses ${word}`).toBe(false);
    }
  });
});
