// Which app the person means when they answer "Where do you track this now?" (MOM-111 round 2). Voice-to-text writes Hevy as
// "Heavy", and the model, seeing an app it did not know, wrote a source the schema refused. Code reads the answer for the
// apps Momentum can read, by the names people say (lib/integrations/catalog.ts spokenNames), and for well-known apps it
// cannot read yet, and gives Claude a note: which app they mean, and that an app it cannot read is logged by hand for now,
// said in one line (DOMAIN_MODEL §1.5, owner decision D4 of 2026-10-29: only that line, no bridge app, no request button).
// Only that question is read: elsewhere "heavy" is just a word. Pure.

import { INTEGRATION_CATALOG } from '@/lib/integrations/catalog';
import type { Transcript } from '@/types/setup';
import { latestAnswer } from './said';

// Apps people often track with that Momentum cannot read yet, by name and the ways people say them.
export const UNREADABLE_APPS: readonly { name: string; spoken: readonly string[] }[] = [
  { name: 'Apple Watch', spoken: ['apple watch', 'my watch', 'iwatch'] },
  { name: 'Apple Health', spoken: ['apple health', 'health app'] },
  { name: 'Apple Fitness', spoken: ['apple fitness', 'fitness app'] },
  { name: 'Strava', spoken: ['strava'] },
  { name: 'Fitbit', spoken: ['fitbit'] },
  { name: 'Garmin', spoken: ['garmin'] },
  { name: 'Oura', spoken: ['oura'] },
  { name: 'Whoop', spoken: ['whoop'] },
  { name: 'Peloton', spoken: ['peloton'] },
  { name: 'MyFitnessPal', spoken: ['myfitnesspal', 'my fitness pal'] },
  { name: 'Nike Run Club', spoken: ['nike run club', 'nike app'] },
  { name: 'Google Fit', spoken: ['google fit'] },
  { name: 'Samsung Health', spoken: ['samsung health'] },
  { name: 'Strong', spoken: ['strong app'] },
  { name: 'a spreadsheet', spoken: ['spreadsheet', 'excel', 'google sheet', 'google sheets', 'my sheet', 'a sheet'] },
  { name: 'a notes app', spoken: ['notes app', 'my notes'] },
];

export interface AppsHeard {
  // Apps Momentum can read, with the words the person used for each.
  readable: { provider: string; name: string; heard: string }[];
  // Apps it cannot read yet, by name.
  unreadable: string[];
}

const said = (text: string, phrase: string): string | null => {
  const m = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').exec(text);
  return m ? m[0] : null;
};

// The apps named in one answer.
export function appsIn(text: string): AppsHeard {
  const readable: AppsHeard['readable'] = [];
  for (const entry of INTEGRATION_CATALOG) {
    for (const phrase of entry.spokenNames) {
      const heard = said(text, phrase);
      if (heard) {
        readable.push({ provider: entry.provider, name: entry.name, heard });
        break;
      }
    }
  }
  const unreadable = UNREADABLE_APPS.filter((app) => app.spoken.some((phrase) => said(text, phrase) !== null)).map((app) => app.name);
  return { readable, unreadable };
}

// The note for Claude when the person's newest message answers the source question and names an app. Undefined otherwise.
export function sourceNote(transcript: Transcript): string | undefined {
  const answer = latestAnswer(transcript);
  if (!answer || answer.answers?.topic !== 'source') return undefined;
  const { readable, unreadable } = appsIn(answer.text);
  if (readable.length === 0 && unreadable.length === 0) return undefined;
  const lines: string[] = ['Source note from code, about the person\'s newest message:'];
  for (const app of readable) {
    const exact = app.heard.toLowerCase() === app.name.toLowerCase();
    lines.push(
      exact
        ? `- "${app.heard}" is the app ${app.name}: a source { "kind": "synced", "provider": "${app.provider}" }.`
        : `- "${app.heard}" means the app ${app.name} (voice-to-text spells it that way): a source { "kind": "synced", "provider": "${app.provider}" }. Call it ${app.name}.`,
    );
  }
  if (unreadable.length > 0) {
    lines.push(
      `- ${unreadable.join(', ')} ${unreadable.length === 1 ? 'is an app' : 'are apps'} Momentum cannot read yet: what they track there is { "kind": "manual" }, logged by the person for now. Say so in one short line in "say" (for example "${unreadable[0]} can't be read yet, so you'll log those yourself for now."), and offer nothing else.`,
    );
  }
  lines.push('- One target may have one source for each way it is tracked; add no label of which activity each covers, and leave the targets as they are.');
  return lines.join('\n');
}
