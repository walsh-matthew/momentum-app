// @vitest-environment jsdom
//
// The auth screens of MOM-64 in a DOM: the sign-in card with its "Forgot password?" link, the reset request and
// new-password forms, the CAPTCHA widget (shown only when a site key is set), the two pages that choose between
// them, and the signed-in indicator in the sidebar and the mobile header. The Server Actions and services behind
// them are replaced; tests/auth-service.test.ts covers the services and tests/e2e/password-reset.spec.ts the real flow.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptchaWidget } from '@/components/auth/CaptchaWidget';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { SignInForm } from '@/components/auth/SignInForm';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import type { CaptchaConfig } from '@/types/auth';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  signOutAction: vi.fn(),
  captcha: null as CaptchaConfig | null,
  user: { ok: true, data: { id: 'u1', email: 'matt@example.com' } } as
    | { ok: true; data: { id: string; email: string } | null }
    | { ok: false; error: string },
  recovering: false,
}));

vi.mock('@/app/actions/auth', () => ({
  authenticate: mocks.authenticate,
  requestPasswordResetAction: mocks.requestPasswordResetAction,
  updatePasswordAction: mocks.updatePasswordAction,
  signOutAction: mocks.signOutAction,
}));
vi.mock('@/lib/config/env', () => ({ getCaptchaConfig: () => mocks.captcha }));
vi.mock('@/lib/services/auth', () => ({
  getCurrentUser: async () => mocks.user,
  hasRecoverySession: async () => mocks.recovering,
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
// next/script loads nothing in jsdom; this stand-in reports the script as loaded, as it would in a browser.
vi.mock('next/script', async () => {
  const { useEffect } = await import('react');
  return {
    default: function Script({ onReady }: { onReady?: () => void }) {
      useEffect(() => onReady?.(), [onReady]);
      return null;
    },
  };
});

const TURNSTILE: CaptchaConfig = { provider: 'turnstile', siteKey: 'public-site-key' };

beforeEach(() => {
  mocks.captcha = null;
  mocks.user = { ok: true, data: { id: 'u1', email: 'matt@example.com' } };
  mocks.recovering = false;
  mocks.authenticate.mockResolvedValue({ error: null, notice: null });
  mocks.requestPasswordResetAction.mockResolvedValue({ error: null, notice: null });
  mocks.updatePasswordAction.mockResolvedValue({ error: null, notice: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  delete (window as unknown as Record<string, unknown>).turnstile;
});

const hiddenToken = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[name="captchaToken"]');

describe('SignInForm', () => {
  it('offers "Forgot password?", which opens the reset request on /login', () => {
    render(<SignInForm />);
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/login?reset=1');
  });

  it('links the privacy notice from sign-up and says the service is for adults (MOM-102)', () => {
    render(<SignInForm />);
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByText(/for adults \(18 or over\)/)).toBeTruthy();
  });

  it('has no CAPTCHA field when no site key is set', () => {
    const { container } = render(<SignInForm />);
    expect(hiddenToken(container)).toBeNull();
  });

  it('carries the CAPTCHA token field when a site key is set', () => {
    const { container } = render(<SignInForm captcha={TURNSTILE} />);
    expect(hiddenToken(container)).not.toBeNull();
  });

  it('shows the error it was given', () => {
    render(<SignInForm initialError="That confirmation link is invalid or has expired." />);
    expect(screen.getByRole('alert').textContent).toContain('invalid or has expired');
  });
});

describe('ForgotPasswordForm', () => {
  it('asks for an email and says the same thing after it is sent', async () => {
    mocks.requestPasswordResetAction.mockResolvedValue({
      error: null,
      notice: 'If that email has an account, we have sent a link to set a new password.',
    });
    render(<ForgotPasswordForm />);
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/If that email has an account/));
    expect(mocks.requestPasswordResetAction).toHaveBeenCalledTimes(1);
    const sent = mocks.requestPasswordResetAction.mock.calls[0][1] as FormData;
    expect(sent.get('email')).toBe('nobody@example.com');
  });

  it('shows a failure as an alert, and the way back to sign-in', async () => {
    mocks.requestPasswordResetAction.mockResolvedValue({ error: 'We could not send the reset email.', notice: null });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('We could not send the reset email.'));
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  });

  it('starts with the message about an expired link when it is given one', () => {
    render(<ForgotPasswordForm initialError="That reset link is invalid or has expired." />);
    expect(screen.getByRole('alert').textContent).toMatch(/invalid or has expired/);
  });
});

describe('ResetPasswordForm', () => {
  it('has two new-password fields and sends both', async () => {
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password', { exact: true }), { target: { value: 'a-brand-new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'a-brand-new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(mocks.updatePasswordAction).toHaveBeenCalledTimes(1));
    const sent = mocks.updatePasswordAction.mock.calls[0][1] as FormData;
    expect(sent.get('password')).toBe('a-brand-new-password');
    expect(sent.get('confirmPassword')).toBe('a-brand-new-password');
  });

  it('shows what the action refused', async () => {
    mocks.updatePasswordAction.mockResolvedValue({ error: 'The two passwords do not match.', notice: null });
    render(<ResetPasswordForm />);
    fireEvent.change(screen.getByLabelText('New password', { exact: true }), { target: { value: 'a-brand-new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'something-else-entirely' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The two passwords do not match.'));
  });
});

describe('CaptchaWidget', () => {
  function installTurnstile() {
    const seen: { options: Record<string, unknown> | null } = { options: null };
    const api = {
      render: vi.fn((_el: HTMLElement, options: Record<string, unknown>) => {
        seen.options = options;
        return 'widget-1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    (window as unknown as Record<string, unknown>).turnstile = api;
    return { api, seen };
  }

  it('renders the provider widget with the public site key, and writes its token into the form field', () => {
    const { api, seen } = installTurnstile();
    const { container } = render(<CaptchaWidget config={TURNSTILE} />);
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(seen.options?.sitekey).toBe('public-site-key');
    act(() => (seen.options?.callback as (token: string) => void)('token-1'));
    expect(hiddenToken(container)?.value).toBe('token-1');
    act(() => (seen.options?.['expired-callback'] as () => void)());
    expect(hiddenToken(container)?.value).toBe('');
  });

  it('asks for a fresh token after each submission, and removes the widget when it goes', () => {
    const { api, seen } = installTurnstile();
    const { container, rerender, unmount } = render(<CaptchaWidget config={TURNSTILE} resetOn="first" />);
    act(() => (seen.options?.callback as (token: string) => void)('used-token'));
    rerender(<CaptchaWidget config={TURNSTILE} resetOn="second" />);
    expect(api.reset).toHaveBeenCalledWith('widget-1');
    expect(hiddenToken(container)?.value).toBe('');
    unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });
});

describe('the login page', () => {
  async function loginPage(params: { error?: string; reset?: string } = {}) {
    const { default: LoginPage } = await import('@/app/login/page');
    return render(await LoginPage({ searchParams: Promise.resolve(params) }));
  }

  it('shows the sign-in card by default, without a CAPTCHA when no site key is set', async () => {
    const { container } = await loginPage();
    expect(screen.getByRole('heading', { name: 'Sign in to Momentum' })).toBeTruthy();
    expect(hiddenToken(container)).toBeNull();
  });

  it('shows the reset request when asked (?reset=1)', async () => {
    await loginPage({ reset: '1' });
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the reset request, with the expired-link message, when the emailed link failed (?error=reset)', async () => {
    await loginPage({ error: 'reset' });
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/reset link is invalid or has expired/);
  });

  it('keeps the confirmation-link message on the sign-in card', async () => {
    await loginPage({ error: 'confirmation' });
    expect(screen.getByRole('heading', { name: 'Sign in to Momentum' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/confirmation link/);
  });

  it('puts the CAPTCHA on both cards when a site key is set', async () => {
    mocks.captcha = TURNSTILE;
    const first = await loginPage();
    expect(hiddenToken(first.container)).not.toBeNull();
    cleanup();
    const second = await loginPage({ reset: '1' });
    expect(hiddenToken(second.container)).not.toBeNull();
  });
});

describe('the new-password page', () => {
  async function resetPage() {
    const { default: ResetPasswordPage } = await import('@/app/auth/reset/page');
    return render(await ResetPasswordPage());
  }

  it('sends a visitor with no session to /login', async () => {
    mocks.user = { ok: true, data: null };
    await expect(resetPage()).rejects.toThrow('NEXT_REDIRECT /login');
  });

  it('shows the form for the recovery session', async () => {
    mocks.recovering = true;
    await resetPage();
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeTruthy();
  });

  it('shows a fixed message, not the form, for a session that a normal sign-in started', async () => {
    await resetPage();
    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeTruthy();
    expect(screen.queryByLabelText('Confirm new password')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

describe('the signed-in indicator', () => {
  it('the sidebar shows the email above the sign-out button', () => {
    render(<WorkspaceSidebar ariaLabel="Workspace" active="settings" userEmail="matt@example.com" />);
    const sidebar = within(screen.getByRole('complementary', { name: 'Workspace' }));
    expect(sidebar.getByText('Signed in as')).toBeTruthy();
    expect(sidebar.getByText('matt@example.com')).toBeTruthy();
    expect(sidebar.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('the sidebar names nobody when there is no session', () => {
    render(<WorkspaceSidebar ariaLabel="Workspace" active="settings" />);
    expect(screen.queryByText('Signed in as')).toBeNull();
  });

  it('the mobile header shows the email and a sign-out button, and the avatar still opens Settings', () => {
    render(<MobileHeader active="dashboard" userEmail="matt@example.com" />);
    const header = within(screen.getByRole('banner'));
    expect(header.getByText('Signed in as matt@example.com')).toBeTruthy();
    expect(header.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(header.getByRole('link', { name: 'Settings and account' }).getAttribute('href')).toBe('/settings');
  });

  it('the mobile header keeps a long address whole for a screen reader, though it is shortened on screen', () => {
    const long = 'a-very-long-throwaway-address-for-390-px-screens-abcdef@example.com';
    render(<MobileHeader active="dashboard" userEmail={long} />);
    const header = within(screen.getByRole('banner'));
    // The row is cut off by CSS (an ellipsis), not in the markup: the text a screen reader reads, and the title, hold all of it.
    const row = header.getByText(`Signed in as ${long}`);
    expect(row.textContent).toBe(`Signed in as ${long}`);
    expect(row.getAttribute('title')).toBe(long);
  });

  it('the mobile header shows no account row when there is no session', () => {
    render(<MobileHeader active="dashboard" />);
    const header = within(screen.getByRole('banner'));
    expect(header.queryByText(/Signed in as/)).toBeNull();
    expect(header.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });
});
