'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { authenticate } from '@/app/actions/auth';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { checkForm, type RequiredField } from '@/lib/forms/missing';
import type { AuthFormState, CaptchaConfig } from '@/types/auth';
import { AuthBrand, FIELD_CLASS, LINK_CLASS } from './AuthCardParts';
import { CaptchaWidget } from './CaptchaWidget';

interface CreateAccountFormProps {
  captcha?: CaptchaConfig | null;
}

const INITIAL_STATE: AuthFormState = { error: null, notice: null, sentTo: null };

// What a tap on "Create account" needs first (MOM-145, MOM-150): the same plain callout as sign-in, with the 8-character rule.
const REQUIRED: RequiredField[] = [
  { name: 'email', what: 'your email address' },
  { name: 'password', what: 'your password', verb: 'Choose', minLength: 8 },
];

// The create-account card, shown at /login?signup=1. After a sign-up that needs the person to confirm, the same card
// turns into the "Check your email" state, which names the address and says what to do next.
export function CreateAccountForm({ captcha = null }: CreateAccountFormProps) {
  const [state, formAction, pending] = useActionState(authenticate, INITIAL_STATE);
  const [missing, setMissing] = useState<string | null>(null);
  // The result the person has already left behind with "Start again"; a new result shows its state again.
  const [dismissed, setDismissed] = useState<AuthFormState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const sent = state.sentTo && dismissed !== state ? state.sentTo : null;

  // The state is new content on the page: put focus on its heading so a screen reader reads it.
  useEffect(() => {
    if (sent) headingRef.current?.focus();
  }, [sent]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const gap = checkForm(event.currentTarget, REQUIRED);
    if (gap) event.preventDefault();
    setMissing(gap?.message ?? null);
  };

  if (sent) {
    return (
      <div role="status" className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
        <AuthBrand />
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-[-0.03em] outline-none">
          Check your email
        </h1>
        <p className="text-base">
          We sent a link to <strong className="break-all font-semibold">{sent}</strong>.
        </p>
        <p className="text-sm">Open the email and tap the link. It confirms your account and signs you in.</p>
        <p className="text-sm text-muted">
          Nothing after a few minutes? Check your junk or spam folder. If it&apos;s not there, tap Start again and use the same address,
          and we&apos;ll send a new link.
        </p>
        <button type="button" onClick={() => setDismissed(state)} className={`${LINK_CLASS} self-start`}>
          Start again
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
      <AuthBrand />
      <h1 className="text-lg font-semibold tracking-[-0.03em]">Create your account</h1>
      <p className="text-sm text-muted">Enter your email and choose a password. We&apos;ll email you a link to confirm your account.</p>
      <input type="hidden" name="intent" value="signup" />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input type="email" name="email" autoComplete="email" required className={FIELD_CLASS} />
      </label>
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="password-hint"
            className={FIELD_CLASS}
          />
        </label>
        <p id="password-hint" className="text-sm text-muted">
          At least 8 characters.
        </p>
      </div>
      {captcha && <CaptchaWidget config={captcha} resetOn={state} />}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <MissingCallout message={missing} />
      <MainButton type="submit" busy={pending} busyLabel="Working…">
        Create account
      </MainButton>
      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-2 hover:text-foreground">
          Sign in
        </Link>
      </p>
      <p className="text-sm text-muted">
        Momentum is for adults (18 or over). See how it handles your data in the{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}
