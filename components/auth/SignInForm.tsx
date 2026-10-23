'use client';

import { useActionState } from 'react';
import { authenticate } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import type { AuthFormState } from '@/types/auth';

interface SignInFormProps {
  initialError?: string | null;
}

const INITIAL_STATE: AuthFormState = { error: null, notice: null };

const FIELD_CLASS =
  'min-h-11 rounded-lg border border-foreground/45 bg-background px-3 text-base font-normal text-foreground placeholder:text-muted';

export function SignInForm({ initialError = null }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(authenticate, { ...INITIAL_STATE, error: initialError });

  return (
    <form action={formAction} className="score-card w-full max-w-sm flex-col items-stretch gap-4 p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <span className="momentum-mark" aria-hidden="true">
            m
          </span>
        </span>
        <span className="text-[17px] font-semibold tracking-[-0.04em]" aria-hidden="true">
          momentum
        </span>
      </div>
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
