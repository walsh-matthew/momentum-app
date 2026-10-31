import { signOutAction } from '@/app/actions/auth';

interface SignOutButtonProps {
  className?: string;
  // A bordered button, for the Settings page where signing out is the page's action; the default is the quiet
  // text link used in the sidebar.
  bordered?: boolean;
  // A short inline button, for the signed-in row of the mobile header.
  compact?: boolean;
}

export function SignOutButton({ className = '', bordered = false, compact = false }: SignOutButtonProps) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className={`rounded-xl px-3 text-sm hover:bg-foreground/[0.06] hover:text-foreground ${
          compact ? 'min-h-8 whitespace-nowrap' : 'min-h-11 w-full text-left'
        } ${bordered ? 'border ctl-30 px-5 text-center font-medium text-foreground' : 'text-muted'}`}
      >
        Sign out
      </button>
    </form>
  );
}
