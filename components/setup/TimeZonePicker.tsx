'use client';

import { useMemo, useState } from 'react';
import { QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import { zoneCity, zoneWords } from '@/lib/setup/timeZones';
import { AnswerChoice } from './AnswerChoice';

interface TimeZonePickerProps {
  // The zone this device reports, shown as the one suggestion. Null when it reports none.
  deviceZone: string | null;
  // The zone already answered, shown as chosen.
  answer: string | null;
  disabled: boolean;
  // `how` is 'accepted' for the device's zone, which the person tapped as a suggestion, and 'said' for one they picked.
  onPick: (zone: string, how: 'said' | 'accepted') => void;
}

// Every time zone name the browser knows, or none when it cannot list them (then only the device's zone is offered).
export function allTimeZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    return list ? list('timeZone') : [];
  } catch {
    return [];
  }
}

const MAX_SHOWN = 8;
const plain = (text: string): string => text.toLowerCase().replaceAll('_', ' ').replaceAll('/', ' ');

// The time zone control (MOM-111 quick path): the device's zone as a suggestion the person taps, in plain words ("Los Angeles
// time"), and a searchable list of every zone, by its city with the IANA name as small secondary text, so a typo cannot be saved.
// A name is only ever picked from the list; nothing is chosen for the person.
export function TimeZonePicker({ deviceZone, answer, disabled, onPick }: TimeZonePickerProps) {
  const zones = useMemo(allTimeZones, []);
  const [query, setQuery] = useState('');
  const words = plain(query).split(/\s+/).filter((w) => w !== '');
  const matches = words.length === 0 ? [] : zones.filter((z) => words.every((w) => plain(z).includes(w)));

  return (
    <div className="min-w-0 space-y-2">
      {answer && !matches.length && <p className="text-sm text-muted">Selected: {zoneWords(answer)}</p>}
      {deviceZone && (
        <AnswerChoice disabled={disabled} selected={answer === deviceZone} onClick={() => onPick(deviceZone, 'accepted')}>
          {QUICK_PATH_WORDS.useDeviceZone(zoneWords(deviceZone))}
        </AnswerChoice>
      )}
      {zones.length > 0 && (
        <>
          <input
            type="search"
            aria-label={QUICK_PATH_WORDS.searchZones}
            placeholder={QUICK_PATH_WORDS.searchZones}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
            className="block min-h-12 w-full min-w-0 rounded-2xl border ctl-30 field-input px-4 text-base text-foreground placeholder:text-muted focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
          {words.length > 0 && matches.length === 0 && <p className="text-sm text-muted">{QUICK_PATH_WORDS.noZones}</p>}
          {matches.length > 0 && (
            <ul aria-label="Matching time zones" className="space-y-2">
              {matches.slice(0, MAX_SHOWN).map((zone) => (
                <li key={zone}>
                  <AnswerChoice disabled={disabled} selected={answer === zone} onClick={() => onPick(zone, 'said')}>
                    <span className="min-w-0">
                      <span className="block">{zoneCity(zone) ?? zone}</span>
                      {zoneCity(zone) && <span className={answer === zone ? 'block text-sm' : 'block text-sm text-muted'}>{zone}</span>}
                    </span>
                  </AnswerChoice>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
