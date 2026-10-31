'use client';

import { useState } from 'react';
import { quickPathReason, QUICK_PATH_WORDS } from '@/lib/setup/quickPath';
import type { FillInItem, QuickPathReason, QuickPathState, QuickStep, RecapSection } from '@/types/setupScreen';
import { CARD_TEXT, CardLead } from './cardText';
import { NeedsAnswer } from './NeedsAnswer';
import { PlaybackLines } from './PlaybackLines';
import { QuickPathFillIn, type FillHow } from './QuickPathFillIn';
import { SetupAlert } from './SetupAlert';
import { SetupButton } from './SetupButton';
import { useIsWide } from './useIsWide';

interface QuickPathCardProps {
  // Why Claude is no longer used. It decides the one line that says so, shown while questions are left.
  reason: QuickPathReason;
  // What the person has said, one part at a time, written by code from the validated draft.
  sections: RecapSection[];
  // The steps of questions, answered and not.
  steps: QuickStep[];
  // What is missing and no control can supply (a goal to add). The setup has to start again.
  stuck: string[];
  saving: boolean;
  // A save that did not go through.
  error: string | null;
  // An answer that was refused, or never got there.
  fillError: string | null;
  // An answer is being set.
  filling: boolean;
  // The device's time zone and date, offered as the only two suggestions.
  deviceZone: string | null;
  today: string | null;
  // Sets one answer; gives the card's new state, or null when it was refused.
  onFill: (item: FillInItem, value: string, how: FillHow) => Promise<QuickPathState | null>;
  onSave: () => void;
  onStartOver: () => void;
}

const isOpen = (step: QuickStep): boolean => step.items.some((item) => !item.answered);
const linesOf = (sections: RecapSection[], step: QuickStep): string[] =>
  sections.find((s) => s.id === step.sectionId)?.lines.filter((l) => l.stepId === step.id).map((l) => l.text) ?? [];

// A line that starts with the goal's name, under a heading that is that name, would say it twice: the line starts at what it says of it.
const withoutName = (text: string, name: string): string => (text.startsWith(`${name} `) ? text.charAt(name.length + 1).toUpperCase() + text.slice(name.length + 2) : text);

const LINK = 'text-sm text-muted underline underline-offset-4 hover:text-foreground disabled:opacity-50';

// What the person sees when setup stops using Claude (MOM-111, DOMAIN_MODEL §2.3): what they have said, and the few plain questions
// that finish it, each answered in place. It applies no default: a question is a question until they answer it. On a phone one
// step shows at a time ("1 of 3", with Back), with the step before it as one small line above; a wide screen shows every step in
// one list. The last step's button is "Save my setup"; there is never a dimmed button, because a button that cannot be used is
// not shown. Start again is a small link that asks first. The reason shows once, only while questions are left.
export function QuickPathCard({ reason, sections, steps, stuck, saving, error, fillError, filling, deviceZone, today, onFill, onSave, onStartOver }: QuickPathCardProps) {
  const wide = useIsWide();
  const [view, setView] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const remaining = steps.filter(isOpen).length;
  const canSave = remaining === 0 && stuck.length === 0;
  const firstOpen = steps.findIndex(isOpen);
  const stepped = !wide && steps.length > 0 && (view !== null || firstOpen !== -1);
  const at = stepped ? Math.min(view ?? firstOpen, steps.length - 1) : -1;
  const locked = saving || filling;

  const top = canSave ? QUICK_PATH_WORDS.readyTop : remaining > 0 ? QUICK_PATH_WORDS.topLine(remaining) : QUICK_PATH_WORDS.stuckTop;

  // Sets one answer, then moves the card on: a step with one answer moves to the next once it is answered (unless it is the last);
  // any other stays put, and shows its Next button when all of it is answered.
  const answer = async (step: QuickStep, item: FillInItem, value: string, how: FillHow): Promise<void> => {
    const state = await onFill(item, value, how);
    if (!state) return;
    const index = state.steps.findIndex((s) => s.id === step.id);
    if (index === -1) return;
    const done = !isOpen(state.steps[index]);
    const last = index === state.steps.length - 1;
    setView(done && step.items.length === 1 && !last ? index + 1 : index);
  };

  const controls = (step: QuickStep, item: FillInItem, boxButton: string | null) => (
    <NeedsAnswer key={item.id} id={item.id} question={item.line} hint={item.hint} answered={item.answered}>
      <QuickPathFillIn item={item} disabled={locked} deviceZone={deviceZone} today={today} boxButton={boxButton} onFill={(i, value, how) => void answer(step, i, value, how)} />
    </NeedsAnswer>
  );

  const stuckNotes = stuck.map((line) => (
    <NeedsAnswer key={line} id={`stuck-${line}`} question={line} label={QUICK_PATH_WORDS.cantAnswerHere}>
      <p className={CARD_TEXT.note}>{QUICK_PATH_WORDS.stuckHelp}</p>
    </NeedsAnswer>
  ));

  let body;
  if (stepped) {
    const step = steps[at];
    const last = at === steps.length - 1;
    const done = !isOpen(step);
    // What was said about this step is shown until the person answers one of its questions; after that the answers are the callouts
    // below, and the same words are not said twice.
    const lines = step.items.some((i) => i.answered) ? [] : linesOf(sections, step);
    const before = at > 0 ? linesOf(sections, steps[at - 1]).join(' ') : '';
    // A box on a step with a single answer is that step's own button, so "Next" sits right under it.
    const boxButton = step.items.length === 1 && !last ? QUICK_PATH_WORDS.next : null;
    body = (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className={CARD_TEXT.note}>{QUICK_PATH_WORDS.stepOf(at + 1, steps.length)}</p>
          {at > 0 && (
            <button type="button" disabled={locked} onClick={() => setView(at - 1)} className={LINK}>
              {QUICK_PATH_WORDS.back}
            </button>
          )}
        </div>
        {before && <p className={CARD_TEXT.note}>{`✓ ${before}`}</p>}
        <h3 className={CARD_TEXT.body}>{step.title}</h3>
        {lines.length > 0 && <PlaybackLines lines={lines} />}
        {step.items.map((item) => controls(step, item, boxButton))}
        {stuckNotes}
        {done && stuck.length === 0 && (
          <SetupButton tone="main" disabled={locked} onClick={last ? onSave : () => setView(at + 1)}>
            {last ? (saving ? 'Saving…' : QUICK_PATH_WORDS.save) : QUICK_PATH_WORDS.next}
          </SetupButton>
        )}
      </div>
    );
  } else {
    // Every part in one list: what was said, and each open question right after what it is about.
    body = (
      <div className="space-y-4">
        {canSave && steps.length > 0 && !wide && (
          // Everything is answered and the person has not stepped through it: a way back to the last step, to change an answer.
          <div className="flex justify-end">
            <button type="button" disabled={locked} onClick={() => setView(steps.length - 1)} className={LINK}>
              {QUICK_PATH_WORDS.back}
            </button>
          </div>
        )}
        {sections.map((section) => (
          <div key={section.id} className="space-y-3">
            <h3 className={CARD_TEXT.body}>{section.title}</h3>
            {section.subjects.map((subject) => {
              const own = subject === section.subjects[0] && section.id.startsWith('goal:');
              const lines = section.lines.filter((l) => l.stepId === subject).map((l) => (own ? withoutName(l.text, section.title) : l.text));
              const step = steps.find((s) => s.id === subject);
              const open = step ? step.items.filter((item) => !item.answered) : [];
              if (lines.length === 0 && open.length === 0) return null;
              // A thing it counts has its name as a heading, as it does on a phone; a work item only when it has a question to ask. The
              // goal's own name is the section's heading, and the days and the settings are the section.
              const name = section.names[subject];
              const named = name !== undefined && name !== section.title && (subject.startsWith('target:') || open.length > 0);
              return (
                <div key={subject} className="space-y-2">
                  {named && <h4 className={CARD_TEXT.body}>{name}</h4>}
                  {lines.length > 0 && <PlaybackLines lines={lines} />}
                  {step && open.map((item) => controls(step, item, null))}
                </div>
              );
            })}
          </div>
        ))}
        {stuckNotes}
        {canSave && (
          <SetupButton tone="main" disabled={locked} onClick={onSave}>
            {saving ? 'Saving…' : QUICK_PATH_WORDS.save}
          </SetupButton>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="setup-quick-path" className="channel-card space-y-4 p-4">
      <CardLead id="setup-quick-path" leads={error === null}>
        {top}
      </CardLead>
      {!canSave && <p className={CARD_TEXT.body}>{quickPathReason(reason)}</p>}
      {body}
      {fillError && <SetupAlert headline={fillError} />}
      {error && <SetupAlert headline={error} />}
      {confirming ? (
        <div className="space-y-2">
          <p className={CARD_TEXT.body}>{QUICK_PATH_WORDS.confirmStartOver}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SetupButton tone="second" disabled={saving} onClick={onStartOver}>
              {QUICK_PATH_WORDS.confirmYes}
            </SetupButton>
            <SetupButton tone="second" onClick={() => setConfirming(false)}>
              {QUICK_PATH_WORDS.confirmNo}
            </SetupButton>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {steps.length > 0 && <p className={CARD_TEXT.note}>{QUICK_PATH_WORDS.fillStays}</p>}
          <button type="button" disabled={saving} onClick={() => setConfirming(true)} className={LINK}>
            {QUICK_PATH_WORDS.startAgain}
          </button>
        </div>
      )}
    </section>
  );
}
