// The words of "Still right for you?" (MOM-113 block 3.4, docs/DOMAIN_MODEL.md §2.1 rule 4 and §3.2; plain language per §2.1 applies to the
// review's cards too). Templates in code, never a model: a suggestion the person took at setup is asked about as a question, never stated
// as a fact about them. The question is the card's bold title; the detail says why it is asked; each row is one saved value in the
// person's own words with two equal answers. Only a target's floor, aspiration and days are asked today (the numbers MOM-146's form can
// change); a row says what it is, never "floor" or "aspiration" on their own.

import { weekdayName } from '@/components/home/wording';
import { amountOf } from '@/lib/setup/playback';
import type { TargetDraft } from '@/types/setup';
import type { StartingPointOutcome } from '@/types/database.types';
import type { StillRightItem, TargetEdit } from '@/types/review';

export const STILL_RIGHT_TITLE = 'Still right for you?';
export const STILL_RIGHT_DETAIL = 'At setup you took these as suggestions instead of saying them yourself. Does each one still fit?';

// The two answers, in this order, equal in weight.
export const FIT_LABELS: Record<StartingPointOutcome, string> = {
  kept: 'Yes, it fits',
  changed: 'No, change it',
};
export const FIT_ORDER: readonly StartingPointOutcome[] = ['kept', 'changed'];

// "Mon", "Wed and Fri", "Mon, Wed and Fri", in the order of the person's week.
function daysInWords(days: readonly number[], weekStartsOn: number): string {
  const order = (d: number) => (((d % 7) - weekStartsOn + 7) % 7);
  const names = [...days].sort((a, b) => order(a) - order(b)).map((d) => weekdayName(d % 7));
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// One suggestion as a sentence, the saved value in the words setup asked it in. The target's name is not in it: the card shows the
// name once above the target's rows.
export function stillRightSentence(item: StillRightItem, edit: TargetEdit): string {
  const draft = { title: edit.title, measure: edit.measure, unit: edit.unit } as Pick<TargetDraft, 'title' | 'measure' | 'unit'>;
  switch (item.field) {
    case 'floor':
      return `${amountOf(draft, edit.floor)} in a hard week still ${edit.floor === 1 ? 'counts' : 'count'}.`;
    case 'aspiration':
      return `Hoping for ${amountOf(draft, edit.aspiration ?? edit.floor)} a week.`;
    case 'slot_weekdays':
      return `Counts on ${daysInWords(edit.days ?? [], edit.weekStartsOn)}.`;
  }
}

// What a screen reader hears for the row's two answers: the target's name, then the row ("Workouts: 2 workouts in a hard week still count").
export function stillRightLabel(item: StillRightItem, edit: TargetEdit): string {
  return `${edit.title}: ${stillRightSentence(item, edit).replace(/\.$/, '')}`;
}
