'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AnswerBox } from './AnswerBox';

interface FinalCardProps {
  // The few lines confirming the whole, written by code (renderFinal in lib/setup/playback.ts).
  lines: string[];
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onChange: (text: string) => void;
}

// The last confirmation. Nothing has been saved until the person taps Save; every part was already approved on its own.
export function FinalCard({ lines, saving, error, onSave, onChange }: FinalCardProps) {
  const [changing, setChanging] = useState(false);

  return (
    <section aria-labelledby="setup-final" className="channel-card space-y-4 p-4">
      <h2 id="setup-final" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
        Ready to save?
      </h2>
      <ul className="space-y-2 text-base">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
      <p className="text-sm text-muted">Nothing is saved until you tap Save.</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {changing ? (
        <AnswerBox label="What should change?" submitLabel="Send the change" busy={saving} onSubmit={onChange} />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" disabled={saving} onClick={onSave} className="w-full sm:w-auto">
            {saving ? 'Saving…' : 'Save my setup'}
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => setChanging(true)} className="w-full sm:w-auto">
            Change something
          </Button>
        </div>
      )}
    </section>
  );
}
