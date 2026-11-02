import type { HomeScoreboard } from '@/types/home';

// Whether the person's first setup is known to be saved (MOM-143): the scoreboard found a goal row. 'ready' and 'needs_day_anchors'
// only exist when there is an active goal, and 'no_goals' says by setupSaved whether a goal exists that is not active (parked,
// archived). A scoreboard that could not be read (null) or was not read (undefined, signed out) says nothing either way, so it is
// not known to be saved and not known to be unsaved: never assume.
export function setupIsSaved(home: HomeScoreboard | null | undefined): boolean {
  if (!home) return false;
  return home.state !== 'no_goals' || home.setupSaved === true;
}

// Whether the person has a goal to log against (MOM-167 part 14): an active goal, which is what 'ready' and 'needs_day_anchors' mean. A
// person whose goals are all set aside has a saved setup but nothing to log, and a scoreboard that was not read says nothing either way.
export function canLogEntry(home: HomeScoreboard | null | undefined): boolean {
  return home?.state === 'ready' || home?.state === 'needs_day_anchors';
}

// Whether home offers the way back to guided setup: only to a person whose scoreboard was read and found no goal row at all, the
// same fact /setup reads to tell a first setup from an addition (MOM-132), so it costs no second read.
export function setupIsOffered(home: HomeScoreboard | null | undefined): boolean {
  return home?.state === 'no_goals' && !setupIsSaved(home);
}
