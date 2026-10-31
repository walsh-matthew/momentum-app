// @vitest-environment jsdom
//
// The way back to guided setup on home (MOM-143). Setup is first-setup-only (migration 015), so home offers it only to a person
// whose first setup is not saved, in one calm card with one link, and never to a person whose setup is saved. The old "No goals yet"
// card no longer shows on home at all (MOM-115, trial subset): one message, one link.
// What decides it is the scoreboard the page already read (no second read), and a scoreboard that could not be read offers nothing.

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SetupLinkCard } from '@/components/home/SetupLinkCard';
import { AppShell } from '@/components/layout/AppShell';
import { EMPTY_CHANNEL_VIEWS } from '@/types/channelViews';
import { setupIsOffered, setupIsSaved } from '@/lib/utils/setupOffer';
import type { HomeScoreboard } from '@/types/home';

vi.mock('@/app/actions/tasks', () => ({ toggleTaskStatus: vi.fn(), applyRebalanceProposal: vi.fn(), askClaudeToRebalance: vi.fn() }));
vi.mock('@/app/actions/goals', () => ({ createGoalWithPlanAction: vi.fn(), generateWeekOnePlanAction: vi.fn() }));
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn(), authenticate: vi.fn() }));
vi.mock('@/app/actions/integrations', () => ({ toggleConnectedApp: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

const READY: HomeScoreboard = { state: 'ready', today: '2026-10-29', hero: null, goals: [], tone: 'middle', celebration: 'medium' };
const SETUP_CARD = { name: 'Set up your goals' } as const;
const NO_GOALS_CARD = { name: 'No goals yet' } as const;

describe('who is offered setup', () => {
  it('a person with no saved goal is', () => {
    expect(setupIsOffered({ state: 'no_goals', setupSaved: false })).toBe(true);
    expect(setupIsOffered({ state: 'no_goals' })).toBe(true);
  });

  it('a person whose setup is saved is not, whether their goals are active or all parked', () => {
    expect(setupIsOffered(READY)).toBe(false);
    expect(setupIsOffered({ state: 'no_goals', setupSaved: true })).toBe(false);
    expect(setupIsOffered({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' })).toBe(false);
  });

  it('a scoreboard that could not be read, or was not read, offers nothing: it says nothing either way', () => {
    expect(setupIsOffered(null)).toBe(false);
    expect(setupIsOffered(undefined)).toBe(false);
  });
});

describe('who has a saved setup', () => {
  it('a person with an active goal, or with only parked ones, does', () => {
    expect(setupIsSaved(READY)).toBe(true);
    expect(setupIsSaved({ state: 'needs_day_anchors', anchor: 'day_end', reason: 'invalid' })).toBe(true);
    expect(setupIsSaved({ state: 'no_goals', setupSaved: true })).toBe(true);
  });

  it('a person with no goal row does not, and an unread scoreboard says nothing either way', () => {
    expect(setupIsSaved({ state: 'no_goals', setupSaved: false })).toBe(false);
    expect(setupIsSaved({ state: 'no_goals' })).toBe(false);
    expect(setupIsSaved(null)).toBe(false);
    expect(setupIsSaved(undefined)).toBe(false);
  });
});

describe('the setup card', () => {
  it('explains what setup is before the one link, and the link goes to /setup', () => {
    render(<SetupLinkCard />);
    const card = within(screen.getByRole('region', SETUP_CARD));
    expect(card.getByRole('heading', SETUP_CARD)).toBeTruthy();
    expect(card.getByText(/You haven't saved a setup yet\. It's a short chat, one question at a time, and nothing is saved until you say so\./)).toBeTruthy();
    const links = card.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('Go to setup');
    expect(links[0].getAttribute('href')).toBe('/setup');
    // The words come first, the link last.
    expect(card.getByText(/short chat/).compareDocumentPosition(links[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not pressure: no countdown, no behind, no must', () => {
    render(<SetupLinkCard />);
    expect(screen.getByRole('region', SETUP_CARD).textContent).not.toMatch(/\b(must|behind|hurry|only|last chance|don't miss|\d+ (days?|minutes?))\b/i);
  });
});

describe('home with and without a saved setup', () => {
  const renderHome = (home: HomeScoreboard | null | undefined) =>
    render(<AppShell views={EMPTY_CHANNEL_VIEWS} connectedApps={[]} moveChains={{}} home={home} />);
  const setupLinks = () => screen.queryAllByRole('link', { name: 'Go to setup' });

  it('no setup saved: the setup card shows with its one link, and the old "No goals yet" card is gone', () => {
    renderHome({ state: 'no_goals', setupSaved: false });
    expect(screen.getByRole('region', SETUP_CARD)).toBeTruthy();
    expect(setupLinks()).toHaveLength(1);
    // One message, one place: nothing else on the page says there are no goals or offers to start the first one.
    expect(screen.queryByRole('heading', NO_GOALS_CARD)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up your first goal' })).toBeNull();
  });

  // The feed under these is the old model's empty state (no active channel), which would say "No goals yet" to a person who has
  // saved their goals. It never shows to them: not the card, not its button.
  const noOldGoalsCard = () => {
    expect(screen.queryByRole('heading', NO_GOALS_CARD)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up your first goal' })).toBeNull();
    expect(screen.queryByText(/Start with a goal and the wizard will build/)).toBeNull();
  };

  it('a setup saved: no setup card, no link to setup, and no "No goals yet" card', () => {
    renderHome(READY);
    expect(screen.queryByRole('region', SETUP_CARD)).toBeNull();
    expect(setupLinks()).toHaveLength(0);
    expect(document.querySelector('a[href="/setup"]')).toBeNull();
    noOldGoalsCard();
  });

  it('a setup saved but still missing the time zone or day end: the same, no card and no "No goals yet"', () => {
    renderHome({ state: 'needs_day_anchors', anchor: 'time_zone', reason: 'not_set' });
    expect(screen.queryByRole('region', SETUP_CARD)).toBeNull();
    expect(document.querySelector('a[href="/setup"]')).toBeNull();
    noOldGoalsCard();
  });

  it('a setup saved whose goals are all parked: no setup card and no "No goals yet"', () => {
    renderHome({ state: 'no_goals', setupSaved: true });
    expect(screen.queryByRole('region', SETUP_CARD)).toBeNull();
    expect(document.querySelector('a[href="/setup"]')).toBeNull();
    noOldGoalsCard();
  });

  it('a scoreboard that could not be read: no setup card, and the page still says so in words', () => {
    renderHome(null);
    expect(screen.queryByRole('region', SETUP_CARD)).toBeNull();
    expect(document.querySelector('a[href="/setup"]')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain("Your goals didn't load just now.");
    noOldGoalsCard();
  });

  it('signed out (no scoreboard passed): no setup card, and no old "No goals yet" card either', () => {
    renderHome(undefined);
    expect(screen.queryByRole('region', SETUP_CARD)).toBeNull();
    noOldGoalsCard();
  });
});
