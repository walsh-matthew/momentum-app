// @vitest-environment jsdom
//
// The manual-entry controls in a DOM (MOM-110): a tap, a number, typed minutes, a timer and a checklist tick each call
// their one server action with the right arguments (and a chosen day only when the person chose one), show the
// service's refusal and notice in words, and cannot be pressed twice while they run; remove and restore work from
// the recent list. The service and the database rules behind them are in
// tests/entries-service.test.ts. Nothing here computes a number: the controls pass on what the person did.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChecklistControl } from '@/components/entries/ChecklistControl';
import { DayPicker } from '@/components/entries/DayPicker';
import { EntryList } from '@/components/entries/EntryList';
import { ManualEntryPanel } from '@/components/entries/ManualEntryPanel';
import { MinutesControl } from '@/components/entries/MinutesControl';
import { NumberControl } from '@/components/entries/NumberControl';
import { TapControl } from '@/components/entries/TapControl';
import { TimerControl } from '@/components/entries/TimerControl';
import { describeEntry, formatChosenDay, formatElapsed, formatEntryTime } from '@/components/entries/format';
import { ENTRY_NETWORK_ERROR } from '@/components/entries/useEntryAction';
import type { LogDay, LogPanel, LogTarget, LoggedEntry } from '@/types/entries';

const actions = vi.hoisted(() => ({
  tap: vi.fn(),
  number: vi.fn(),
  minutes: vi.fn(),
  timer: vi.fn(),
  tick: vi.fn(),
  untick: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
}));
vi.mock('@/app/actions/entries', () => ({
  logTapEntry: actions.tap,
  logNumberEntry: actions.number,
  logMinutesEntry: actions.minutes,
  logTimerEntry: actions.timer,
  tickChecklistStep: actions.tick,
  untickChecklistStep: actions.untick,
  removeLoggedEntry: actions.remove,
  restoreLoggedEntry: actions.restore,
}));

const ok = { ok: true, data: { entryId: 'e' } };
const refused = (error: string) => ({ ok: false, error });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const target = (over: Partial<LogTarget> = {}): LogTarget => ({
  id: 't-1',
  title: 'Workouts',
  goalTitle: 'Stay fit',
  measure: 'count',
  unit: null,
  items: [],
  ...over,
});

const entry = (over: Partial<LoggedEntry> = {}): LoggedEntry => ({
  id: 'e-1',
  targetId: 't-1',
  targetTitle: 'Workouts',
  measure: 'count',
  unit: null,
  value: 1,
  occurredAt: '2026-10-27T15:30:00.000Z',
  via: 'tap',
  detail: null,
  chosenDay: null,
  beforeStart: false,
  removed: false,
  ...over,
});

// Today is Tuesday 2026-10-27; the server builds these in the person's zone.
const days: LogDay[] = [
  { date: '2026-10-27', label: 'Today', detail: 'Oct 27' },
  { date: '2026-10-26', label: 'Yesterday', detail: 'Oct 26' },
  { date: '2026-10-25', label: 'Sun', detail: 'Oct 25' },
  { date: '2026-10-24', label: 'Sat', detail: 'Oct 24' },
  { date: '2026-10-23', label: 'Fri', detail: 'Oct 23' },
  { date: '2026-10-22', label: 'Thu', detail: 'Oct 22' },
  { date: '2026-10-21', label: 'Wed', detail: 'Oct 21' },
  { date: '2026-10-20', label: 'Tue', detail: 'Oct 20' },
];

// Opens the day picker and chooses a day by its name ("Yesterday, Oct 26").
function chooseDay(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Change day/ }));
  fireEvent.click(screen.getByRole('radio', { name }));
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('the tap', () => {
  it('is one large button that logs the target when tapped, and nothing before', async () => {
    actions.tap.mockResolvedValue(ok);
    render(<TapControl target={target()} />);
    expect(actions.tap).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Log one: Workouts/ }));
    await waitFor(() => expect(actions.tap).toHaveBeenCalledWith('t-1'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens no keyboard: it has no text field at all', () => {
    render(<TapControl target={target()} />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('is disabled while saving, so a double tap logs once', async () => {
    const pending = deferred<typeof ok>();
    actions.tap.mockReturnValue(pending.promise);
    render(<TapControl target={target()} />);

    const button = screen.getByRole('button', { name: /Log one: Workouts/ });
    fireEvent.click(button);
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button'));
    expect(actions.tap).toHaveBeenCalledTimes(1);

    pending.resolve(ok);
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows the service's refusal in words, such as no time zone", async () => {
    actions.tap.mockResolvedValue(refused('Set your time zone before logging, so your entries land on the right day. Nothing was logged.'));
    render(<TapControl target={target()} />);
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toContain('Set your time zone before logging');
  });

  it('says so when the request itself fails, and lets the person try again', async () => {
    actions.tap.mockRejectedValue(new Error('offline'));
    render(<TapControl target={target()} />);
    fireEvent.click(screen.getByRole('button'));
    expect((await screen.findByRole('alert')).textContent).toBe(ENTRY_NETWORK_ERROR);
    await waitFor(() => expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('the number', () => {
  const quantity = target({ id: 't-2', title: 'Distance', measure: 'quantity', unit: 'km' });

  it('opens the number pad (decimal input mode) and is the only control with a text field', () => {
    render(<NumberControl target={quantity} />);
    const input = screen.getByRole('textbox', { name: 'Amount in km for Distance' });
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });

  it('logs the number as typed, accepts a comma as the decimal mark, and clears the field after it is accepted', async () => {
    actions.number.mockResolvedValue(ok);
    render(<NumberControl target={quantity} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(actions.number).toHaveBeenCalledWith('t-2', 12.5));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it.each(['', '   ', 'abc', '0', '0.0', '-3', '1e3', '12 km', '1.2.3'])('refuses "%s" without calling the server', (text) => {
    render(<NumberControl target={quantity} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a number above 0.');
    expect(actions.number).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the service refuses, and shows why', async () => {
    actions.number.mockResolvedValue(refused('That number is above 1,000,000, so it was not logged. Check it and try again.'));
    render(<NumberControl target={quantity} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect((await screen.findByRole('alert')).textContent).toContain('above 1,000,000');
    expect(input.value).toBe('5000000');
  });
});

describe('the timer', () => {
  const time = target({ id: 't-3', title: 'Study time', measure: 'time' });
  const started = '2026-10-27T15:00:00.000Z';

  it('starts, remembers its start in this browser, and shows a running clock and Stop', () => {
    render(<TimerControl target={time} />);
    expect(screen.queryByRole('timer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Start timer: Study time/ }));
    expect(screen.getByRole('button', { name: /Stop timer: Study time/ })).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(Date.parse(window.localStorage.getItem('momentum:timer:t-3') ?? '')).not.toBeNaN();
    expect(actions.timer).not.toHaveBeenCalled();
  });

  it('picks a running timer back up after a reload', async () => {
    window.localStorage.setItem('momentum:timer:t-3', started);
    render(<TimerControl target={time} />);
    expect(await screen.findByRole('button', { name: /Stop timer: Study time/ })).toBeTruthy();
  });

  it('stopping sends the saved start and nothing else, then goes back to Start and forgets the start', async () => {
    window.localStorage.setItem('momentum:timer:t-3', started);
    actions.timer.mockResolvedValue(ok);
    render(<TimerControl target={time} />);

    fireEvent.click(await screen.findByRole('button', { name: /Stop timer/ }));
    await waitFor(() => expect(actions.timer).toHaveBeenCalledWith('t-3', started));
    expect(actions.timer.mock.calls[0]).toHaveLength(2);
    expect(await screen.findByRole('button', { name: /Start timer/ })).toBeTruthy();
    expect(window.localStorage.getItem('momentum:timer:t-3')).toBeNull();
  });

  it('keeps the timer running when the service refuses, and says why', async () => {
    window.localStorage.setItem('momentum:timer:t-3', started);
    actions.timer.mockResolvedValue(refused('That timer ran under 30 seconds, so it was not logged.'));
    render(<TimerControl target={time} />);

    fireEvent.click(await screen.findByRole('button', { name: /Stop timer/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('under 30 seconds');
    expect(screen.getByRole('button', { name: /Stop timer/ })).toBeTruthy();
    expect(window.localStorage.getItem('momentum:timer:t-3')).toBe(started);
  });

  it('can discard a running timer without logging anything', async () => {
    window.localStorage.setItem('momentum:timer:t-3', started);
    render(<TimerControl target={time} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Discard this timer without logging' }));
    expect(await screen.findByRole('button', { name: /Start timer/ })).toBeTruthy();
    expect(actions.timer).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('momentum:timer:t-3')).toBeNull();
  });

  it('keeps one timer per target', async () => {
    window.localStorage.setItem('momentum:timer:t-3', started);
    render(<TimerControl target={target({ id: 't-9', title: 'Other time', measure: 'time' })} />);
    expect(screen.getByRole('button', { name: /Start timer: Other time/ })).toBeTruthy();
  });

  it('still works when the browser will not let the page store anything', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const reading = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<TimerControl target={time} />);
    fireEvent.click(screen.getByRole('button', { name: /Start timer/ }));
    expect(screen.getByRole('button', { name: /Stop timer/ })).toBeTruthy();
    blocked.mockRestore();
    reading.mockRestore();
  });
});

describe('the checklist', () => {
  const checklist = target({
    id: 't-4',
    title: 'Prep',
    measure: 'checklist',
    items: [
      {
        id: 'i-1',
        title: 'Prep checklist',
        steps: [
          { id: 's-1', title: 'Read the brief', ticked: true },
          { id: 's-2', title: 'Book the room', ticked: false },
        ],
      },
    ],
  });

  it('shows each step as a checkbox that says whether it is ticked, with no keyboard', () => {
    render(<ChecklistControl target={checklist} />);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('ticks an unticked step, and un-ticks a ticked one', async () => {
    actions.tick.mockResolvedValue(ok);
    actions.untick.mockResolvedValue(ok);
    render(<ChecklistControl target={checklist} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Book the room/ }));
    await waitFor(() => expect(actions.tick).toHaveBeenCalledWith('s-2'));
    fireEvent.click(screen.getByRole('checkbox', { name: /Read the brief/ }));
    await waitFor(() => expect(actions.untick).toHaveBeenCalledWith('s-1'));
    expect(actions.tick).toHaveBeenCalledTimes(1);
    expect(actions.untick).toHaveBeenCalledTimes(1);
  });

  it("shows a step's refusal beside that step only", async () => {
    actions.tick.mockResolvedValue(refused("This item isn't feeding a checklist target yet."));
    render(<ChecklistControl target={checklist} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Book the room/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("isn't feeding a checklist target");
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('says so when nothing feeds the target, or an item has no steps', () => {
    const { rerender } = render(<ChecklistControl target={target({ measure: 'checklist', items: [] })} />);
    expect(screen.getByText('No steps feed this target yet.')).toBeTruthy();
    rerender(<ChecklistControl target={target({ measure: 'checklist', items: [{ id: 'i', title: 'Empty', steps: [] }] })} />);
    expect(screen.getByText('This item has no steps yet.')).toBeTruthy();
  });
});

describe('the recent entries: remove and restore', () => {
  it('removes an entry on tap and restores a removed one, each calling its action with the entry id', async () => {
    actions.remove.mockResolvedValue(ok);
    actions.restore.mockResolvedValue(ok);
    render(
      <EntryList
        timeZone="America/Los_Angeles"
        entries={[entry({ id: 'e-1' }), entry({ id: 'e-2', removed: true, targetTitle: 'Distance', measure: 'quantity', unit: 'km', value: 12.5 })]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove\s+Workouts: \+1/ }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith('e-1'));
    fireEvent.click(screen.getByRole('button', { name: /Restore\s+Distance: 12.5 km/ }));
    await waitFor(() => expect(actions.restore).toHaveBeenCalledWith('e-2'));
  });

  it('keeps a removed entry in the list, marked Removed, never hides it from the person', () => {
    render(<EntryList timeZone="UTC" entries={[entry({ removed: true })]} />);
    expect(screen.getByText('Removed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it("shows the time in the person's own time zone, and none when no zone is set", () => {
    const { rerender } = render(<EntryList timeZone="America/Los_Angeles" entries={[entry()]} />);
    expect(screen.getByText(/8:30\s?AM PDT/)).toBeTruthy();
    rerender(<EntryList timeZone="Asia/Tokyo" entries={[entry()]} />);
    expect(screen.getByText(/12:30\s?AM/)).toBeTruthy();
    rerender(<EntryList timeZone={null} entries={[entry()]} />);
    expect(screen.queryByText(/AM|PM/)).toBeNull();
  });

  it('says so when nothing is logged yet', () => {
    render(<EntryList timeZone="UTC" entries={[]} />);
    expect(screen.getByText('Nothing logged yet.')).toBeTruthy();
  });

  it("shows a removal's refusal on that entry", async () => {
    actions.remove.mockResolvedValue(refused('Only entries you logged yourself can be changed here.'));
    render(<EntryList timeZone="UTC" entries={[entry()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Only entries you logged yourself');
  });
});

describe('the panel', () => {
  const panel = (over: Partial<LogPanel> = {}): LogPanel => ({
    timeZone: 'America/Los_Angeles',
    targets: [
      target({ id: 'a', title: 'Workouts', measure: 'count' }),
      target({ id: 'b', title: 'Distance', measure: 'quantity', unit: 'km' }),
      target({ id: 'c', title: 'Study time', measure: 'time' }),
      target({
        id: 'd',
        title: 'Prep',
        measure: 'checklist',
        items: [{ id: 'i', title: 'Prep checklist', steps: [{ id: 's', title: 'Read the brief', ticked: false }] }],
      }),
    ],
    days,
    recent: [],
    ...over,
  });

  it('gives each target the control its measure calls for', () => {
    render(<ManualEntryPanel panel={panel()} />);
    const section = (name: string) => screen.getByRole('region', { name });
    expect(within(section('Workouts')).getByRole('button', { name: /Log one: Workouts/ })).toBeTruthy();
    expect(within(section('Distance')).getByRole('textbox')).toBeTruthy();
    expect(within(section('Study time')).getByRole('button', { name: /Start timer: Study time/ })).toBeTruthy();
    expect(within(section('Prep')).getByRole('checkbox', { name: /Read the brief/ })).toBeTruthy();
  });

  it('says plainly that no time zone is set, and assumes none', () => {
    render(<ManualEntryPanel panel={panel({ timeZone: null })} />);
    expect(screen.getByRole('status').textContent).toContain('No time zone is set yet');
  });

  it('shows no notice when a time zone is set', () => {
    render(<ManualEntryPanel panel={panel()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so when there are no targets yet', () => {
    render(<ManualEntryPanel panel={panel({ targets: [] })} />);
    expect(screen.getByText(/No targets yet/)).toBeTruthy();
  });
});

describe('the day picker', () => {
  it('starts on today, closed, and opens a grid of days with no keyboard', () => {
    const onChange = vi.fn();
    render(<DayPicker days={days} value={null} onChange={onChange} name="Workouts" />);
    expect(screen.getByRole('button', { name: /When: Today/ })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Change day/ }));
    const group = screen.getByRole('radiogroup', { name: 'Day for Workouts' });
    expect(within(group).getAllByRole('radio')).toHaveLength(8);
    expect(within(group).getByRole('radio', { name: 'Today, Oct 27' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('chooses today as "now" (null) and any other day by its date, then closes', () => {
    const onChange = vi.fn();
    render(<DayPicker days={days} value={null} onChange={onChange} name="Workouts" />);
    fireEvent.click(screen.getByRole('button', { name: /Change day/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Yesterday, Oct 26' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-26');
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Change day/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Today, Oct 27' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('names the chosen day in its summary and marks it chosen', () => {
    render(<DayPicker days={days} value="2026-10-24" onChange={vi.fn()} name="Workouts" />);
    expect(screen.getByRole('button', { name: /When: Sat, Oct 24/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Change day/ }));
    expect(screen.getByRole('radio', { name: 'Sat, Oct 24' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Today, Oct 27' }).getAttribute('aria-checked')).toBe('false');
  });

  it('can be disabled while a log is saving', () => {
    render(<DayPicker days={days} value={null} onChange={vi.fn()} name="Workouts" disabled />);
    expect((screen.getByRole('button', { name: /When: Today/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('logging on a chosen day', () => {
  it('shows no day picker where the person cannot choose a day yet', () => {
    render(<TapControl target={target()} days={null} />);
    expect(screen.queryByRole('button', { name: /Change day/ })).toBeNull();
  });

  it('sends the chosen day with a tap, and only then; the day goes back to today after it is accepted', async () => {
    actions.tap.mockResolvedValue(ok);
    render(<TapControl target={target()} days={days} />);

    chooseDay('Yesterday, Oct 26');
    expect(screen.getByRole('button', { name: /When: Yesterday, Oct 26/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Log one: Workouts/ }));
    await waitFor(() => expect(actions.tap).toHaveBeenCalledWith('t-1', '2026-10-26'));
    expect(await screen.findByRole('button', { name: /When: Today/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Log one: Workouts/ }));
    await waitFor(() => expect(actions.tap).toHaveBeenCalledTimes(2));
    expect(actions.tap).toHaveBeenLastCalledWith('t-1');
  });

  it('keeps the chosen day when the service refuses it, and shows why', async () => {
    actions.tap.mockResolvedValue(refused("That day hasn't happened yet, so nothing was logged."));
    render(<TapControl target={target()} days={days} />);
    chooseDay('Sat, Oct 24');
    fireEvent.click(screen.getByRole('button', { name: /Log one: Workouts/ }));
    expect((await screen.findByRole('alert')).textContent).toContain("hasn't happened yet");
    expect(screen.getByRole('button', { name: /When: Sat, Oct 24/ })).toBeTruthy();
  });

  it('sends the chosen day with a number', async () => {
    actions.number.mockResolvedValue(ok);
    render(<NumberControl target={target({ id: 't-2', title: 'Distance', measure: 'quantity', unit: 'km' })} days={days} />);
    chooseDay('Sun, Oct 25');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(actions.number).toHaveBeenCalledWith('t-2', 8, '2026-10-25'));
  });

  it('sends the chosen day with the first tick of a step, from one picker for the whole target', async () => {
    actions.tick.mockResolvedValue(ok);
    const checklist = target({
      id: 't-4',
      title: 'Prep',
      measure: 'checklist',
      items: [{ id: 'i-1', title: 'Prep checklist', steps: [{ id: 's-2', title: 'Book the room', ticked: false }] }],
    });
    render(<ChecklistControl target={checklist} days={days} />);
    expect(screen.getAllByRole('button', { name: /Change day/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Day for the next tick: Today/ })).toBeTruthy();

    chooseDay('Fri, Oct 23');
    fireEvent.click(screen.getByRole('checkbox', { name: /Book the room/ }));
    await waitFor(() => expect(actions.tick).toHaveBeenCalledWith('s-2', '2026-10-23'));
  });

  it('un-ticks without a day', async () => {
    actions.untick.mockResolvedValue(ok);
    const checklist = target({
      measure: 'checklist',
      items: [{ id: 'i-1', title: 'Prep checklist', steps: [{ id: 's-1', title: 'Read the brief', ticked: true }] }],
    });
    render(<ChecklistControl target={checklist} days={days} />);
    chooseDay('Fri, Oct 23');
    fireEvent.click(screen.getByRole('checkbox', { name: /Read the brief/ }));
    await waitFor(() => expect(actions.untick).toHaveBeenCalledWith('s-1'));
    expect(actions.tick).not.toHaveBeenCalled();
  });
});

describe('typed minutes', () => {
  const time = target({ id: 't-3', title: 'Study time', measure: 'time' });

  it('opens the number pad (numeric input mode) for whole minutes', () => {
    render(<MinutesControl target={time} />);
    expect(screen.getByRole('textbox', { name: 'Minutes for Study time' }).getAttribute('inputmode')).toBe('numeric');
  });

  it('logs the minutes as typed and clears the field once the service accepts them', async () => {
    actions.minutes.mockResolvedValue(ok);
    render(<MinutesControl target={time} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    await waitFor(() => expect(actions.minutes).toHaveBeenCalledWith('t-3', 45));
    expect(actions.minutes.mock.calls[0]).toHaveLength(2);
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('sends the chosen day with the minutes', async () => {
    actions.minutes.mockResolvedValue(ok);
    render(<MinutesControl target={time} days={days} />);
    chooseDay('Yesterday, Oct 26');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    await waitFor(() => expect(actions.minutes).toHaveBeenCalledWith('t-3', 30, '2026-10-26'));
  });

  it.each(['', '  ', 'abc', '0', '1.5', '1,5', '-3', '1e3', '45 min', '4 5'])('refuses "%s" without calling the server', (text) => {
    render(<MinutesControl target={time} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a whole number of minutes, 1 or more.');
    expect(actions.minutes).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the service refuses, and shows why', async () => {
    actions.minutes.mockResolvedValue(refused('That is more than 24 hours (1,440 minutes), so it was not logged. Check it and try again.'));
    render(<MinutesControl target={time} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('more than 24 hours');
    expect(input.value).toBe('5000');
  });

  it('sits under the timer, which takes no day', async () => {
    window.localStorage.setItem('momentum:timer:t-3', '2026-10-27T15:00:00.000Z');
    actions.timer.mockResolvedValue(ok);
    render(<TimerControl target={time} days={days} />);
    expect(screen.getByRole('textbox', { name: 'Minutes for Study time' })).toBeTruthy();
    // One picker only: the one for the typed minutes. The timer has none.
    expect(screen.getAllByRole('button', { name: /Change day/ })).toHaveLength(1);

    chooseDay('Sat, Oct 24');
    fireEvent.click(await screen.findByRole('button', { name: /Stop timer/ }));
    await waitFor(() => expect(actions.timer).toHaveBeenCalledWith('t-3', '2026-10-27T15:00:00.000Z'));
    expect(actions.timer.mock.calls[0]).toHaveLength(2);
  });
});

describe('an entry saved before its goal’s start date', () => {
  const notice = "Saved. It's before this goal's start date (Oct 26), so it won't count unless you move the start date earlier.";
  const saved = { ok: true, data: { entryId: 'e', notice } };

  it('says so in words after a tap, as a status and not an error', async () => {
    actions.tap.mockResolvedValue(saved);
    render(<TapControl target={target()} days={days} />);
    fireEvent.click(screen.getByRole('button', { name: /Log one/ }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so after stopping a timer, which is a log made now', async () => {
    window.localStorage.setItem('momentum:timer:t-3', '2026-10-27T15:00:00.000Z');
    actions.timer.mockResolvedValue(saved);
    render(<TimerControl target={target({ id: 't-3', title: 'Study time', measure: 'time' })} />);
    fireEvent.click(await screen.findByRole('button', { name: /Stop timer/ }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so after a number', async () => {
    actions.number.mockResolvedValue(saved);
    render(<NumberControl target={target({ id: 't-2', title: 'Distance', measure: 'quantity', unit: 'km' })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
  });

  it('says so after typed minutes', async () => {
    actions.minutes.mockResolvedValue(saved);
    render(<MinutesControl target={target({ id: 't-3', title: 'Study time', measure: 'time' })} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log minutes' }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
  });

  it('says so beside the step after a first tick', async () => {
    actions.tick.mockResolvedValue(saved);
    render(
      <ChecklistControl
        target={target({
          measure: 'checklist',
          items: [{ id: 'i-1', title: 'Prep checklist', steps: [{ id: 's-2', title: 'Book the room', ticked: false }] }],
        })}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Book the room/ }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
  });

  it('shows no status after an ordinary log, and clears the notice on the next one', async () => {
    actions.tap.mockResolvedValueOnce(saved).mockResolvedValueOnce(ok);
    render(<TapControl target={target()} />);
    fireEvent.click(screen.getByRole('button', { name: /Log one/ }));
    expect((await screen.findByRole('status')).textContent).toBe(notice);
    fireEvent.click(screen.getByRole('button', { name: /Log one/ }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('labels the entry in Recent entries as not counted, and leaves other entries unlabelled', () => {
    render(
      <EntryList
        timeZone="America/Los_Angeles"
        entries={[entry({ id: 'e-1', beforeStart: true }), entry({ id: 'e-2', targetTitle: 'Distance', measure: 'quantity', value: 3 })]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText("Before the goal's start, not counted")).toBeTruthy();
    expect(within(rows[1]).queryByText(/not counted/)).toBeNull();
  });

  it('keeps the label on a removed entry too, so it is never silent', () => {
    render(<EntryList timeZone="UTC" entries={[entry({ beforeStart: true, removed: true })]} />);
    expect(screen.getByText("Before the goal's start, not counted")).toBeTruthy();
    expect(screen.getByText('Removed')).toBeTruthy();
  });
});

describe('an entry on a chosen day, in the recent list', () => {
  it('shows the day only, never a clock time, because the stored time is a stand-in', () => {
    render(<EntryList timeZone="America/Los_Angeles" entries={[entry({ chosenDay: '2026-10-26', occurredAt: '2026-10-26T19:00:00.000Z' })]} />);
    expect(screen.getByText('Mon, Oct 26 · the day you chose')).toBeTruthy();
    expect(screen.queryByText(/AM|PM/)).toBeNull();
  });

  it('shows the chosen day even when no time zone is set, and a day that is not a date as nothing', () => {
    const { rerender } = render(<EntryList timeZone={null} entries={[entry({ chosenDay: '2026-10-26' })]} />);
    expect(screen.getByText(/Mon, Oct 26/)).toBeTruthy();
    expect(formatChosenDay('2026-10-26')).toBe('Mon, Oct 26');
    expect(formatChosenDay('not a date')).toBe('');
    rerender(<EntryList timeZone={null} entries={[entry()]} />);
    expect(screen.queryByText(/the day you chose/)).toBeNull();
  });

  it('describes a typed-minutes entry like any time entry', () => {
    expect(describeEntry(entry({ measure: 'time', value: 45, via: 'minutes' }))).toBe('45 min');
  });
});

describe('the panel and the day end', () => {
  const withDays = (over: Partial<LogPanel> = {}): LogPanel => ({
    timeZone: 'America/Los_Angeles',
    days,
    targets: [target({ id: 'a', title: 'Workouts', measure: 'count' }), target({ id: 'c', title: 'Study time', measure: 'time' })],
    recent: [],
    ...over,
  });

  it('gives every control the days, so each log can say when it happened', () => {
    render(<ManualEntryPanel panel={withDays()} />);
    expect(within(screen.getByRole('region', { name: 'Workouts' })).getByRole('button', { name: /Change day/ })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Study time' })).getByRole('button', { name: /Change day/ })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says plainly that no day end is set, offers no day, and still lets the person log for now', () => {
    render(<ManualEntryPanel panel={withDays({ days: null })} />);
    expect(screen.getByRole('status').textContent).toContain('No day end is set yet');
    expect(screen.queryByRole('button', { name: /Change day/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Log one: Workouts/ })).toBeTruthy();
  });

  it('says only that the time zone is missing when there is no zone, not also the day end', () => {
    render(<ManualEntryPanel panel={withDays({ timeZone: null, days: null })} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toContain('No time zone is set yet');
  });
});

describe('the wording helpers', () => {
  it('describes each kind of entry in the way it was logged', () => {
    expect(describeEntry(entry())).toBe('+1');
    expect(describeEntry(entry({ measure: 'quantity', unit: 'km', value: 12.5 }))).toBe('12.5 km');
    expect(describeEntry(entry({ measure: 'quantity', unit: null, value: 3 }))).toBe('3');
    expect(describeEntry(entry({ measure: 'time', value: 25 }))).toBe('25 min');
    expect(describeEntry(entry({ measure: 'checklist', detail: 'Read the brief' }))).toBe('Ticked: Read the brief');
    expect(describeEntry(entry({ measure: 'checklist', detail: null }))).toBe('Ticked a step');
  });

  it('formats a running clock as m:ss, and h:mm:ss from an hour', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('shows no time for a zone that is missing or not real', () => {
    expect(formatEntryTime('2026-10-27T15:30:00.000Z', null)).toBe('');
    expect(formatEntryTime('2026-10-27T15:30:00.000Z', 'Mars/Base')).toBe('');
    expect(formatEntryTime('not a date', 'UTC')).toBe('');
  });
});
