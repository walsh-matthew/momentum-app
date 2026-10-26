import type { ReactNode } from 'react';
import { MobileHeader } from './MobileHeader';
import { WorkspaceSidebar, type WorkspacePage } from './WorkspaceSidebar';

interface PageFrameProps {
  // Which page this is, for the navigation's aria-current.
  active: Exclude<WorkspacePage, 'dashboard'>;
  title: string;
  // The signed-in user's email, for the avatar's initials.
  userEmail: string | null;
  children: ReactNode;
}

// The frame for the pages that are not the dashboard (Connected Apps, Settings): the same sticky header below
// 1200px and the same sidebar from 1200px, with the page's content in the middle. It has no channels and no
// data of its own; the page passes in everything it shows.
export function PageFrame({ active, title, userEmail, children }: PageFrameProps) {
  return (
    <div className="desktop-shell" data-columns="2">
      <WorkspaceSidebar ariaLabel="Workspace" active={active} userEmail={userEmail} />
      <section className="desktop-workspace" aria-label={title}>
        <div className="workspace-content">
          <MobileHeader active={active} userEmail={userEmail} />
          <main className="min-w-0 pt-5">
            <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.055em] min-[1200px]:text-[34px]">
              {title}
            </h1>
            {children}
          </main>
        </div>
      </section>
    </div>
  );
}
