// MOM-167 part 1: goal, target and work-item titles are short names, never the person's sentence. The check is a plain-words
// check (one retry, then the reply is shown), the prompt says so, and the playback reads correctly with the titles setup now
// produces: "at least 2 runs a week", a name keeping its capital.

import { describe, expect, it } from 'vitest';
import { checkTitles, checkTurn, onlyPlainWords, type TurnContext } from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import { retryFeedback } from '@/lib/setup/feedback';
import { countedWords, renderFinal, renderPlayback } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { PLAIN_WORDS } from '@/lib/setup/steps';
import { isSentenceTitle, newSentenceTitlePaths, titleLeaves } from '@/lib/setup/titles';
import type { AssistantTurn, SetupDraft, Transcript } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';

function draftWith(goalTitle: string, targetTitle: string, itemTitle?: string): SetupDraft {
  const draft = emptyDraft();
  draft.model.goals = [
    goal('g1', goalTitle, {
      shape: 'ongoing',
      startDate: '2026-11-02',
      targets: [target('t1', targetTitle, { floor: 2 })],
      items: itemTitle ? [item('i1', 'habit', itemTitle, { targetKey: 't1' })] : [],
    }),
  ];
  return draft;
}
function turnOf(draft: SetupDraft): AssistantTurn {
  return { kind: 'question', chunk: null, skipped: null, detail: null, say: '', question: 'What else matters to you right now?', topic: 'priorities', options: [], draft };
}
const ctx = (prevDraft: SetupDraft = emptyDraft(), transcript: Transcript = []): TurnContext => ({ transcript, prevDraft });

describe('what reads as a sentence and what reads as a name', () => {
  it.each([
    'I want to get back into running',
    "I'm trying to read more",
    'you want to go for runs each week',
    'We want to eat together',
    'To get fit',
    'Need to save money',
    'Going to the gym more',
    'Get fit for the wedding.',
    'Run three times a week for my health',
    'Reading is my way to unwind',
    'Wanna lose weight',
  ])('flags %s', (title) => {
    expect(isSentenceTitle(title)).toBe(true);
  });

  it.each([
    'Running',
    'Runs',
    'Pages read',
    'Family dinners',
    'Getting back into running',
    'Read more',
    'Get back into running',
    'Spanish lessons',
    "Emma's recitals",
    'Hevy workouts',
    'Workdays',
  ])('lets %s through', (title) => {
    expect(isSentenceTitle(title)).toBe(false);
  });

  it('counts the words, six at most', () => {
    expect(isSentenceTitle('One two three four five six')).toBe(false);
    expect(isSentenceTitle('One two three four five six seven')).toBe(true);
  });
});

describe('the check on a turn', () => {
  it('flags a sentence title as a plain-words violation at the title’s path, and no other', () => {
    const turn = turnOf(draftWith('Getting back into running', 'you want to go for runs each week', 'Send the form'));
    const found = checkTitles(turn, ctx());
    expect(found.map((x) => x.path)).toEqual(['goals.g1.targets.t1.title']);
    expect(found[0].rule).toBe('plain_words');
    expect(found[0].code).toBe('plain.title');
    // Part of checkTurn, so a reply with only this is retried once and then shown, never "Try again".
    expect(onlyPlainWords(checkTurn(turn, ctx()).filter((x) => x.code === 'plain.title'))).toBe(true);
  });

  it('checks a goal title, a work item title and a kind of day', () => {
    const draft = draftWith('I want to get back into running', 'Runs', 'I need to send the form today');
    draft.model.person.dayTypes = [{ name: 'The days when I am at my mother’s house', capacityAmount: null, capacityUnit: null }];
    const paths = checkTitles(turnOf(draft), ctx()).map((x) => x.path);
    expect(paths).toEqual(expect.arrayContaining(['goals.g1.title', 'goals.g1.items.i1.title', 'person.dayTypes']));
  });

  it('does not flag a title the conversation has already met', () => {
    const before = draftWith('I want to get back into running', 'Runs');
    const after = structuredClone(before);
    after.model.goals[0].targets.push(target('t2', 'Pages read', { floor: 3 }));
    expect(newSentenceTitlePaths(after.model, before.model)).toEqual([]);
    expect(checkTitles(turnOf(after), ctx(before))).toEqual([]);
  });

  it('flags a title again when it changes to another sentence', () => {
    const before = draftWith('I want to get back into running', 'Runs');
    const after = structuredClone(before);
    after.model.goals[0].title = 'I really want to run again';
    expect(newSentenceTitlePaths(after.model, before.model)).toEqual(['goals.g1.title']);
  });

  it('reads the clean version the person is shown, not the raw title', () => {
    // Claude wrote a short clean version for the title: that is what the playback shows, so that is what is checked.
    const draft = draftWith('I wanna run', 'Runs');
    draft.plain = [{ path: 'goals.g1.title', text: 'Running' }];
    const transcript: Transcript = [{ role: 'person', text: 'I wanna run' }];
    expect(checkTitles(turnOf(draft), ctx(emptyDraft(), transcript))).toEqual([]);
  });

  it('lists the titles it reads, with no day type name in a path', () => {
    const draft = draftWith('Running', 'Runs', 'Send the form');
    draft.model.person.dayTypes = [{ name: 'Workdays', capacityAmount: null, capacityUnit: null }];
    expect(titleLeaves(draft.model).map((l) => l.path)).toEqual(['person.dayTypes', 'goals.g1.title', 'goals.g1.targets.t1.title', 'goals.g1.items.i1.title']);
  });
});

describe('the retry note and the prompt', () => {
  it('tells Claude in fixed words which titles to rewrite, without quoting any of them', () => {
    const turn = turnOf(draftWith('Running', 'I want to run twice a week'));
    const lines = retryFeedback(checkTurn(turn, ctx()).filter((x) => x.code === 'plain.title'));
    expect(lines).toEqual([
      "A title must be a short name, not a sentence. Write the titles at the paths below as a few words, with no 'I', 'you' or 'want'. Paths: goals.g1.targets.t1.title.",
    ]);
    expect(lines.join(' ')).not.toMatch(/twice/);
  });

  it('puts the rule in the prompt with short examples', () => {
    expect(PLAIN_WORDS.some((line) => /A title is a short name, never a sentence/.test(line))).toBe(true);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/A target's title names what is counted, as a plural noun/);
  });
});

describe('the playback and the final lines with the titles setup now produces', () => {
  const model = draftWith('Getting back into running', 'Runs').model;
  const lines = renderPlayback(model, 'targets').join('\n');

  it('reads the goal and the target as plain sentences', () => {
    expect(lines).toContain('Getting back into running keeps going, starting');
    expect(lines).toContain('Your goal: at least 2 runs a week.');
    expect(renderFinal(model)).toContain('Your goal: at least 2 runs a week.');
  });

  it('lowercases a target title in the middle of a sentence, and says one in the singular', () => {
    expect(countedWords('Runs')).toBe('runs');
    expect(countedWords('Pages read')).toBe('pages read');
    const one = draftWith('Running', 'Runs').model;
    one.goals[0].targets[0].floor = 1;
    expect(renderPlayback(one, 'targets').join('\n')).toContain('Your goal: at least 1 run a week.');
  });

  it('keeps the capital of a name: a word the person wrote with one, and an app’s name', () => {
    expect(countedWords('Spanish lessons', ['I want to take Spanish lessons'])).toBe('Spanish lessons');
    expect(countedWords('Hevy workouts')).toBe('Hevy workouts');
    expect(countedWords('PT sessions')).toBe('PT sessions');
    const named = draftWith('Learning Spanish', 'Spanish lessons').model;
    const text = renderPlayback(named, 'targets', { said: ['I want to take Spanish lessons'] }).join('\n');
    expect(text).toContain('Your goal: at least 2 Spanish lessons a week.');
  });
});
