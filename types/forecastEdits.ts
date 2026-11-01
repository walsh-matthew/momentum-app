// What the two edit screens behind home's forecast lines show (MOM-138): a deadline task's rough size, steps and due date,
// and a kind of day's usual time. Built on the server by lib/services/forecastEdits.ts. The words are written in
// components/forecast/wording.ts. Nothing here is a guess: a value is what the person saved, or it is empty.

import type { CapacityUnit } from '@/types/database.types';
import type { LocalDate } from '@/types/scoreboard';

// What a change answers: how many rows it touched (zero when it was already so), or why it was refused. The same shape as
// ServiceResult, written here so a component can use it without importing from the services.
export type EditChange = { ok: true; data: { changed: number } } | { ok: false; error: string };

export interface TaskStepView {
  id: string;
  title: string;
  // Ticked by the person (or a source). A ticked step stays as it is.
  done: boolean;
}

// One deadline task, as its edit screen shows it.
export interface TaskEditView {
  id: string;
  // The person's own words, kept as written.
  title: string;
  goalTitle: string;
  // The person's own today, so the due date reads "Fri, Nov 20" and a past day can be refused on the form too.
  today: LocalDate;
  dueOn: LocalDate;
  // What setup recorded. The date can be moved only when this is true.
  dateCanMove: boolean;
  // The person's own rough size, in hours; null when they have not given one.
  estimateHours: number | null;
  // Marked done, or every step ticked: nothing about it is edited.
  finished: boolean;
  steps: TaskStepView[];
}

// One of the person's own kinds of days, with the usual time they gave it.
export interface DayKindTimeView {
  id: string;
  name: string;
  // Both set, or both null (the table's own rule).
  unit: CapacityUnit | null;
  amount: number | null;
}
