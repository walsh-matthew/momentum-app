// What the home page shows for each goal channel the user can pick in the sidebar (MOM-44). The server builds
// one view per active goal plus an "all channels" view from the user's own goals and tasks, and the sidebar
// only chooses between them, so no selection is ever sent to the server or trusted by it.

import type { VelocitySnapshot } from '@/lib/utils/velocity';
import type { FocusFeed } from './focusFeed';
import type { RebalanceProposalView } from './rebalance';

// The key of the view that covers every active goal. Goal ids are UUIDs, so it cannot collide with one.
export const ALL_CHANNELS = 'all';

export interface ChannelSummary {
  id: string;
  title: string;
}

// Why a view has no velocity number or rebalance proposal:
//   choose_channel  several goals are active and both are worked out per goal, because each goal's weeks
//                   count from its own start date; pick a channel to see them
export type ChannelHint = 'choose_channel';
export type VelocityHint = ChannelHint;

// What the main feed shows (MOM-18). Decided once, where the views are built, so the UI never works it out
// from an empty list:
//   signed_out  there is no session (app/page.tsx; the proxy normally redirects first, see SIGNED_OUT_CHANNEL_VIEWS)
//   load_failed the plan could not be read (an error or a throw, app/page.tsx); says nothing about the goals
//   no_goals    signed in, the read succeeded and found no active goal (all channels only)
//   no_tasks    the channel's goals have no tasks at all
//   all_done    the channel has tasks, every one of them finished
//   tasks       at least one unfinished task: the focus card and its lists
export type FeedState = 'signed_out' | 'load_failed' | 'no_goals' | 'no_tasks' | 'all_done' | 'tasks';

export interface ChannelView {
  // Which of the feed's screens to show; see FeedState.
  feedState: FeedState;
  // The focus task, up next and recently done for this channel only (all active channels for "all").
  feed: FocusFeed;
  // Velocity from this channel's tasks and its own start date; null when there is nothing to score or,
  // for "all" with several goals, no single honest number (see velocityHint).
  velocity: VelocitySnapshot | null;
  velocityHint: VelocityHint | null;
  // The rule-based rebalance proposal for this channel's tasks and its own plan week (MOM-87); null when
  // its start date cannot be read, when it has more unfinished work than a proposal can carry, or, for
  // "all" with several goals, because there is no single plan week (see rebalanceHint).
  rebalance: RebalanceProposalView | null;
  // The goal the proposal is for, which "Ask Claude" sends back. For "all" it is the one active goal, or
  // null with none or several.
  rebalanceChannelId: string | null;
  rebalanceHint: ChannelHint | null;
}

export interface ChannelViews {
  // The active goals, in the order the goals service lists them (the default goal first).
  channels: ChannelSummary[];
  // A view for ALL_CHANNELS and for each channel id.
  byChannel: Record<string, ChannelView>;
}

const emptyViews = (feedState: FeedState): ChannelViews => ({
  channels: [],
  byChannel: {
    [ALL_CHANNELS]: {
      feedState,
      feed: { focus: null, upNext: [], recentlyDone: [] },
      velocity: null,
      velocityHint: null,
      rebalance: null,
      rebalanceChannelId: null,
      rebalanceHint: null,
    },
  },
});

// A signed-in user whose plan was read and has no active goal. Not a fallback for a failed read (see
// LOAD_FAILED_CHANNEL_VIEWS): a failed read must never tell someone who has goals that they have none.
export const EMPTY_CHANNEL_VIEWS: ChannelViews = emptyViews('no_goals');

// What the page passes when the signed-in user's plan could not be read (an error result or a thrown error, for
// example the database is unreachable). The same empty shape, so nothing of a plan can show, but its own state.
export const LOAD_FAILED_CHANNEL_VIEWS: ChannelViews = emptyViews('load_failed');

// What the page passes when there is no session, instead of reading anything. proxy.ts redirects a signed-out
// visitor to /login before the page renders, so this is only reached when the session ends between the proxy
// and the render; it is the safe default for that gap.
export const SIGNED_OUT_CHANNEL_VIEWS: ChannelViews = emptyViews('signed_out');
