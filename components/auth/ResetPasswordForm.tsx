'use client';

import { useActionState } from 'react';
import { updatePasswordAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import type { PasswordFormState } from '@/types/auth';
import { AuthBrand, FIELD_CLASS } from './AuthCardParts';

const INITIAL_STATE: PasswordFormState = { error: null, notice: null };

// The page behind the emailed reset link: choose a new password. On success the action sends the person to the app.
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL_STATE);

  return (
    <form action={formAction} className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
      <AuthBrand />
      <h1 className="text-lg font-semibold tracking-[-0.03em]">Set a new password</h1>
      <label className="flex flex-col gap-1 text-sm font-medium">
        New password
        <input type="password" name="password" autoComplete="new-password" minLength={8} required className={FIELD_CLASS} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Confirm new password
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
          className={FIELD_CLASS}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Working…' : 'Set new password'}
      </Button>
    </form>
  );
}
