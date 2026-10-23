import { LayoutDashboard, Link2, Settings, Target } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BurnoutRiskBadge } from '@/components/velocity/BurnoutRiskBadge';
import type { BurnoutRisk } from '@/lib/utils/velocity';

export type WorkspacePage = 'dashboard' | 'connections' | 'settings';

interface WorkspaceSidebarProps {
  // The accessible name of the sidebar landmark.
  ariaLabel: string;
  // The page being shown, which the nav marks with aria-current.
  active: WorkspacePage;
  // The selected channel's burnout risk, or null when there is none to show (for example several goals and no
  // channel chosen, or a page that has no channel).
  burnoutRisk?: BurnoutRisk | null;
  // Show the pace note in the footer. Only the dashboard has a channel to say it about.
  showPace?: boolean;
  // The goal channel list, on the home page. Other pages leave it out.
  children?: ReactNode;
}

// What the footer says about the user's pace, worked out from the same risk the badge shows. It claims nothing
// the data does not support: with no risk it says how to get one.
const PACE_NOTES: Record<BurnoutRisk, string> = {
  low: 'Your pace is looking steady',
  rising: 'Carry-over is building up',
  high: 'Consider a lighter week',
};

// The desktop sidebar (from 1200px; below that it is hidden and the mobile header and goal cards take over):
// logo, burnout badge, workspace navigation, then whatever the page puts in `children`. No data access.
export function WorkspaceSidebar({ ariaLabel, active, burnoutRisk = null, showPace = false, children }: WorkspaceSidebarProps) {
  const link = (page: WorkspacePage) => (active === page ? ('page' as const) : undefined);

  return (
    <aside aria-label={ariaLabel} className="desktop-sidebar">
      <Link href="/" className="desktop-brand" aria-label="Momentum home">
        <span className="brand-mark" aria-hidden="true">
          <span className="momentum-mark">m</span>
        </span>
        <span aria-hidden="true">momentum</span>
      </Link>

      {burnoutRisk && (
        <div className="desktop-status-stack">
          <BurnoutRiskBadge risk={burnoutRisk} />
        </div>
      )}

      <nav className="desktop-nav" aria-label="Workspace">
        <p className="sidebar-label" aria-hidden="true">
          Workspace
        </p>
        <Link href="/" className="desktop-nav-link" aria-current={link('dashboard')}>
          <LayoutDashboard aria-hidden="true" />
          Daily Dashboard
        </Link>
        <Link href="/#active-goals" className="desktop-nav-link">
          <Target aria-hidden="true" />
          Goal Channels
        </Link>
        <Link href="/connections" className="desktop-nav-link" aria-current={link('connections')}>
          <Link2 aria-hidden="true" />
          Connected Apps
        </Link>
        <Link href="/settings" className="desktop-nav-link" aria-current={link('settings')}>
          <Settings aria-hidden="true" />
          Settings
        </Link>
      </nav>

      {children}

      <div className="mt-auto">
        {showPace && (
          <p className="sidebar-footer">
            <span className="sidebar-footer-dot" aria-hidden="true" />
            {burnoutRisk ? PACE_NOTES[burnoutRisk] : 'Choose a channel to see your pace'}
          </p>
        )}
        <SignOutButton className="pt-1" />
      </div>
    </aside>
  );
}
