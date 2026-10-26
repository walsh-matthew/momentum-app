import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BurnoutRiskBadge } from '@/components/velocity/BurnoutRiskBadge';
import { initialsFrom } from '@/lib/utils/initials';
import type { BurnoutRisk } from '@/lib/utils/velocity';
import type { WorkspacePage } from './WorkspaceSidebar';

interface MobileHeaderProps {
  // The page being shown, which marks its link with aria-current.
  active: WorkspacePage;
  // The signed-in user's email, for the avatar's initials and the signed-in row; null when there is no session.
  userEmail?: string | null;
  // The selected channel's burnout risk, or null when there is none to show.
  burnoutRisk?: BurnoutRisk | null;
}

// The top bar below 1200px (from 1200px the sidebar replaces it): the logo, the burnout badge, a link to the
// Connected Apps page and the avatar, which opens Settings; under them, who is signed in and a sign-out button. It
// sticks to the top while the page scrolls.
export function MobileHeader({ active, userEmail = null, burnoutRisk = null }: MobileHeaderProps) {
  return (
    <header className="mobile-header">
      <Link href="/" className="mobile-brand" aria-label="Momentum home">
        <span className="brand-mark" aria-hidden="true">
          <span className="momentum-mark">m</span>
        </span>
        <span aria-hidden="true" className="hidden min-[440px]:inline">
          momentum
        </span>
      </Link>
      <div className="flex items-center gap-1">
        {burnoutRisk && <BurnoutRiskBadge risk={burnoutRisk} />}
        <Link
          href="/connections"
          className="icon-link"
          aria-label="Connected apps"
          aria-current={active === 'connections' ? 'page' : undefined}
        >
          <Link2 className="size-[18px]" aria-hidden="true" />
        </Link>
        <Link
          href="/settings"
          className="avatar-button"
          aria-label="Settings and account"
          aria-current={active === 'settings' ? 'page' : undefined}
        >
          <span aria-hidden="true">{initialsFrom(userEmail)}</span>
        </Link>
      </div>
      {userEmail && (
        <div className="mobile-account">
          <span className="mobile-account-email" title={userEmail}>
            Signed in as {userEmail}
          </span>
          <SignOutButton compact />
        </div>
      )}
    </header>
  );
}
