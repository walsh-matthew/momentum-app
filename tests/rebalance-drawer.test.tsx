// The rebalance drawer renders each kind of proposal (components/rebalance/RebalanceDrawer.tsx, MOM-47).
//
// These render the real component to HTML on the server (react-dom/server). That proves it renders
// without crashing and shows the right words for each state, but it cannot click: the "Ask Claude"
// interaction (button -> server action -> new proposal on screen) needs a DOM and Testing Library,
// which is MOM-61. The action behind the button is covered in tests/rebalance-model.test.ts.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RebalanceDrawer } from '@/components/rebalance/RebalanceDrawer';
import type { RebalanceProposalView } from '@/types/rebalance';

const actions = vi.hoisted(() => ({ apply: vi.fn(), ask: vi.fn() }));
vi.mock('@/app/actions/tasks', () => ({
  applyRebalanceProposal: actions.apply,
  askClaudeToRebalance: actions.ask,
}));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function view(over: Partial<RebalanceProposalView> = {}): RebalanceProposalView {
  return {
    source: 'rules',
    model: null,
    notice: null,
    currentWeek: 4,
    proposal: {
      summary: '2 unfinished tasks can be carried over. Nothing is cut.',
      moves: [
        { action: 'carry_over', taskId: A, fromWeek: 2, toWeek: 4, reason: 'Unfinished in week 2; week 4 has room.' },
        { action: 'carry_over', taskId: B, fromWeek: 3, toWeek: 5, reason: 'Week 4 is full.' },
      ],
      warnings: [],
    },
    tasks: {
      [A]: { id: A, title: 'Study cloud security', taskType: 'certify', minutes: 45 },
      [B]: { id: B, title: 'Build the demo', taskType: 'build', minutes: 60 },
    },
    ...over,
  };
}

const render = (v: RebalanceProposalView | null, open = true, moveChains = {}) =>
  renderToStaticMarkup(<RebalanceDrawer open={open} onClose={() => {}} view={v} moveChains={moveChains} />);

describe('a rule-based proposal', () => {
  const html = render(view());

  it('says it is rule-based, with the plan week', () => {
    expect(html).toContain('Rule-based suggestion');
    expect(html).toContain('week 4 of the plan');
    expect(html).not.toContain('Suggested by Claude');
  });
  it('shows the summary and each move with the user’s own task titles', () => {
    expect(html).toContain('2 unfinished tasks can be carried over.');
    expect(html).toContain('Study cloud security');
    expect(html).toContain('Build the demo');
    expect(html).toContain('Week 2');
    expect(html).toContain('Carry over');
  });
  it('offers to ask Claude, and says what Claude would be sent', () => {
    expect(html).toContain('Ask Claude to review');
    expect(html).toContain('never your task titles');
    expect(html).toContain('You approve every change');
  });
  it('has no notice and no leftover to-do text', () => {
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('TODO');
  });
  it('has no way to delete anything', () => {
    expect(html.toLowerCase()).not.toMatch(/delete|remove task|cut task|drop task/);
  });
});

describe('a proposal written by Claude', () => {
  const html = render(view({ source: 'model', model: 'claude-opus-5-5' }));

  it('credits the model by name, and says it was checked', () => {
    expect(html).toContain('Suggested by Claude (claude-opus-5-5)');
    expect(html).toContain('checked against your plan');
    expect(html).not.toContain('Rule-based suggestion');
  });
  it('offers to ask again instead of ask', () => {
    expect(html).toContain('Ask Claude again');
    expect(html).not.toContain('Ask Claude to review');
  });
  it('still shows the user’s own titles', () => {
    expect(html).toContain('Study cloud security');
  });
});

describe('when Claude’s answer was not used', () => {
  it('explains why in plain words, above the rule-based suggestion', () => {
    const notice = "Claude's suggestion did not pass our safety checks, so this is the rule-based suggestion.";
    const html = render(view({ notice }));
    expect(html).toContain('role="status"');
    expect(html).toContain('did not pass our safety checks');
    expect(html).toContain('Rule-based suggestion');
  });
});

describe('the other states', () => {
  it('an on-track plan shows no moves, but still the ask button', () => {
    const html = render(
      view({ proposal: { summary: 'Your plan is on track. No unfinished work needs to move.', moves: [], warnings: [] } }),
    );
    expect(html).toContain('Your plan is on track.');
    expect(html).not.toContain('Proposed shifts');
    expect(html).toContain('Ask Claude to review');
  });

  it('a warning that the timeline cannot hold is shown with the tasks named', () => {
    const html = render(
      view({
        proposal: {
          summary: '1 task does not fit.',
          moves: [],
          warnings: [{ kind: 'cannot_hold', weeks: [13], taskIds: [A], message: 'This does not fit before week 13. You decide.' }],
        },
      }),
    );
    expect(html).toContain('This does not fit before week 13. You decide.');
    expect(html).toContain('Study cloud security');
  });

  it('a task that already moved shows its earlier path', () => {
    const html = render(view(), true, { [A]: [{ sourceWeek: 1, targetWeek: 2, shiftType: 'carry_over' }] });
    expect(html).toContain('Already moved: Week 1 → 2');
  });

  it('with no plan it says so, and offers no model button', () => {
    const html = render(null);
    expect(html).toContain('There is no plan to rebalance yet.');
    expect(html).not.toContain('Ask Claude');
  });

  it('closed, it renders no body', () => {
    const html = render(view(), false);
    expect(html).not.toContain('Rebalance your plan');
  });

  it('rendering never calls the model or applies anything', () => {
    render(view());
    render(view({ source: 'model', model: 'claude-opus-5-5' }));
    expect(actions.ask).not.toHaveBeenCalled();
    expect(actions.apply).not.toHaveBeenCalled();
  });
});
