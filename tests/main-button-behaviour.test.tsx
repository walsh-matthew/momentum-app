// @vitest-environment jsdom
//
// MOM-145, the behaviour behind the main-button rule (the sweep is tests/main-button-rule.test.ts):
// (a) a single-answer input shows no main button until it has a value, then shows it solid, and Enter still sends;
// (b) a form with several fields keeps its main button visible and solid, and a tap with something missing shows a plain callout that
//     names it, focuses it and sends nothing;
// and while work is in flight a main button stays solid, says it is busy and ignores taps.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { SignInForm } from '@/components/auth/SignInForm';
import { AnswerBox } from '@/components/setup/AnswerBox';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { busyProps } from '@/lib/forms/mainButton';
import { firstMissing } from '@/lib/forms/missing';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn(),
}));
vi.mock('@/app/actions/auth', () => mocks);
vi.mock('next/script', () => ({ default: () => null }));

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset().mockResolvedValue({ error: null, notice: null });
});
afterEach(cleanup);

describe('what is missing, in the order on the screen', () => {
  const fields = [
    { name: 'email', what: 'your email address' },
    { name: 'password', what: 'your password', minLength: 8 },
  ];

  it('names the first field with no value, or one that is too short, and nothing when all is there', () => {
    expect(firstMissing(new Map(), fields)).toEqual({ name: 'email', message: 'Enter your email address to continue.' });
    expect(
      firstMissing(
        new Map([
          ['email', '   '],
          ['password', 'longenough'],
        ]),
        fields,
      )?.name,
    ).toBe('email');
    expect(
      firstMissing(
        new Map([
          ['email', 'a@b.co'],
          ['password', 'short'],
        ]),
        fields,
      ),
    ).toEqual({ name: 'password', message: 'Your password needs at least 8 characters.' });
    expect(
      firstMissing(
        new Map([
          ['email', 'a@b.co'],
          ['password', 'longenough'],
        ]),
        fields,
      ),
    ).toBeNull();
  });

  it('says "Choose" for a choice', () => {
    expect(firstMissing(new Map(), [{ name: 'kind', what: 'a kind of goal', verb: 'Choose' }])?.message).toBe('Choose a kind of goal to continue.');
  });

  it('shows the callout as a plain alert, and nothing without a message', () => {
    const { rerender } = render(<MissingCallout message={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<MissingCallout message="Choose one first." />);
    expect(screen.getByRole('alert').textContent).toBe('Choose one first.');
  });
});

describe('busy, not disabled', () => {
  it('a busy MainButton stays enabled and solid, says it is busy, shows its busy word and ignores a tap', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <MainButton onClick={onClick} busy={false} busyLabel="Saving…">
        Save
      </MainButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(
      <MainButton onClick={onClick} busy busyLabel="Saving…">
        Save
      </MainButton>,
    );
    const busy = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.className).toContain('bg-primary');
    fireEvent.click(busy);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('busyProps with no work in flight passes the tap through and sets no aria-busy', () => {
    const tap = vi.fn();
    const props = busyProps<HTMLButtonElement>(false, tap);
    expect(props['aria-busy']).toBeUndefined();
    props.onClick({ preventDefault: vi.fn() } as never);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it('Enter in a form also fires a click on its default button, so a busy button stops that too', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input aria-label="Name" />
        <MainButton type="submit" busy>
          Go
        </MainButton>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('(a) a single-answer input hides its main button until it has a value', () => {
  it("setup's answer box has no Send while it is empty or blank, then a solid one, and sends the words trimmed", () => {
    const onSubmit = vi.fn();
    render(<AnswerBox label="Your answer" submitLabel="Send" busy={false} onSubmit={onSubmit} />);
    const box = screen.getByLabelText('Your answer');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(box, { target: { value: '   ' } });
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(box, { target: { value: '  Run more  ' } });
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(send.getAttribute('aria-disabled')).toBeNull();
    expect(send.className).toContain('bg-primary');
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledWith('Run more');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('while a reply loads the Send stays solid, says "Thinking…" and a second tap sends nothing', () => {
    const onSubmit = vi.fn();
    render(<AnswerBox label="Your answer" submitLabel="Send" busy onSubmit={onSubmit} initialText="Run more" />);
    const thinking = screen.getByRole('button', { name: 'Thinking…' }) as HTMLButtonElement;
    expect(thinking.disabled).toBe(false);
    expect(thinking.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(thinking);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('the forgotten-password form shows its button once there is an address, and not before', () => {
    render(<ForgotPasswordForm />);
    expect(screen.queryByRole('button', { name: 'Send reset link' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matt@example.com' } });
    expect((screen.getByRole('button', { name: 'Send reset link' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('(b) a form with several fields keeps its main button and names what is missing', () => {
  it('sign-in: the buttons are always there; a tap with nothing typed names the email, focuses it and sends nothing', () => {
    render(<SignInForm />);
    const signIn = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement;
    expect(signIn.disabled).toBe(false);
    expect(signIn.className).toContain('bg-primary');
    fireEvent.click(signIn);
    expect(screen.getByRole('alert').textContent).toBe('Enter your email address to continue.');
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it('sign-in: with an email and no password, the password is what is missing', () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matt@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter your password to continue.');
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });

  it('sign-in: a 6-character password reaches the server instead of a callout (older accounts, MOM-150)', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matt@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.authenticate).toHaveBeenCalledTimes(1));
    expect((mocks.authenticate.mock.calls[0][1] as FormData).get('password')).toBe('abc123');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sign-in: with everything there the tap sends it, and no callout is left', async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'matt@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longenough' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.authenticate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('set a new password: both fields are named in turn, and nothing is sent until both are there', () => {
    render(<ResetPasswordForm />);
    const set = screen.getByRole('button', { name: 'Set new password' }) as HTMLButtonElement;
    expect(set.disabled).toBe(false);
    fireEvent.click(set);
    expect(screen.getByRole('alert').textContent).toBe('Enter a new password to continue.');
    expect(document.activeElement).toBe(screen.getByLabelText('New password'));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough' } });
    fireEvent.click(set);
    expect(screen.getByRole('alert').textContent).toBe('Enter your new password again to continue.');
    expect(document.activeElement).toBe(screen.getByLabelText('Confirm new password'));
    expect(mocks.updatePasswordAction).not.toHaveBeenCalled();
  });
});
