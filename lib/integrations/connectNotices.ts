// The sentence for each way the Google consent flow can end (MOM-62). Client-safe: it only maps the fixed outcome
// codes in types/integrations.ts to our own wording. Anything else in the address (an unknown or tampered value) maps
// to nothing, so no text from a URL is ever shown.

import { CONNECT_OUTCOMES, type ConnectOutcome } from '@/types/integrations';

export interface ConnectNotice {
  // 'ok' for the connected message, 'problem' for the rest. The words carry the meaning; the tone only picks the icon.
  tone: 'ok' | 'problem';
  text: string;
}

export const CONNECT_NOTICES: Record<Exclude<ConnectOutcome, 'signed_out'>, ConnectNotice> = {
  connected: { tone: 'ok', text: 'Google Calendar is connected.' },
  denied: { tone: 'problem', text: 'Google Calendar was not connected, because access was not allowed. You can try again any time.' },
  expired: { tone: 'problem', text: 'That sign-in took too long, so nothing was connected. Start again from the card below.' },
  bad_state: { tone: 'problem', text: 'That sign-in could not be checked, so nothing was connected. Start again from the card below.' },
  scope: { tone: 'problem', text: 'Google Calendar was not connected: it needs permission to read your calendar. Start again and leave that permission ticked.' },
  failed: { tone: 'problem', text: 'Google Calendar could not be connected. Nothing was saved. Try again shortly.' },
  not_configured: { tone: 'problem', text: "Google Calendar isn't set up on the server yet." },
};

// The notice for the `google` value in the address, or null when there is none or it is not one we know.
export function noticeFor(value: string | string[] | undefined): ConnectNotice | null {
  if (typeof value !== 'string') return null;
  if (!(CONNECT_OUTCOMES as readonly string[]).includes(value) || value === 'signed_out') return null;
  return CONNECT_NOTICES[value as keyof typeof CONNECT_NOTICES];
}
