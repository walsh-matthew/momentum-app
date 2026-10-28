import type { LoggedEntry } from '@/types/entries';

// An instant as the person's own wall clock, in their own time zone ("Tue, Oct 27, 8:15 AM PDT"). With no zone
// set there is no wall clock to show, and none is assumed.
export function formatEntryTime(instant: string, timeZone: string | null): string {
  if (timeZone === null) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

// A day the person chose ("Tue, Oct 27"). The entry's stored time on that day is a stand-in, so only the day is shown.
// The date is read as a calendar date, so no time zone moves it.
export function formatChosenDay(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(day);
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
