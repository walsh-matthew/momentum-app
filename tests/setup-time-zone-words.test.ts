// MOM-178: the time zone card never shows the raw IANA id ("America/Denver"). It says the plain name the person knows the zone by, with the
// city ("Your phone is set to Mountain Time (Denver). Is that your time zone?"); when the platform has no plain name for a zone, just the
// city ("Your phone is set to Denver time. ..."); and when a zone has neither, no proposal at all, only "Which time zone are you in?" with
// the search. The zone Yes accepts travels beside the words (the proposal's one option), never in them.

import { describe, expect, it, vi } from 'vitest';

const names = vi.hoisted(() => ({ none: false }));
vi.mock('@/lib/setup/timeZones', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/setup/timeZones')>();
  // A zone the platform has no plain name for, on demand.
  return { ...real, plainZoneName: (zone: string) => (names.none ? null : real.plainZoneName(zone)) };
});

import { TIME_ZONE_ASK, answerTimeZone, timeZoneQuestion, zoneOfTurn } from '@/lib/setup/cards';
import { cardStep } from '@/lib/setup/cardTurns';
import { emptyDraft } from '@/lib/setup/draft';
import type { AssistantTurn, SetupSession, Transcript } from '@/types/setup';

const IANA = /\b[A-Z][A-Za-z]+\/[A-Za-z_]+\b/;

// A conversation that has just approved what counts, with no time zone yet.
function afterTargets(): { transcript: Transcript; draft: ReturnType<typeof emptyDraft> } {
  const draft = emptyDraft();
  const shown: AssistantTurn = {
    kind: 'playback',
    chunk: 'targets',
    skipped: null,
    say: '',
    question: null,
    detail: null,
    topic: null,
    options: [],
    draft,
  };
  return { transcript: [{ role: 'assistant', turn: shown }, { role: 'person', text: 'Yes, that is right.' }], draft };
}

describe('the time zone card says the zone in plain words', () => {
  it('with the plain name and the city', () => {
    names.none = false;
    expect(timeZoneQuestion('America/Denver')).toBe('Your phone is set to Mountain Time (Denver). Is that your time zone?');
    expect(timeZoneQuestion('America/Los_Angeles')).toBe('Your phone is set to Pacific Time (Los Angeles). Is that your time zone?');
    expect(timeZoneQuestion('Europe/London')).toMatch(/^Your phone is set to .+ \(London\)\. Is that your time zone\?$/);
  });

  it('with just the city when the platform has no plain name for the zone', () => {
    names.none = true;
    expect(timeZoneQuestion('America/Denver')).toBe('Your phone is set to Denver time. Is that your time zone?');
    expect(timeZoneQuestion('America/Argentina/Buenos_Aires')).toBe('Your phone is set to Buenos Aires time. Is that your time zone?');
    names.none = false;
  });

  it('never shows the IANA id, in any wording', () => {
    for (const none of [false, true]) {
      names.none = none;
      for (const zone of ['America/Denver', 'America/Argentina/Buenos_Aires', 'Asia/Kolkata', 'Europe/London']) {
        expect(timeZoneQuestion(zone), `${zone} (${none ? 'no plain name' : 'plain name'})`).not.toMatch(IANA);
      }
    }
    names.none = false;
  });

  it('has no proposal for a zone with neither a plain name nor a city, and asks plainly instead', () => {
    names.none = false;
    for (const zone of ['UTC', 'Etc/UTC', 'Etc/GMT+5']) {
      expect(timeZoneQuestion(zone), zone).toBeNull();
      const { transcript, draft } = afterTargets();
      const card = cardStep(transcript, draft, zone);
      expect(card?.kind).toBe('question');
      expect(card?.question).toBe(TIME_ZONE_ASK);
      expect(card?.options).toEqual([]);
    }
  });

  it('carries the zone Yes accepts beside the words, and only that zone is accepted', () => {
    names.none = false;
    const { transcript, draft } = afterTargets();
    const card = cardStep(transcript, draft, 'America/Denver');
    if (!card) throw new Error('no card');
    expect(card.question).toBe('Your phone is set to Mountain Time (Denver). Is that your time zone?');
    expect(card.question).not.toMatch(IANA);
    expect(card.options).toEqual(['America/Denver']);
    expect(zoneOfTurn(card)).toBe('America/Denver');
    const session: SetupSession = { transcript: [...transcript, { role: 'assistant', turn: card }], draft: card.draft, spentTokens: 0 };
    expect(answerTimeZone(session, 'America/Denver', 'accepted')?.draft.model.person.timeZone).toBe('America/Denver');
    expect(answerTimeZone(session, 'America/Chicago', 'accepted')).toBeNull();
    expect(answerTimeZone(session, 'America/Chicago', 'said')?.draft.model.person.timeZone).toBe('America/Chicago');
  });

  it('writes the city-only words too when there is no plain name', () => {
    names.none = true;
    const { transcript, draft } = afterTargets();
    const card = cardStep(transcript, draft, 'America/Denver');
    expect(card?.question).toBe('Your phone is set to Denver time. Is that your time zone?');
    expect(card?.options).toEqual(['America/Denver']);
    names.none = false;
  });
});
