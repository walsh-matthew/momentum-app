// Where a target stood, in words (MOM-113). One place, so the recap on screen and the facts sent for Claude's one line say the
// same thing: never a bare level name, and a target that is not graded never gets a level word.

import type { Level } from '@/types/scoreboard';

export function levelWords(value: { level: Level | null; graded: boolean }): string {
  if (!value.graded || value.level === null) return 'tracked, not judged';
  return { none: 'not started', partway: 'partway', floor: 'floor met', aspiration: 'aspiration reached' }[value.level];
}
