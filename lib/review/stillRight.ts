// "Still right for you?" (docs/DOMAIN_MODEL.md §2.1 rule 4 and §3.2, MOM-113 block 3.4): which setup suggestions the weekly review asks
// about. Pure: no database, no model, no clock.
//
// Only a mark with an edit path in the app today is asked: a target's floor, aspiration or days, which MOM-146's form can change. Every
// other mark stays unanswered and unrecorded until its edit path exists, and is then asked at the first review after (owner decision,
// 2026-10-31). So each mark is asked once, at the first review after it is made or after it can be changed.
//
// A mark whose value the person has already changed (a saved change to that target, migration 020) is theirs to skip: it is not asked, and
// is recorded as changed when the review is finished. The person's word beats a source (principle 3).

import type { StillRightField, StillRightItem, StillRightMarks, TargetEdit, UnconfirmedStartingPoint } from '@/types/review';
import { STILL_RIGHT_FIELDS } from '@/types/review';

const isStillRightField = (field: string): field is StillRightField => (STILL_RIGHT_FIELDS as readonly string[]).includes(field);

// `editFor` is the review's own edit of a target (null when the target cannot be edited here). A mark with nothing saved behind it,
// or whose value the edit does not hold (an aspiration the target does not have, days on a weekly target), has no question to ask.
export function stillRightMarks(points: UnconfirmedStartingPoint[], editFor: (targetId: string) => TargetEdit | null): StillRightMarks {
  const asking: StillRightItem[] = [];
  const changed: StillRightItem[] = [];
  const edits = new Map<string, TargetEdit>();
  for (const point of points) {
    if (point.kind !== 'target' || point.targetId === null || !isStillRightField(point.field)) continue;
    const edit = editFor(point.targetId);
    if (edit === null) continue;
    const held = point.field === 'floor' ? true : point.field === 'aspiration' ? edit.aspiration !== null : edit.days !== null;
    if (!held) continue;
    const item: StillRightItem = { id: point.id, targetId: point.targetId, field: point.field };
    if (point.changed) {
      changed.push(item);
      continue;
    }
    asking.push(item);
    edits.set(edit.targetId, edit);
  }
  return { asking, changed, edits: [...edits.values()] };
}
