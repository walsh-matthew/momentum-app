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

export interface ChannelView {
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

const EMPTY_VIEW: ChannelView = {
  feed: { focus: null, upNext: [], recentlyDone: [] },
  velocity: null,
  velocityHint: null,
  rebalance: null,
  rebalanceChannelId: null,
  rebalanceHint: null,
};

export const EMPTY_CHANNEL_VIEWS: ChannelViews = { channels: [], byChannel: { [ALL_CHANNELS]: EMPTY_VIEW } };
