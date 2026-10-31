// @vitest-environment jsdom
//
// The back row on the signed-in pages that have no header of their own (MOM-148): a way home and Sign out, with no email
// address in it, and the privacy notice's own "Back to sign in" left out for a signed-in visitor. CSS is not loaded in
// jsdom, so the 390px width is checked in tests/e2e/header-390.spec.ts.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn(), authenticate: vi.fn() }));

afterEach(cleanup);

describe('PageBackRow', () => {
  it('has a link home and a Sign out button', () => {
    render(<PageBackRow />);
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: 'Sign out' }).getAttribute('type')).toBe('submit');
  });

  it('shows no email address, so a long one cannot widen the page', () => {
    const { container } = render(<PageBackRow />);
    expect(container.textContent).toBe('Back to homeSign out');
  });
});

describe('PrivacyNotice footer', () => {
  it('offers Back to sign in to a signed-out visitor', () => {
    render(<PrivacyNotice />);
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  });

  it('leaves it out for a signed-in visitor, who has the back row instead', () => {
    render(<PrivacyNotice signedIn />);
    expect(screen.queryByRole('link', { name: 'Back to sign in' })).toBeNull();
  });
});
