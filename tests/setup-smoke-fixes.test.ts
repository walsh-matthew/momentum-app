// The MOM-111 setup fix round from the owner's phone smoke test of 2026-10-29: each rule below runs across every setup step,
// not one patched screen. Root cause B (what the person said counts wherever they said it), the plain-words checks
// (findings 4 and 6), the example sweep (finding 5), the retry feedback table (root cause A), the clean versions of the
// person's words (finding 11), and the smoke-test eval cases, including the owner's own paths. Pure: no network, no model.

import { describe, expect, it } from 'vitest';
import {
  VIOLATION_CODES,
  askedForSuggestions,
  checkDateLeadIn,
  checkLeadIn,
  checkNoNewActivity,
  checkOneQuestion,
  checkQuestionLength,
  checkTurn,
  type TurnContext,
} from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval, violationsOf } from '@/lib/setup/evals';
import { RETRY_FEEDBACK, failingPaths, retryFeedback } from '@/lib/setup/feedback';
import { PLAIN_PATH_FORMS, freeTextLeaves } from '@/lib/setup/leaves';
import { paraphraseAddsNothing, shownModel } from '@/lib/setup/paraphrase';
import { renderPlayback } from '@/lib/setup/playback';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { draftToRows } from '@/lib/setup/rows';
import { answerAt, latestAnswer, personWords, pickedOptionIndex } from '@/lib/setup/said';
import { DAY_END_SAY, HARD_RULES, PLAIN_WORDS, SETUP_STEPS } from '@/lib/setup/steps';
import { asksForIdeas, wantsIdeas } from '@/lib/setup/text';
import { validateDraft } from '@/lib/setup/validate';
import { activitiesIn, unsaidActivities } from '@/lib/setup/activities';
import type { AssistantTurn, Transcript, TurnKind } from '@/types/setup';
import { scriptedModel } from './helpers/setupScript';
import { SETUP_CASES } from './setup-evals/cases';
import { PHONE_CODE_TURNS, SMOKE_CASES, SMOKE_TODAY } from './setup-evals/smokeCases';

function turn(over: Partial<AssistantTurn> = {}): AssistantTurn {
  return { kind: 'question', chunk: null, skipped: null, detail: null, say: '', question: 'What would you like to work on?', topic: 'idea', options: [], draft: emptyDraft(), ...over };
}
const asked = (over: Partial<AssistantTurn> = {}): Transcript[number] => ({ role: 'assistant', turn: turn(over) });
const said = (text: string): Transcript[number] => ({ role: 'person', text });
const ctx = (transcript: Transcript = []): TurnContext => ({ transcript, prevDraft: emptyDraft() });
const codes = (v: { code: string }[]) => v.map((x) => x.code);

const ASKING_KINDS: TurnKind[] = ['question', 'offer_ideas', 'ideas', 'interpretations', 'proposal'];

// ---------------------------------------------------------------------------
// The smoke-test eval cases
// ---------------------------------------------------------------------------

describe.each(SMOKE_CASES)('smoke case $id', (c) => {
  it(c.title, async () => {
    const report = await runSetupEval(c, scriptedModel(c.script));
    expect(report.malformed).toBeNull();
    if (c.expect === 'clean') {
      expect(report.turns.flatMap((t) => t.violations.map((v) => `turn ${t.index} [${v.rule}] ${v.message}`))).toEqual([]);
      expect(report.finished).toBe(true);
      expect(report.finalIssues).toEqual([]);
    } else {
      expect(violationsOf(report)).toEqual(c.expect.violations);
    }
  });
});

describe('the owner\'s phone paths (run-m-phone-paths)', () => {
  const phone = SMOKE_CASES.find((c) => c.id === 'run-m-phone-paths');
  if (!phone) throw new Error('no phone case');

  it('has code, not the model, answer "next week", "Monday" and "two months from now", with exactly the turns the script expects', async () => {
    const report = await runSetupEval(phone, scriptedModel(phone.script));
    const byCode = report.turns.filter((t) => t.byCode);
    expect(byCode.map((t) => t.turn.question)).toEqual([PHONE_CODE_TURNS.askDay, PHONE_CODE_TURNS.start, PHONE_CODE_TURNS.stretch]);
    for (const t of byCode) expect(t.turn).toEqual(phone.script[t.index]);
    expect(report.draft.model.goals[0].startDate).toBe('2026-11-02');
    // The start date counts as accepted: the person said yes to the proposal code showed.
    expect(report.draft.said.find((s) => s.path === 'goals.g1.startDate')?.how).toBe('accepted');
  });

  it('turns "two months from now" into whole weeks from the start date, accepted with one tap (round 2 finding 7)', async () => {
    const report = await runSetupEval(phone, scriptedModel(phone.script));
    expect(report.draft.model.goals[0].blockWeeks).toBe(9);
    expect(report.draft.said.find((s) => s.path === 'goals.g1.blockWeeks')?.how).toBe('accepted');
  });

  it('records "Heavy for lifts, I log my runs" as Hevy plus the person\'s own logging, on the one target (round 2)', async () => {
    for (const id of ['run-m-phone-paths', 'run-m-apple-watch']) {
      const c = SMOKE_CASES.find((x) => x.id === id);
      if (!c) throw new Error(id);
      const report = await runSetupEval(c, scriptedModel(c.script));
      expect(report.finalIssues).toEqual([]);
      expect(report.draft.model.goals[0].targets[0].sources).toEqual([{ kind: 'synced', provider: 'hevy', metric: null }, { kind: 'manual' }]);
    }
  });

  it('plays the why back in clean words, and saves what was shown (finding 11)', async () => {
    const report = await runSetupEval(phone, scriptedModel(phone.script));
    const lines = renderPlayback(shownModel(report.draft, report.transcript), 'goals', { today: SMOKE_TODAY });
    expect(lines).toEqual(['Goal: Physical fitness, because you want to be around for your kids.']);
    const rows = draftToRows(report.draft, report.transcript);
    if (!rows.ok) throw new Error('expected rows');
    expect(rows.rows.goals[0].row.why).toBe('I want to be around for my kids');
  });

  it('without the person\'s today, every turn is the model\'s', async () => {
    const report = await runSetupEval({ ...phone, today: undefined }, scriptedModel(phone.script));
    expect(report.turns.some((t) => t.byCode)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Root cause B: what the person said counts wherever they said it
// ---------------------------------------------------------------------------

describe('asking for ideas or a recommendation counts wherever it is said', () => {
  it.each([
    'any recommendations?',
    'what do you recommend',
    'Do you have a recommendation?',
    'what do you suggest?',
    'any advice?',
    'some examples would help',
    'ideas please',
  ])('"%s" asks for ideas after any kind of turn', (text) => {
    expect(asksForIdeas(text)).toBe(true);
    for (const kind of ASKING_KINDS) {
      const answer = latestAnswer([asked({ kind, options: kind === 'ideas' || kind === 'interpretations' ? ['a', 'b'] : [] }), said(text)]);
      expect(askedForSuggestions(answer), kind).toBe(true);
    }
  });

  it('a plain yes counts only as the answer to the offer of ideas', () => {
    expect(wantsIdeas('yes please')).toBe(true);
    expect(asksForIdeas('yes please')).toBe(false);
    expect(askedForSuggestions(latestAnswer([asked({ kind: 'offer_ideas' }), said('Yes, please')]))).toBe(true);
    for (const kind of ['question', 'proposal', 'interpretations'] as const) {
      expect(askedForSuggestions(latestAnswer([asked({ kind }), said('Yes, please')])), kind).toBe(false);
    }
  });

  it('turning ideas down is never asking for them', () => {
    for (const text of ['I have something in mind', 'no thanks', 'my own answer']) {
      expect(asksForIdeas(text)).toBe(false);
      expect(wantsIdeas(text)).toBe(false);
    }
  });

  it('a tapped option counts as that option\'s words (finding 14)', () => {
    const list = asked({ kind: 'interpretations', options: ['You have a number in mind', 'Some starting ideas would help'] });
    expect(pickedOptionIndex('Option 2')).toBe(1);
    expect(pickedOptionIndex('the second one')).toBe(1);
    expect(pickedOptionIndex('Option two-ish thing')).toBeNull();
    expect(answerAt([list, said('Option 2')], 1)?.picked).toBe('Some starting ideas would help');
    expect(askedForSuggestions(latestAnswer([list, said('Option 2')]))).toBe(true);
    expect(askedForSuggestions(latestAnswer([list, said('Option 1')]))).toBe(false);
    // The checks read what the person picked as words they said.
    expect(personWords([list, said('Option 2')])).toEqual(['Option 2', 'Some starting ideas would help']);
  });

  it('lets ideas through after each way of asking, and stops them when nobody asked', () => {
    const ideas = turn({ kind: 'ideas', topic: 'floor', detail: 'The fewest a week, as starting points.', options: ['At least 2 a week', 'At least 3 a week'], question: 'Which of these would you like?' });
    const ok: Transcript[] = [
      [asked({ kind: 'offer_ideas', topic: 'floor' }), said('Yes')],
      [asked({ kind: 'interpretations', topic: 'floor', options: ['A number', 'Starting ideas'] }), said('Option 2')],
      [asked({ topic: 'floor' }), said('No idea, what do you suggest?')],
    ];
    for (const t of ok) expect(codes(checkTurn(ideas, ctx(t))).filter((c) => c.startsWith('choice.'))).toEqual([]);
    expect(codes(checkTurn(ideas, ctx([asked({ topic: 'floor' }), said('Three')])))).toContain('choice.ideas_unasked');
  });
});

describe('accepting a suggestion counts for a value shown in any kind of turn', () => {
  function draftWithFloor(n: number) {
    const draft = emptyDraft();
    draft.model.goals.push({
      key: 'g1', title: 'Read more', why: null, startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'active', returnWhen: null,
      completionMode: null, tone: null, items: [],
      targets: [{ key: 't1', title: 'Pages', measure: 'count', unit: null, role: 'effort', period: { kind: 'weekly' }, floor: n, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null, sources: [] }],
    });
    draft.said.push({ path: 'goals.g1.targets.t1.floor', turn: 1, how: 'accepted' });
    return draft;
  }
  const floorIssues = (shown: AssistantTurn, reply: string, n = 20) =>
    validateDraft(draftWithFloor(n), [{ role: 'assistant', turn: shown }, said(reply)], 'progress').issues.filter((i) => i.path.endsWith('floor'));

  it.each(ASKING_KINDS)('in a %s turn\'s question, lead-in or options', (kind) => {
    expect(floorIssues(turn({ kind, question: 'Would 20 pages a week work?' }), 'Yes')).toEqual([]);
    expect(floorIssues(turn({ kind, say: 'Many people start with 20 pages a week.', question: 'Would that work?' }), 'yes, that works')).toEqual([]);
    expect(floorIssues(turn({ kind, question: 'Which one?', options: ['10 pages', '20 pages'] }), 'Option 2')).toEqual([]);
  });

  it('never for a value the turn did not show (finding 9), or without a yes', () => {
    expect(floorIssues(turn({ question: 'What would you count, like pages read?' }), 'yes, pages per week')[0]?.code).toBe('not_accepted');
    expect(floorIssues(turn({ question: 'Would 20 pages a week work?' }), 'No, not that')[0]?.code).toBe('not_accepted');
  });
});

// ---------------------------------------------------------------------------
// Finding 4: lead-ins only react; finding 6: no activity nobody said
// ---------------------------------------------------------------------------

describe('a lead-in only reacts to the last answer (finding 4)', () => {
  const c = ctx([asked(), said('One goal.')]);
  it.each([
    "Next, I'll check when you want to start.",
    'Next is the start date.',
    "Now let's talk about your week.",
    "I'll now ask about your schedule.",
    'One more question about this.',
    'Moving on to the timing.',
  ])('"%s" is a preview, caught on every kind of asking turn', (say) => {
    for (const kind of ASKING_KINDS) expect(codes(checkLeadIn(turn({ kind, say }), c)), kind).toEqual(['plain.lead_in']);
  });

  it('lets a short reaction through, and stops one longer than one short line', () => {
    expect(checkLeadIn(turn({ say: 'Got it, one goal.' }), c)).toEqual([]);
    expect(checkLeadIn(turn({ say: '' }), c)).toEqual([]);
    expect(codes(checkLeadIn(turn({ say: 'Got it. That is a good place to start.' }), c))).toEqual(['plain.lead_in']);
  });

  it('exempts the fixed day-end explanation and the answer to "What do you mean?" (owner decision 2)', () => {
    expect(checkLeadIn(turn({ topic: 'day_end', say: DAY_END_SAY, question: 'When does your day end?' }), c)).toEqual([]);
    const meaning = ctx([asked({ topic: 'priorities' }), said('What do you mean?')]);
    expect(checkLeadIn(turn({ topic: 'priorities', say: 'I mean the parts of your life you want to keep room for. For example family time or rest.' }), meaning)).toEqual([]);
  });

  it('leaves playback and final turns alone: code writes them', () => {
    expect(checkLeadIn(turn({ kind: 'playback', chunk: 'goals', question: null, say: 'Next, I will play it back.' }), c)).toEqual([]);
  });
});

describe('no activity the person never said (finding 6)', () => {
  const fitness = ctx([asked(), said('physical fitness')]);
  it('catches one in a lead-in, a question, a skip line and an option, on every kind of asking turn', () => {
    for (const kind of ASKING_KINDS) {
      expect(codes(checkNoNewActivity(turn({ kind, question: 'How many workouts a week?' }), fitness)), kind).toEqual(['plain.activity']);
      expect(codes(checkNoNewActivity(turn({ kind, say: 'The gym is a good start.', question: 'How often?' }), fitness)), kind).toEqual(['plain.activity']);
      expect(codes(checkNoNewActivity(turn({ kind, skipped: { topic: 'why', line: 'You told me about lifting.' } }), fitness)), kind).toEqual(['plain.activity']);
    }
    expect(codes(checkNoNewActivity(turn({ kind: 'interpretations', options: ['Running', 'Something else'], question: 'Which?' }), fitness))).toEqual(['plain.activity']);
  });

  it('catches one in the draft\'s free text, which every playback part shows', () => {
    const draft = emptyDraft();
    draft.model.person.priorities = ['Morning runs with the dog... jogging'];
    expect(checkNoNewActivity(turn({ draft }), fitness).map((v) => v.path)).toEqual(['person.priorities.0']);
  });

  it('lets through what the person said, in their own words ("I ran a lot" says running)', () => {
    expect(checkNoNewActivity(turn({ question: 'How much running a week?' }), ctx([asked(), said('I ran a lot in college')]))).toEqual([]);
    expect(checkNoNewActivity(turn({ question: 'How many workouts a week?' }), ctx([asked(), said('exercise more')]))).toEqual([]);
    // Setup's own "run until a set date" names no activity.
    expect(activitiesIn('Does this keep going, or run until a set date?')).toEqual([]);
  });

  it('exempts ideas the person asked for, a recommendation they asked for, and the which-number question for an app', () => {
    expect(checkNoNewActivity(turn({ kind: 'ideas', options: ['Walking', 'Swimming'], question: 'Which of these?' }), ctx([asked({ kind: 'offer_ideas' }), said('Yes')]))).toEqual([]);
    expect(checkNoNewActivity(turn({ kind: 'proposal', say: 'Research suggests walking is an easy start.', question: 'Would that work?' }), ctx([asked(), said('any recommendations?')]))).toEqual([]);
    expect(codes(checkNoNewActivity(turn({ kind: 'proposal', say: 'Walking is an easy start.', question: 'Would that work?' }), fitness))).toEqual(['plain.activity']);
    expect(checkNoNewActivity(turn({ topic: 'metric', question: 'Which number should count: pounds lifted, sets, or minutes?' }), fitness)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Finding 5: every scripted example, swept
// ---------------------------------------------------------------------------

describe('every scripted example (finding 5)', () => {
  const examples = SETUP_STEPS.flatMap((s) => s.examples.map((e) => [s.n, e] as const));

  // Round 2: the detail line is read too, the core question is short, and nothing hides a second question in the detail.
  it.each(examples)('step %i example passes the plain-words checks and rule 1 with nothing said yet', (_n, e) => {
    const t = turn({ topic: e.topic, say: e.say ?? '', question: e.question, detail: e.detail ?? null });
    expect(checkLeadIn(t, ctx())).toEqual([]);
    expect(checkNoNewActivity(t, ctx())).toEqual([]);
    expect(checkQuestionLength(t)).toEqual([]);
    expect(checkDateLeadIn(t)).toEqual([]);
    expect(checkOneQuestion(t)).toEqual([]);
    expect(e.question.split(/\s+/).length, e.question).toBeLessThanOrEqual(12);
  });

  it('names no activity in any step summary, example or rule, and says "moving more and eating better"', () => {
    const text = [
      ...SETUP_STEPS.flatMap((s) => [s.summary, s.reason ?? '', ...s.examples.map((e) => `${e.say ?? ''} ${e.question} ${e.detail ?? ''}`)]),
      ...HARD_RULES.map((r) => r.text),
    ];
    // The which-number question for an app names that app's own numbers.
    const metric = SETUP_STEPS.find((s) => s.n === 9);
    const scanned = text.filter((t) => !metric || (t !== metric.summary && !/pounds lifted/i.test(t)));
    expect(scanned.filter((t) => activitiesIn(t).length > 0)).toEqual([]);
    expect(JSON.stringify(SETUP_STEPS)).toContain('moving more and eating better');
    expect(JSON.stringify(SETUP_STEPS)).not.toContain('lifting and eating better');
  });

  it('never tells Claude to preview a question or put the reason in a lead-in', () => {
    for (const s of SETUP_STEPS) expect(s.summary).not.toMatch(/\bSay why\b|\bNext,|\bsay once\b/i);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/It never previews the question/);
    expect(PLAIN_WORDS.join(' ')).toMatch(/only reacts to their last answer, in one short line/);
  });

  it('every turn of every clean scripted conversation passes the plain-words checks too', async () => {
    for (const c of [...SETUP_CASES, ...SMOKE_CASES].filter((x) => x.expect === 'clean')) {
      const report = await runSetupEval(c, scriptedModel(c.script));
      expect(report.turns.flatMap((t) => t.violations.filter((v) => v.rule === 'plain_words')), c.id).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Root cause A: the feedback table
// ---------------------------------------------------------------------------

describe('retry feedback (root cause A)', () => {
  it('has fixed words for every check code, and none quote a person', () => {
    for (const code of VIOLATION_CODES) expect(RETRY_FEEDBACK[code], code).toBeTruthy();
  });

  it('turns violations into one line per code, with draft paths and never a value', () => {
    const lines = retryFeedback([
      { rule: 'draft', code: 'draft.not_said', message: 'goals.g1.targets.t1.floor: 3 is not said', path: 'goals.g1.targets.t1.floor' },
      { rule: 'draft', code: 'draft.not_said', message: 'x', path: 'goals.g1.blockWeeks' },
      { rule: 'one_question', code: 'one_question.joined', message: 'Two asks are joined in one question.' },
    ]);
    expect(lines).toEqual([
      `${RETRY_FEEDBACK['draft.not_said']} Paths: goals.g1.blockWeeks, goals.g1.targets.t1.floor.`,
      RETRY_FEEDBACK['one_question.joined'],
    ]);
    expect(lines.join(' ')).not.toMatch(/\b3\b/);
  });

  it('logs a day type\'s path without its name, which is the person\'s words', () => {
    expect(failingPaths([{ rule: 'draft', code: 'draft.rule', message: '', path: 'person.dayTypes.my office days.capacityAmount' }])).toEqual([
      'person.dayTypes.<name>.capacityAmount',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Finding 11: the clean version of the person's words
// ---------------------------------------------------------------------------

describe('a clean version of the person\'s words (finding 11)', () => {
  const words = ['i wanna be around for my kids', 'Two goals', 'Mostly on Saturday mornings'];
  it('is used when it adds nothing they did not say', () => {
    expect(paraphraseAddsNothing('I want to be around for my kids', 'i wanna be around for my kids', words)).toBe(true);
  });

  it.each([
    ['an activity', 'I want to go jogging with my kids'],
    ['a number', 'I want to be around for my 3 kids'],
    ['a date', 'I want to be around for my kids by June 5'],
    ['a clock time', 'I want to be around for my kids at 6pm'],
    ['a weekday or day word', 'I want to be around for my kids on weekends'],
    ['a second sentence', 'I want to be around. For my kids.'],
    ['a question', 'Do I want to be around for my kids?'],
    ['far more words', 'I want to be around for my kids because family is the most important thing in the whole world to me'],
  ])('is not used when it adds %s', (_what, clean) => {
    expect(paraphraseAddsNothing(clean, 'i wanna be around for my kids', words)).toBe(false);
  });

  it('a day word the person did say may stay', () => {
    expect(paraphraseAddsNothing('Quiet on Saturday mornings', 'saturday mornings pls', words)).toBe(true);
  });

  it('applies at every free-text path a playback part shows, and falls back to the raw words when it fails', () => {
    const draft = emptyDraft();
    draft.model.person.priorities = ['fam time'];
    draft.model.settings.quietTimes = ['sunday morning pls'];
    draft.model.goals.push({
      key: 'g1', title: 'get fit', why: 'cuz kids', startDate: null, shape: null, endDate: null, blockWeeks: null, state: 'parked',
      returnWhen: { kind: 'condition', note: 'when my knee heals up' }, completionMode: null, tone: null,
      targets: [{ key: 't1', title: 'sesh', measure: 'count', unit: null, role: 'effort', period: { kind: 'weekly' }, floor: null, aspiration: null, qualifyingThreshold: null, carryOver: 'habit', completionMode: null, tone: null, sources: [] }],
      items: [{ key: 'i1', kind: 'milestone', title: 'see doc', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['book appt'] }],
    });
    const transcript: Transcript = [asked(), said('get fit cuz kids, fam time matters, sunday morning pls, when my knee heals up')];
    const clean: Record<string, string> = {
      'goals.g1.title': 'Get fit',
      'goals.g1.why': 'Because of my kids',
      'goals.g1.returnNote': 'When my knee heals',
      'goals.g1.targets.t1.title': 'Sessions',
      'goals.g1.items.i1.title': 'See the doctor',
      'goals.g1.items.i1.steps.0': 'Book an appointment',
      'person.priorities.0': 'Family time',
      'settings.quietTimes.0': 'Sunday mornings',
    };
    // One entry for each path form the prompt names.
    expect(Object.keys(clean)).toHaveLength(PLAIN_PATH_FORMS.length);
    draft.plain = Object.entries(clean).map(([path, text]) => ({ path, text }));
    const shown = shownModel(draft, transcript);
    expect(Object.fromEntries(freeTextLeaves(shown).filter((l) => l.path in clean).map((l) => [l.path, l.text]))).toEqual(clean);

    // One that adds a number nobody said is not used: the raw words are.
    draft.plain = [{ path: 'goals.g1.title', text: 'Get fit in 12 weeks' }];
    expect(shownModel(draft, transcript).goals[0].title).toBe('get fit');
  });
});

describe('the unsaid-activity reader', () => {
  it('groups words, so "working out" and "workouts" are the same thing said', () => {
    expect(unsaidActivities('How many workouts a week?', ['I want to work out more'])).toEqual([]);
    expect(unsaidActivities('How many runs or gym visits?', ['work out more'])).toEqual(['gym']);
  });

  it('does not read "work out" as exercise when it means figuring something out', () => {
    expect(activitiesIn('Never work out a date yourself.')).toEqual([]);
    expect(activitiesIn('We are working out the details.')).toEqual([]);
    expect(activitiesIn('How many workouts a week?')).toEqual(['exercise']);
    expect(activitiesIn('Is working out on your mind?')).toEqual(['exercise']);
  });
});
