// MOM-180 part B1: no repeated words. "What does this mean?" must add what the card's subtitle or lead-in does not say (test day 1: the idea card
// showed "Big or small, in your own words." above "Big or small is fine.", and what to count said "from what you log" in both). Every card
// is held to it: no run of 4 or more words in an explanation appears in the card's subtitle (its detail line) or its lead-in.

import { describe, expect, it } from 'vitest';
import { SETTINGS_ROWS, SETTINGS_SKIP_LINE } from '@/lib/setup/cards';
import { emptyDraft } from '@/lib/setup/draft';
import { EXPLANATIONS, explanationFor } from '@/lib/setup/explain';
import { GOAL_WORDS } from '@/lib/setup/goalCards';
import { DAY_END_SAY, SETUP_STEPS } from '@/lib/setup/steps';
import { WEEK_WORDS } from '@/lib/setup/weekCards';
import type { SetupTopic } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { goal, target } from './helpers/setupScript';

const RUN = 4;
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// The first run of RUN or more words that `explanation` shares with `card`, or null.
export function sharedRun(explanation: string, card: string): string | null {
  const words = norm(explanation).split(' ').filter(Boolean);
  const haystack = ` ${norm(card)} `;
  for (let i = 0; i + RUN <= words.length; i++) {
    const run = words.slice(i, i + RUN).join(' ');
    if (haystack.includes(` ${run} `)) return run;
  }
  return null;
}

// Every subtitle code or the steps' examples put under a question, by topic.
function subtitles(): Map<SetupTopic, string[]> {
  const out = new Map<SetupTopic, string[]>();
  const add = (topic: SetupTopic, ...texts: (string | null | undefined)[]) => out.set(topic, [...(out.get(topic) ?? []), ...texts.filter((t): t is string => !!t)]);
  for (const step of SETUP_STEPS) for (const e of step.examples) add(e.topic, e.say, e.detail);
  for (const row of SETTINGS_ROWS) add(row.topic, row.reason, SETTINGS_SKIP_LINE);
  add('week_start', WEEK_WORDS.weekStartReason);
  add('planning_moment', WEEK_WORDS.planningReason);
  add('capacity', WEEK_WORDS.timeSkipLine);
  add('day_end', DAY_END_SAY);
  add('starting_point', GOAL_WORDS.startingReason);
  add('shape', GOAL_WORDS.shapeReason);
  add('start_date', GOAL_WORDS.startReason);
  add('block_length', GOAL_WORDS.blockReason);
  add('end_date', GOAL_WORDS.endReason);
  return out;
}

function counting(title: string) {
  const d = emptyDraft();
  const g = goal('g1', 'Reading');
  g.targets.push(target('t1', title));
  d.model.goals.push(g);
  return d;
}

describe('an explanation never repeats the card\'s own subtitle or lead-in', () => {
  it('the helper finds a run of 4 words and ignores punctuation and capitals', () => {
    expect(sharedRun('Big or small, in your own words.', 'This is your goal in your own words.')).toBe('in your own words');
    expect(sharedRun('Momentum shows your progress from what you log.', 'Like pages. Momentum shows your progress.')).toBe('momentum shows your progress');
    expect(sharedRun('It is up to you.', 'Up to you.')).toBeNull();
  });

  const bySubtitle = subtitles();
  const topics = [...new Set<SetupTopic>([...(Object.keys(EXPLANATIONS) as SetupTopic[]), 'floor', 'aspiration', 'number_level'])];

  it.each(topics)('%s: nothing in the explanation is already in a subtitle or example under the question', (topic) => {
    for (const draft of [null, counting('Pages')]) {
      const text = explanationFor(topic, draft)?.text;
      if (!text) continue;
      for (const card of bySubtitle.get(topic) ?? []) expect(sharedRun(text, card), `"${text}" repeats "${card}"`).toBeNull();
    }
  });

  it('every turn in the scripted conversations: the lead-in and the detail do not repeat the explanation either', () => {
    const repeats: string[] = [];
    for (const c of SETUP_CASES) {
      for (const [i, turn] of c.script.entries()) {
        if (!turn.topic) continue;
        const text = explanationFor(turn.topic, turn.draft)?.text;
        if (!text) continue;
        for (const shown of [turn.say, turn.detail ?? '']) {
          const run = shown ? sharedRun(text, shown) : null;
          if (run) repeats.push(`${c.id} turn ${i} (${turn.topic}): "${run}"`);
        }
      }
    }
    expect(repeats).toEqual([]);
  });
});
