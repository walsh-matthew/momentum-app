'use client';

import { useState } from 'react';
import { TIME_ZONE_ASK, TIME_ZONE_OTHER, TIME_ZONE_YES } from '@/lib/setup/cards';
import { AnswerChoice } from './AnswerChoice';
import { CardLead } from './cardText';
import { TimeZonePicker } from './TimeZonePicker';

interface TimeZoneCardProps {
  // The question code wrote: "Your phone is set to America/Chicago (Chicago). Is that your time zone?" when the phone reports a zone,
  // otherwise "Which time zone are you in?".
  question: string;
  // The zone the phone reports and the question shows, or null when it reports none.
  deviceZone: string | null;
  busy: boolean;
  // `how` is 'accepted' for a yes to the zone shown, and 'said' for one picked from the list.
  onPick: (zone: string, how: 'said' | 'accepted') => void;
}

// The time zone, asked once (MOM-178): "Your phone is set to <zone> (<city>). Is that your time zone?" with Yes and A different one. Yes
// is recorded only on the tap, as the person's accepted answer; "A different one" opens the time zone search, and a pick is theirs.
// With no zone from the phone, only the search shows. Written by code: no Claude call.
export function TimeZoneCard({ question, deviceZone, busy, onPick }: TimeZoneCardProps) {
  const [searching, setSearching] = useState(deviceZone === null);
  return (
    <section aria-labelledby="setup-question" className="channel-card min-w-0 space-y-4 p-4" data-card="time-zone">
      <CardLead id="setup-question">{deviceZone === null ? TIME_ZONE_ASK : question}</CardLead>
      {deviceZone !== null && !searching && (
        <div className="space-y-2">
          <AnswerChoice tone="main" disabled={busy} onClick={() => onPick(deviceZone, 'accepted')}>
            {TIME_ZONE_YES}
          </AnswerChoice>
          <AnswerChoice disabled={busy} onClick={() => setSearching(true)}>
            {TIME_ZONE_OTHER}
          </AnswerChoice>
        </div>
      )}
      {searching && <TimeZonePicker deviceZone={null} answer={null} disabled={busy} onPick={(zone) => onPick(zone, 'said')} />}
    </section>
  );
}
