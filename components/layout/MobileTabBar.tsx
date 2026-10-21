'use client';

import { WORKSPACE_VIEWS, WORKSPACE_VIEW_LABELS, type WorkspaceView } from './panels';

interface MobileTabBarProps {
  active: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}

export function MobileTabBar({ active, onChange }: MobileTabBarProps) {
  return (
    <nav
      aria-label="Workspace sections"
      className="grid shrink-0 grid-cols-3 border-t border-border bg-panel lg:hidden"
    >
      {WORKSPACE_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-current={active === view ? 'page' : undefined}
          onClick={() => onChange(view)}
          className={`min-h-12 text-sm font-medium ${
            active === view ? 'text-accent' : 'text-muted'
          }`}
        >
          {WORKSPACE_VIEW_LABELS[view]}
        </button>
      ))}
    </nav>
  );
}
