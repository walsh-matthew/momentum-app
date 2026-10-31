'use client';

import { useState } from 'react';
import { QUICK_PATH_WORDS, quickPathNext } from '@/lib/setup/quickPath';
import type { FillInItem, PlaybackSection, QuickPathReason } from '@/types/setupScreen';
import { CARD_TEXT, CardLead } from './cardText';
import { PlaybackLines } from './PlaybackLines';
import { QuickPathFillIn, type FillHow } from './QuickPathFillIn';
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
  // What of the missing items can be set on the card (MOM-111), the device's time zone to suggest, and the setting of one. Without
  // items the card is the plain list it was.
  items?: FillInItem[];
  deviceZone?: string | null;
  today?: string | null;
  filling?: boolean;
  fillError?: string | null;
  onFill?: (item: FillInItem, value: string, how: FillHow) => void;
}

const SAVE_OFF_NOTE_ID = 'quick-path-save-off';

// What the person sees when setup stops using Claude (the budget, the shared limit, or a limit that could not be checked): what
// happened, what they have told us, what is still missing, what to do next, and the buttons (MOM-111; DOMAIN_MODEL §2.3). The
// quick path saves what was said when it is complete, on their tap, as their approval of every part shown. It applies no
// default: when something is missing it says so, says why that blocks saving, and says the way forward before any button. Start
// again clears everything, so it asks first, as the rest of setup does.
export function QuickPathCard({
  reason,
  message,
  sections,
  missing,
  canSave,
  saving,
  error,
  onSave,
  onStartOver,
  items = [],
  deviceZone = null,
  today = null,
  filling = false,
  fillError = null,
  onFill,
}: QuickPathCardProps) {
  const [confirming, setConfirming] = useState(false);
  const complete = missing.length === 0;
  // A missing line with a control is set on the card; the rest (a goal or a thing to count to add) only Claude could ask for.
  const fillable = onFill ? items : [];
  const stuck = missing.filter((line) => !fillable.some((item) => item.line === line));
  const locked = saving || filling;
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
        <div className="space-y-3">
          <h3 className={CARD_TEXT.note}>Still needed before this can be saved</h3>
          {stuck.length > 0 && <PlaybackLines lines={stuck} />}
          {onFill &&
            fillable.map((item) => <QuickPathFillIn key={item.id} item={item} disabled={locked} deviceZone={deviceZone} today={today} onFill={onFill} />)}
          {fillable.length > 0 && <p className={CARD_TEXT.note}>{QUICK_PATH_WORDS.fillStays}</p>}
          {fillError && <SetupAlert headline={fillError} />}
        </div>
      )}
      <p className={CARD_TEXT.body}>{quickPathNext(reason, complete, fillable.length > 0 && stuck.length === 0)}</p>
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
            <SetupButton tone="main" disabled={!canSave || locked} aria-describedby={canSave ? undefined : SAVE_OFF_NOTE_ID} onClick={onSave}>
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
