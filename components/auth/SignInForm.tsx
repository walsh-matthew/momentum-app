'use client';

import { useActionState } from 'react';
import { authenticate } from '@/app/actions/auth';
import type { AuthFormState } from '@/types/auth';

interface SignInFormProps {
  initialError?: string | null;
}

const INITIAL_STATE: AuthFormState = { error: null, notice: null };

export function SignInForm({ initialError = null }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(authenticate, { ...INITIAL_STATE, error: initialError });

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-panel p-6">
      <h1 className="text-lg font-semibold">Sign in to Momentum</h1>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="min-h-11 rounded-md border border-border bg-background px-3 text-base font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={8}
          required
          className="min-h-11 rounded-md border border-border bg-background px-3 text-base font-normal"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-sm text-muted">
          {state.notice}
        </p>
      )}
      <button
        type="submit"
        name="intent"
        value="signin"
        disabled={pending}
        className="min-h-11 rounded-md bg-accent px-5 text-sm font-medium text-background disabled:opacity-60"
      >
        {pending ? 'Working…' : 'Sign in'}
      </button>
      <button
        type="submit"
        name="intent"
        value="signup"
        disabled={pending}
        className="min-h-11 rounded-md border border-border px-5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60"
      >
        Create account
      </button>
    </form>
  );
}
