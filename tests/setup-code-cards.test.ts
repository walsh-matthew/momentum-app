// MOM-178: the two cards code writes in guided setup, with no Claude call: the time zone, asked as soon as "what counts" is approved, and
// "how Momentum talks to you", asked as soon as the planning is. What these hold the code to:
// 1. The settings card asks only the four settings something reads, in the owner's words; reminders, check-ins, quiet times and balance
//    mentions are not asked and stay unset; nothing is pre-selected and a row left alone stays unset.
// 2. The cards come from code at the right moment (the person's yes to the playback before them) and never otherwise, never for a person
//    adding to a finished setup, and the part the yes approves is marked approved in the card's own draft.
// 3. An answer enters the draft as the person's: their own message, one `said` entry each, a zone accepted only if the card showed it.
// 4. The service answers a card with no call to Claude, and a card that would break a draft rule goes to Claude instead.
// 5. Claude may not ask a card's topic, and the setup prompt no longer asks for the four unused ones.
// Nothing here touches the network.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeAddTurn, takeSetupTurn } from '@/lib/services/setup';
import type { RunSetupTurnArgs, SetupTurnResult } from '@/lib/services/llm';
import {
  SETTINGS_CARD_MARK,
  SETTINGS_HEADING,
  SETTINGS_NONE_SAID,
  SETTINGS_ROWS,
  SETTINGS_SKIP_LINE,
  TIME_ZONE_ASK,
  TIME_ZONE_CARD_MARK,
  UNUSED_SETTING_TOPICS,
  answerSettings,
  answerTimeZone,
  isSettingsCard,
  isTimeZoneCard,
  settingsRowsLeft,
  zoneOfTurn,
} from '@/lib/setup/cards';
import { cardStep } from '@/lib/setup/cardTurns';
import { checkSkipAnswered, checkTurn, type TurnContext } from '@/lib/setup/checks';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { draftToRows } from '@/lib/setup/rows';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { SETUP_STEPS } from '@/lib/setup/steps';
import { renderFinal, renderPlayback } from '@/lib/setup/playback';
import { CELEBRATION_LEVELS, REVIEW_DEPTHS, REVIEW_PLANNING_MODES, TONES } from '@/types/database.types';
import type { AssistantTurn, SetupSession, Transcript } from '@/types/setup';
import { createSupabaseServerClient, resetFakeSave } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';
import { SETUP_CASES } from './setup-evals/cases';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
beforeEach(() => resetFakeSave({ id: ME }));
afterEach(() => vi.restoreAllMocks());

const DENVER = 'America/Denver';

// The finished habit conversation (run-l, one-word answers: a weekly goal), cut where the person has just said yes to a playback.
async function conversation() {
  const c = SETUP_CASES.find((x) => x.id === 'run-b-habit-ideas');
  if (!c) throw new Error('no case');
  const report = await runSetupEval(c, scriptedModel(c.script));
  if (!report.finished) throw new Error('the case did not finish');
  return report;
}

// The session at the moment the person has answered "Yes" to the playback of `chunk` (the last message is theirs).
async function afterYesTo(chunk: 'goals' | 'targets' | 'planning' | 'talk'): Promise<SetupSession> {
  const report = await conversation();
  const t = report.transcript;
  const at = t.findIndex((m) => m.role === 'assistant' && m.turn.kind === 'playback' && m.turn.chunk === chunk && t[t.indexOf(m) + 1]?.role === 'person');
  const shown = t[at];
  if (shown?.role !== 'assistant') throw new Error(`no ${chunk} playback`);
  return { transcript: t.slice(0, at + 2), draft: shown.turn.draft, spentTokens: 0 };
}

const lastTurn = (s: SetupSession): AssistantTurn => {
  const m = s.transcript[s.transcript.length - 1];
  if (m?.role !== 'assistant') throw new Error('the conversation does not end with a turn');
  return m.turn;
};

// ---------------------------------------------------------------------------
// 1. The settings card's rows
// ---------------------------------------------------------------------------

describe('the settings card asks only what something reads', () => {
  it('has the four rows in the owner\'s words, in order', () => {
    expect(SETTINGS_ROWS.map((r) => [r.topic, r.question, r.reason])).toEqual([
      ['tone', 'How direct should Momentum be?', 'Your progress and weekly look-back are worded that way.'],
      ['celebrations', 'How big should a celebration be?', 'Used when you pass a number you set.'],
      ['review_depth', 'How much should your weekly look-back cover?', 'It decides what you see when you look back on your week.'],
      ['review_planning', 'Look back and plan the next week together, or separately?', 'It sets whether those two happen in one go.'],
    ]);
    expect(SETTINGS_ROWS.map((r) => r.choices.map((c) => c.label))).toEqual([
      ['Gentle', 'Plain', 'Direct'],
      ['Low-key', 'Medium', 'Big'],
      ['Short recap only', 'Recap, with an offer to go deeper', 'Recap and a few questions'],
      ['One sitting', 'Separately'],
    ]);
  });

  it('says in its own words that these cannot be changed after setup yet (the owner\'s two lines, exactly)', () => {
    expect(SETTINGS_HEADING).toBe('How should Momentum talk to you?');
    expect(SETTINGS_SKIP_LINE).toBe("Skip any you like. You can't change these after setup yet.");
    const final = renderFinal(emptyModel());
    expect(final.at(-1)).toBe("You can't change your choices after setup yet. That's coming soon.");
    expect(final.join(' ')).not.toMatch(/settings page/);
  });

  it('offers only values the database knows, so what a tap sets can be saved', () => {
    const allowed: Record<string, readonly string[]> = {
      tone: TONES,
      celebrations: CELEBRATION_LEVELS,
      review_depth: REVIEW_DEPTHS,
      review_planning: REVIEW_PLANNING_MODES,
    };
    for (const row of SETTINGS_ROWS) expect(row.choices.map((c) => c.value)).toEqual(allowed[row.topic]);
  });

  it('leaves out reminders, check-ins, quiet times and balance mentions: no row, no step topic, nothing for Claude to ask', () => {
    const asked = new Set<string>(SETTINGS_ROWS.map((r) => r.topic));
    for (const topic of UNUSED_SETTING_TOPICS) expect(asked.has(topic), topic).toBe(false);
    const stepTopics = new Set(SETUP_STEPS.flatMap((s) => s.topics));
    for (const topic of UNUSED_SETTING_TOPICS) expect(stepTopics.has(topic), topic).toBe(false);
    const talk = SETUP_STEPS.find((s) => s.id === 'how_momentum_talks');
    expect(talk?.examples).toEqual([]);
    expect(talk?.summary).toMatch(/Never write a question for any of them/);
    expect(talk?.summary).not.toMatch(/reminder|check-in|quiet time|balance/i);
  });

  it('settings already given are not asked again', () => {
    const settings = emptyModel().settings;
    expect(settingsRowsLeft(settings)).toHaveLength(4);
    expect(settingsRowsLeft({ ...settings, tone: 'direct', reviewDepth: 'full' }).map((r) => r.topic)).toEqual(['celebrations', 'review_planning']);
  });
});

function emptyModel() {
  return emptyDraft().model;
}

// ---------------------------------------------------------------------------
// 2. When a card comes
// ---------------------------------------------------------------------------

describe('code writes a card the moment the part before it is approved, and not otherwise', () => {
  it('shows the zone the phone reports as a proposal after the targets playback is accepted, with that part marked approved', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    const card = cardStep(session.transcript, draft, DENVER);
    if (!card) throw new Error('no card');
    expect(isTimeZoneCard(card)).toBe(true);
    expect(card.kind).toBe('proposal');
    expect(card.question).toBe('Your phone is set to Mountain Time (Denver). Is that your time zone?');
    expect(card.detail).toBe(TIME_ZONE_CARD_MARK);
    expect(card.draft.approved).toContain('targets');
    expect(card.draft.model.person.timeZone).toBeNull();
  });

  it('asks plainly, with the search only, when the phone reports no zone or one that is not a zone', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    for (const device of [null, 'Not/AZone']) {
      const card = cardStep(session.transcript, draft, device);
      expect(card?.kind).toBe('question');
      expect(card?.question).toBe(TIME_ZONE_ASK);
      expect(card && isTimeZoneCard(card)).toBe(true);
    }
  });

  it('carries the zone Yes accepts beside the words, and nothing for the card that shows none (the words are in tests/setup-time-zone-words.test.ts)', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    const shown = cardStep(session.transcript, draft, DENVER);
    const asked = cardStep(session.transcript, draft, null);
    expect(shown && zoneOfTurn(shown)).toBe(DENVER);
    expect(asked && zoneOfTurn(asked)).toBeNull();
  });

  it('asks no zone when one is known, and no card for an answer that is not an acceptance', async () => {
    const session = await afterYesTo('targets');
    const known = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: DENVER } } };
    expect(cardStep(session.transcript, known, DENVER)).toBeNull();
    const changing: Transcript = [...session.transcript.slice(0, -1), { role: 'person', text: 'Actually, make it three a week.' }];
    expect(cardStep(changing, { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } }, DENVER)).toBeNull();
  });

  it('shows the settings card after the planning playback is accepted, topic first row, planning marked approved', async () => {
    const session = await afterYesTo('planning');
    const card = cardStep(session.transcript, session.draft, DENVER);
    if (!card) throw new Error('no card');
    expect(isSettingsCard(card)).toBe(true);
    expect(card.question).toBe(SETTINGS_HEADING);
    expect(card.detail).toBe(SETTINGS_CARD_MARK);
    expect(card.topic).toBe('tone');
    expect(card.draft.approved).toEqual(expect.arrayContaining(['goals', 'targets', 'planning']));
    expect(card.draft.approved).not.toContain('talk');
    // Nothing is pre-chosen: every setting is still unset.
    expect(Object.values(card.draft.model.settings)).toEqual([null, null, null, null, null, null, null, null]);
  });

  it('goes straight to the playback of the part when every row is already answered, and skips a row already given', async () => {
    const session = await afterYesTo('planning');
    const some = structuredClone(session.draft);
    some.model.settings.tone = 'direct';
    const partly = cardStep(session.transcript, some, DENVER);
    expect(partly && isSettingsCard(partly)).toBe(true);
    expect(partly?.topic).toBe('celebrations');
    const all = structuredClone(session.draft);
    Object.assign(all.model.settings, { tone: 'gentle', celebrations: 'big', reviewDepth: 'full', reviewPlanning: 'separate' });
    const played = cardStep(session.transcript, all, DENVER);
    expect(played?.kind).toBe('playback');
    expect(played?.chunk).toBe('talk');
  });

  it('waits while a part changed after approval is still to be played back again, and never repeats the card', async () => {
    const session = await afterYesTo('planning');
    const waiting = { ...session.draft, approved: session.draft.approved.filter((c) => c !== 'targets') };
    expect(cardStep(session.transcript, waiting, DENVER)).toBeNull();
    const done = { ...session.draft, approved: [...session.draft.approved, 'talk' as const] };
    expect(cardStep(session.transcript, done, DENVER)).toBeNull();
    const card = cardStep(session.transcript, session.draft, DENVER);
    if (!card) throw new Error('no card');
    const again: Transcript = [...session.transcript, { role: 'assistant', turn: card }, { role: 'person', text: 'Yes, that is right.' }];
    expect(cardStep(again, card.draft, DENVER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. The person's answers
// ---------------------------------------------------------------------------

describe('an answer to a card is the person\'s own', () => {
  async function zoneCardSession(device: string | null = DENVER): Promise<SetupSession> {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } }, said: session.draft.said.filter((s) => s.path !== 'person.timeZone') };
    const card = cardStep(session.transcript, draft, device);
    if (!card) throw new Error('no card');
    return { transcript: [...session.transcript, { role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
  }

  it('records a yes to the zone shown as accepted, in the person\'s own message', async () => {
    const session = await zoneCardSession();
    const next = answerTimeZone(session, DENVER, 'accepted');
    if (!next) throw new Error('refused');
    expect(next.draft.model.person.timeZone).toBe(DENVER);
    expect(next.transcript.at(-1)).toEqual({ role: 'person', text: PROPOSAL_YES_TEXT });
    expect(next.draft.said.find((s) => s.path === 'person.timeZone')).toEqual({ path: 'person.timeZone', turn: session.transcript.length, how: 'accepted' });
  });

  it('records a zone picked from the list as said, and takes a yes only for the zone the card showed', async () => {
    const session = await zoneCardSession();
    const picked = answerTimeZone(session, 'America/Chicago', 'said');
    expect(picked?.draft.model.person.timeZone).toBe('America/Chicago');
    expect(picked?.transcript.at(-1)).toEqual({ role: 'person', text: 'America/Chicago' });
    expect(picked?.draft.said.at(-1)?.how).toBe('said');
    expect(answerTimeZone(session, 'America/Chicago', 'accepted')).toBeNull();
    expect(answerTimeZone(session, 'Not/AZone', 'said')).toBeNull();
    expect(answerTimeZone(session, 'x'.repeat(80), 'said')).toBeNull();
    const noZone = await zoneCardSession(null);
    expect(answerTimeZone(noZone, DENVER, 'accepted')).toBeNull();
    expect(answerTimeZone(noZone, DENVER, 'said')?.draft.model.person.timeZone).toBe(DENVER);
  });

  it('takes no answer when the newest turn is not the time zone card', async () => {
    const session = await afterYesTo('targets');
    expect(answerTimeZone(session, DENVER, 'said')).toBeNull();
  });

  async function settingsCardSession(): Promise<SetupSession> {
    const session = await afterYesTo('planning');
    const card = cardStep(session.transcript, session.draft, DENVER);
    if (!card) throw new Error('no card');
    return { transcript: [...session.transcript, { role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
  }

  it('sets what was tapped, notes each as said at the person\'s message, plays the part back by code, and leaves the rest unset', async () => {
    const session = await settingsCardSession();
    const next = answerSettings(session, { tone: 'gentle', review_planning: 'separate' });
    if (!next) throw new Error('refused');
    const s = next.draft.model.settings;
    expect(s).toEqual({
      tone: 'gentle',
      reminders: null,
      checkIns: null,
      celebrations: null,
      balanceMentions: null,
      reviewDepth: null,
      reviewPlanning: 'separate',
      quietTimes: null,
    });
    const at = session.transcript.length;
    expect(next.transcript[at]).toEqual({ role: 'person', text: 'Tone: Gentle. Planning: Separately.' });
    expect(next.draft.said.filter((e) => e.path.startsWith('settings.')).map((e) => [e.path, e.turn, e.how])).toEqual([
      ['settings.tone', at, 'said'],
      ['settings.reviewPlanning', at, 'said'],
    ]);
    const played = lastTurn(next);
    expect(played.kind).toBe('playback');
    expect(played.chunk).toBe('talk');
    expect(played.say).toBe('');
    expect(renderPlayback(next.draft.model, 'talk')).toEqual(['Momentum talks to you gently.', 'You look back on your week and plan the next one separately.']);
  });

  it('is fine with nothing tapped: all unset, the person says they skip, and the playback shows nothing was chosen', async () => {
    const session = await settingsCardSession();
    const next = answerSettings(session, {});
    if (!next) throw new Error('refused');
    expect(Object.values(next.draft.model.settings).every((v) => v === null)).toBe(true);
    expect(next.transcript.at(-2)).toEqual({ role: 'person', text: SETTINGS_NONE_SAID });
    expect(renderPlayback(next.draft.model, 'talk')).toEqual(['Nothing in this part yet.']);
  });

  it('refuses a value the card did not offer, a row not asked, and an answer when the card is not showing', async () => {
    const session = await settingsCardSession();
    expect(answerSettings(session, { tone: 'blunt' })).toBeNull();
    expect(answerSettings(session, { celebrations: 'gentle' })).toBeNull();
    expect(answerSettings(session, { reminders: 'off' } as never)).toBeNull();
    expect(answerSettings(await afterYesTo('planning'), { tone: 'gentle' })).toBeNull();
  });

  it('is saved as the person left it: what was tapped is in the row, and the four nothing reads stay null', async () => {
    const session = await settingsCardSession();
    const answered = answerSettings(session, { tone: 'direct', celebrations: 'big', review_depth: 'full', review_planning: 'one_sitting' });
    if (!answered) throw new Error('refused');
    const row = draftToRows(
      { ...answered.draft, approved: ['goals', 'targets', 'planning', 'talk'] },
      answered.transcript,
    );
    if (!row.ok) throw new Error(`not saveable: ${JSON.stringify(row)}`);
    expect(row.rows.personSettings).toMatchObject({ tone: 'direct', celebrations: 'big', review_depth: 'full', review_planning: 'one_sitting', reminders: null, check_ins: null, balance_mentions: null, quiet_times: null });
  });
});

// ---------------------------------------------------------------------------
// 4. The service
// ---------------------------------------------------------------------------

describe('the server answers a card with no call to Claude', () => {
  const stub = () => {
    const calls: RunSetupTurnArgs[] = [];
    const run = async (args: RunSetupTurnArgs): Promise<SetupTurnResult> => {
      calls.push(args);
      return { kind: 'quick_path', reason: 'unchecked', message: 'no call expected' } as unknown as SetupTurnResult;
    };
    return { calls, run };
  };

  it('writes the time zone card when the targets playback is accepted, from the zone the phone reports', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    const s = stub();
    const result = await takeSetupTurn({ ...session, draft, timeZone: DENVER, today: '2026-11-04' }, { runTurn: s.run });
    expect(s.calls).toHaveLength(0);
    if (!result.ok || result.data.kind !== 'turn') throw new Error('no turn');
    expect(result.data.turn.question).toBe('Your phone is set to Mountain Time (Denver). Is that your time zone?');
    expect(result.data.turn.draft.approved).toContain('targets');
    expect(result.data.rejected).toBe(0);
  });

  it('writes the settings card when the planning playback is accepted', async () => {
    const session = await afterYesTo('planning');
    const s = stub();
    const result = await takeSetupTurn({ ...session, timeZone: DENVER }, { runTurn: s.run });
    expect(s.calls).toHaveLength(0);
    if (!result.ok || result.data.kind !== 'turn') throw new Error('no turn');
    expect(isSettingsCard(result.data.turn)).toBe(true);
  });

  it('drops a device zone that is not usable instead of refusing the turn, and offers the search with no zone', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    const s = stub();
    for (const timeZone of ['Not/AZone', 'x'.repeat(100), '']) {
      const result = await takeSetupTurn({ ...session, draft, timeZone }, { runTurn: s.run });
      if (!result.ok || result.data.kind !== 'turn') throw new Error('no turn');
      expect(result.data.turn.question).toBe(TIME_ZONE_ASK);
    }
    expect(s.calls).toHaveLength(0);
  });

  it('leaves any other answer to Claude, as before', async () => {
    const session = await afterYesTo('goals');
    const s = stub();
    await takeSetupTurn({ ...session, timeZone: DENVER }, { runTurn: s.run });
    expect(s.calls).toHaveLength(1);
  });

  it('writes no card for a person adding to a finished setup: their zone and settings are saved already', async () => {
    const session = await afterYesTo('targets');
    const draft = { ...session.draft, model: { ...session.draft.model, person: { ...session.draft.model.person, timeZone: null } } };
    const s = stub();
    await takeAddTurn({ ...session, draft, addition: { mode: 'add_goal' } }, { runTurn: s.run });
    expect(s.calls.length).toBeLessThanOrEqual(1);
    // Whatever it did, it wrote no card.
    const again = await takeAddTurn({ ...session, draft, addition: { mode: 'add_goal' } }, { runTurn: s.run });
    if (again.ok && again.data.kind === 'turn') expect(isTimeZoneCard(again.data.turn) || isSettingsCard(again.data.turn)).toBe(false);
  });

  it('a card is checked like any turn: one that would break a draft rule goes to Claude instead', async () => {
    const session = await afterYesTo('planning');
    // A draft with a number nobody said breaks the draft check, so the card is not shown on top of it.
    const broken = structuredClone(session.draft);
    broken.model.person.dayEnd = '23:00';
    broken.said = broken.said.filter((e) => e.path !== 'person.dayEnd');
    const s = stub();
    await takeSetupTurn({ ...session, draft: broken }, { runTurn: s.run });
    expect(s.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. Claude may not ask what the screen asks
// ---------------------------------------------------------------------------

describe('Claude is held to the screen asking the card\'s topics', () => {
  const ctx = (): TurnContext => ({ transcript: [], prevDraft: emptyDraft() });
  const turn = (over: Partial<AssistantTurn>): AssistantTurn => ({
    kind: 'question',
    chunk: null,
    skipped: null,
    say: '',
    question: 'How direct would you like me to be?',
    detail: null,
    topic: 'tone',
    options: [],
    draft: emptyDraft(),
    ...over,
  });

  it.each(['tone', 'celebrations', 'review_depth', 'review_planning', 'reminders', 'check_ins', 'quiet_times', 'balance_mentions'] as const)('refuses a question of Claude\'s on "%s"', (topic) => {
    const found = checkSkipAnswered(turn({ topic }), ctx());
    expect(found.map((v) => v.code)).toContain('skip.not_asked');
  });

  it('lets the card code writes carry its own topic', async () => {
    const session = await afterYesTo('planning');
    const card = cardStep(session.transcript, session.draft, DENVER);
    if (!card) throw new Error('no card');
    expect(checkSkipAnswered(card, { transcript: session.transcript, prevDraft: session.draft }).map((v) => v.code)).not.toContain('skip.not_asked');
    expect(checkTurn(card, { transcript: session.transcript, prevDraft: session.draft }).filter((v) => v.code === 'skip.not_asked')).toEqual([]);
  });

  it('still lets Claude ask the topics it owns', () => {
    expect(checkSkipAnswered(turn({ topic: 'day_end', question: 'When does your day end?' }), ctx()).map((v) => v.code)).not.toContain('skip.not_asked');
  });

  it('tells Claude in the prompt that the screen asks step 11, and gives it no question for any of the eight', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain('The screen asks this itself, with one card of choices written by code');
    for (const old of ['How direct would you like me to be?', 'Would you like reminders', 'ask how it went for things you log yourself']) {
      expect(SETUP_SYSTEM_PROMPT, old).not.toContain(old);
    }
    // The time zone is the screen's too, so Claude asks it only when it is still unknown.
    expect(SETUP_SYSTEM_PROMPT).toContain('Their time zone is asked by the screen');
  });
});
