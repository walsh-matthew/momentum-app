// @vitest-environment jsdom
//
// The privacy notice (MOM-102): it states what it was approved to state, quotes Anthropic's terms with links, and
// says nothing about any tester, age or household. The prompt field lists it describes are pinned in
// tests/rebalance-model.test.ts and tests/task-plan-ai.test.ts; the Google field list in tests/adapters.test.ts.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PrivacyPage from '@/app/privacy/page';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { ANTHROPIC_TERMS, DELETION_WITHIN_DAYS, TERMS_CHECKED_ON } from '@/lib/config/privacy';

afterEach(cleanup);

describe('the privacy notice', () => {
  it('renders as a page with a heading, with no session or service needed', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeTruthy();
  });

  it('states that the service is for adults (18 or over)', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText(/for adults only \(18 or over\)/)).toBeTruthy();
  });

  it('says what each group of stored data is', () => {
    render(<PrivacyNotice />);
    const stored = screen.getByRole('region', { name: 'What Momentum stores' });
    for (const text of [
      /email address/,
      /Facts and settings/,
      /goals and the targets/,
      /work items/,
      /Entries and corrections/,
      /Closed-period snapshots/,
      /How many times you have asked Claude/,
    ]) {
      expect(stored.textContent).toMatch(text);
    }
  });

  it('says how long usage counts are kept: until the account is deleted', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText(/kept until your account is deleted/)).toBeTruthy();
  });

  it('lists what comes from Hevy and Google, and that the Google event title is not kept', () => {
    render(<PrivacyNotice />);
    const connected = screen.getByRole('region', { name: 'What comes from services you connect' }).textContent ?? '';
    expect(connected).toMatch(/Hevy/);
    expect(connected).toMatch(/Not exercise names/);
    expect(connected).toMatch(/only the time block/);
    expect(connected).toMatch(/Not the title/);
    expect(connected).toMatch(/testing mode, it expires about every week/);
  });

  it('says what is sent to Claude, that setup text goes to Anthropic, and that secrets never do', () => {
    render(<PrivacyNotice />);
    const claude = screen.getByRole('region', { name: 'What is sent to Claude (Anthropic)' }).textContent ?? '';
    expect(claude).toMatch(/Not task titles, minutes or scores/);
    expect(claude).toMatch(/What you type during setup is sent to Anthropic/);
    expect(claude).toMatch(/Never sent: your email, your passwords or tokens/);
  });

  it('quotes Anthropic\'s terms with links and the date they were checked', () => {
    render(<PrivacyNotice />);
    const claude = screen.getByRole('region', { name: 'What is sent to Claude (Anthropic)' });
    expect(claude.textContent).toContain(ANTHROPIC_TERMS.noTraining.quote);
    expect(claude.textContent).toContain(ANTHROPIC_TERMS.retention.quote);
    expect(claude.textContent).toContain(TERMS_CHECKED_ON);
    const hrefs = [...claude.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([ANTHROPIC_TERMS.noTraining.href, ANTHROPIC_TERMS.retention.href]);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\//);
  });

  it('says each account sees only its own data and the operator sees rows only to support, when asked', () => {
    render(<PrivacyNotice />);
    const who = screen.getByRole('region', { name: 'Who can see your data' }).textContent ?? '';
    expect(who).toMatch(/Each account sees only its own data/);
    expect(who).toMatch(/only to give support, and only when you ask/);
  });

  it('says how to get all data deleted, within a stated number of days', () => {
    render(<PrivacyNotice />);
    const del = screen.getByRole('region', { name: 'Getting your data deleted' }).textContent ?? '';
    expect(Number.isInteger(DELETION_WITHIN_DAYS) && DELETION_WITHIN_DAYS > 0).toBe(true);
    expect(del).toContain(`within ${DELETION_WITHIN_DAYS} days`);
    expect(del).toMatch(/delete all of your data/);
  });

  it('links back to sign in', () => {
    render(<PrivacyNotice />);
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  });

  // The repo is public and so is this page: nothing about a person, an age group or a household.
  it('names no tester, minor or household', () => {
    const { container } = render(<PrivacyNotice />);
    expect(container.textContent).not.toMatch(/\b(minor|child|children|teen|daughter|son|family|household|kid)s?\b/i);
  });
});
