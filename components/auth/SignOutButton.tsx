import { signOutAction } from '@/app/actions/auth';

interface SignOutButtonProps {
  className?: string;
  // A bordered button, for the Settings page where signing out is the page's action; the default is the quiet
  // text link used in the sidebar.
  bordered?: boolean;
}

export function SignOutButton({ className = '', bordered = false }: SignOutButtonProps) {
  return (
    <form action={signOutAction} className={className}>
      <button
        type="submit"
        className={`min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-foreground/[0.06] hover:text-foreground ${
          bordered ? 'border border-foreground/30 px-5 text-center font-medium text-foreground' : 'text-muted'
        }`}
      >
        Sign out
      </button>
    </form>
  );
}
