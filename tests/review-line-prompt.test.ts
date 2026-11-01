// Layer 2's prompt after the warmer-tone change (MOM-113 block 3.4, owner-approved word for word on 2026-10-31). What these hold fixed:
// - the rules did not move: one sentence, no number, no question, nothing to do, only the facts, a celebration stands alone, JSON only,
// - the warmth is in the prompt as approved (a kind friend; "tracked, not judged" said kindly without the cold words; the three tones),
// - the reply checks did not move either: a warm line passes, and a line with a number, a question or an ask is still refused,
// - the facts sent are the same fields as before (the privacy notice's pin is tests/review-prompt-fields.test.ts).
// No network call: the prompt is a constant and the checks are pure.

import { describe, expect, it } from 'vitest';
import { REVIEW_SYSTEM_PROMPT, buildReviewMessages, reviewPromptFacts } from '@/lib/ai/review';
import { REFLECTION_MAX_CHARS, checkReflectionLine, type ReflectionFacts } from '@/lib/review/reflection';

describe('the rules in the prompt are unchanged', () => {
  it.each([
    'Write ONE plain sentence, under 200 characters',
    '- No numbers at all: no digits and no number words (not "two", "twice", "first", "half"). No percentages, scores, grades or ratings.',
    '- No question, and nothing the person must answer or do. Do not suggest, advise, remind or ask. Do not mention next week or what to change.',
    '- Say only what the facts say. Add no activity, reason, feeling, date or weekday that the facts do not give.',
    '- Never call a week a failure or a miss.',
    '- A celebration stands alone. If something is worth being glad about, say only that.',
    'Tone changes your words, never the facts.',
    '- Reply with only a JSON object: {"line": "<your one sentence>"}. If a note says your last try was not usable, fix exactly that.',
  ])('still says: %s', (rule) => {
    expect(REVIEW_SYSTEM_PROMPT).toContain(rule);
  });

  it('keeps the length in step with the check', () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain(`under ${REFLECTION_MAX_CHARS} characters`);
  });
});

describe('the warmth, as approved', () => {
  it('asks for a kind friend who has been following along, never a report', () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      'Sound like a kind friend who has been following along: warm and natural, never like a report or a status message.',
    );
  });

  it('says "tracked, not judged" kindly and without the cold words', () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain(
      'A target "tracked, not judged" has no level to measure it against. Say that kindly and simply, for example that it is just being kept an eye on this week. Never use the words "judged", "verdict", "graded" or "not graded", and never call it good or bad.',
    );
  });

  it('describes the three tones, the direct one still kind', () => {
    expect(REVIEW_SYSTEM_PROMPT).toContain('"gentle" is soft and warm, "middle" is calm and friendly, "direct" is brief and matter-of-fact but still kind.');
  });
});

describe('what the checks still do with a warmer line', () => {
  const titles = ['Study', 'Run 5k'];

  it.each([
    "You're keeping an eye on Study this week, with nothing to measure it against.",
    'Study is simply there to look at this week, with nothing to measure it against.',
    'You kept Run 5k going this week, and that counts for something.',
  ])('passes: %s', (line) => {
    expect(checkReflectionLine(line, titles)).toEqual({ ok: true, line });
  });

  it('still refuses a number, a question, an ask and a score, however warm', () => {
    expect(checkReflectionLine('What a lovely week, you did it twice!', titles)).toMatchObject({ ok: false, problem: 'number' });
    expect(checkReflectionLine('A lovely week, wasn’t it?', titles)).toMatchObject({ ok: false, problem: 'question' });
    expect(checkReflectionLine('A lovely week, you should keep going.', titles)).toMatchObject({ ok: false, problem: 'ask' });
    expect(checkReflectionLine('A lovely week, well graded.', titles)).toMatchObject({ ok: false, problem: 'score' });
  });
});

describe('the facts sent are the same fields as before', () => {
  const facts: ReflectionFacts = {
    tone: 'gentle',
    targets: [{ title: 'Study', level: 'tracked, not judged', crossings: [], patterns: [], trend: null }],
  };

  it('sends the tone and each target, and on a retry only code\'s note', () => {
    expect(reviewPromptFacts(facts)).toEqual({ tone: 'gentle', targets: facts.targets });
    expect(Object.keys(reviewPromptFacts(facts, ['Do not ask a question.']))).toEqual(['tone', 'targets', 'retryFeedback']);
    const first = buildReviewMessages(facts);
    expect(first).toHaveLength(1);
    expect(JSON.stringify(first[0].content)).toContain('tone');
    expect(JSON.stringify(first[0].content)).not.toContain('Your last try');
  });
});
