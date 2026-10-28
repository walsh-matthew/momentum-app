'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CHUNK_TITLES } from '@/lib/setup/quickPath';
import { APPROVE_TEXT } from '@/lib/setup/session';
import type { SetupChunk } from '@/types/setup';
import { AnswerBox } from './AnswerBox';

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
export function PlaybackCard({ chunk, lines, busy, onApprove, onChange }: PlaybackCardProps) {
  const [changing, setChanging] = useState(false);

  return (
    <section aria-labelledby="setup-playback" className="channel-card space-y-4 p-4">
      <h2 id="setup-playback" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
        {CHUNK_TITLES[chunk]}: is this right?
      </h2>
      <ul className="space-y-2 text-base">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="whitespace-pre-wrap">
            {line}
          </li>
        ))}
      </ul>
      {changing ? (
        <AnswerBox label="What should change?" submitLabel="Send the change" busy={busy} onSubmit={onChange} />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" disabled={busy} onClick={() => onApprove(APPROVE_TEXT)} className="w-full sm:w-auto">
            {busy ? 'Thinking…' : 'Yes, that is right'}
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => setChanging(true)} className="w-full sm:w-auto">
            Change something
          </Button>
        </div>
      )}
    </section>
  );
}
