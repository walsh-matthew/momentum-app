'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { CHANGE_PROMPT, KEEP_IT } from '@/lib/setup/session';
import { AnswerBox } from './AnswerBox';
import { CARD_TEXT, CardLead } from './cardText';
import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';

interface FinalCardProps {
  // The few lines confirming the whole, written by code (renderFinal in lib/setup/playback.ts).
  lines: string[];
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onChange: (text: string) => void;
}

// The last confirmation. Nothing has been saved until the person taps Save; every part was already approved on its own.
// "Keep it as it is" only closes the change box: saving still takes its own tap.
export function FinalCard({ lines, saving, error, onSave, onChange }: FinalCardProps) {
  const [changing, setChanging] = useState(false);

  return (
    <section aria-labelledby="setup-final" className="channel-card space-y-4 p-4">
      {/* A save that did not go through leads the card instead (round 3c, finding 1). */}
      <CardLead id="setup-final" leads={error === null}>
        Ready to save?
      </CardLead>
      <ul className={`space-y-2 ${CARD_TEXT.body}`}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
      <p className={CARD_TEXT.note}>Nothing is saved until you tap Save.</p>
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
            {saving ? 'Saving…' : 'Save my setup'}
          </SetupButton>
          <SetupButton tone="second" disabled={saving} onClick={() => flushSync(() => setChanging(true))}>
            Change something
          </SetupButton>
        </div>
      )}
    </section>
  );
}
