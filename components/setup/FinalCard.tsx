'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { CHANGE_PROMPT, KEEP_IT } from '@/lib/setup/session';
import { AnswerBox } from './AnswerBox';
import { CARD_TEXT, CardLead } from './cardText';
import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';

// The words on the card that change between a first setup and an addition to one (MOM-132 part 2).
export interface FinalCardWords {
  heading: string;
  // Small lines under the recap, each on its own line.
  notes: string[];
  save: string;
  saving: string;
  change: string;
}

// A first setup's words: what the card has always said.
export const FIRST_SETUP_WORDS: FinalCardWords = {
  heading: 'Ready to save?',
  notes: ['Nothing is saved until you tap Save.'],
  save: 'Save my setup',
  saving: 'Saving…',
  change: 'Change something',
};

interface FinalCardProps {
  // The few lines confirming the whole, written by code (renderFinal in lib/setup/playback.ts).
  lines: string[];
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onChange: (text: string) => void;
  // Left out for a first setup.
  words?: FinalCardWords;
}

// The last confirmation. Nothing has been saved until the person taps Save; every part was already approved on its own.
// "Keep it as it is" only closes the change box: saving still takes its own tap.
export function FinalCard({ lines, saving, error, onSave, onChange, words = FIRST_SETUP_WORDS }: FinalCardProps) {
  const [changing, setChanging] = useState(false);

  return (
    <section aria-labelledby="setup-final" className="channel-card space-y-4 p-4">
      {/* A save that did not go through leads the card instead (round 3c, finding 1). */}
      <CardLead id="setup-final" leads={error === null}>
        {words.heading}
      </CardLead>
      <ul className={`space-y-2 ${CARD_TEXT.body}`}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
      {words.notes.map((note) => (
        <p key={note} className={CARD_TEXT.note}>
          {note}
        </p>
      ))}
      {error && <SetupAlert headline={error} />}
      {changing ? (
        <div className="space-y-2">
          <p className={CARD_TEXT.body}>{CHANGE_PROMPT}</p>
          <AnswerBox
            label={CHANGE_PROMPT}
            submitLabel="Send the change"
            busy={saving}
            onSubmit={onChange}
            focusOnOpen
            secondary={{ label: KEEP_IT, onClick: () => setChanging(false) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SetupButton tone="main" busy={saving} onClick={onSave}>
            {saving ? words.saving : words.save}
          </SetupButton>
          <SetupButton tone="second" disabled={saving} onClick={() => flushSync(() => setChanging(true))}>
            {words.change}
          </SetupButton>
        </div>
      )}
    </section>
  );
}
