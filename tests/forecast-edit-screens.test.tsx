// @vitest-environment jsdom
//
// The two edit screens behind home's forecast lines, and the lines that lead to them (MOM-138). The owner approved every word on
// 2026-11-01 (the MOM-138 design comment); these tests pin them. What they pin:
// - every control is the person's own tap, and nothing is chosen for them: a kind with no usual time starts with neither unit on;
// - a tap with something missing answers with one plain callout and calls nothing (MOM-145); a main button is never disabled;
// - the locked due date has no control and reads "Due Fri, Nov 20. You said this date can't move.";
// - a ticked step shows "Done" and nothing else; a finished task shows only that it is finished;
// - each "missing fact" line leads to its edit, and "move the date" leads only where setup said it can move;
// - everything is in everyday words (tests/forecast-edit-words.test.tsx runs the glossary over every state).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from '@/app/actions/forecastEdits';
import { KindTimesScreen } from '@/components/forecast/KindTimesScreen';
import { TaskEditScreen } from '@/components/forecast/TaskEditScreen';
import { MilestoneRow } from '@/components/home/MilestoneRow';
import { forecastLine } from '@/components/home/wording';
import type { ForecastView, MilestoneView } from '@/types/home';
import type { DayKindTimeView, TaskEditView } from '@/types/forecastEdits';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/forecastEdits', () => ({
  changeKindTime: vi.fn(),
  changeTaskSize: vi.fn(),
  changeTaskDate: vi.fn(),
  addStep: vi.fn(),
  renameStep: vi.fn(),
  removeStep: vi.fn(),
}));

const ok = { ok: true as const, data: { changed: 1 } };
const TODAY = '2026-11-01';

beforeEach(() => {
  refresh.mockClear();
  for (const fn of Object.values(actions)) (fn as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(ok);
});
afterEach(cleanup);

const task = (over: Partial<TaskEditView> = {}): TaskEditView => ({
  id: 't1',
  title: 'Send the application',
  goalTitle: 'Land the new role',
  today: TODAY,
  dueOn: '2026-11-20',
  dateCanMove: true,
  estimateHours: 4,
  finished: false,
  steps: [
    { id: 's1', title: 'Write the letter', done: true },
    { id: 's2', title: 'Send it', done: false },
  ],
  ...over,
});

const kinds = (): DayKindTimeView[] => [
  { id: 'k1', name: 'Work day', unit: 'hours', amount: 3 },
  { id: 'k2', name: 'Rest day', unit: null, amount: null },
  { id: 'k3', name: 'Gym day', unit: 'sessions', amount: 1 },
];

const callout = () => document.querySelector('[data-slot="missing-callout"]');
const typeInto = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('a deadline task: the words', () => {
  it('says the goal, then size, steps and due date, in the approved words', () => {
    render(<TaskEditScreen task={task()} />);
    expect(screen.getByText('Goal: Land the new role')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'How big is this?' })).toBeTruthy();
    expect(screen.getByText("A rough guess is fine. It's only used to say whether the days you've set aside look like enough. You can change it any time.")).toBeTruthy();
    expect(screen.getByLabelText('Rough size, in hours')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save size' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy();
    expect(screen.getByText("Steps are the smaller pieces of this. A step you've ticked stays as it is.")).toBeTruthy();
    expect(screen.getByLabelText('Add a step')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add step' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Due date' })).toBeTruthy();
    expect(screen.getByText('Due Fri, Nov 20. You said this date can move.')).toBeTruthy();
    expect(screen.getByLabelText('Move the date to')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move date' })).toBeTruthy();
  });

  it('a date that cannot move reads as approved and has no control to move it', () => {
    render(<TaskEditScreen task={task({ dateCanMove: false })} />);
    expect(screen.getByText("Due Fri, Nov 20. You said this date can't move.")).toBeTruthy();
    expect(screen.queryByLabelText('Move the date to')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move date' })).toBeNull();
  });

  it('a finished task shows only that it is finished, with no control', () => {
    render(<TaskEditScreen task={task({ finished: true })} />);
    expect(screen.getByText('This one is finished.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/Due /)).toBeNull();
  });

  it('starts with the size the person gave, and with nothing when they gave none', () => {
    const { unmount } = render(<TaskEditScreen task={task({ estimateHours: 2.5 })} />);
    expect((screen.getByLabelText('Rough size, in hours') as HTMLInputElement).value).toBe('2.5');
    unmount();
    render(<TaskEditScreen task={task({ estimateHours: null })} />);
    expect((screen.getByLabelText('Rough size, in hours') as HTMLInputElement).value).toBe('');
  });
});

describe('a deadline task: the size', () => {
  it('a tap with nothing typed shows the plain callout and calls nothing', () => {
    render(<TaskEditScreen task={task({ estimateHours: null })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save size' }));
    expect(callout()?.textContent).toBe('Say roughly how many hours first.');
    expect(actions.changeTaskSize).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Rough size, in hours'));
  });

  it('saves what was typed and then says it was saved, with the way home', async () => {
    render(<TaskEditScreen task={task()} />);
    typeInto(screen.getByLabelText('Rough size, in hours'), '2.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save size' }));
    await waitFor(() => expect(actions.changeTaskSize).toHaveBeenCalledWith('t1', '2.5'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. See it on home.'));
    expect(screen.getByRole('link', { name: 'See it on home.' }).getAttribute('href')).toBe('/');
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a refusal in words and does not say saved', async () => {
    (actions.changeTaskSize as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'Could not save that. Nothing was changed.' });
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save size' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not save that. Nothing was changed.'));
    expect(screen.queryByRole('status')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('the main button stays solid while saving: busy, never disabled', async () => {
    // A save the test settles itself at the end, so no transition is left pending for the tests after this one.
    let finish: (value: typeof ok) => void = () => {};
    (actions.changeTaskSize as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save size' }));
    const busy = screen.getByRole('button', { name: 'Saving…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect((busy as HTMLButtonElement).disabled).toBe(false);
    // Only the tapped button is busy: the other main buttons keep their own words, solid, and a tap on them is ignored meanwhile.
    expect(screen.getAllByRole('button', { name: 'Saving…' })).toHaveLength(1);
    for (const name of ['Add step', 'Move date']) {
      const other = screen.getByRole('button', { name });
      expect((other as HTMLButtonElement).disabled).toBe(false);
      expect(other.getAttribute('aria-busy')).toBeNull();
    }
    typeInto(screen.getByLabelText('Add a step'), 'Another step');
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(actions.addStep).not.toHaveBeenCalled();
    fireEvent.click(busy);
    expect(actions.changeTaskSize).toHaveBeenCalledTimes(1);
    finish(ok);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. See it on home.'));
    expect(screen.getByRole('button', { name: 'Save size' }).getAttribute('aria-busy')).toBeNull();
  });
});

describe('a deadline task: the steps', () => {
  it('a ticked step shows Done and nothing else; a step not ticked can be renamed or removed', () => {
    render(<TaskEditScreen task={task()} />);
    const items = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Done')).toBeTruthy();
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[1]).getByRole('button', { name: 'Rename Send it' }).textContent).toBe('Rename');
    expect(within(items[1]).getByRole('button', { name: 'Remove Send it' }).textContent).toBe('Remove');
    expect(within(items[1]).queryByText('Done')).toBeNull();
  });

  it('adding with nothing typed answers with the plain callout', () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(callout()?.textContent).toBe('Write the step first.');
    expect(actions.addStep).not.toHaveBeenCalled();
  });

  it('adds what was typed and empties the box once it is saved', async () => {
    render(<TaskEditScreen task={task()} />);
    const field = screen.getByLabelText('Add a step') as HTMLInputElement;
    typeInto(field, 'Get a reference');
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    await waitFor(() => expect(actions.addStep).toHaveBeenCalledWith('t1', 'Get a reference'));
    await waitFor(() => expect(field.value).toBe(''));
  });

  it('renames in place: the new words are sent only on Save name, and Never mind changes nothing', async () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    const field = screen.getByLabelText('Rename Send it') as HTMLInputElement;
    expect(field.value).toBe('Send it');
    typeInto(field, 'Send it by Friday');
    fireEvent.click(screen.getByRole('button', { name: 'Never mind' }));
    expect(actions.renameStep).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename Send it' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    expect((screen.getByLabelText('Rename Send it') as HTMLInputElement).value).toBe('Send it');
    typeInto(screen.getByLabelText('Rename Send it'), 'Send it by Friday');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(actions.renameStep).toHaveBeenCalledWith('s2', 'Send it by Friday'));
  });

  it('a rename opens with the step’s current name in the field, every time it is opened', () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    const field = () => screen.getByLabelText('Rename Send it') as HTMLInputElement;
    expect(field().value).toBe('Send it');
    // Emptied and given up on, then opened again: the current name is back, not the empty box.
    typeInto(field(), '');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(callout()?.textContent).toBe('Write the new name first.');
    fireEvent.click(screen.getByRole('button', { name: 'Never mind' }));
    expect(callout()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    expect(field().value).toBe('Send it');
    expect(callout()).toBeNull();
  });

  it('adding a step and renaming one are asked for in their own words', () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    expect(callout()?.textContent).toBe('Write the step first.');
    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    typeInto(screen.getByLabelText('Rename Send it'), '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain('Write the new name first.');
  });

  it('renaming to nothing answers with the plain callout', () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename Send it' }));
    typeInto(screen.getByLabelText('Rename Send it'), '  ');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(callout()?.textContent).toBe('Write the new name first.');
    expect(actions.renameStep).not.toHaveBeenCalled();
  });

  it('removes with one tap on that step', async () => {
    render(<TaskEditScreen task={task()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Send it' }));
    await waitFor(() => expect(actions.removeStep).toHaveBeenCalledWith('s2'));
  });

  it('a task with no steps shows the box to add one and no list', () => {
    render(<TaskEditScreen task={task({ steps: [] })} />);
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();
    expect(screen.getByLabelText('Add a step')).toBeTruthy();
  });
});

describe('a deadline task: the due date', () => {
  it('starts on the date it has and moves only on the tap', async () => {
    render(<TaskEditScreen task={task()} />);
    const field = screen.getByLabelText('Move the date to') as HTMLInputElement;
    expect(field.value).toBe('2026-11-20');
    expect(actions.changeTaskDate).not.toHaveBeenCalled();
    typeInto(field, '2026-12-04');
    fireEvent.click(screen.getByRole('button', { name: 'Move date' }));
    await waitFor(() => expect(actions.changeTaskDate).toHaveBeenCalledWith('t1', '2026-12-04'));
  });

  it('a day that has passed is refused with the approved words, before anything is sent', () => {
    render(<TaskEditScreen task={task()} />);
    typeInto(screen.getByLabelText('Move the date to'), '2026-10-30');
    fireEvent.click(screen.getByRole('button', { name: 'Move date' }));
    expect(callout()?.textContent).toBe('That day has passed. Pick a day from today on.');
    expect(actions.changeTaskDate).not.toHaveBeenCalled();
  });

  it('an empty day answers with a plain callout', () => {
    render(<TaskEditScreen task={task()} />);
    typeInto(screen.getByLabelText('Move the date to'), '');
    fireEvent.click(screen.getByRole('button', { name: 'Move date' }));
    expect(callout()?.textContent).toBe('Pick a day first.');
    expect(actions.changeTaskDate).not.toHaveBeenCalled();
  });

  it('the section can be reached from a link that ends in #date', () => {
    render(<TaskEditScreen task={task()} />);
    expect(document.getElementById('date')?.querySelector('h2')?.textContent).toBe('Due date');
  });
});

describe('how much time each kind of day gives', () => {
  it('says the help, each kind under its own name, and what is saved for it', () => {
    render(<KindTimesScreen kinds={kinds()} />);
    expect(
      screen.getByText(
        "For each kind of day, say how much time you usually have. Momentum uses this only to tell whether the days you've set aside look like enough for a deadline. It never fills in a day for you.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Work day' })).toBeTruthy();
    expect(screen.getByText('Usually 3 hours')).toBeTruthy();
    expect(screen.getByText('No usual time yet')).toBeTruthy();
    expect(screen.getByText('Usually 1 session')).toBeTruthy();
    for (const name of ['Work day', 'Rest day', 'Gym day']) expect(screen.getByRole('button', { name: `Save time for “${name}”` })).toBeTruthy();
    expect(screen.getAllByLabelText('How many?')).toHaveLength(3);
  });

  it('each kind can be reached by its own address (#kind-<id>), which home’s line uses', () => {
    render(<KindTimesScreen kinds={kinds()} />);
    expect(document.getElementById('kind-k2')?.querySelector('h2')?.textContent).toBe('Rest day');
  });

  it('a kind with no usual time starts with neither unit chosen, and the person’s own are kept', () => {
    render(<KindTimesScreen kinds={kinds()} />);
    const rest = within(document.getElementById('kind-k2') as HTMLElement);
    expect(rest.getByRole('button', { name: 'Hours' }).getAttribute('aria-pressed')).toBe('false');
    expect(rest.getByRole('button', { name: 'Sessions' }).getAttribute('aria-pressed')).toBe('false');
    expect((rest.getByLabelText('How many?') as HTMLInputElement).value).toBe('');
    const work = within(document.getElementById('kind-k1') as HTMLElement);
    expect(work.getByRole('button', { name: 'Hours' }).getAttribute('aria-pressed')).toBe('true');
    expect((work.getByLabelText('How many?') as HTMLInputElement).value).toBe('3');
  });

  it('a tap with no unit chosen says to choose one first, and with no amount says how many, and calls nothing', () => {
    render(<KindTimesScreen kinds={kinds()} />);
    const rest = within(document.getElementById('kind-k2') as HTMLElement);
    fireEvent.click(rest.getByRole('button', { name: 'Save time for “Rest day”' }));
    expect(callout()?.textContent).toBe('Choose hours or sessions first.');
    fireEvent.click(rest.getByRole('button', { name: 'Hours' }));
    expect(callout()).toBeNull();
    fireEvent.click(rest.getByRole('button', { name: 'Save time for “Rest day”' }));
    expect(callout()?.textContent).toBe('Say how many first.');
    expect(actions.changeKindTime).not.toHaveBeenCalled();
  });

  it('saves the unit and amount the person chose, for that kind only', async () => {
    render(<KindTimesScreen kinds={kinds()} />);
    const rest = within(document.getElementById('kind-k2') as HTMLElement);
    fireEvent.click(rest.getByRole('button', { name: 'Hours' }));
    typeInto(rest.getByLabelText('How many?'), '2.5');
    fireEvent.click(rest.getByRole('button', { name: 'Save time for “Rest day”' }));
    await waitFor(() => expect(actions.changeKindTime).toHaveBeenCalledWith('k2', 'hours', '2.5'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. See it on home.'));
  });

  it('says what sessions mean for a deadline, only once sessions is chosen', () => {
    render(<KindTimesScreen kinds={kinds()} />);
    const rest = within(document.getElementById('kind-k2') as HTMLElement);
    expect(rest.queryByText(/sized in hours/)).toBeNull();
    fireEvent.click(rest.getByRole('button', { name: 'Sessions' }));
    expect(rest.getByText("If you count in sessions, a deadline sized in hours can't be checked against that kind of day.")).toBeTruthy();
    expect(within(document.getElementById('kind-k3') as HTMLElement).getByText(/sized in hours/)).toBeTruthy();
  });

  it('with no kinds says so and shows nothing to save', () => {
    render(<KindTimesScreen kinds={[]} />);
    expect(screen.getByText("You haven't named any kinds of day yet.")).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a kind’s name is kept exactly as written', () => {
    render(<KindTimesScreen kinds={[{ id: 'k9', name: 'Gym + study (am)', unit: null, amount: null }]} />);
    expect(screen.getByRole('heading', { name: 'Gym + study (am)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save time for “Gym + study (am)”' })).toBeTruthy();
  });
});

describe("where home's forecast lines lead", () => {
  const dateCanMove = { id: 't1', dateCanMove: true };
  const dateLocked = { id: 't1', dateCanMove: false };
  const linksOf = (forecast: ForecastView, t: { id: string; dateCanMove: boolean } | null = dateCanMove) =>
    forecastLine(forecast, TODAY, t).links.map((l) => [l.label, l.href]);

  it('"no usual amount of time" leads to that kind’s own place', () => {
    expect(linksOf({ state: 'kind_without_time', date: '2026-11-02', kindName: 'Rest day', kindId: 'k2' })).toEqual([['Set the usual time for “Rest day”', '/plan/kinds#kind-k2']]);
    // It does not need the task: the kind is the place.
    expect(linksOf({ state: 'kind_without_time', date: '2026-11-02', kindName: 'Rest day', kindId: 'k2' }, null)).toEqual([['Set the usual time for “Rest day”', '/plan/kinds#kind-k2']]);
  });

  it('"no rough size" leads to the task’s size', () => {
    expect(linksOf({ state: 'not_enough_data' })).toEqual([['Say how big this is', '/task/t1']]);
    expect(linksOf({ state: 'not_enough_data' }, null)).toEqual([]);
  });

  it('a short verdict leads to making it smaller, and to moving the date only when that is offered and the date can move', () => {
    const all: ForecastView = { state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] };
    expect(linksOf(all)).toEqual([
      ['Plan more days', '/plan'],
      ["Make what's left smaller", '/task/t1'],
      ['Move the date', '/task/t1#date'],
    ]);
    // The engine did not offer "move the date" (setup said it cannot move): there is no link for it.
    const fixed: ForecastView = { state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'accept_risk'] };
    expect(linksOf(fixed)).toEqual([
      ['Plan more days', '/plan'],
      ["Make what's left smaller", '/task/t1'],
    ]);
    // Offered, but the task says it cannot move: still no link (nothing is assumed).
    expect(linksOf(all, dateLocked).map(([label]) => label)).not.toContain('Move the date');
  });

  it('"keep going as it is" is words only: there is nothing to save, so no link', () => {
    const line = forecastLine({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] }, TODAY, dateCanMove);
    expect(line.could).toContain('keep going as it is');
    expect(line.links.map((l) => l.label.toLowerCase())).not.toContain('keep going as it is');
  });

  it('a date that has passed leads to moving it only when setup said it can move', () => {
    expect(linksOf({ state: 'past_due' }, dateCanMove)).toEqual([['Move the date', '/task/t1#date']]);
    expect(linksOf({ state: 'past_due' }, dateLocked)).toEqual([]);
    expect(linksOf({ state: 'past_due' }, null)).toEqual([]);
  });

  it('the other lines lead where they did: into the week plan, or nowhere', () => {
    expect(linksOf({ state: 'tight' })).toEqual([['Plan more days', '/plan']]);
    expect(linksOf({ state: 'nothing_set_aside' })).toEqual([['Plan your week', '/plan']]);
    expect(linksOf({ state: 'day_without_kind', date: '2026-11-02' })).toEqual([['Say what kind of day', '/plan']]);
    expect(linksOf({ state: 'planned_so_far', days: 2, through: '2026-11-03' })).toEqual([['Plan more days', '/plan']]);
    expect(linksOf({ state: 'fits', soFar: false })).toEqual([]);
    expect(linksOf({ state: 'counted_in_sessions' })).toEqual([]);
  });
});

describe('home’s deadline row', () => {
  const row = (forecast: ForecastView | null, over: Partial<MilestoneView> = {}): MilestoneView => ({
    id: 't1',
    goalId: 'g',
    goalTitle: 'Land the new role',
    title: 'Send the application',
    kind: 'deadline_task',
    dueOn: '2026-11-20',
    steps: [{ id: 's1', title: 'Send it', done: false }],
    stepsDone: 0,
    dateCanMove: true,
    forecast,
    ...over,
  });
  const hrefs = (container: HTMLElement) => [...container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);

  it('every unfinished deadline task has the quiet "Edit this task" link', () => {
    const { container } = render(<MilestoneRow milestone={row({ state: 'fits', soFar: false })} today={TODAY} />);
    expect(hrefs(container)).toEqual([['Edit this task', '/task/t1']]);
  });

  it('a line that already leads to the task’s screen does not get the same link twice', () => {
    const { container } = render(<MilestoneRow milestone={row({ state: 'not_enough_data' })} today={TODAY} />);
    expect(hrefs(container)).toEqual([['Say how big this is', '/task/t1']]);
  });

  it('a line that only leads to the plan, or to a kind, still gets the quiet link', () => {
    const { container } = render(<MilestoneRow milestone={row({ state: 'kind_without_time', date: '2026-11-02', kindName: 'Rest day', kindId: 'k2' })} today={TODAY} />);
    expect(hrefs(container)).toEqual([
      ['Set the usual time for “Rest day”', '/plan/kinds#kind-k2'],
      ['Edit this task', '/task/t1'],
    ]);
  });

  it('a milestone has no edit, and a finished task (no forecast) has none either', () => {
    const milestone = render(<MilestoneRow milestone={row(null, { kind: 'milestone', dateCanMove: false })} today={TODAY} />);
    expect(hrefs(milestone.container)).toEqual([]);
    milestone.unmount();
    const finished = render(<MilestoneRow milestone={row(null)} today={TODAY} />);
    expect(hrefs(finished.container)).toEqual([]);
  });

  it('a task with no steps does not say "0 of 0 steps done"; one with steps still counts them', () => {
    const none = render(<MilestoneRow milestone={row({ state: 'fits', soFar: false }, { steps: [], stepsDone: 0 })} today={TODAY} />);
    expect(none.container.querySelector('.home-count')).toBeNull();
    expect(none.container.textContent).not.toMatch(/\d+\s*of\s*\d+/);
    // Everything else about the row is still there: its title, the date, the forecast and the way to edit it.
    expect(none.getByRole('heading', { name: 'Send the application' })).toBeTruthy();
    expect(none.container.querySelector('.home-forecast')).not.toBeNull();
    expect(hrefs(none.container)).toEqual([['Edit this task', '/task/t1']]);
    none.unmount();

    const some = render(<MilestoneRow milestone={row({ state: 'fits', soFar: false }, { steps: [{ id: 's1', title: 'Send it', done: true }], stepsDone: 1 })} today={TODAY} />);
    expect(some.container.querySelector('.home-count')?.textContent).toBe('1 of 1step done');
  });

  it('a milestone with no steps does not say it either', () => {
    const { container } = render(<MilestoneRow milestone={row(null, { kind: 'milestone', dateCanMove: false, steps: [], stepsDone: 0 })} today={TODAY} />);
    expect(container.querySelector('.home-count')).toBeNull();
  });

  it('"move the date" on a short task leads to the date section of its screen', () => {
    const { container } = render(
      <MilestoneRow milestone={row({ state: 'does_not_fit', options: ['more_time', 'smaller_scope', 'move_date', 'accept_risk'] })} today={TODAY} />,
    );
    expect(hrefs(container)).toEqual([
      ['Plan more days', '/plan'],
      ["Make what's left smaller", '/task/t1'],
      ['Move the date', '/task/t1#date'],
    ]);
  });
});
