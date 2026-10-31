// @vitest-environment jsdom
//
// MOM-111, the quick-path card (shown when setup stops using Claude). The owner's review: it said what was missing but not how to
// finish and save, promised "sensible defaults" no code applies, cleared everything on one tap of "Start again", and its lists
// rendered garbled on a phone (leading spaces and white-space: pre-wrap, no bullets). Now:
// 1. It says what happened, what it has, and what to do next BEFORE any button, by reason and by whether anything is missing.
// 2. It promises no default anywhere in the code (DOMAIN_MODEL §2.3 says what the code does: save what was said if complete).
// 3. "Start again" asks first.
// 4. What it shows is real nested lists with a hanging indent, no pre-wrap: the same list the playback card uses.
// 5. The sentence "your answers stay in this tab and setup picks up where it stopped" is PROVEN: a conversation stopped by a limit
//    is still in the tab after a reload, and when Claude can answer again, one tap carries on from the same transcript and draft.
// The two server actions are stubs: no Claude call, no network.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackCard } from '@/components/setup/PlaybackCard';
import { groupLines } from '@/components/setup/PlaybackLines';
import { QuickPathCard } from '@/components/setup/QuickPathCard';
import { SetupConversation } from '@/components/setup/SetupConversation';
import { SETUP_QUICK_PATH_MESSAGES } from '@/lib/services/llm';
import { runSetupEval } from '@/lib/setup/evals';
import { QUICK_PATH_WORDS, quickPathCanWait, quickPathNext } from '@/lib/setup/quickPath';
import { setupStorageKey } from '@/lib/setup/session';
import type { AssistantTurn, SetupSession } from '@/types/setup';
import type { QuickPathReason, SetupTurnView } from '@/types/setupScreen';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

const USER = '11111111-1111-4111-8111-111111111111';
const KEY = setupStorageKey(USER);
const actions = vi.hoisted(() => ({ ask: vi.fn(), save: vi.fn() }));
vi.mock('@/app/actions/setup', () => ({ askSetupTurn: actions.ask, saveSetup: actions.save }));

const REASONS: QuickPathReason[] = ['over_turns', 'over_tokens', 'shared_cap', 'person_cap', 'unchecked'];
const SECTIONS = [
  { chunk: 'goals' as const, title: 'Your goals', lines: ['Your goal: Get stronger.'] },
  {
    chunk: 'targets' as const,
    title: "What you'll count",
    lines: ['Get stronger: how long it runs is not set yet.', '  Workouts: counted each week.', '  Runs: counted each week, at least 2.'],
  },
];
const MISSING = ['Your time zone.', 'When your day ends.'];

const card = (reason: QuickPathReason, missing: string[], extra: Partial<Parameters<typeof QuickPathCard>[0]> = {}) =>
  render(
    <QuickPathCard
      reason={reason}
      message={SETUP_QUICK_PATH_MESSAGES[reason]}
      sections={SECTIONS}
      missing={missing}
      canSave={missing.length === 0}
      saving={false}
      error={null}
      onSave={() => {}}
      onStartOver={() => {}}
      {...extra}
    />,
  );

beforeEach(() => {
  actions.ask.mockReset();
  actions.save.mockReset();
  window.sessionStorage.clear();
});
afterEach(cleanup);

describe('what the card says, before any button', () => {
  it.each(REASONS)('%s, complete: says what happened, that it is ready, and to look it over and tap Save', (reason) => {
    const { container } = card(reason, []);
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.readyTitle })).toBeTruthy();
    expect(screen.getByText(SETUP_QUICK_PATH_MESSAGES[reason])).toBeTruthy();
    expect(screen.getByText(QUICK_PATH_WORDS.intro)).toBeTruthy();
    expect(screen.getByText(QUICK_PATH_WORDS.readyNext)).toBeTruthy();
    expect(screen.queryByText(QUICK_PATH_WORDS.saveOff)).toBeNull();
    expect((screen.getByRole('button', { name: 'Save what I have' }) as HTMLButtonElement).disabled).toBe(false);
    // The words come before the first button, in the page's order.
    const text = container.textContent ?? '';
    expect(text.indexOf(QUICK_PATH_WORDS.readyNext)).toBeLessThan(text.indexOf('Save what I have'));
  });

  it.each(REASONS)('%s, missing: says why Save is off and the way forward for that reason, before the buttons', (reason) => {
    const { container } = card(reason, MISSING);
    expect(screen.getByRole('heading', { name: QUICK_PATH_WORDS.missingTitle })).toBeTruthy();
    const next = quickPathNext(reason, false);
    expect(next).toBe(quickPathCanWait(reason) ? QUICK_PATH_WORDS.missingWait : QUICK_PATH_WORDS.missingNoWait);
    expect(screen.getByText(next)).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save what I have' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const note = screen.getByText(QUICK_PATH_WORDS.saveOff);
    expect(save.getAttribute('aria-describedby')).toBe(note.id);
    const text = container.textContent ?? '';
    expect(text.indexOf(next)).toBeLessThan(text.indexOf('Save what I have'));
    expect(text.indexOf(QUICK_PATH_WORDS.saveOff)).toBeLessThan(text.indexOf('Save what I have'));
  });

  it('only a limit that lifts on its own is told to wait; a spent budget is told to start again', () => {
    for (const r of ['shared_cap', 'person_cap', 'unchecked'] as const) expect(quickPathCanWait(r), r).toBe(true);
    for (const r of ['over_turns', 'over_tokens'] as const) expect(quickPathCanWait(r), r).toBe(false);
    expect(QUICK_PATH_WORDS.missingWait).toContain('your answers stay in this tab and setup picks up where it stopped');
    expect(QUICK_PATH_WORDS.missingNoWait).not.toMatch(/reload|wait/i);
  });

  it('promises no default, and says so nowhere on the card', () => {
    for (const reason of REASONS) {
      const { container, unmount } = card(reason, MISSING);
      expect(container.textContent ?? '').not.toMatch(/default|sensible/i);
      unmount();
    }
  });

  it('keeps the one bold line: only the title is heavy', () => {
    const { container } = card('over_turns', MISSING);
    const heavy = [...container.querySelectorAll('*')].filter((el) => /\b(font-(medium|semibold|bold)|section-title)\b/.test(el.getAttribute('class') ?? ''));
    expect(heavy.map((el) => el.textContent)).toEqual([QUICK_PATH_WORDS.missingTitle]);
  });
});

describe('Start again asks first', () => {
  it('shows the question and two ways out; only "Yes, start again" clears', () => {
    const onStartOver = vi.fn();
    card('shared_cap', MISSING, { onStartOver });
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(onStartOver).not.toHaveBeenCalled();
    expect(screen.getByText(QUICK_PATH_WORDS.confirmStartOver)).toBeTruthy();
    // No Save beside the question: one decision at a time.
    expect(screen.queryByRole('button', { name: 'Save what I have' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.confirmNo }));
    expect(screen.getByRole('button', { name: 'Save what I have' })).toBeTruthy();
    expect(onStartOver).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    fireEvent.click(screen.getByRole('button', { name: QUICK_PATH_WORDS.confirmYes }));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });
});

describe('lists: real bullets, nested, hanging indent, no pre-wrap', () => {
  it('groups an indented line under the line above it', () => {
    expect(groupLines(SECTIONS[1].lines)).toEqual([
      { text: 'Get stronger: how long it runs is not set yet.', children: ['Workouts: counted each week.', 'Runs: counted each week, at least 2.'] },
    ]);
    // An indented line with nothing above it stands alone; blank edges are trimmed.
    expect(groupLines(['  Alone.', 'Next. '])).toEqual([{ text: 'Alone.', children: [] }, { text: 'Next.', children: [] }]);
    expect(groupLines([])).toEqual([]);
  });

  it('the quick-path card renders each section and the missing items as real lists, with a nested list under a goal', () => {
    const { container } = card('over_turns', MISSING);
    const lists = [...container.querySelectorAll('ul')];
    expect(lists.length).toBeGreaterThanOrEqual(4);
    for (const ul of lists) expect(ul.className, 'a bulleted list, outside, with room for the bullet').toMatch(/(^|\s)list-(disc|\[circle\])(\s|$)/);
    const nested = container.querySelector('li > ul');
    expect(nested).not.toBeNull();
    expect([...nested!.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Workouts: counted each week.', 'Runs: counted each week, at least 2.']);
    expect(nested!.className).toContain('list-[circle]');
    // No line keeps its leading spaces, and nothing relies on pre-wrap for its shape.
    for (const li of container.querySelectorAll('li')) expect(li.firstChild?.textContent ?? '').not.toMatch(/^\s/);
    expect(container.innerHTML).not.toContain('whitespace-pre');
    // Long words may break instead of pushing the screen sideways.
    for (const ul of container.querySelectorAll('section > div > ul')) expect(ul.className).toContain('[overflow-wrap:anywhere]');
  });

  it('the playback card uses the same list', () => {
    const { container } = render(<PlaybackCard chunk="targets" lines={SECTIONS[1].lines} busy={false} onApprove={() => {}} onChange={() => {}} />);
    expect(container.querySelector('ul.list-disc')).not.toBeNull();
    expect(container.querySelector('li > ul.list-\\[circle\\]')).not.toBeNull();
    expect(container.innerHTML).not.toContain('whitespace-pre');
    expect(screen.getByText('Workouts: counted each week.')).toBeTruthy();
  });
});

describe('no source file promises a default', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
  it('"sensible default" appears in no file of lib/, components/ or app/', () => {
    const files = ['lib', 'components', 'app'].flatMap((d) => walk(join(process.cwd(), d)));
    const found = files.filter((f) => /sensible default/i.test(readFileSync(f, 'utf8'))).map((f) => f.replace(process.cwd(), ''));
    expect(found).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });
});

describe('"your answers stay in this tab and setup picks up where it stopped": proven', () => {
  let script: AssistantTurn[];
  beforeAll(async () => {
    const c = SETUP_CASES.find((x) => x.expect === 'clean');
    if (!c) throw new Error('no clean case');
    await runSetupEval(c, scriptedModel(c.script));
    script = c.script;
  });

  const turnView = (turn: AssistantTurn): { ok: true; data: SetupTurnView } => ({ ok: true, data: { kind: 'turn', turn, spentTokens: 1000, rejected: 0 } });
  const limitView = (reason: QuickPathReason): { ok: true; data: SetupTurnView } => ({
    ok: true,
    data: { kind: 'quick_path', reason, message: SETUP_QUICK_PATH_MESSAGES[reason], sections: SECTIONS, missing: MISSING, canSave: false },
  });

  it('a limit stops setup; after a reload the same conversation is still there, and one tap carries on from it when Claude can answer', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValueOnce(limitView('shared_cap'));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The limit: the card says to wait and reload, and the conversation is in this tab's storage as it was.
    await screen.findByRole('heading', { name: QUICK_PATH_WORDS.missingTitle });
    expect(screen.getByText(QUICK_PATH_WORDS.missingWait)).toBeTruthy();
    const stored: SetupSession = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null');
    expect(stored.transcript).toHaveLength(2);
    expect(stored.transcript[1]).toEqual({ role: 'person', text: 'Run more' });
    expect(stored.draft).toEqual(script[0].draft);

    // The reload: nothing of the page survives but this tab's storage.
    cleanup();
    actions.ask.mockReset();
    actions.ask.mockResolvedValue(turnView(script[1]));
    render(<SetupConversation userId={USER} />);

    // It opens on the question, with the answer waiting, and asks nothing until the person taps.
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    expect(screen.getByText('Run more')).toBeTruthy();
    expect(actions.ask).not.toHaveBeenCalled();

    // Claude can answer again: one tap sends the very same conversation and setup moves on to its next question.
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await screen.findByRole('heading', { name: script[1].question ?? '' });
    expect(actions.ask).toHaveBeenCalledTimes(1);
    const sentSession = actions.ask.mock.calls[0][0] as SetupSession;
    expect(sentSession.transcript).toEqual(stored.transcript);
    expect(sentSession.draft).toEqual(stored.draft);
    expect(sentSession.spentTokens).toBe(stored.spentTokens);
    await waitFor(() => expect((JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as SetupSession).transcript).toHaveLength(3));
  });

  it('a spent budget is different: reloading brings back the same card, so that card says start again, not wait', async () => {
    actions.ask.mockResolvedValueOnce(turnView(script[0])).mockResolvedValue(limitView('over_turns'));
    render(<SetupConversation userId={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Run more' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('heading', { name: QUICK_PATH_WORDS.missingTitle });
    expect(screen.getByText(QUICK_PATH_WORDS.missingNoWait)).toBeTruthy();
    cleanup();
    render(<SetupConversation userId={USER} />);
    await screen.findByRole('heading', { name: script[0].question ?? '' });
    fireEvent.click(screen.getByRole('button', { name: 'Send it again' }));
    await screen.findByRole('heading', { name: QUICK_PATH_WORDS.missingTitle });
    expect(screen.getByText(QUICK_PATH_WORDS.missingNoWait)).toBeTruthy();
  });
});
