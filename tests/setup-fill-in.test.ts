// MOM-111, the quick path's fill-in (lib/setup/fillIn.ts, lib/services/setup.ts fillQuickPathItem). When setup stops using
// Claude, the person sets each missing item on the card; the value enters the draft the way an answer to Claude does, so the
// setup validator and the first-setup save apply unchanged. What these hold the code to:
// - a typed value is a code-written question in the card's exact words, then the person's own message, recorded as `said`;
// - a suggestion they took (the device's time zone, today for a start date) is a proposal showing it and a yes, recorded as
//   `accepted`; an item with no suggestion refuses `accepted`;
// - a value that fails its kind or the setup validator is refused and changes nothing;
// - `canSave` turns true when the last item is filled, and then the same save writes it.
// Nothing here reaches the network or a key.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillQuickPathItem, saveApprovedSetup } from '@/lib/services/setup';
import { FILL_IN_ERRORS, FILL_IN_MARK, planFillIn } from '@/lib/setup/fillIn';
import { runSetupEval } from '@/lib/setup/evals';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
import { acceptedStartingPoints, startingPointForPath } from '@/lib/setup/startingPoints';
import { validateDraft } from '@/lib/setup/validate';
import { SETUP_CHUNKS, type AssistantTurn, type SetupSession } from '@/types/setup';
import type { FillInItem, QuickPathState } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { resetFakeSave } from './helpers/fakeSetupSave';
import { scriptedModel } from './helpers/setupScript';

vi.mock('@/lib/supabase/server', async () => {
  const { createSupabaseServerClient } = await import('./helpers/fakeSetupSave');
  return { createSupabaseServerClient };
});

const ME = '11111111-1111-4111-8111-111111111111';
const TODAY = '2026-10-30';

// A whole, validated conversation from the eval set whose person has a week start, and the same conversation with some of what
// setup asks later taken out: the state of a setup that stopped early. Nothing else in it changes.
async function stoppedEarly(strip: { timeZone?: boolean; dayEnd?: boolean; weekStart?: boolean; floor?: boolean } = { timeZone: true, dayEnd: true, weekStart: true, floor: true }) {
  for (const c of SETUP_CASES.filter((x) => x.expect === 'clean')) {
    const report = await runSetupEval(c, scriptedModel(c.script));
    if (!report.finished || report.finalIssues === null || report.finalIssues.length > 0) continue;
    const draft = structuredClone(report.draft);
    const weekly = draft.model.goals.flatMap((g) => g.targets).find((t) => t.period.kind === 'weekly' && t.floor !== null);
    if (draft.model.person.weekStart === null || !weekly) continue;
    if (strip.timeZone) draft.model.person.timeZone = null;
    if (strip.dayEnd) draft.model.person.dayEnd = null;
    if (strip.weekStart) draft.model.person.weekStart = null;
    if (strip.floor) {
      const target = draft.model.goals.flatMap((g) => g.targets).find((t) => t.key === weekly.key);
      if (target) {
        target.floor = null;
        target.aspiration = null;
      }
    }
    // The quick path comes after the person has answered, so the conversation ends on them: drop the closing turn of Claude's.
    const closing = report.transcript.at(-1);
    const ended = closing?.role === 'assistant' ? report.transcript.slice(0, -1) : report.transcript;
    const session: SetupSession = { transcript: ended, draft, spentTokens: 0 };
    return { session, floorKey: weekly.key, closing };
  }
  throw new Error('no clean case with a weekly target and a week start');
}

type Filled = Awaited<ReturnType<typeof fillQuickPathItem>>;
type FilledOk = Extract<Filled, { ok: true }>['data'];

const ask = (session: SetupSession, itemId: string, value: string, how: 'said' | 'accepted' = 'said'): Promise<Filled> =>
  fillQuickPathItem({ session, itemId, value, how, today: TODAY });

async function mustFill(session: SetupSession, itemId: string, value: string, how: 'said' | 'accepted' = 'said'): Promise<FilledOk> {
  const result = await ask(session, itemId, value, how);
  if (!result.ok) throw new Error(`fill refused: ${result.error}`);
  return result.data;
}

// The items the card would offer for a session, worked out the way the service does.
const planOf = (s: SetupSession) => planFillIn(s, validateDraft({ ...s.draft, approved: [...SETUP_CHUNKS] }, s.transcript, 'final').issues);
const itemsOf = (s: SetupSession): FillInItem[] => planOf(s).missing;

const lastTwo = (s: SetupSession) => s.transcript.slice(-2) as [{ role: 'assistant'; turn: AssistantTurn }, { role: 'person'; text: string }];

beforeEach(() => {
  resetFakeSave({ id: ME });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fillQuickPathItem: a typed value', () => {
  it('adds the card\'s own question and the person\'s own words, recorded as said', async () => {
    const { session } = await stoppedEarly();
    const before = session.transcript.length;
    const out = await mustFill(session, 'person.timeZone', 'America/Chicago');

    expect(out.session.transcript).toHaveLength(before + 2);
    const [asked, answered] = lastTwo(out.session);
    expect(asked.turn.kind).toBe('question');
    expect(asked.turn.topic).toBe('time_zone');
    // The question is the card's exact line for the item.
    expect(asked.turn.question).toBe('Which time zone are you in?');
    expect(answered.text).toBe('America/Chicago');
    expect(out.session.draft.model.person.timeZone).toBe('America/Chicago');
    expect(out.session.draft.said.at(-1)).toEqual({ path: 'person.timeZone', turn: before + 1, how: 'said' });
    // Nothing else moved, and the session sent is untouched.
    expect(session.draft.model.person.timeZone).toBeNull();
    expect(out.items.map((i) => i.id)).not.toContain('person.timeZone');
  });

  it('records a time, a weekday and a number as the person\'s own words, which the setup validator reads as said', async () => {
    const { session, floorKey } = await stoppedEarly();
    let s = (await mustFill(session, 'person.dayEnd', '21:00')).session;
    expect(lastTwo(s)[1].text).toBe('21:00');
    expect(s.draft.model.person.dayEnd).toBe('21:00');

    s = (await mustFill(s, 'person.weekStart', '1')).session;
    expect(lastTwo(s)[1].text).toBe('Monday');
    expect(s.draft.model.person.weekStart).toBe(1);

    const goal = s.draft.model.goals.find((g) => g.targets.some((t) => t.key === floorKey));
    const path = `goals.${goal?.key}.targets.${floorKey}.floor`;
    const floorLine = itemsOf(s).find((i) => i.id === path)?.line;
    expect(floorLine).toMatch(/\?$/);
    s = (await mustFill(s, path, '3')).session;
    expect(lastTwo(s)[0].turn.question).toBe(floorLine);
    expect(lastTwo(s)[1].text).toBe('3');
    for (const entry of s.draft.said.slice(-3)) expect(entry.how).toBe('said');
    // No provenance issue is left for the values just set.
    const issues = validateDraft({ ...s.draft, approved: [...SETUP_CHUNKS] }, s.transcript, 'final').issues;
    expect(issues.filter((i) => ['no_source', 'not_said'].includes(i.code))).toEqual([]);
  });
});

describe('fillQuickPathItem: a unit', () => {
  it('is offered only for a quantity with no unit, and is stored as typed', async () => {
    const { session, floorKey } = await stoppedEarly({});
    const goal = session.draft.model.goals.find((g) => g.targets.some((t) => t.key === floorKey));
    const path = `goals.${goal?.key}.targets.${floorKey}.unit`;
    // A target that is not a quantity has no unit to ask for.
    expect(itemsOf(session).map((i) => i.id)).not.toContain(path);

    const draft = structuredClone(session.draft);
    const target = draft.model.goals.flatMap((g) => g.targets).find((t) => t.key === floorKey);
    if (!target) throw new Error('fixture');
    target.measure = 'quantity';
    target.unit = null;
    const open = { ...session, draft };
    const item = itemsOf(open).find((i) => i.id === path);
    expect(item?.kind).toBe('text');
    expect(item?.suggestion).toBeNull();

    const out = await mustFill(open, path, '  pages  ');
    expect(lastTwo(out.session)[0].turn.question).toBe(item?.line);
    expect(lastTwo(out.session)[1].text).toBe('pages');
    expect(out.session.draft.model.goals.flatMap((g) => g.targets).find((t) => t.key === floorKey)?.unit).toBe('pages');
    expect(out.items.map((i) => i.id)).not.toContain(path);
  });
});

describe('fillQuickPathItem: an accepted suggestion', () => {
  it('records the device\'s time zone as a proposal and a yes, accepted, with no migration', async () => {
    const { session } = await stoppedEarly();
    const before = session.transcript.length;
    const out = await mustFill(session, 'person.timeZone', 'Europe/Berlin', 'accepted');

    const [asked, answered] = lastTwo(out.session);
    expect(asked.turn.kind).toBe('proposal');
    expect(asked.turn.question).toBe('Which time zone are you in?');
    expect(asked.turn.options).toEqual(['Europe/Berlin']);
    expect(answered.text).toBe(PROPOSAL_YES_TEXT);
    expect(out.session.draft.model.person.timeZone).toBe('Europe/Berlin');
    expect(out.session.draft.said.at(-1)).toEqual({ path: 'person.timeZone', turn: before + 1, how: 'accepted' });
  });

  it('refuses "accepted" for an item that has no suggestion', async () => {
    const { session } = await stoppedEarly();
    for (const [id, value] of [['person.dayEnd', '21:00'], ['person.weekStart', '1']] as const) {
      const result = await ask(session, id, value, 'accepted');
      expect(result).toEqual({ ok: false, error: FILL_IN_ERRORS.noSuggestion });
    }
  });
});

describe('fillQuickPathItem: a value that is not right', () => {
  it('refuses it, says why in plain words, and changes nothing', async () => {
    const { session, floorKey } = await stoppedEarly();
    const goal = session.draft.model.goals.find((g) => g.targets.some((t) => t.key === floorKey));
    const floor = `goals.${goal?.key}.targets.${floorKey}.floor`;
    const snapshot = JSON.stringify(session);

    const cases: [string, string, string][] = [
      ['person.timeZone', 'Mars/Phobos', FILL_IN_ERRORS.badZone],
      ['person.timeZone', '', FILL_IN_ERRORS.badZone],
      ['person.dayEnd', '25:99', FILL_IN_ERRORS.badValue],
      ['person.dayEnd', '9pm', FILL_IN_ERRORS.badValue],
      ['person.weekStart', '9', FILL_IN_ERRORS.badValue],
      ['person.weekStart', 'Funday', FILL_IN_ERRORS.badValue],
      [floor, '0', FILL_IN_ERRORS.badValue],
      [floor, '-3', FILL_IN_ERRORS.badValue],
      [floor, 'lots', FILL_IN_ERRORS.badValue],
      [floor, '2000000', FILL_IN_ERRORS.badValue],
      ['person.priorities.0', 'x', FILL_IN_ERRORS.notFillable],
      ['goals.nope.targets.nope.floor', '3', FILL_IN_ERRORS.notFillable],
    ];
    for (const [id, value, error] of cases) {
      expect(await ask(session, id, value), `${id} = "${value}"`).toEqual({ ok: false, error });
    }
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  it('refuses a request that is not well formed, and one that names a person', async () => {
    const { session } = await stoppedEarly();
    for (const bad of [null, 'hello', { session }, { session, itemId: 'person.timeZone', value: 'UTC', how: 'whatever' }, { session, itemId: 'person.timeZone', value: 'UTC', how: 'said', userId: 'x' }]) {
      const result = await fillQuickPathItem(bad);
      expect(result.ok).toBe(false);
    }
  });

  it('refuses a conversation that does not end on the person', async () => {
    const { session, closing } = await stoppedEarly();
    if (closing?.role !== 'assistant') throw new Error('fixture');
    const result = await ask({ ...session, transcript: [...session.transcript, closing] }, 'person.timeZone', 'UTC');
    expect(result).toEqual({ ok: false, error: FILL_IN_ERRORS.notReady });
  });
});

describe('fillQuickPathItem: canSave', () => {
  it('turns true when the last item is filled, and the same save then writes the setup', async () => {
    const { session, floorKey } = await stoppedEarly();
    const goal = session.draft.model.goals.find((g) => g.targets.some((t) => t.key === floorKey));
    const floor = `goals.${goal?.key}.targets.${floorKey}.floor`;

    let out = await mustFill(session, 'person.timeZone', 'America/Chicago');
    expect(out.canSave).toBe(false);
    out = await mustFill(out.session, 'person.dayEnd', '21:00');
    expect(out.canSave).toBe(false);
    out = await mustFill(out.session, 'person.weekStart', '1');
    expect(out.canSave).toBe(false);
    expect(out.items.map((i) => i.id)).toEqual([floor]);
    expect(out.missing).toHaveLength(1);

    out = await mustFill(out.session, floor, '3');
    expect(out.canSave).toBe(true);
    expect(out.missing).toEqual([]);
    expect(out.items).toEqual([]);

    // The quick path's save counts as approval of every part and writes through the one first-setup save.
    const saved = await saveApprovedSetup(out.session, true);
    expect(saved.ok, saved.ok ? '' : saved.error).toBe(true);
  });

  it('keeps Save off, and says what is left, while any item is not filled', async () => {
    const { session } = await stoppedEarly({ timeZone: true, dayEnd: true });
    const out = await mustFill(session, 'person.timeZone', 'UTC');
    expect(out.canSave).toBe(false);
    expect(out.missing).toEqual(['When your day ends.']);
    expect(out.items.map((i) => i.id)).toEqual(['person.dayEnd']);
    const result = await saveApprovedSetup(out.session, true);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The second set: dates, shape, source, deadline task fields and a step's target
// ---------------------------------------------------------------------------

// The starting points an accepted suggestion added between two sessions. (The eval case already holds one from Claude's own
// scripted conversation, so what matters here is only what the fill-in adds.)
const newMarks = (before: SetupSession, after: SetupSession) => {
  const had = new Set(acceptedStartingPoints(before.draft).map((m) => JSON.stringify(m)));
  return acceptedStartingPoints(after.draft).filter((m) => !had.has(JSON.stringify(m)));
};

// The same stopped-early session with one goal opened up the way a setup that stopped early would be: no start date, no shape,
// no source for its weekly target, a deadline task with no date, and a habit that feeds nothing yet.
async function opened() {
  const { session, floorKey } = await stoppedEarly({});
  const draft = structuredClone(session.draft);
  const goal = draft.model.goals.find((g) => g.targets.some((t) => t.key === floorKey));
  const target = goal?.targets.find((t) => t.key === floorKey);
  if (!goal || !target) throw new Error('fixture');
  goal.startDate = null;
  goal.shape = null;
  goal.endDate = null;
  goal.blockWeeks = null;
  target.sources = [];
  goal.items.push(
    { key: 'sew', kind: 'deadline_task', title: 'Sew the quilt', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: [] },
    { key: 'walk', kind: 'habit', title: 'Walk', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: [] },
  );
  const g = `goals.${goal.key}`;
  const ids = {
    start: `${g}.startDate`,
    shape: `${g}.shape`,
    end: `${g}.endDate`,
    source: `${g}.targets.${floorKey}.sources`,
    due: `${g}.items.sew.dueDate`,
    canMove: `${g}.items.sew.dateCanMove`,
    feeds: `${g}.items.walk.targetKey`,
  };
  return { session: { ...session, draft } as SetupSession, floorKey, goal, ids };
}

describe('fillInItems: the second set', () => {
  it('offers each with its control, its choices and the one suggestion code has', async () => {
    const { session, ids, floorKey } = await opened();
    const items = itemsOf(session);
    const by = (id: string) => items.find((i) => i.id === id);

    expect(by(ids.start)).toMatchObject({ kind: 'date', suggestion: 'today' });
    expect(by(ids.shape)?.choices.map((c) => c.label)).toEqual(['It keeps going', 'It ends on a date', 'It has a deadline']);
    expect(by(ids.source)?.choices.map((c) => c.label)).toEqual(["I'll log it myself", 'Hevy', 'Google Calendar']);
    expect(by(ids.due)).toMatchObject({ kind: 'date', suggestion: null });
    expect(by(ids.canMove)?.choices.map((c) => c.label)).toEqual(['Yes, it can move', "No, it can't move"]);
    expect(by(ids.feeds)?.choices.map((c) => c.value)).toContain(floorKey);
    // The end date waits for a shape that has one.
    expect(by(ids.end)).toBeUndefined();
    // Only the start date has a suggestion.
    expect(items.filter((i) => i.suggestion !== null).map((i) => i.id)).toEqual([ids.start]);
  });
});

describe('fillQuickPathItem: dates', () => {
  it("a picked date is said in the picker's own words, with its year", async () => {
    const { session, ids } = await opened();
    const out = await mustFill(session, ids.start, '2026-11-02');
    expect(lastTwo(out.session)[1].text).toBe('Monday, November 2, 2026');
    expect(out.session.draft.said.at(-1)?.how).toBe('said');
    expect(JSON.stringify(out.session.draft.model)).toContain('2026-11-02');
  });

  it('today taken as a suggestion is a proposal and a yes, and is marked a starting point', async () => {
    const { session, ids, goal } = await opened();
    const before = session.transcript.length;
    const out = await mustFill(session, ids.start, TODAY, 'accepted');
    const [asked, answered] = lastTwo(out.session);
    expect(asked.turn.kind).toBe('proposal');
    expect(asked.turn.topic).toBe('start_date');
    expect(asked.turn.question).toBe(itemsOf(session).find((i) => i.id === ids.start)?.line);
    expect(asked.turn.options).toEqual(['today, Friday, Oct 30']);
    expect(answered.text).toBe(PROPOSAL_YES_TEXT);
    expect(out.session.draft.said.at(-1)).toEqual({ path: ids.start, turn: before + 1, how: 'accepted' });
    // A typed value is stored as said; this one is a starting point the first review asks about.
    expect(newMarks(session, out.session)).toEqual([{ subject: { kind: 'goal', goalKey: goal.key }, field: 'start_date' }]);
    expect(startingPointForPath(ids.start)?.field).toBe('start_date');
  });

  it('a typed value is never a starting point', async () => {
    const { session, ids } = await opened();
    const out = await mustFill(session, ids.start, '2026-11-02');
    expect(newMarks(session, out.session)).toEqual([]);
  });

  it('refuses a suggestion that is not today, and a date that is not real', async () => {
    const { session, ids } = await opened();
    expect(await ask(session, ids.start, '2026-11-02', 'accepted')).toEqual({ ok: false, error: FILL_IN_ERRORS.noSuggestion });
    expect(await ask(session, ids.start, '2026-02-31')).toEqual({ ok: false, error: FILL_IN_ERRORS.badDate });
    expect(await ask(session, ids.start, 'next week')).toEqual({ ok: false, error: FILL_IN_ERRORS.badDate });
  });

  it('a shape with an end date makes the end date the next item, and an end date before the start is refused', async () => {
    const { session, ids } = await opened();
    let out = await mustFill(session, ids.start, '2026-11-02');
    out = await mustFill(out.session, ids.shape, 'finite');
    expect(lastTwo(out.session)[1].text).toBe('It ends on a date');
    expect(out.items.map((i) => i.id)).toContain(ids.end);

    expect(await ask(out.session, ids.end, '2026-10-01')).toEqual({ ok: false, error: FILL_IN_ERRORS.badDate });
    out = await mustFill(out.session, ids.end, '2027-01-15');
    expect(out.items.map((i) => i.id)).not.toContain(ids.end);
  });

  it('a start date that would fall after an end date already given is refused, and nothing changes', async () => {
    const { session, ids } = await opened();
    let out = await mustFill(session, ids.shape, 'finite');
    out = await mustFill(out.session, ids.end, '2026-11-10');
    const snapshot = JSON.stringify(out.session);
    expect(await ask(out.session, ids.start, '2026-12-01')).toEqual({ ok: false, error: FILL_IN_ERRORS.badDate });
    expect(JSON.stringify(out.session)).toBe(snapshot);
    expect((await mustFill(out.session, ids.start, '2026-11-02')).items.map((i) => i.id)).not.toContain(ids.start);
  });

  it('a shape of "keeps going" asks nothing more', async () => {
    const { session, ids } = await opened();
    const out = await mustFill(session, ids.shape, 'ongoing');
    expect(out.items.map((i) => i.id)).not.toContain(ids.end);
    expect(await ask(session, ids.shape, 'sometimes')).toEqual({ ok: false, error: FILL_IN_ERRORS.badValue });
  });
});

describe('fillQuickPathItem: source', () => {
  it('offers only logging it yourself or an app the code supports, and stores that', async () => {
    const { session, ids, floorKey, goal } = await opened();
    const sourcesOf = (s: SetupSession) => s.draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === floorKey)?.sources;
    const manual = await mustFill(session, ids.source, 'manual');
    expect(lastTwo(manual.session)[1].text).toBe("I'll log it myself");
    expect(sourcesOf(manual.session)).toEqual([{ kind: 'manual' }]);

    const hevy = await mustFill(session, ids.source, 'hevy');
    expect(sourcesOf(hevy.session)).toEqual([{ kind: 'synced', provider: 'hevy', metric: null }]);
    // Not a provider the code supports, and not a suggestion.
    expect(await ask(session, ids.source, 'strava')).toEqual({ ok: false, error: FILL_IN_ERRORS.badValue });
    expect(await ask(session, ids.source, 'manual', 'accepted')).toEqual({ ok: false, error: FILL_IN_ERRORS.noSuggestion });
  });

  it('an app with more than one number to count asks which, in its own words, as the next item', async () => {
    const { session, ids, floorKey, goal } = await opened();
    const draft = structuredClone(session.draft);
    const target = draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === floorKey);
    if (!target) throw new Error('fixture');
    target.measure = 'quantity';
    target.unit = 'sets';
    const quantity = { ...session, draft };

    const out = await mustFill(quantity, ids.source, 'hevy');
    const metricId = `${ids.source}#metric`;
    const next = out.items.find((i) => i.id === metricId);
    expect(next?.line).toBe('Which number counts for runs in Hevy?');
    expect(next?.choices.map((c) => c.label)).toEqual(['pounds lifted', 'kilograms lifted', 'sets', 'minutes']);
    expect(out.canSave).toBe(false);

    const done = await mustFill(out.session, metricId, 'sets');
    expect(lastTwo(done.session)[0].turn.question).toBe(next?.line);
    expect(lastTwo(done.session)[0].turn.topic).toBe('metric');
    expect(done.items.map((i) => i.id)).not.toContain(metricId);
    expect(done.session.draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === floorKey)?.sources).toEqual([
      { kind: 'synced', provider: 'hevy', metric: 'sets' },
    ]);
  });
});

describe("fillQuickPathItem: a deadline task and a step's target", () => {
  it('sets its date and whether it can move, the second as the answer to its own question', async () => {
    const { session, ids, goal } = await opened();
    let out = await mustFill(session, ids.due, '2026-12-15');
    out = await mustFill(out.session, ids.canMove, 'no');
    const [asked, answered] = lastTwo(out.session);
    expect(asked.turn.topic).toBe('date_can_move');
    expect(asked.turn.question).toBe(itemsOf(session).find((i) => i.id === ids.canMove)?.line);
    expect(answered.text).toBe("No, it can't move");
    const task = out.session.draft.model.goals.find((g) => g.key === goal.key)?.items.find((i) => i.key === 'sew');
    expect(task).toMatchObject({ dueDate: '2026-12-15', dateCanMove: false });
    expect(out.items.map((i) => i.id)).not.toContain(ids.due);
    expect(out.items.map((i) => i.id)).not.toContain(ids.canMove);
    expect(await ask(session, ids.canMove, 'maybe')).toEqual({ ok: false, error: FILL_IN_ERRORS.badValue });
  });

  it("feeds a habit to one of the goal's own targets, by the target's name", async () => {
    const { session, ids, floorKey, goal } = await opened();
    const out = await mustFill(session, ids.feeds, floorKey);
    expect(lastTwo(out.session)[1].text).toBe(goal.targets.find((t) => t.key === floorKey)?.title);
    expect(out.session.draft.model.goals.find((g) => g.key === goal.key)?.items.find((i) => i.key === 'walk')?.targetKey).toBe(floorKey);
    expect(await ask(session, ids.feeds, 'nothing_here')).toEqual({ ok: false, error: FILL_IN_ERRORS.badValue });
  });
});

describe('fillQuickPathItem: all of it', () => {
  it('fills in everything a stopped setup lacked, one item at a time, and the same save writes it', async () => {
    const { session, ids, floorKey } = await opened();
    const person = { ...session.draft.model.person, timeZone: null, dayEnd: null, weekStart: null };
    const full: SetupSession = { ...session, draft: { ...session.draft, model: { ...session.draft.model, person } } };

    const values: [string, string, 'said' | 'accepted'][] = [
      ['person.timeZone', 'Europe/Berlin', 'accepted'],
      ['person.dayEnd', '22:30', 'said'],
      ['person.weekStart', '1', 'said'],
      [ids.start, TODAY, 'accepted'],
      [ids.shape, 'ongoing', 'said'],
      [ids.source, 'manual', 'said'],
      [ids.due, '2026-12-15', 'said'],
      [ids.canMove, 'yes', 'said'],
      [ids.feeds, floorKey, 'said'],
    ];
    let state: FilledOk | null = null;
    let current = full;
    for (const [id, value, how] of values) {
      if (state) expect(state.canSave).toBe(false);
      state = await mustFill(current, id, value, how);
      current = state.session;
    }
    expect(state?.canSave, JSON.stringify(state?.missing)).toBe(true);
    expect(state?.items).toEqual([]);
    expect(newMarks(full, current).map((m) => m.field)).toEqual(['start_date']);

    const saved = await saveApprovedSetup(current, true);
    expect(saved.ok, saved.ok ? '' : saved.error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Steps, and changing an answer (the quick-path rework)
// ---------------------------------------------------------------------------

// The opened-up session with the person's time zone, day end and week start taken out as well.
async function openedWithoutDays() {
  const base = await opened();
  const person = { ...base.session.draft.model.person, timeZone: null, dayEnd: null, weekStart: null };
  const session: SetupSession = { ...base.session, draft: { ...base.session.draft, model: { ...base.session.draft.model, person } } };
  return { ...base, session };
}

describe('planFillIn: steps', () => {
  it('groups the questions by what they are about, with time zone, day end and week start in one "Your days" step', async () => {
    const { session, goal, floorKey } = await openedWithoutDays();
    const { steps } = planOf(session);
    const g = `goal:${goal.key}`;
    expect(steps.map((s) => s.id)).toEqual([g, `target:${goal.key}.${floorKey}`, `item:${goal.key}.sew`, `item:${goal.key}.walk`, 'days']);
    expect(steps.map((s) => s.sectionId)).toEqual([g, g, g, g, 'days']);
    expect(steps.map((s) => s.title)).toEqual([expect.any(String), expect.any(String), 'Sew the quilt', 'Walk', 'Your days']);
    expect(steps[0].items.map((i) => i.id.split('.').pop())).toEqual(['startDate', 'shape']);
    expect(steps.at(-1)?.items.map((i) => i.id)).toEqual(['person.timeZone', 'person.dayEnd', 'person.weekStart']);
    // Every item is a plain question, and none shows a path or a word of the model's.
    for (const item of steps.flatMap((s) => s.items)) {
      expect(item.line, item.id).toMatch(/\?$/);
      expect(item.line, item.id).not.toMatch(/goals\.|person\.|fewest|floor|aspiration|baseline|target/i);
      expect(item.answered).toBe(false);
      expect(item.answer).toBeNull();
    }
    expect(steps.flatMap((s) => s.items).map((i) => i.line)).toEqual(expect.arrayContaining([
      'Does this goal keep going, end on a date, or have a deadline?',
      'When do you want to start this goal?',
      'Which time zone are you in?',
      'What time do you check in each day?',
      'Which day does your week start on?',
    ]));
  });

  it('gives the day-end question its one note, and no other item a note', async () => {
    const { session } = await openedWithoutDays();
    const items = planOf(session).steps.flatMap((s) => s.items);
    expect(items.filter((i) => i.hint !== null).map((i) => i.id)).toEqual(['person.dayEnd']);
    expect(items.find((i) => i.id === 'person.dayEnd')?.hint).toBe("If you're often up past midnight, pick when your day really ends, like 2:00 AM. Late entries then count toward the day before.");
  });

  it('leaves out an answer Claude took, and a step with nothing left to ask is not a step', async () => {
    const { session } = await opened();
    const { steps, all } = planOf(session);
    expect(all.map((i) => i.id)).not.toContain('person.weekStart');
    expect(steps.some((s) => s.id === 'days')).toBe(false);
  });

  it('keeps an answered step in its place, so the number of steps does not change as they are answered', async () => {
    const { session, ids } = await openedWithoutDays();
    const before = planOf(session).steps;
    let s = (await mustFill(session, ids.start, '2026-11-02')).session;
    s = (await mustFill(s, ids.shape, 'ongoing')).session;
    const after = planOf(s).steps;
    expect(after.map((x) => x.id)).toEqual(before.map((x) => x.id));
    expect(after[0].items.map((i) => i.answered)).toEqual([true, true]);
    expect(after[0].items.map((i) => i.answer)).toEqual(['2026-11-02', 'ongoing']);
    expect(after[1].items.every((i) => !i.answered)).toBe(true);
  });
});

describe('fillQuickPathItem: changing an answer', () => {
  it('marks each question it writes, so an answer given on the card can be told from one given to Claude', async () => {
    const { session, ids } = await opened();
    const out = await mustFill(session, ids.start, '2026-11-02');
    expect(lastTwo(out.session)[0].turn.detail).toBe(FILL_IN_MARK);
    expect(lastTwo(out.session)[0].turn.say).toBe('');
  });

  it('takes a new answer for one given on the card; the newest is the one that counts, and the conversation only grows', async () => {
    const { session } = await openedWithoutDays();
    let s = (await mustFill(session, 'person.dayEnd', '21:00')).session;
    const length = s.transcript.length;
    const changed = await mustFill(s, 'person.dayEnd', '22:30');
    s = changed.session;
    expect(s.draft.model.person.dayEnd).toBe('22:30');
    expect(s.transcript).toHaveLength(length + 2);
    expect(lastTwo(s)[1].text).toBe('22:30');
    expect(planOf(s).all.find((i) => i.id === 'person.dayEnd')).toMatchObject({ answered: true, answer: '22:30' });
    // The old answer is still in the record, before the new one.
    expect(s.draft.said.filter((e) => e.path === 'person.dayEnd').map((e) => e.turn).slice(-2)).toEqual([length - 1, length + 1]);
  });

  it('the same answer again changes nothing and adds nothing to the conversation', async () => {
    const { session } = await openedWithoutDays();
    const once = (await mustFill(session, 'person.weekStart', '1')).session;
    const again = await mustFill(once, 'person.weekStart', '1');
    expect(again.session).toEqual(once);
  });

  it('can change a choice, and changing a shape to "keeps going" drops an end date it had', async () => {
    const { session, ids, goal } = await opened();
    let out = await mustFill(session, ids.shape, 'finite');
    out = await mustFill(out.session, ids.end, '2027-01-15');
    out = await mustFill(out.session, ids.start, '2026-11-02');
    const changed = await mustFill(out.session, ids.shape, 'ongoing');
    expect(changed.session.draft.model.goals.find((g) => g.key === goal.key)).toMatchObject({ shape: 'ongoing', endDate: null });
    expect(changed.items.map((i) => i.id)).not.toContain(ids.end);
    expect(planOf(changed.session).all.find((i) => i.id === ids.shape)).toMatchObject({ answered: true, answer: 'ongoing' });
  });

  it('refuses a change that breaks another date, and keeps the answer it had', async () => {
    const { session, ids } = await opened();
    let out = await mustFill(session, ids.shape, 'finite');
    out = await mustFill(out.session, ids.end, '2026-12-01');
    out = await mustFill(out.session, ids.start, '2026-11-02');
    const snapshot = JSON.stringify(out.session);
    expect(await ask(out.session, ids.start, '2027-03-01')).toEqual({ ok: false, error: FILL_IN_ERRORS.badDate });
    expect(JSON.stringify(out.session)).toBe(snapshot);
  });

  it('changing the source drops the number it asked for, and asks again if the new one needs it', async () => {
    const { session, ids, floorKey, goal } = await opened();
    const draft = structuredClone(session.draft);
    const target = draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === floorKey);
    if (!target) throw new Error('fixture');
    target.measure = 'quantity';
    target.unit = 'sets';
    let out = await mustFill({ ...session, draft }, ids.source, 'hevy');
    out = await mustFill(out.session, `${ids.source}#metric`, 'sets');
    expect(planOf(out.session).all.filter((i) => i.id.startsWith(ids.source)).map((i) => [i.id, i.answered, i.answer])).toEqual([
      [ids.source, true, 'hevy'],
      [`${ids.source}#metric`, true, 'sets'],
    ]);
    const manual = await mustFill(out.session, ids.source, 'manual');
    expect(manual.session.draft.model.goals.find((g) => g.key === goal.key)?.targets.find((t) => t.key === floorKey)?.sources).toEqual([{ kind: 'manual' }]);
    expect(manual.items.map((i) => i.id)).not.toContain(`${ids.source}#metric`);
  });
});
