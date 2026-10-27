// @vitest-environment jsdom
//
// The privacy notice (MOM-102): it prints everything in lib/config/privacy.ts, says what it was approved to say, quotes
// Anthropic's terms with links, and says nothing about any tester, age group or household. That the config matches the
// code is tested elsewhere: tests/privacy-sync.test.ts (tables, providers, services, browser storage) and, next to the
// prompts, tests/rebalance-model.test.ts and tests/task-plan-ai.test.ts.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PrivacyPage from '@/app/privacy/page';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import {
  ANTHROPIC_TERMS,
  DELETION_WITHIN_DAYS,
  DEVICE_STORAGE,
  GOOGLE_TESTING_LINE,
  GUIDED_SETUP_LINE,
  NEVER_SENT,
  NOTICE_CHANGE_LINE,
  PROMPTS,
  PROVIDER_NOTICES,
  SERVICES,
  STORED_GROUPS,
  TERMS_CHECKED_ON,
  joinWords,
} from '@/lib/config/privacy';

afterEach(cleanup);

const region = (name: string) => screen.getByRole('region', { name }).textContent ?? '';

describe('the privacy notice', () => {
  it('renders as a page with a heading, with no session or service needed', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeTruthy();
  });

  it('states that the service is for adults (18 or over)', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText(/for adults only \(18 or over\)/)).toBeTruthy();
  });

  it('prints a line for every group of stored data, in plain words', () => {
    render(<PrivacyNotice />);
    const stored = region('What Momentum stores');
    for (const group of STORED_GROUPS) expect(stored, group.id).toContain(group.words);
    expect(stored).toContain('your time zone, when your day ends, the time you have available');
    expect(stored).toContain('anything you hide or fix');
    expect(stored).toContain("so changing a target later doesn't re-grade the past");
    expect(stored).toContain("Your current plan's tasks");
    // Internal terms and things that are not stored do not appear.
    expect(stored).not.toMatch(/Entries and corrections|Closed-period|the days you work|review notes|plan tasks/i);
  });

  it('says how long usage counts are kept: until the account is deleted', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText(/kept until your account is deleted/)).toBeTruthy();
  });

  it('lists what is kept from each provider and what is not, and the Google weekly expiry', () => {
    render(<PrivacyNotice />);
    const connected = region('What comes from services you connect');
    for (const provider of Object.values(PROVIDER_NOTICES)) {
      expect(connected).toContain(provider.name);
      expect(connected).toContain(joinWords(provider.stores));
      expect(connected).toContain(`Not stored: ${provider.leavesOut}`);
    }
    expect(connected).toContain(GOOGLE_TESTING_LINE);
    expect(connected).toContain('in place of its real title');
  });

  it('says what each Claude feature is sent, that guided setup is still to come, and what is never sent', () => {
    render(<PrivacyNotice />);
    const claude = region('What is sent to Claude (Anthropic)');
    for (const prompt of Object.values(PROMPTS)) {
      expect(claude).toContain(prompt.title);
      expect(claude).toContain(joinWords(prompt.sends));
      if (prompt.leavesOut) expect(claude).toContain(`Not ${prompt.leavesOut}`);
      if (prompt.note) expect(claude).toContain(prompt.note);
    }
    expect(claude).toContain('Not task titles, minutes or scores');
    expect(claude).toContain(GUIDED_SETUP_LINE);
    expect(claude).toMatch(/When guided setup arrives, it is a conversation with Claude, and what you type is sent to Anthropic\./);
    expect(claude).not.toMatch(/Guided setup is a conversation/);
    expect(claude).toContain(`Never sent: ${NEVER_SENT}`);
  });

  it("quotes Anthropic's terms with links and the date they were checked", () => {
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
    const who = region('Who can see your data');
    expect(who).toMatch(/Each account sees only its own data/);
    expect(who).toMatch(/only to give support, and only when you ask/);
  });

  it('names every service that handles data, including the bot check and what it sees', () => {
    render(<PrivacyNotice />);
    const who = region('Who can see your data');
    for (const service of Object.values(SERVICES)) {
      expect(who).toContain(service.name);
      expect(who).toContain(service.does);
    }
    expect(who).toContain('Cloudflare Turnstile');
    expect(who).toMatch(/sign-up, sign-in and password-reset requests for bots/);
    expect(who).toMatch(/details of your browser and network connection/);
  });

  it('says what is kept on the device: the sign-in cookie, and a running timer when timers arrive', () => {
    render(<PrivacyNotice />);
    const device = region('On your device');
    for (const line of DEVICE_STORAGE.now) expect(device).toContain(line);
    expect(device).toContain('a cookie that keeps you signed in');
    expect(device).toContain("When timers arrive, a running timer's start time is kept in your browser.");
  });

  it('says how to get all data deleted, within a stated number of days', () => {
    render(<PrivacyNotice />);
    const del = region('Getting your data deleted');
    expect(Number.isInteger(DELETION_WITHIN_DAYS) && DELETION_WITHIN_DAYS > 0).toBe(true);
    expect(del).toContain(`within ${DELETION_WITHIN_DAYS} days`);
    expect(del).toMatch(/delete all of your data/);
  });

  it('promises that trial members are told before the notice changes', () => {
    render(<PrivacyNotice />);
    expect(screen.getByText('If this notice changes, trial members are told before the change applies.')).toBeTruthy();
    expect(NOTICE_CHANGE_LINE).toContain('before the change applies');
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
