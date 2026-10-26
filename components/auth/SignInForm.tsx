'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { authenticate } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import type { AuthFormState, CaptchaConfig } from '@/types/auth';
import { AuthBrand, FIELD_CLASS, LINK_CLASS } from './AuthCardParts';
import { CaptchaWidget } from './CaptchaWidget';

interface SignInFormProps {
  initialError?: string | null;
  // The CAPTCHA to show, or null when no site key is configured (then the form is exactly as it was).
  captcha?: CaptchaConfig | null;
}

const INITIAL_STATE: AuthFormState = { error: null, notice: null };

export function SignInForm({ initialError = null, captcha = null }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(authenticate, { ...INITIAL_STATE, error: initialError });

  return (
    <form action={formAction} className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
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
          minLength={8}
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
      <Button type="submit" name="intent" value="signin" disabled={pending}>
        {pending ? 'Working…' : 'Sign in'}
      </Button>
      <Button type="submit" name="intent" value="signup" variant="outline" disabled={pending}>
        Create account
      </Button>
    </form>
  );
}
