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
import { FILL_IN_ERRORS, fillInItems } from '@/lib/setup/fillIn';
import { runSetupEval } from '@/lib/setup/evals';
import { PROPOSAL_YES_TEXT } from '@/lib/setup/session';
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
const itemsOf = (s: SetupSession): FillInItem[] =>
  fillInItems(s.draft.model, validateDraft({ ...s.draft, approved: [...SETUP_CHUNKS] }, s.transcript, 'final').issues);

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
    expect(asked.turn.question).toBe('Your time zone.');
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
    expect(asked.turn.question).toBe('Your time zone.');
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
