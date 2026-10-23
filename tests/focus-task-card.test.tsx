// @vitest-environment jsdom
//
// The focus card's own markers in a DOM (MOM-61, closing the gap left in MOM-56): the "Carried over from week N" and
// "Pulled forward from week N" chips and the "Moved N times" line. The toggle and its error states are in
// tests/focus-card.test.tsx. The card shows what the task row and the move history say; it never moves or completes
// anything itself (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusTaskCard } from '@/components/tasks/FocusTaskCard';
import type { MicroTask } from '@/types/database.types';
import type { TaskMove } from '@/types/rebalance';

const actions = vi.hoisted(() => ({ toggle: vi.fn() }));
vi.mock('@/app/actions/tasks', () => ({ toggleTaskStatus: actions.toggle }));

function task(over: Partial<MicroTask> = {}): MicroTask {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: 'u',
    goal_channel_id: 'g',
    title: 'Finish the cloud security study block',
    task_type: 'certify',
    minutes: 45,
    status: 'todo',
    fit: null,
    week_of: 3,
    due_date: null,
    carried_from_week: null,
    pulled_from_week: null,
    completed_at: null,
    source_provider: null,
    source_external_id: null,
    source_evidence: null,
    created_at: '2026-10-14T00:00:00Z',
    updated_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}
const move = (sourceWeek: number, targetWeek: number, shiftType: TaskMove['shiftType'] = 'carry_over'): TaskMove => ({
  sourceWeek,
  targetWeek,
  shiftType,
});

beforeEach(() => actions.toggle.mockReset());
afterEach(cleanup);

describe('the carried-over and pulled-forward markers', () => {
  it('a carried-over task says which week it came from', () => {
    render(<FocusTaskCard task={task({ carried_from_week: 2 })} moves={[move(2, 3)]} />);
    expect(screen.getByText('Carried over from week 2')).toBeTruthy();
    expect(screen.queryByText(/Pulled forward/)).toBeNull();
  });

  it('a pulled-forward task says which week it came from', () => {
    render(<FocusTaskCard task={task({ pulled_from_week: 6, week_of: 4 })} moves={[move(6, 4, 'pull_forward')]} />);
    expect(screen.getByText('Pulled forward from week 6')).toBeTruthy();
    expect(screen.queryByText(/Carried over/)).toBeNull();
  });

  it('a task that never moved has neither marker', () => {
    render(<FocusTaskCard task={task()} moves={[]} />);
    expect(screen.queryByText(/Carried over|Pulled forward/)).toBeNull();
  });

  it('also shows the task type, the minutes and the title', () => {
    render(<FocusTaskCard task={task({ carried_from_week: 2 })} moves={[]} />);
    expect(screen.getByText('Certify')).toBeTruthy();
    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Finish the cloud security study block' })).toBeTruthy();
  });
});

describe('the "Moved N times" line', () => {
  it('shows the whole path for a task that moved more than once', () => {
    render(<FocusTaskCard task={task({ carried_from_week: 3, week_of: 5 })} moves={[move(2, 3), move(3, 5)]} />);
    expect(screen.getByText('Moved 2 times: Week 2 → 3 → 5')).toBeTruthy();
    // The chip still shows only the last hop.
    expect(screen.getByText('Carried over from week 3')).toBeTruthy();
  });

  it('follows a pull-forward after a carry-over', () => {
    render(
      <FocusTaskCard
        task={task({ pulled_from_week: 5, week_of: 4 })}
        moves={[move(2, 3), move(3, 5), move(5, 4, 'pull_forward')]}
      />,
    );
    expect(screen.getByText('Moved 3 times: Week 2 → 3 → 5 → 4')).toBeTruthy();
  });

  it('is left out for a single move, which the chip already says', () => {
    render(<FocusTaskCard task={task({ carried_from_week: 2 })} moves={[move(2, 3)]} />);
    expect(screen.queryByText(/Moved \d+ times/)).toBeNull();
  });

  it('is left out when there is no history', () => {
    render(<FocusTaskCard task={task()} moves={[]} />);
    expect(screen.queryByText(/Moved \d+ times/)).toBeNull();
  });
});

describe('the markers never change the task', () => {
  it('rendering a moved task calls no action', () => {
    render(<FocusTaskCard task={task({ carried_from_week: 2 })} moves={[move(2, 3), move(3, 5)]} />);
    expect(actions.toggle).not.toHaveBeenCalled();
  });
});
