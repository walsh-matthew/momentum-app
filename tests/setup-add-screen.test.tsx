// @vitest-environment jsdom
//
// The screens for adding a goal or a target after first setup, in a DOM (MOM-132 part 2): the chooser that replaces "Setup is already
// done", which goal, the same conversation held to what is saved, the start question for a target, the final cards, the saved card, and
// a save that does not go through. The server actions are stubs, so no Claude call is made and nothing is saved; what the server does
// is in tests/setup-add-service.test.ts. The words are the owner's, repeated here as plain strings (tests/setup-add-words.test.ts pins
// them the same way).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddToGoals } from '@/components/setup/AddToGoals';
import { ADD_REFUSALS } from '@/lib/services/setup';
import { runSetupEval } from '@/lib/setup/evals';
import { RETURNING_FIRST_LINE, returningDraft } from '@/lib/setup/returning';
import { setupStorageKey } from '@/lib/setup/session';
import type { SetupSession } from '@/types/setup';
import type { AddGoalOption, AddOptions } from '@/types/setupScreen';
import { RETURNING_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const GOAL: AddGoalOption = { id: '33333333-3333-4333-8333-333333333333', title: 'Run more', startDate: '2026-10-27', endDate: '2026-12-18' };
const OTHER_GOAL: AddGoalOption = { id: '44444444-4444-4444-8444-444444444444', title: 'Read more books', startDate: '2026-10-28', endDate: null };
// A Wednesday, in a week that starts on Monday.
const OPTIONS: AddOptions = { goals: [GOAL, OTHER_GOAL], weekStart: 1, today: '2026-11-04' };

const actions = vi.hoisted(() => ({ ask: vi.fn(), addGoals: vi.fn(), addTargets: vi.fn(), askFirst: vi.fn(), save: vi.fn(), fill: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({
  askAddTurn: actions.ask,
  addGoalsAction: actions.addGoals,
  addTargetsAction: actions.addTargets,
  askSetupTurn: actions.askFirst,
  saveSetup: actions.save,
  fillQuickPathItemAction: actions.fill,
}));

const POINTER = `momentum.setup.add.${USER}`;
const goalKey = `${USER}.add.add_goal.`;
const targetKey = `${USER}.add.add_target.${GOAL.id}`;

// A returning conversation that has finished clean, and where a reload could put the person.
async function finished(id: string): Promise<SetupSession> {
  const c = RETURNING_CASES.find((x) => x.id === id)!;
  const report = await runSetupEval(c, scriptedModel(c.script));
  return { transcript: report.transcript, draft: report.draft, spentTokens: 0 };
}
const firstQuestion = async (id: string): Promise<SetupSession> => {
  const { transcript } = await finished(id);
  const turn = transcript[0];
  if (turn.role !== 'assistant') throw new Error('fixture');
  return { transcript: [turn], draft: turn.turn.draft, spentTokens: 0 };
};
function resumeAt(session: SetupSession, kind: 'add_goal' | 'add_target') {
  window.sessionStorage.setItem(setupStorageKey(kind === 'add_goal' ? goalKey : targetKey), JSON.stringify(session));
  window.sessionStorage.setItem(POINTER, JSON.stringify(kind === 'add_goal' ? { mode: 'add_goal', goalId: null } : { mode: 'add_target', goalId: GOAL.id }));
}
const storedFor = (key: string) => window.sessionStorage.getItem(setupStorageKey(key));

const turnView = (turn: unknown) => ({ ok: true as const, data: { kind: 'turn' as const, turn, spentTokens: 1000, rejected: 0 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const added = (goals: number, targets: number) => ({ ok: true as const, data: { goals, targets, replayed: false } });
const renderAdd = (options: AddOptions = OPTIONS) => render(<AddToGoals userId={USER} options={options} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  for (const a of Object.values(actions)) a.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('the chooser, and which goal', () => {
  it('asks what to add in the approved words, and asks Claude nothing', async () => {
    renderAdd();
    expect(await screen.findByRole('heading', { name: 'What would you like to add?' })).toBeTruthy();
    expect(screen.getByText("Nothing you've already set up changes. Nothing is saved until you check it.")).toBeTruthy();
    expect(button('A new goal')).toBeTruthy();
    expect(button('A target for a goal I already have')).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-slot="card-lead"]')).toHaveLength(1);
  });

  it('with no active goal there is no target button, and the chooser says why', async () => {
    renderAdd({ ...OPTIONS, goals: [] });
    await screen.findByRole('heading', { name: 'What would you like to add?' });
    expect(screen.queryByRole('button', { name: 'A target for a goal I already have' })).toBeNull();
    expect(screen.getByText('You have no active goal to add a target to.')).toBeTruthy();
  });

  it('lists the active goals, one button each, in the approved words', async () => {
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'A target for a goal I already have' }));
    expect(await screen.findByRole('heading', { name: 'Which goal is it for?' })).toBeTruthy();
    expect(screen.getByText('Pick one. You can add to another goal after.')).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Run more', 'Read more books']);
    expect(actions.ask).not.toHaveBeenCalled();
  });
});

describe('the conversation for a new goal', () => {
  it('starts only on Start, sends the returning draft and the kind (never a goal), and says what is skipped once', async () => {
    const first = (await firstQuestion('return-g-reading')).transcript[0];
    actions.ask.mockResolvedValue(turnView(first.role === 'assistant' ? first.turn : null));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'A new goal' }));
    expect(await screen.findByRole('heading', { name: "Let's add to your goals" })).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();

    fireEvent.click(button('Start'));
    await screen.findByText(RETURNING_FIRST_LINE);
    expect(actions.ask).toHaveBeenCalledTimes(1);
    const sent = actions.ask.mock.calls[0][0];
    expect(sent.addition).toEqual({ mode: 'add_goal' });
    expect(sent.transcript).toEqual([]);
    expect(sent.draft).toEqual(returningDraft('add_goal', null));
    // The saved facts are not in what is sent: the draft holds none.
    expect(JSON.stringify(sent)).not.toMatch(/America\//);
    // The tab remembers what they were adding.
    expect(JSON.parse(window.sessionStorage.getItem(POINTER) ?? 'null')).toEqual({ mode: 'add_goal', goalId: null });
  });

  it('shows the skipped-topics line on the first question only', async () => {
    const full = await finished('return-g-reading');
    const [q0, a0, q1] = full.transcript;
    if (q0.role !== 'assistant' || q1.role !== 'assistant') throw new Error('fixture');
    actions.ask.mockResolvedValue(turnView(q1.turn));
    resumeAt({ transcript: [q0], draft: q0.turn.draft, spentTokens: 0 }, 'add_goal');
    renderAdd();
    await screen.findByText(RETURNING_FIRST_LINE);
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: a0.role === 'person' ? a0.text : 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: q1.turn.question ?? '' });
    expect(screen.queryByText(RETURNING_FIRST_LINE)).toBeNull();
    expect(actions.ask.mock.calls[0][0].addition).toEqual({ mode: 'add_goal' });
  });

  it('a reload in the middle opens straight on the question: no chooser, no intro', async () => {
    resumeAt(await firstQuestion('return-g-reading'), 'add_goal');
    renderAdd();
    const q = (await firstQuestion('return-g-reading')).transcript[0];
    await screen.findByRole('heading', { name: q.role === 'assistant' ? (q.turn.question ?? '') : '' });
    expect(screen.queryByRole('heading', { name: 'What would you like to add?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(actions.ask).not.toHaveBeenCalled();
  });
});

describe('the conversation for a target', () => {
  it('sends the goal’s id and a draft that holds only its title', async () => {
    const q = (await firstQuestion('return-t-miles')).transcript[0];
    actions.ask.mockResolvedValue(turnView(q.role === 'assistant' ? q.turn : null));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'A target for a goal I already have' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Run more' }));
    // Targets added to one goal: the card names the goal; the body is the same as for a new goal.
    expect(await screen.findByRole('heading', { name: `Let's add to "Run more"` })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: "Let's add to your goals" })).toBeNull();
    expect(screen.getByText(/A short conversation with Claude, one question at a time\./)).toBeTruthy();
    fireEvent.click(button('Start'));
    await screen.findByText(RETURNING_FIRST_LINE);
    const sent = actions.ask.mock.calls[0][0];
    expect(sent.addition).toEqual({ mode: 'add_target', goalId: GOAL.id });
    expect(sent.draft).toEqual(returningDraft('add_target', 'Run more'));
    expect(JSON.stringify(sent)).not.toContain('Read more books');
    expect(JSON.parse(window.sessionStorage.getItem(POINTER) ?? 'null')).toEqual({ mode: 'add_target', goalId: GOAL.id });
  });
});

describe('the final card for a goal', () => {
  beforeEach(async () => resumeAt(await finished('return-g-reading'), 'add_goal'));

  it('asks "Add this goal?" in the approved words, with the two buttons, and saves nothing until Add it', async () => {
    renderAdd();
    expect(await screen.findByRole('heading', { name: 'Add this goal?' })).toBeTruthy();
    // The goal's title first, then its targets as sentences: no "Your goal:" prefix.
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Read more', 'At least 2 reading sessions a week.']);
    expect(screen.queryByText(/Your goal:/)).toBeNull();
    expect(screen.getByText("Your other goals and everything you've logged stay exactly as they are.")).toBeTruthy();
    expect(button('Add it').getAttribute('data-tone')).toBe('main');
    expect(button('Change something')).toBeTruthy();
    expect(document.querySelectorAll('[data-tone="main"]')).toHaveLength(1);
    expect(actions.addGoals).not.toHaveBeenCalled();
  });

  it('Add it sends the approved conversation and one id, then says "Added." and forgets what was in progress', async () => {
    actions.addGoals.mockResolvedValue(added(1, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Add it' }));
    expect(await screen.findByRole('heading', { name: 'Added.' })).toBeTruthy();
    expect(screen.getByText("Nothing you'd already saved changed.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
    const [session, request] = actions.addGoals.mock.calls[0];
    expect(session.draft.model.goals[0].title).toBe('Read more');
    expect(request.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(request)).toEqual(['submissionId']);
    expect(storedFor(goalKey)).toBeNull();
    expect(window.sessionStorage.getItem(POINTER)).toBeNull();
    expect(actions.addTargets).not.toHaveBeenCalled();
  });

  it('a double tap while the first is out sends once, and the button stays solid and says it is working', async () => {
    const pending = deferred<ReturnType<typeof added>>();
    actions.addGoals.mockReturnValue(pending.promise);
    renderAdd();
    const add = await screen.findByRole('button', { name: 'Add it' });
    fireEvent.click(add);
    const working = await screen.findByRole('button', { name: 'Adding…' });
    expect((working as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(working);
    fireEvent.click(working);
    expect(actions.addGoals).toHaveBeenCalledTimes(1);
    pending.resolve(added(1, 1));
    await screen.findByRole('heading', { name: 'Added.' });
    expect(actions.addGoals).toHaveBeenCalledTimes(1);
  });

  it('a refusal is said in its own words above the same card; nothing is lost and a retry carries the same id', async () => {
    actions.addGoals.mockResolvedValueOnce({ ok: false, error: ADD_REFUSALS.MS002 }).mockResolvedValueOnce(added(1, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Add it' }));
    expect((await screen.findByRole('alert')).textContent).toContain(ADD_REFUSALS.MS002);
    expect(screen.getByRole('heading', { name: 'Add this goal?' })).toBeTruthy();
    expect(storedFor(goalKey)).not.toBeNull();
    // The alert leads, so the card has exactly one bold line.
    expect(document.querySelectorAll('[data-slot="card-lead"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    await screen.findByRole('heading', { name: 'Added.' });
    expect(actions.addGoals.mock.calls[1][1].submissionId).toBe(actions.addGoals.mock.calls[0][1].submissionId);
  });

  it('a save that never reached the server says so, keeps the card, and can be tried again', async () => {
    actions.addGoals.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(added(1, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Add it' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't connect. Nothing was added yet. Check your connection, then try again.");
    expect(screen.getByRole('heading', { name: 'Add this goal?' })).toBeTruthy();
    expect(storedFor(goalKey)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    await screen.findByRole('heading', { name: 'Added.' });
  });
});

describe('the start question, then the final card for a target', () => {
  beforeEach(async () => resumeAt(await finished('return-t-miles'), 'add_target'));

  it('asks when the target starts counting, proposes today, and offers next week’s start on a day that is not it', async () => {
    renderAdd();
    expect(await screen.findByRole('heading', { name: 'When should this target start counting?' })).toBeTruthy();
    expect(screen.getByText(`Weeks before this date won't count for it. Your goal "Run more" keeps its own start of Tuesday, Oct 27.`)).toBeTruthy();
    expect(screen.getByText('Start today, Wednesday, Nov 4?')).toBeTruthy();
    expect(screen.getByText("If that's partway through a week, that first week is shown but never counted as a miss.")).toBeTruthy();
    expect(button('Yes, start today').getAttribute('data-tone')).toBe('main');
    expect(button('Start next week, Mon, Nov 9')).toBeTruthy();
    expect(screen.getByLabelText('Pick another date')).toBeTruthy();
    // Nothing is asked of Claude and nothing is added by asking.
    expect(actions.ask).not.toHaveBeenCalled();
    expect(actions.addTargets).not.toHaveBeenCalled();
  });

  it('on the first day of the person’s week there is no next-week button and no mid-week line', async () => {
    renderAdd({ ...OPTIONS, today: '2026-11-02' });
    await screen.findByRole('heading', { name: 'When should this target start counting?' });
    expect(screen.getByText('Start today, Monday, Nov 2?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start next week/ })).toBeNull();
    expect(screen.queryByText(/partway through a week/)).toBeNull();
  });

  it('with no week start saved nothing is assumed: no next-week button and no mid-week line', async () => {
    renderAdd({ ...OPTIONS, weekStart: null });
    await screen.findByRole('heading', { name: 'When should this target start counting?' });
    expect(screen.queryByRole('button', { name: /Start next week/ })).toBeNull();
    expect(screen.queryByText(/partway through a week/)).toBeNull();
  });

  it('a day before the goal started, or after it ends, is refused in words and goes no further', async () => {
    renderAdd();
    await screen.findByRole('heading', { name: 'When should this target start counting?' });
    fireEvent.change(screen.getByLabelText('Pick another date'), { target: { value: '2026-10-01' } });
    expect((await screen.findByRole('alert')).textContent).toBe("That's before your goal started on Tuesday, Oct 27. Pick a day on or after it.");
    fireEvent.change(screen.getByLabelText('Pick another date'), { target: { value: '2026-12-19' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe("That's after your goal ends on Friday, Dec 18. Pick a day on or before it."));
    expect(screen.queryByRole('heading', { name: /Add this target/ })).toBeNull();
    expect(actions.addTargets).not.toHaveBeenCalled();
  });

  it('a chosen day leads to the final card in the approved words, and Add it sends that day and the goal’s id with one id', async () => {
    actions.addTargets.mockResolvedValue(added(0, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Start next week, Mon, Nov 9' }));
    expect(await screen.findByRole('heading', { name: 'Add this target to "Run more"?' })).toBeTruthy();
    expect(screen.getByText("It starts counting on Monday, Nov 9. Weeks before that aren't counted. Everything else on this goal stays as it is.")).toBeTruthy();
    // Monday is the first day of the week, so the first week is a whole one: no mid-week line.
    expect(screen.queryByText(/partway through a week/)).toBeNull();

    fireEvent.click(button('Add it'));
    expect(await screen.findByRole('heading', { name: 'Added to "Run more". It starts counting on Monday, Nov 9.' })).toBeTruthy();
    expect(screen.getByText("Nothing you'd already saved changed.")).toBeTruthy();
    const [session, request] = actions.addTargets.mock.calls[0];
    expect(request).toEqual({ submissionId: expect.stringMatching(/^[0-9a-f-]{36}$/), goalId: GOAL.id, startDate: '2026-11-09' });
    expect(session.draft.model.goals[0].targets).toHaveLength(1);
    expect(actions.addGoals).not.toHaveBeenCalled();
    expect(storedFor(targetKey)).toBeNull();
  });

  it('a start in the middle of the week says so on the final card as well', async () => {
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, start today' }));
    await screen.findByRole('heading', { name: 'Add this target to "Run more"?' });
    expect(screen.getByText("It starts counting on Wednesday, Nov 4. Weeks before that aren't counted. Everything else on this goal stays as it is.")).toBeTruthy();
    expect(screen.getByText("If that's partway through a week, that first week is shown but never counted as a miss.")).toBeTruthy();
  });

  it('the same approval is sent with the same id when the person taps again after a refusal', async () => {
    actions.addTargets.mockResolvedValueOnce({ ok: false, error: ADD_REFUSALS.MS005 }).mockResolvedValueOnce(added(0, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, start today' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add it' }));
    expect((await screen.findByRole('alert')).textContent).toContain(ADD_REFUSALS.MS005);
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    await screen.findByText(/It starts counting on Wednesday, Nov 4\./);
    expect(actions.addTargets.mock.calls[1][1]).toEqual(actions.addTargets.mock.calls[0][1]);
  });
});

describe('Claude is no longer used (the quick path) while adding a target', () => {
  it('asks the start first, then shows the quick path card, and saves through the add action with the start', async () => {
    resumeAt({ ...(await firstQuestion('return-t-miles')), transcript: [(await firstQuestion('return-t-miles')).transcript[0]] }, 'add_target');
    const session = await finished('return-t-miles');
    actions.ask.mockResolvedValue({
      ok: true,
      data: { kind: 'quick_path', reason: 'over_turns', message: 'No more questions.', sections: [], steps: [], items: [], stuck: [], missing: [], canSave: true },
    });
    // The person's answer is waiting on a reply: the next turn is the quick path.
    const [q0] = session.transcript;
    if (q0.role !== 'assistant') throw new Error('fixture');
    window.sessionStorage.setItem(
      setupStorageKey(targetKey),
      JSON.stringify({ transcript: [q0, { role: 'person', text: 'Miles.' }], draft: q0.turn.draft, spentTokens: 0 }),
    );
    actions.addTargets.mockResolvedValue(added(0, 1));
    renderAdd();
    fireEvent.click(await screen.findByRole('button', { name: 'Send it again' }));
    expect(await screen.findByRole('heading', { name: 'When should this target start counting?' })).toBeTruthy();
    fireEvent.click(button('Yes, start today'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'When should this target start counting?' })).toBeNull());
    expect(actions.addTargets).not.toHaveBeenCalled();
    // The card says what is added, in the owner's words, and never "Save my setup".
    expect(screen.getByRole('heading', { name: "Here's what will be added" })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Everything is in. Look it over, then save.' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save my setup' })).toBeNull();
    expect(within(document.body).getAllByRole('button', { name: 'Add it' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    await waitFor(() => expect(actions.addTargets).toHaveBeenCalledTimes(1));
    expect(actions.addTargets.mock.calls[0][1]).toMatchObject({ goalId: GOAL.id, startDate: '2026-11-04', quickPath: true });
    expect(actions.save).not.toHaveBeenCalled();
  });
});
