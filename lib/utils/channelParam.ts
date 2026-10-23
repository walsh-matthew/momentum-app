// The selected goal channel lives in the address bar as ?channel=<goal id> (MOM-88), so a reload, a shared link
// and the back button all keep it. Pure string handling: no database, no router, no window. The id is only ever
// used to choose among views the server already built from the signed-in user's own data (resolveChannel in
// channelViews.ts), so a pasted id from anyone else's account simply is not a channel here.

import { ALL_CHANNELS } from '@/types/channelViews';

export const CHANNEL_PARAM = 'channel';

// The query string (with its leading '?', or '' when empty) for selecting a channel, starting from the current
// one. Every other parameter is kept as it is; choosing all channels removes the parameter so the address stays
// clean; a repeated channel parameter is collapsed to one. Pass window.location.search.
export function withChannelParam(currentSearch: string, channelId: string): string {
  const params = new URLSearchParams(currentSearch);
  if (channelId === ALL_CHANNELS) params.delete(CHANNEL_PARAM);
  else params.set(CHANNEL_PARAM, channelId);
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
}
