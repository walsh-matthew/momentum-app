'use client';

import Link from 'next/link';
import { useActionState, useState, type FormEvent } from 'react';
import { authenticate } from '@/app/actions/auth';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { checkForm, type RequiredField } from '@/lib/forms/missing';
import type { AuthFormState, CaptchaConfig } from '@/types/auth';
import { AuthBrand, FIELD_CLASS, LINK_CLASS } from './AuthCardParts';
import { CaptchaWidget } from './CaptchaWidget';

interface SignInFormProps {
  initialError?: string | null;
  // The CAPTCHA to show, or null when no site key is configured (then the form is exactly as it was).
  captcha?: CaptchaConfig | null;
}

const INITIAL_STATE: AuthFormState = { error: null, notice: null };

// What a tap on the button needs first (MOM-145): a form with two fields keeps its button visible and answers a tap with a callout.
// No length rule on the password (MOM-150): accounts made before production's minimum became 8 may have 6 or 7 characters.
const REQUIRED: RequiredField[] = [
  { name: 'email', what: 'your email address' },
  { name: 'password', what: 'your password' },
];

export function SignInForm({ initialError = null, captcha = null }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(authenticate, { ...INITIAL_STATE, error: initialError });
  const [missing, setMissing] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const gap = checkForm(event.currentTarget, REQUIRED);
    if (gap) event.preventDefault();
    setMissing(gap?.message ?? null);
  };

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
      <AuthBrand />
      <h1 className="text-lg font-semibold tracking-[-0.03em]">Sign in to Momentum</h1>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input type="email" name="email" autoComplete="email" required className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className={FIELD_CLASS}
        />
      </label>
      <Link href="/login?reset=1" className={`${LINK_CLASS} self-start`}>
        Forgot password?
      </Link>
      {captcha && <CaptchaWidget config={captcha} resetOn={state} />}
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-sm text-muted">
          {state.notice}
        </p>
      )}
      <MissingCallout message={missing} />
      <MainButton type="submit" name="intent" value="signin" busy={pending} busyLabel="Working…">
        Sign in
      </MainButton>
      <p className="text-sm text-muted">
        New to Momentum?{' '}
        <Link href="/login?signup=1" className="underline underline-offset-2 hover:text-foreground">
          Create an account
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
