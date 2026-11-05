// @vitest-environment jsdom
// MOM-180 part A: "What does this mean?" is answered by code first (docs/DOMAIN_MODEL.md §2.1, §4.2 principle 13). Every setup topic has a fixed
// explanation written in lib/setup/explain.ts, shown in place with no Claude call; "Still not clear? Ask Claude" shows only on the concept
// topics (what to count, the least that counts, the goal's shape); no explanation names a day, time or number the person hasn't said; and
// expansion questions are no longer asked, so nothing explains them.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpLink } from '@/components/setup/HelpLink';
import { QuestionCard } from '@/components/setup/QuestionCard';
import { TimeZoneCard } from '@/components/setup/TimeZoneCard';
import { SETTINGS_ROWS } from '@/lib/setup/cards';
import { emptyDraft } from '@/lib/setup/draft';
import { ASK_CLAUDE_TOPICS, EXPLANATIONS, explanationFor } from '@/lib/setup/explain';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { ASK_CLAUDE, MEANING_LINK, MEANING_TEXT } from '@/lib/setup/session';
import { DAY_END_SAY, SETUP_STEPS, UNRECORDED_TOPICS } from '@/lib/setup/steps';
import { WEEK_CARD_TOPICS } from '@/lib/setup/weekCards';
import { SETUP_TOPICS, type AssistantTurn, type SetupDraft, type SetupTopic } from '@/types/setup';
import { goal, target } from './helpers/setupScript';

afterEach(cleanup);

const TODAY = '2026-11-04';

const turn = (topic: SetupTopic, draft: SetupDraft = emptyDraft()): AssistantTurn => ({
  kind: 'question',
  chunk: null,
  topic,
  skipped: null,
  say: '',
  question: 'What is it?',
  detail: null,
  options: [],
  draft,
});

function counting(title: string): SetupDraft {
  const d = emptyDraft();
  const g = goal('g1', 'Reading');
  g.targets.push(target('t1', title));
  d.model.goals.push(g);
  return d;
}

// Every topic setup asks about: the steps' topics, the cards code writes, and the settings rows.
const ASKED: SetupTopic[] = [
  ...new Set<SetupTopic>([...SETUP_STEPS.flatMap((s) => s.topics), ...WEEK_CARD_TOPICS, ...SETTINGS_ROWS.map((r) => r.topic)]),
];

describe('the explanations', () => {
  it('cover every topic setup asks about', () => {
    for (const topic of ASKED) expect(explanationFor(topic, counting('Pages'), TODAY), topic).not.toBeNull();
    expect(ASKED).toEqual(expect.arrayContaining(['idea', 'why', 'breakup', 'sequencing', 'parked_return', 'shape', 'target', 'floor', 'time_zone', 'tone']));
  });

  it('are the owner\'s words: the four he changed on 2026-11-04, and the ones reworded in MOM-180 B1 (Jira comment 10358) so none repeats its card', () => {
    expect(EXPLANATIONS.priorities).toBe('These are the things in your life, besides this goal, that your plan should not crowd out.');
    expect(EXPLANATIONS.capacity).toBe('This is about how much time each kind of day usually has for this.');
    expect(EXPLANATIONS.planning_moment).toBe('Pick the day and the time that suit you best.');
    expect(EXPLANATIONS.sequencing).toBe('Together means every goal is in your plan from the start. One first means the others wait until you bring them back.');
    expect(EXPLANATIONS.idea).toBe('This is the goal you want to work on. It can be anything you would like to change, build or keep up.');
    expect(EXPLANATIONS.target).toBe('This is the thing you will count to know it is going well. It can be anything you can add up.');
    expect(EXPLANATIONS.day_end).toBe('This is the time you would say your day is done.');
    expect(DAY_END_SAY).toMatch(/midnight/);
  });

  it('name no day, time or number the person has not said (principle 1), except the day-end rule\'s own words', () => {
    for (const [topic, text] of Object.entries(EXPLANATIONS)) {
      if (topic === 'day_end') continue;
      expect(text, topic).not.toMatch(/\d/);
      expect(text, topic).not.toMatch(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|midnight|morning|evening|noon|tonight|weekend|weekday)s?\b/i);
      expect(text, topic).not.toMatch(/\b\d{1,2}(:\d\d)?\s?(am|pm)\b/i);
    }
  });

  it('say nothing about the person\'s whole week or free time (principle 12) or a look-back that may not happen together with planning', () => {
    for (const [topic, text] of Object.entries(EXPLANATIONS)) {
      expect(text, topic).not.toMatch(/free time|your whole week|keeps room|look back at the week/i);
    }
  });

  it('use no word the plain-words rule bans without saying what it means', () => {
    for (const [topic, text] of Object.entries(EXPLANATIONS)) {
      expect(text, topic).not.toMatch(/\b(target|floor|aspiration|effort|outcome|protected|quota|slot|capacity|check-in|synced|manual|milestone|metric|parked)\b/i);
    }
  });

  it('carry the person\'s own counted thing on the number questions, and read the same for a deadline', () => {
    const floor = explanationFor('floor', counting('Pages'), TODAY);
    expect(floor?.text).toContain('the least pages that still counts');
    expect(floor?.text).not.toMatch(/fewest|\baim\b|floor|aspiration/i);
    expect(explanationFor('aspiration', counting('Pages'), TODAY)?.text).toBe(floor?.text);
    const level = explanationFor('number_level', counting('Pages'), TODAY);
    expect(level?.text).toBe('The number of pages you could settle for in a hard week is one answer. The number you are aiming for is the other.');
    // Nothing counted yet: plain words with no thing and no number.
    expect(explanationFor('floor')?.text).toBe('This is the number you could settle for in a hard week.');
    expect(explanationFor('number_level')?.text).toBe('A number you could settle for in a hard week is one answer. A number you are aiming for is the other.');
  });
});

describe('"Still not clear? Ask Claude"', () => {
  it('belongs to exactly four topics: what to count, the least that counts (twice), and the goal\'s shape', () => {
    expect([...ASK_CLAUDE_TOPICS].sort()).toEqual(['floor', 'number_level', 'shape', 'target']);
    for (const topic of ASKED) expect(explanationFor(topic, counting('Pages'), TODAY)?.askClaude, topic).toBe(ASK_CLAUDE_TOPICS.has(topic));
    // The hoped-for number has the explanation alone.
    expect(explanationFor('aspiration', counting('Pages'), TODAY)?.askClaude).toBe(false);
  });

  it.each(ASKED)('on a %s question: the link opens the words, makes no call, and Ask Claude shows only on a concept topic', (topic) => {
    const onAnswer = vi.fn();
    const draft = counting('Pages');
    render(<QuestionCard turn={turn(topic, draft)} busy={false} onAnswer={onAnswer} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot="help-explain"]')?.textContent).toContain(explanationFor(topic, draft, TODAY)?.text ?? '(none)');
    const ask = screen.queryByRole('button', { name: ASK_CLAUDE });
    expect(ask !== null).toBe(ASK_CLAUDE_TOPICS.has(topic));
    if (ask) {
      fireEvent.click(ask);
      expect(onAnswer).toHaveBeenCalledTimes(1);
      expect(onAnswer).toHaveBeenCalledWith(MEANING_TEXT);
    }
  });

  it('is never offered where nothing can be asked: a link with no words asks Claude as it did before, and a link with words but no handler shows none', () => {
    const onAsk = vi.fn();
    const { unmount } = render(<HelpLink onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    unmount();
    render(<HelpLink explain="Words." askClaude />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    expect(screen.getByText('Words.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: ASK_CLAUDE })).toBeNull();
  });

  it('closes again on a second tap', () => {
    render(<HelpLink explain="Words." />);
    const link = screen.getByRole('button', { name: MEANING_LINK });
    fireEvent.click(link);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(link);
    expect(screen.queryByText('Words.')).toBeNull();
  });
});

describe('the time zone card', () => {
  it('has the explanation, with the zone question unchanged and no call', () => {
    const onPick = vi.fn();
    render(<TimeZoneCard question="Your phone is set to Mountain Time (Denver). Is that your time zone?" deviceZone="America/Denver" busy={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: MEANING_LINK }));
    expect(screen.getByText(EXPLANATIONS.time_zone ?? '')).toBeTruthy();
    expect(screen.queryByRole('button', { name: ASK_CLAUDE })).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('expansion questions are not asked (DOMAIN_MODEL §2.2 step 8, principle 13)', () => {
  it('is no topic, no example and no explanation', () => {
    expect(SETUP_TOPICS as readonly string[]).not.toContain('expansion');
    expect(Object.keys(EXPLANATIONS)).not.toContain('expansion');
    expect(explanationFor('expansion')).toBeNull();
    expect(UNRECORDED_TOPICS.has('starting_point')).toBe(true);
    const step = SETUP_STEPS.find((s) => s.n === 8);
    expect(step?.topics).toEqual([]);
    expect(step?.examples).toEqual([]);
  });

  it('is told to the model: step 8 asks nothing', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('Ask nothing here.');
    expect(SETUP_SYSTEM_PROMPT).not.toMatch(/bring up things worth deciding/);
  });
});
