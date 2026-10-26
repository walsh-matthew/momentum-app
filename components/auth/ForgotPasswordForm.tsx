'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestPasswordResetAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import type { CaptchaConfig, PasswordFormState } from '@/types/auth';
import { AuthBrand, FIELD_CLASS, LINK_CLASS } from './AuthCardParts';
import { CaptchaWidget } from './CaptchaWidget';

interface ForgotPasswordFormProps {
  // A message to show before anything is submitted, for example that the emailed link had expired.
  initialError?: string | null;
  captcha?: CaptchaConfig | null;
}

const INITIAL_STATE: PasswordFormState = { error: null, notice: null };

// The request form for a forgotten password, shown on /login. Whatever address is typed, the answer is the same
// notice, so the form never says whether an account exists.
export function ForgotPasswordForm({ initialError = null, captcha = null }: ForgotPasswordFormProps) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, { ...INITIAL_STATE, error: initialError });

  return (
    <form action={formAction} className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
      <AuthBrand />
      <h1 className="text-lg font-semibold tracking-[-0.03em]">Reset your password</h1>
      <p className="text-sm text-muted">Enter your email and we will send you a link to set a new password.</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input type="email" name="email" autoComplete="email" required className={FIELD_CLASS} />
      </label>
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
      <Button type="submit" disabled={pending}>
        {pending ? 'Working…' : 'Send reset link'}
      </Button>
      <Link href="/login" className={`${LINK_CLASS} self-start`}>
        Back to sign in
      </Link>
    </form>
  );
}
