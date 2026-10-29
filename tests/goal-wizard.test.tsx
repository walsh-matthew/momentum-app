// @vitest-environment jsdom
//
// The goal wizard in a DOM (MOM-61, closing what MOM-55 listed): the steps, Generate and the labels on the plan,
// a failure with Try again and no automatic fallback, "Use the starter plan instead", Create sending the chosen
// plan, and the 20 second wait message. The two server actions are mocked; what they do (validation, the cooldown,
// saving) is in tests/week-one-plan.test.ts and, against the real database function, supabase/verify/009.
//
// Nothing here saves anything until Create is clicked, and the model is only asked when Generate is clicked
// (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6).

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoalBuilderWizard } from '@/components/goals/GoalBuilderWizard';
import { buildStubTaskPlan, parseWizardInput } from '@/lib/goals/taskPlan';

// The default of 1 second is too tight when the whole suite runs in parallel.
const actions = vi.hoisted(() => ({ generate: vi.fn(), create: vi.fn() }));
vi.mock('@/app/actions/goals', () => ({
  generateWeekOnePlanAction: actions.generate,
  createGoalWithPlanAction: actions.create,
}));

const CLAUDE_PLAN = {
  tasks: [
    { title: 'Pick the certification and book the exam date', taskType: 'certify', minutes: 30, weekOf: 1 },
    { title: 'Study the first exam domain', taskType: 'certify', minutes: 45, weekOf: 1 },
    { title: 'Friday review: tick tasks and fill in notes', taskType: 'review', minutes: 30, weekOf: 1 },
  ],
};
const GENERATED = { ok: true, data: { plan: CLAUDE_PLAN, model: 'claude-opus-5-5' } };

// What the wizard sends when only the goal type is chosen (the title defaults to the type's label).
const INPUT = { title: 'Get certified', goalType: 'get_certified', constraints: [], pace: null, reviewPrompts: [] };

// The starter plan for INPUT, built the way the wizard builds it.
const STARTER_PLAN = (() => {
  const parsed = parseWizardInput(INPUT);
  if (!parsed.ok) throw new Error(parsed.error);
  return buildStubTaskPlan(parsed.data);
})();

beforeEach(() => {
  actions.generate.mockReset();
  actions.create.mockReset();
  // jsdom has no <dialog>.showModal; this stand-in only opens and closes it.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

const wizard = () => within(screen.getByRole('dialog', { name: 'New goal wizard' }));
// Waits for the button to exist and be enabled before clicking: right after a request the wizard is briefly busy and
// its buttons are disabled, and a click on a disabled button does nothing.
async function click(name: string | RegExp) {
  const button = await wizard().findByRole('button', { name });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

function openWizard(props: { onClose?: () => void; onCreated?: () => void } = {}) {
  return render(<GoalBuilderWizard open onClose={props.onClose ?? (() => {})} onCreated={props.onCreated} />);
}

// Goal type chosen, then Next through Constraints and Pace to Review.
async function goToReview() {
  await click('Get certified');
  await click('Next');
  await click('Next');
  await click('Next');
}

describe('the steps', () => {
  it('starts on step 1 with Next off until a goal type is chosen', async () => {
    openWizard();
    expect(wizard().getByRole('heading', { name: 'New goal' })).toBeTruthy();
    expect(wizard().getByText('What kind of goal is this?')).toBeTruthy();
    expect((wizard().getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(wizard().getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('choosing a goal type fills the title and turns Next on', async () => {
    openWizard();
    await click('Get certified');
    expect((wizard().getByLabelText('Title') as HTMLInputElement).value).toBe('Get certified');
    expect(wizard().getByRole('button', { name: 'Get certified' }).getAttribute('aria-pressed')).toBe('true');
    expect((wizard().getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('steps through constraints and pace to review, marking the current step', async () => {
    openWizard();
    const current = () => wizard().getByRole('list', { name: 'Wizard steps' }).querySelector('[aria-current="step"]')?.textContent;
    await click('Get certified');
    expect(current()).toBe('1. Goal type');
    await click('Next');
    expect(current()).toBe('2. Constraints');
    expect(wizard().getByText('Anything the plan should respect?')).toBeTruthy();
    await click('Next');
    expect(current()).toBe('3. Pace');
    expect(wizard().getByText('How should the first week feel?')).toBeTruthy();
    await click('Next');
    expect(current()).toBe('4. Review');
    expect(wizard().getByRole('region', { name: 'Summary' })).toBeTruthy();
    expect(wizard().getByRole('region', { name: 'Week 1 plan' })).toBeTruthy();
  });

  it('Back returns to the earlier step and keeps the answers', async () => {
    openWizard();
    await click('Get certified');
    await click('Next');
    await click('Hours are flexible');
    await click('Back');
    expect((wizard().getByLabelText('Title') as HTMLInputElement).value).toBe('Get certified');
    await click('Next');
    expect(wizard().getByRole('button', { name: 'Hours are flexible' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('on review, Create is off until there is a plan, and nothing has been asked or saved', async () => {
    openWizard();
    await goToReview();
    expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(wizard().getByRole('button', { name: 'Generate week 1 plan with Claude' })).toBeTruthy();
    expect(wizard().getByText(/Claude sees only what you entered in this wizard/)).toBeTruthy();
    expect(actions.generate).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('Cancel on the first step closes it', async () => {
    const onClose = vi.fn();
    openWizard({ onClose });
    await click('Cancel');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Generate', () => {
  it('shows the plan labelled as written by Claude, and sends only the wizard\'s answers', async () => {
    actions.generate.mockResolvedValue(GENERATED);
    openWizard();
    await goToReview();

    await click('Generate week 1 plan with Claude');

    expect(await wizard().findByText('Written by Claude (claude-opus-5-5)')).toBeTruthy();
    expect(actions.generate).toHaveBeenCalledTimes(1);
    expect(actions.generate).toHaveBeenCalledWith(INPUT);
    for (const t of CLAUDE_PLAN.tasks) expect(wizard().getByText(t.title)).toBeTruthy();
    expect(await wizard().findByRole('button', { name: 'Ask Claude again' })).toBeTruthy();
    await waitFor(() => expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(false));
    // Showing a plan saves nothing.
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('shows "Asking Claude…" while it waits', async () => {
    let resolve!: (v: unknown) => void;
    actions.generate.mockReturnValue(new Promise((r) => (resolve = r)));
    openWizard();
    await goToReview();

    await click('Generate week 1 plan with Claude');

    expect(await wizard().findByRole('status')).toBeTruthy();
    expect(wizard().getByText('Asking Claude to write your week 1 plan…')).toBeTruthy();
    expect((wizard().getByRole('button', { name: 'Asking Claude…' }) as HTMLButtonElement).disabled).toBe(true);

    resolve(GENERATED);
    expect(await wizard().findByText('Written by Claude (claude-opus-5-5)')).toBeTruthy();
  });

  it('a failure shows its message and Try again, and puts no plan in its place', async () => {
    actions.generate.mockResolvedValue({ ok: false, error: 'Claude could not be reached.' });
    openWizard();
    await goToReview();

    await click('Generate week 1 plan with Claude');

    const alert = await wizard().findByRole('alert');
    expect(alert.textContent).toBe('Claude could not be reached. Nothing was saved or substituted.');
    expect(await wizard().findByRole('button', { name: 'Try again' })).toBeTruthy();
    // No automatic fallback: no plan on screen, Create still off, and the starter plan is only offered.
    expect(wizard().queryByText(/Written by Claude/)).toBeNull();
    expect(wizard().queryByText(/Starter plan/)).toBeNull();
    expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(true);
    expect(wizard().getByRole('button', { name: 'Use the starter plan instead' })).toBeTruthy();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('Try again asks again, and a success replaces the failure', async () => {
    actions.generate.mockResolvedValueOnce({ ok: false, error: 'Claude is busy right now.' }).mockResolvedValueOnce(GENERATED);
    openWizard();
    await goToReview();

    await click('Generate week 1 plan with Claude');
    await wizard().findByRole('alert');
    await click('Try again');

    expect(await wizard().findByText('Written by Claude (claude-opus-5-5)')).toBeTruthy();
    expect(actions.generate).toHaveBeenCalledTimes(2);
    expect(wizard().queryByRole('alert')).toBeNull();
  });

  it('shows the 20 second wait message when the action returns it', async () => {
    actions.generate.mockResolvedValue({ ok: false, error: 'Please wait a few seconds before asking again.' });
    openWizard();
    await goToReview();

    await click('Generate week 1 plan with Claude');

    expect((await wizard().findByRole('alert')).textContent).toBe(
      'Please wait a few seconds before asking again. Nothing was saved or substituted.',
    );
    expect(await wizard().findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('changing an answer after a plan makes the plan stale: it is not kept or saved against the new answers', async () => {
    actions.generate.mockResolvedValue(GENERATED);
    openWizard();
    await goToReview();
    await click('Generate week 1 plan with Claude');
    await wizard().findByText('Written by Claude (claude-opus-5-5)');

    await click('Back');
    await click('Heavier week');
    await click('Next');

    expect(wizard().queryByText(/Written by Claude/)).toBeNull();
    expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the starter plan', () => {
  it('is only used when asked for, labelled as the starter plan, and asks no model', async () => {
    openWizard();
    await goToReview();

    await click('Use the starter plan instead');

    expect(wizard().getByText('Starter plan (rule-based, not written by Claude)')).toBeTruthy();
    expect(wizard().queryByText(/Written by Claude/)).toBeNull();
    for (const t of STARTER_PLAN.tasks) expect(wizard().getByText(t.title)).toBeTruthy();
    expect(wizard().queryByRole('button', { name: 'Use the starter plan instead' })).toBeNull();
    expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(false);
    expect(actions.generate).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('after a failure it is the user\'s choice, and Create sends exactly that plan', async () => {
    actions.generate.mockResolvedValue({ ok: false, error: 'Claude could not be reached.' });
    actions.create.mockResolvedValue({ ok: true, data: { goal: { title: 'Get certified', target_date: '2027-01-21' }, tasksSaved: 5 } });
    const onCreated = vi.fn();
    openWizard({ onCreated });
    await goToReview();
    await click('Generate week 1 plan with Claude');
    await wizard().findByRole('alert');

    await click('Use the starter plan instead');
    expect(actions.create).not.toHaveBeenCalled();
    await click('Create goal');

    await waitFor(() => expect(actions.create).toHaveBeenCalledTimes(1));
    const [input, plan] = actions.create.mock.calls[0];
    expect(input).toEqual(INPUT);
    expect(plan).toEqual(STARTER_PLAN);
    expect(await wizard().findByRole('heading', { name: 'Goal created' })).toBeTruthy();
    expect(wizard().getByText(/5 week 1 tasks are saved, all unticked/)).toBeTruthy();
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

describe('Create', () => {
  it('sends Claude\'s plan when Claude wrote it', async () => {
    actions.generate.mockResolvedValue(GENERATED);
    actions.create.mockResolvedValue({ ok: true, data: { goal: { title: 'Get certified', target_date: null }, tasksSaved: 3 } });
    openWizard();
    await goToReview();
    await click('Generate week 1 plan with Claude');
    await wizard().findByText('Written by Claude (claude-opus-5-5)');

    await click('Create goal');

    await waitFor(() => expect(actions.create).toHaveBeenCalledTimes(1));
    expect(actions.create).toHaveBeenCalledWith(INPUT, CLAUDE_PLAN);
    expect(await wizard().findByRole('heading', { name: 'Goal created' })).toBeTruthy();
    expect(wizard().getByText(/3 week 1 tasks are saved, all unticked/)).toBeTruthy();
  });

  it('shows the service\'s refusal and keeps the plan, so the user can try again', async () => {
    actions.generate.mockResolvedValue(GENERATED);
    actions.create.mockResolvedValue({ ok: false, error: 'Sign in to create a goal.' });
    openWizard();
    await goToReview();
    await click('Generate week 1 plan with Claude');
    await wizard().findByText('Written by Claude (claude-opus-5-5)');

    await click('Create goal');

    expect((await wizard().findByRole('alert')).textContent).toBe('Sign in to create a goal.');
    expect(wizard().getByText('Written by Claude (claude-opus-5-5)')).toBeTruthy();
    await waitFor(() => expect((wizard().getByRole('button', { name: 'Create goal' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('Done on the success screen closes the wizard', async () => {
    actions.create.mockResolvedValue({ ok: true, data: { goal: { title: 'Get certified', target_date: null }, tasksSaved: 1 } });
    const onClose = vi.fn();
    openWizard({ onClose });
    await goToReview();
    await click('Use the starter plan instead');
    await click('Create goal');
    await wizard().findByRole('heading', { name: 'Goal created' });
    await click('Done');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
