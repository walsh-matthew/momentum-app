// The words around layer 3's one adjustment (MOM-113 block 3.3, docs/DOMAIN_MODEL.md §3.2 and §2.1's plain-language rules, which
// apply to the review's cards too). Templates in code, never a model: the engine picked the adjustment from facts, and code says
// it. The question is the core ask in about 12 words, shown in bold as the card's title; a detail line under it says what the
// engine saw and what the answer is used for. Nothing is celebrated here and nothing is blocked: the three choices are equal,
// and "Skip for now" is a choice, not a way out of a trap (principle 7, "every change has a way out").
//
// What "Yes, I want to change it" does today: nothing in the app edits a target or a deadline yet, so for those it records the
// person's choice and says so plainly ("so nothing was changed"). The choice is still what kill criterion 4 measures. The
// deadline forecast's "more time" is the one that can act today, through the week plan, which is after the review in the same
// sitting.

import type { ReviewAdjustmentOutcome } from '@/types/database.types';
import type { ForecastOption, LayerThreeAdjustment } from '@/types/scoreboard';

export interface AdjustmentView {
  kind: LayerThreeAdjustment['kind'];
  // The core ask, in bold, as the card's title.
  question: string;
  // What the engine saw, and why it is asked, in regular weight.
  detail: string;
  // The three buttons, always in this order and always all there.
  choices: Record<ReviewAdjustmentOutcome, string>;
  // The sentence shown once the person has chosen, before they finish.
  afterChoice: Record<ReviewAdjustmentOutcome, string>;
}

export const CHOICE_LABELS: Record<ReviewAdjustmentOutcome, string> = {
  changed: 'Yes, I want to change it',
  declined: 'No, keep it as it is',
  skipped: 'Skip for now',
};

export const CHOICE_ORDER: readonly ReviewAdjustmentOutcome[] = ['changed', 'declined', 'skipped'];

const KEPT = 'Okay. It stays as it is.';
const SKIPPED = 'Skipped. Nothing changes.';

// A target's title as the person wrote it, in curly quotes so a long or odd title still reads as a title.
const quoted = (title: string) => `“${title}”`;

const OPTION_WORDS: Record<ForecastOption, string> = {
  more_time: 'set aside more time before the date',
  smaller_scope: 'make it smaller',
  move_date: 'move the date',
  accept_risk: 'keep going and accept the risk',
};

// "a, b or c", in the order the engine gave them.
export function optionsInWords(options: readonly ForecastOption[]): string {
  const words = options.map((o) => OPTION_WORDS[o]);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

export interface AdjustmentTitles {
  // A target's title by its id, or null when the recap does not name it.
  target: (id: string) => string | null;
  // A deadline task's title by its id, or null when it is not known (the review does not read work items yet).
  item: (id: string) => string | null;
}

export function adjustmentView(adjustment: LayerThreeAdjustment, titles: AdjustmentTitles): AdjustmentView {
  switch (adjustment.kind) {
    case 'slipping_check_in': {
      const title = titles.target(adjustment.targetId);
      return {
        kind: adjustment.kind,
        question: title === null ? 'Want to change anything about this target?' : `Want to change anything about ${quoted(title)}?`,
        detail: `You didn't reach your floor, the least that counts, for ${adjustment.periods} weeks in a row. One week isn't a pattern, but this might mean it doesn't fit right now. It's your call.`,
        choices: CHOICE_LABELS,
        afterChoice: {
          changed: "Noted. Changing a target isn't in the app yet, so nothing was changed.",
          declined: KEPT,
          skipped: SKIPPED,
        },
      };
    }
    case 'rebaseline': {
      const title = titles.target(adjustment.targetId);
      return {
        kind: adjustment.kind,
        question: title === null ? 'Raise the bar on this target?' : `Raise the bar on ${quoted(title)}?`,
        detail: `You reached your aspiration, the number you hoped for, ${adjustment.periods} weeks in a row. You can aim higher from next week. Past weeks keep the number they had.`,
        choices: CHOICE_LABELS,
        afterChoice: {
          changed: "Noted. Changing a target isn't in the app yet, so nothing was changed.",
          declined: KEPT,
          skipped: SKIPPED,
        },
      };
    }
    case 'deadline_forecast': {
      const title = titles.item(adjustment.itemId);
      const state =
        adjustment.verdict === 'does_not_fit'
          ? "The days you've set aside don't look like enough to finish it by the date."
          : "The days you've set aside look tight for finishing it by the date.";
      const choices = adjustment.options.length > 0 ? ` Your choices: ${optionsInWords(adjustment.options)}.` : '';
      return {
        kind: adjustment.kind,
        question: title === null ? 'Does one of your deadlines still work?' : `Does ${quoted(title)} still work?`,
        detail: `${state}${choices} It's your call.`,
        choices: CHOICE_LABELS,
        afterChoice: {
          changed: adjustment.options.includes('more_time')
            ? "Noted. You can set aside more time on your week plan once you've finished. Changing a deadline or its size isn't in the app yet, so nothing else was changed."
            : "Noted. Changing a deadline isn't in the app yet, so nothing was changed.",
          declined: KEPT,
          skipped: SKIPPED,
        },
      };
    }
  }
}

// What the screen says when the engine raised nothing.
export const NO_ADJUSTMENT = 'Nothing to adjust this week.';
