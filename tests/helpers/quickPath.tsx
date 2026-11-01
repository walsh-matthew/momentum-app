// Builders for the quick-path card (components/setup/QuickPathCard.tsx) in tests: its props with every one filled in, and the small
// pieces a test wants to say in a line (a step, an item, a recap section).

import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { QuickPathCard } from '@/components/setup/QuickPathCard';
import type { FillInItem, QuickStep, RecapSection } from '@/types/setupScreen';

export type CardProps = ComponentProps<typeof QuickPathCard>;

// A question on the card. `kind` picks the control; the rest has the plain defaults of an item nobody has answered.
export const item = (id: string, line: string, kind: FillInItem['kind'], over: Partial<FillInItem> = {}): FillInItem => ({
  id,
  line,
  hint: null,
  kind,
  choices: [],
  suggestion: null,
  answered: false,
  answer: null,
  ...over,
});

export const step = (id: string, title: string, items: FillInItem[], sectionId = id): QuickStep => ({ id, sectionId, title, items });

export const section = (id: string, title: string, lines: string[] = [], stepId = id): RecapSection => ({
  id,
  title,
  lines: lines.map((text) => ({ text, stepId })),
  subjects: [stepId],
  names: { [stepId]: title },
});

export const WEEKDAY_CHOICES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((label, i) => ({ value: String(i + 1), label }));

// The card's props, complete: a setup with nothing missing, over its turns, with nothing to do.
export const quickProps = (over: Partial<CardProps> = {}): CardProps => ({
  reason: 'over_turns',
  sections: [],
  steps: [],
  stuck: [],
  saving: false,
  error: null,
  fillError: null,
  filling: false,
  deviceZone: null,
  today: null,
  onFill: vi.fn(async () => null),
  onSave: () => {},
  onStartOver: () => {},
  ...over,
});
