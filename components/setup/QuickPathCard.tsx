'use client';

import { useState } from 'react';
import { QUICK_PATH_WORDS, quickPathNext } from '@/lib/setup/quickPath';
import type { PlaybackSection, QuickPathReason } from '@/types/setupScreen';
import { CARD_TEXT, CardLead } from './cardText';
import { PlaybackLines } from './PlaybackLines';
import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';

interface QuickPathCardProps {
  // Why Claude is no longer used.
  reason: QuickPathReason;
  // What happened, in one plain sentence for that reason (written on the server, by the setup budget).
  message: string;
  // Every part collected so far, written by code from the validated draft.
  sections: PlaybackSection[];
  // What the draft still lacks before it can be saved, in plain words. Empty when it can be saved.
  missing: string[];
  canSave: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onStartOver: () => void;
}

const SAVE_OFF_NOTE_ID = 'quick-path-save-off';

// What the person sees when setup stops using Claude (the budget, the shared limit, or a limit that could not be checked): what
// happened, what they have told us, what is still missing, what to do next, and the buttons (MOM-111; DOMAIN_MODEL §2.3). The
// quick path saves what was said when it is complete, on their tap, as their approval of every part shown. It applies no
// default: when something is missing it says so, says why that blocks saving, and says the way forward before any button. Start
// again clears everything, so it asks first, as the rest of setup does.
export function QuickPathCard({ reason, message, sections, missing, canSave, saving, error, onSave, onStartOver }: QuickPathCardProps) {
  const [confirming, setConfirming] = useState(false);
  const complete = missing.length === 0;
  return (
    <section aria-labelledby="setup-quick-path" className="channel-card space-y-4 p-4">
      <CardLead id="setup-quick-path" leads={error === null}>
        {complete ? QUICK_PATH_WORDS.readyTitle : QUICK_PATH_WORDS.missingTitle}
      </CardLead>
      <p className={CARD_TEXT.body}>{message}</p>
      <p className={CARD_TEXT.body}>{QUICK_PATH_WORDS.intro}</p>
      {/* Section labels are muted notes: the card's title is its one bold line (round 3c, finding 1). */}
      {sections.map((section) => (
        <div key={section.chunk} className="space-y-1">
          <h3 className={CARD_TEXT.note}>{section.title}</h3>
          <PlaybackLines lines={section.lines} />
        </div>
      ))}
      {!complete && (
        <div className="space-y-1">
          <h3 className={CARD_TEXT.note}>Still needed before this can be saved</h3>
          <PlaybackLines lines={missing} />
        </div>
      )}
      <p className={CARD_TEXT.body}>{quickPathNext(reason, complete)}</p>
      {error && <SetupAlert headline={error} />}
      {confirming ? (
        <div className="space-y-2">
          <p className={CARD_TEXT.body}>{QUICK_PATH_WORDS.confirmStartOver}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SetupButton tone="second" disabled={saving} onClick={onStartOver}>
              {QUICK_PATH_WORDS.confirmYes}
            </SetupButton>
            <SetupButton tone="main" onClick={() => setConfirming(false)}>
              {QUICK_PATH_WORDS.confirmNo}
            </SetupButton>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!canSave && (
            <p id={SAVE_OFF_NOTE_ID} className={CARD_TEXT.note}>
              {QUICK_PATH_WORDS.saveOff}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <SetupButton tone="main" disabled={!canSave || saving} aria-describedby={canSave ? undefined : SAVE_OFF_NOTE_ID} onClick={onSave}>
              {saving ? 'Saving…' : 'Save what I have'}
            </SetupButton>
            <SetupButton tone="second" disabled={saving} onClick={() => setConfirming(true)}>
              Start again
            </SetupButton>
          </div>
        </div>
      )}
    </section>
  );
}
