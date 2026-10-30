'use client';

import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';
import type { PlaybackSection } from '@/types/setupScreen';

interface QuickPathCardProps {
  // Why Claude is no longer used, in plain words (written by the setup budget on the server).
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

// What the person sees when setup stops using Claude (the budget, the shared limit, or a limit that could not be checked):
// the message, what they have told us, what is still missing, and a way to save what they have. Saving is their approval of
// every part shown here; nothing is saved without that tap, and an incomplete setup cannot be saved.
export function QuickPathCard({ message, sections, missing, canSave, saving, error, onSave, onStartOver }: QuickPathCardProps) {
  return (
    <section aria-labelledby="setup-quick-path" className="channel-card space-y-4 p-4">
      <h2 id="setup-quick-path" className="text-lg font-semibold leading-snug tracking-[-0.02em]">
        Finish without more questions
      </h2>
      <p className="text-base">{message}</p>
      {sections.map((section) => (
        <div key={section.chunk} className="space-y-1">
          <h3 className="section-title">{section.title}</h3>
          <ul className="space-y-1 text-base">
            {section.lines.map((line, index) => (
              <li key={`${index}-${line}`} className="whitespace-pre-wrap">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {missing.length > 0 && (
        <div className="space-y-1">
          <h3 className="section-title">Still needed before this can be saved</h3>
          <ul className="ml-5 list-disc space-y-1 text-base">
            {missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <SetupAlert headline={error} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <SetupButton tone="main" disabled={!canSave || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save what I have'}
        </SetupButton>
        <SetupButton tone="second" disabled={saving} onClick={onStartOver}>
          Start again
        </SetupButton>
      </div>
    </section>
  );
}
