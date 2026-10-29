// Activity words (MOM-111 finding 6): setup never names an activity the person has not said. In Matt's 2026-10-29 run a
// goal of "physical fitness" came back as questions about workouts and lifting, which is an assumption about their life
// (hard rule 2). Words are grouped, so "working out" and "workouts" count as the same thing said, and "exercise" covers
// both. Only clear activity words are listed: "run" is left out on purpose, because setup itself says a goal "runs until a
// set date". Pure.

export interface ActivityGroup {
  id: string;
  // The words that name it, in anyone's words.
  pattern: RegExp;
  // More words that name it in the person's own words only: "I ran a lot" says running, but setup's own "runs until a set
  // date" does not.
  saidAs?: RegExp;
}

export const ACTIVITY_GROUPS: readonly ActivityGroup[] = [
  // "Work out" is also the verb for figuring something out ("work out a date"), so in anyone's words only the noun and
  // "working out" on its own count; the person saying "I want to work out more" counts as said.
  {
    id: 'exercise',
    pattern: /\b(exercis(e|es|ed|ing)|work-?outs?|working out(?!\s+(a|an|the|what|how|when|which|whether|if|your|my|our|their|this|that)\b))\b/i,
    saidAs: /\bwork(s|ed|ing)? out\b/i,
  },
  { id: 'running', pattern: /\b(running|runners?|jog|jogs|jogging|sprint(s|ing)?|marathons?|5k|10k)\b/i, saidAs: /\b(run|runs|ran)\b/i },
  { id: 'lifting', pattern: /\b(lifting|weight ?lifting|lift(ing)? weights|weights|strength training|bench press(ing)?|squats?)\b/i, saidAs: /\b(lift|lifts|lifted)\b/i },
  { id: 'gym', pattern: /\bgyms?\b/i },
  { id: 'swimming', pattern: /\b(swim|swims|swimming|laps in the pool)\b/i, saidAs: /\bswam\b/i },
  { id: 'cycling', pattern: /\b(cycling|biking|bike rides?|spin class(es)?)\b/i, saidAs: /\b(bike|bikes|biked|cycle|cycled)\b/i },
  { id: 'yoga', pattern: /\byoga\b/i },
  { id: 'pilates', pattern: /\bpilates\b/i },
  { id: 'hiking', pattern: /\b(hike|hikes|hiking)\b/i },
  { id: 'walking', pattern: /\b(walk|walks|walking)\b/i },
  { id: 'climbing', pattern: /\b(climbing|bouldering)\b/i },
  { id: 'dancing', pattern: /\b(dance|dances|dancing)\b/i },
  { id: 'sport', pattern: /\b(tennis|golf|soccer|football|basketball|baseball|hockey|volleyball|pickleball)\b/i },
  { id: 'meditation', pattern: /\b(meditat(e|es|ed|ing|ion))\b/i },
];

// The activity groups a text names, by id.
export function activitiesIn(text: string): string[] {
  return ACTIVITY_GROUPS.filter((g) => g.pattern.test(text)).map((g) => g.id);
}

// The activity groups the person's own words name, with the words that count only from them.
export function activitiesSaid(said: readonly string[]): Set<string> {
  return new Set(said.flatMap((text) => ACTIVITY_GROUPS.filter((g) => g.pattern.test(text) || g.saidAs?.test(text)).map((g) => g.id)));
}

// The activity groups in `text` that none of `said` names.
export function unsaidActivities(text: string, said: readonly string[]): string[] {
  const known = activitiesSaid(said);
  return activitiesIn(text).filter((id) => !known.has(id));
}
