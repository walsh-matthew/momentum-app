// Shared view keys for the workspace. On desktop all panels render side by side;
// on mobile exactly one is visible at a time, selected via MobileTabBar.
export const WORKSPACE_VIEWS = ['channels', 'feed', 'stack'] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

export const WORKSPACE_VIEW_LABELS: Record<WorkspaceView, string> = {
  channels: 'Channels',
  feed: 'Feed',
  stack: 'Stack & AI',
};
