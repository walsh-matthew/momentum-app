import { casualDateLabel, dateInZone } from '@/lib/dates/casual';
import type { LoggedEntry } from '@/types/entries';

// An instant as the person's own wall clock, in their own time zone ("Today, 8:15 AM PDT", "Tue, Oct 27, 8:15 AM PDT"). The
// day goes through the app's one date formatter (lib/dates/casual.ts, MOM-111 finding 7). With no zone set there is no wall
// clock to show, and none is assumed. `today` is the person's own date.
export function formatEntryTime(instant: string, timeZone: string | null, today: string | null = null): string {
  if (timeZone === null) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  const day = dateInZone(timeZone, date);
  if (day === null) return '';
  const clock = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date);
  return `${casualDateLabel(day, today, { weekday: 'short' })}, ${clock}`;
}

// A day the person chose ("Yesterday", "Tue, Oct 27"). The entry's stored time on that day is a stand-in, so only the day
// is shown. The date is read as a calendar date, so no time zone moves it.
export function formatChosenDay(date: string, today: string | null = null): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) return '';
  return casualDateLabel(date, today, { weekday: 'short' });
}

// What one entry added, in the person's terms: "+1", "12 km", "25 min", or the step that was ticked.
export function describeEntry(entry: LoggedEntry): string {
  switch (entry.measure) {
    case 'count':
      return entry.value === 1 ? '+1' : `+${entry.value}`;
    case 'quantity':
      return `${entry.value}${entry.unit ? ` ${entry.unit}` : ''}`;
    case 'time':
      return `${entry.value} min`;
    case 'checklist':
      return entry.detail ? `Ticked: ${entry.detail}` : 'Ticked a step';
  }
}

// A running timer's clock: m:ss, or h:mm:ss from an hour.
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
