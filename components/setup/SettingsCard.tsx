'use client';

import { useState } from 'react';
import { SETTINGS_HEADING, SETTINGS_NEXT, SETTINGS_SKIP_LINE, settingsRowsLeft, type SettingsAnswers, type SettingsRow } from '@/lib/setup/cards';
import { explanationFor } from '@/lib/setup/explain';
import type { SetupSettings } from '@/types/setup';
import { AnswerChoice } from './AnswerChoice';
import { CARD_TEXT, CardLead } from './cardText';
import { HelpLink } from './HelpLink';
import { SetupButton } from './SetupButton';

interface SettingsCardProps {
  // The settings the draft holds now: a row the person already answered is not asked again.
  settings: SetupSettings;
  // Nothing can be tapped while the setup is being saved or a reply is on its way.
  busy: boolean;
  onDone: (answers: SettingsAnswers) => void;
}

// "How should Momentum talk to you?" (MOM-178): one card written by code, one row for each setting something reads, with its choices as
// buttons and a plain reason under each question. Nothing is pre-selected, a row left alone stays unset, and "Next" is always there and
// never dimmed. A tap on the chosen answer again takes it back. No Claude call is made for this card.
export function SettingsCard({ settings, busy, onDone }: SettingsCardProps) {
  const rows: SettingsRow[] = settingsRowsLeft(settings);
  const [chosen, setChosen] = useState<SettingsAnswers>({});
  const pick = (row: SettingsRow, value: string) =>
    setChosen((now) => {
      const next = { ...now };
      if (next[row.topic] === value) delete next[row.topic];
      else next[row.topic] = value;
      return next;
    });

  return (
    <section aria-labelledby="setup-question" className="channel-card min-w-0 space-y-4 p-4" data-card="settings">
      <div className="space-y-1">
        <CardLead id="setup-question">{SETTINGS_HEADING}</CardLead>
        <p className={CARD_TEXT.secondary}>{SETTINGS_SKIP_LINE}</p>
      </div>
      {rows.map((row) => (
        <fieldset key={row.topic} className="min-w-0 space-y-2">
          <legend className={`${CARD_TEXT.body} mb-1`}>{row.question}</legend>
          <p className={CARD_TEXT.note}>{row.reason}</p>
          <HelpLink disabled={busy} explain={explanationFor(row.topic)?.text ?? null} />
          <div className="flex flex-col gap-2">
            {row.choices.map((choice) => (
              <AnswerChoice key={choice.value} disabled={busy} selected={chosen[row.topic] === choice.value} onClick={() => pick(row, choice.value)}>
                {choice.label}
              </AnswerChoice>
            ))}
          </div>
        </fieldset>
      ))}
      <SetupButton tone="main" busy={busy} onClick={() => onDone(chosen)}>
        {SETTINGS_NEXT}
      </SetupButton>
    </section>
  );
}
