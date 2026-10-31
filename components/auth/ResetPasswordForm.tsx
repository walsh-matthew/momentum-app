'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { updatePasswordAction } from '@/app/actions/auth';
import { MainButton } from '@/components/ui/MainButton';
import { MissingCallout } from '@/components/ui/MissingCallout';
import { checkForm, type RequiredField } from '@/lib/forms/missing';
import type { PasswordFormState } from '@/types/auth';
import { AuthBrand, FIELD_CLASS } from './AuthCardParts';

const INITIAL_STATE: PasswordFormState = { error: null, notice: null };

const REQUIRED: RequiredField[] = [
  { name: 'password', what: 'a new password', minLength: 8 },
  { name: 'confirmPassword', what: 'your new password again', minLength: 8 },
];

// The page behind the emailed reset link: choose a new password. On success the action sends the person to the app.
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL_STATE);
  const [missing, setMissing] = useState<string | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const gap = checkForm(event.currentTarget, REQUIRED);
    if (gap) event.preventDefault();
    setMissing(gap?.message ?? null);
  };

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
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
      <MissingCallout message={missing} />
      <MainButton type="submit" busy={pending} busyLabel="Working…">
        Set new password
      </MainButton>
    </form>
  );
}
