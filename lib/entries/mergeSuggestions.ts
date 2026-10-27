// When a manual entry and a synced record look like the same event (docs/DOMAIN_MODEL.md §1.6). Pure: it reads
// nothing and writes nothing. It only suggests. Momentum never merges on its own: confirming is the person's act
// (a hide correction on one of the two records, written from their own session).
//
// "Looks like the same event":
//   - the same target,
//   - one entry from a manual source and one from a synced source,
//   - neither hidden by a correction,
//   - times within MERGE_WINDOW_HOURS of each other,
//   - for a quantity or time target, values within MERGE_VALUE_TOLERANCE of each other (a count has no size to
//     compare).
// Possible duplicates from one synced source are grouped into one suggestion, however many entries are involved
// (§1.6: merges must not nag): entries that match each other, directly or through a third, share a group.
//
// Both numbers are guesses (BACKLOG.md, MOM-109): tune them from the trial.

import type { Measure, SourceKind } from '@/types/database.types';

export const MERGE_WINDOW_HOURS = 4;
export const MERGE_VALUE_TOLERANCE = 0.25;

const MS_PER_HOUR = 3_600_000;

export interface MergeCandidate {
  id: string;
  targetId: string;
  sourceId: string;
  sourceKind: SourceKind;
  // An instant with an explicit offset or Z.
  occurredAt: string;
  value: number;
  // Hidden by the person's correction (§1.6): out of the question.
  hidden: boolean;
}

export interface MergeSuggestion {
  targetId: string;
  // The synced source the group came from.
  syncedSourceId: string;
  // Sorted by id, so the same entries always give the same suggestion.
  manualEntryIds: string[];
  syncedEntryIds: string[];
}

// Whether two entries on one target look like one event. `measure` is that target's.
export function looksLikeSameEvent(manual: MergeCandidate, synced: MergeCandidate, measure: Measure): boolean {
  const gap = Math.abs(Date.parse(manual.occurredAt) - Date.parse(synced.occurredAt));
  if (!Number.isFinite(gap) || gap > MERGE_WINDOW_HOURS * MS_PER_HOUR) return false;
  if (measure === 'quantity' || measure === 'time') {
    const larger = Math.max(manual.value, synced.value);
    return larger > 0 && Math.abs(manual.value - synced.value) <= MERGE_VALUE_TOLERANCE * larger;
  }
  // A checklist tick is never a synced record.
  return measure === 'count';
}

// One suggestion per group of possible duplicates, earliest first. `measures` maps a target id to its measure;
// entries on a target it does not know are left out.
export function suggestMerges(entries: MergeCandidate[], measures: ReadonlyMap<string, Measure>): MergeSuggestion[] {
  const live = entries.filter((e) => !e.hidden && measures.has(e.targetId));
  const suggestions: Array<MergeSuggestion & { first: number }> = [];

  const targetIds = [...new Set(live.map((e) => e.targetId))].sort();
  for (const targetId of targetIds) {
    const measure = measures.get(targetId)!;
    const onTarget = live.filter((e) => e.targetId === targetId);
    const manual = onTarget.filter((e) => e.sourceKind === 'manual');
    const syncedSources = [...new Set(onTarget.filter((e) => e.sourceKind === 'synced').map((e) => e.sourceId))].sort();

    for (const sourceId of syncedSources) {
      const synced = onTarget.filter((e) => e.sourceKind === 'synced' && e.sourceId === sourceId);
      const members = [...manual, ...synced];
      // Union-find over the entries that match each other.
      const parent = new Map(members.map((e) => [e.id, e.id]));
      const find = (id: string): string => {
        let root = id;
        while (parent.get(root) !== root) root = parent.get(root)!;
        parent.set(id, root);
        return root;
      };
      const matched = new Set<string>();
      for (const m of manual) {
        for (const s of synced) {
          if (!looksLikeSameEvent(m, s, measure)) continue;
          matched.add(m.id);
          matched.add(s.id);
          parent.set(find(m.id), find(s.id));
        }
      }

      const groups = new Map<string, MergeCandidate[]>();
      for (const e of members) {
        if (!matched.has(e.id)) continue;
        const root = find(e.id);
        groups.set(root, [...(groups.get(root) ?? []), e]);
      }
      for (const group of groups.values()) {
        suggestions.push({
          targetId,
          syncedSourceId: sourceId,
          manualEntryIds: group.filter((e) => e.sourceKind === 'manual').map((e) => e.id).sort(),
          syncedEntryIds: group.filter((e) => e.sourceKind === 'synced').map((e) => e.id).sort(),
          first: Math.min(...group.map((e) => Date.parse(e.occurredAt))),
        });
      }
    }
  }

  suggestions.sort(
    (a, b) =>
      a.first - b.first ||
      (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0) ||
      (a.syncedEntryIds[0] < b.syncedEntryIds[0] ? -1 : 1),
  );
  return suggestions.map(({ first: _first, ...suggestion }) => suggestion);
}
