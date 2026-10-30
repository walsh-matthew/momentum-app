'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { CHUNK_TITLES } from '@/lib/setup/quickPath';
import { APPROVE_TEXT, CHANGE_PROMPT, KEEP_IT } from '@/lib/setup/session';
import type { SetupChunk } from '@/types/setup';
import { AnswerBox } from './AnswerBox';
import { CARD_TEXT, CardLead } from './cardText';
import { SetupButton } from './SetupButton';

interface PlaybackCardProps {
  chunk: SetupChunk;
  // Written by code from the validated draft (lib/setup/playback.ts), never by Claude.
  lines: string[];
  busy: boolean;
  onApprove: (text: string) => void;
  onChange: (text: string) => void;
}

// One part of the setup, played back for the person to approve before the next begins (docs/DOMAIN_MODEL.md §2.1 rule 7).
// Approving sends their "yes"; changing sends what they type, and the part is played back again from the newest draft.
// Once the change box is open, "Keep it as it is" is the way out: it approves the part as shown, in one tap (MOM-111).
export function PlaybackCard({ chunk, lines, busy, onApprove, onChange }: PlaybackCardProps) {
  const [changing, setChanging] = useState(false);

  return (
    <section aria-labelledby="setup-playback" className="channel-card space-y-4 p-4">
      <CardLead id="setup-playback">{CHUNK_TITLES[chunk]}: did I get this right?</CardLead>
      <ul className={`space-y-2 ${CARD_TEXT.body}`}>
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="whitespace-pre-wrap">
            {line}
          </li>
        ))}
      </ul>
      {changing ? (
        <div className="space-y-2">
          <p className={CARD_TEXT.body}>{CHANGE_PROMPT}</p>
          <AnswerBox
            label={CHANGE_PROMPT}
            submitLabel="Send the change"
            busy={busy}
            onSubmit={onChange}
            focusOnOpen
            secondary={{ label: KEEP_IT, onClick: () => onApprove(APPROVE_TEXT) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <SetupButton tone="main" disabled={busy} onClick={() => onApprove(APPROVE_TEXT)}>
            {busy ? 'Thinking…' : 'Yes, that is right'}
          </SetupButton>
          <SetupButton tone="second" disabled={busy} onClick={() => flushSync(() => setChanging(true))}>
            Change something
          </SetupButton>
        </div>
      )}
    </section>
  );
}
