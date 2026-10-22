import { signOutAction } from '@/app/actions/auth';

interface SignOutButtonProps {
  className?: string;
}

export function SignOutButton({ className = '' }: SignOutButtonProps) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className="min-h-11 w-full rounded-md px-3 text-left text-sm text-muted hover:bg-foreground/5"
      >
        Sign out
      </button>
    </form>
  );
}
