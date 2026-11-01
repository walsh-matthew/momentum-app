// The words on the screens for adding a goal or a target after first setup (MOM-132 part 2), and the start question's rules.
//
// The words below are the owner's, approved on 2026-11-01 and written into MOM-132's Jira comment (2026-11-02) so that they can not be lost again.
// They are repeated here as plain strings, not read back from lib/setup/addWords.ts, so a change to a word has to be made in two places on
// purpose. Pure: no DOM.

import { describe, expect, it } from 'vitest';
import { ADD_WORDS } from '@/lib/setup/addWords';
import { nextWeekStart, startProblem, startsMidWeek, weekdayOf } from '@/lib/setup/addStart';
import { ADD_FAILED, ADD_REFUSALS, ADD_SIGN_IN, NO_WEEK_START, START_AFTER_DUE } from '@/lib/services/setup';
import { RETURNING_FIRST_LINE } from '@/lib/setup/returning';

describe('the approved words, verbatim', () => {
  it('home and the chooser', () => {
    expect(ADD_WORDS.homeLink).toBe('Add to your goals');
    expect(ADD_WORDS.pageTitle).toBe('Add to your goals');
    expect(ADD_WORDS.chooseLead).toBe('What would you like to add?');
    expect(ADD_WORDS.chooseDetail).toBe("Nothing you've already set up changes. Nothing is saved until you check it.");
    expect(ADD_WORDS.newGoal).toBe('A new goal');
    expect(ADD_WORDS.newTarget).toBe('A target for a goal I already have');
    expect(ADD_WORDS.backHome).toBe('Back to home');
  });

  it('which goal', () => {
    expect(ADD_WORDS.whichLead).toBe('Which goal is it for?');
    expect(ADD_WORDS.whichDetail).toBe('Pick one. You can add to another goal after.');
  });

  it('the start question', () => {
    expect(ADD_WORDS.startLead).toBe('When should this target start counting?');
    expect(ADD_WORDS.startDetail('Run more', 'Tuesday, Oct 27')).toBe(
      `Weeks before this date won't count for it. Your goal "Run more" keeps its own start of Tuesday, Oct 27.`,
    );
    expect(ADD_WORDS.partWay).toBe("If that's partway through a week, that first week is shown but never counted as a miss.");
    expect(ADD_WORDS.startToday('Monday, Nov 2')).toBe('Start today, Monday, Nov 2?');
    expect(ADD_WORDS.yesToday).toBe('Yes, start today');
    expect(ADD_WORDS.nextWeek('Mon, Nov 9')).toBe('Start next week, Mon, Nov 9');
    expect(ADD_WORDS.pickAnother).toBe('Pick another date');
    expect(ADD_WORDS.tooEarly('Tuesday, Oct 27')).toBe("That's before your goal started on Tuesday, Oct 27. Pick a day on or after it.");
    expect(ADD_WORDS.tooLate('Friday, Dec 18')).toBe("That's after your goal ends on Friday, Dec 18. Pick a day on or before it.");
  });

  it('the final cards, and the buttons', () => {
    expect(ADD_WORDS.goalHeading).toBe('Add this goal?');
    expect(ADD_WORDS.goalDetail).toBe("Your other goals and everything you've logged stay exactly as they are.");
    expect(ADD_WORDS.targetHeading('Run more')).toBe('Add this target to "Run more"?');
    expect(ADD_WORDS.targetDetail('Monday, Nov 2')).toBe(
      "It starts counting on Monday, Nov 2. Weeks before that aren't counted. Everything else on this goal stays as it is.",
    );
    expect(ADD_WORDS.add).toBe('Add it');
    expect(ADD_WORDS.adding).toBe('Adding…');
    expect(ADD_WORDS.change).toBe('Change something');
  });

  it('the planning playback of an addition is not called "Your days and weeks" (not in the approved list; flagged for the screenshot review)', () => {
    expect(ADD_WORDS.planningTitle).toBe("How you'll track it");
  });

  it('saved', () => {
    expect(ADD_WORDS.added).toBe('Added.');
    expect(ADD_WORDS.addedDetail).toBe("Nothing you'd already saved changed.");
    expect(ADD_WORDS.addedTarget('Run more', 'Monday, Nov 2')).toBe('Added to "Run more". It starts counting on Monday, Nov 2.');
  });

  it('the problem lines: part 1 constants kept, and the new lines', () => {
    expect(ADD_REFUSALS.MS002).toBe('You already have this one. Nothing was added. Change the title or the start date to add another.');
    expect(ADD_REFUSALS.MS003).toBe('Finish your first setup before adding more.');
    expect(ADD_REFUSALS.MS004).toBe("That goal isn't active, so nothing was added.");
    expect(ADD_REFUSALS.MS005).toBe("That start date is outside the goal's dates. Nothing was added.");
    expect(ADD_FAILED).toBe('Could not add it. Nothing was saved. Your other goals are unchanged.');
    expect(ADD_SIGN_IN).toBe('Sign in to add to your goals.');
    expect(START_AFTER_DUE).toBe("The start date is after the target's due date. Nothing was added.");
    expect(ADD_WORDS.noNetwork).toBe("Couldn't connect. Nothing was added yet. Check your connection, then try again.");
    expect(NO_WEEK_START).toBe(
      "Your week start isn't saved, so a target that repeats each week can't be added yet. A target with a due date can be. Nothing was saved.",
    );
  });

  it('the first chat line names topics and no value', () => {
    expect(RETURNING_FIRST_LINE).toBe("I already have your time zone, when your day ends, your days and your settings, so I'll skip those.");
  });
});

describe('the start question: next week, the first week, and the goal’s dates', () => {
  it('numbers weekdays Monday 1 to Sunday 7', () => {
    expect(weekdayOf('2026-11-02')).toBe(1); // a Monday
    expect(weekdayOf('2026-11-08')).toBe(7); // a Sunday
    expect(weekdayOf('2026-11-04')).toBe(3);
  });

  it('next week starts on the next date that is the person’s week start; none when it is saved nowhere or today already is it', () => {
    expect(nextWeekStart('2026-11-04', 1)).toBe('2026-11-09'); // Wednesday -> next Monday
    expect(nextWeekStart('2026-11-08', 1)).toBe('2026-11-09'); // Sunday -> next day
    expect(nextWeekStart('2026-11-04', 7)).toBe('2026-11-08'); // a Sunday week start
    expect(nextWeekStart('2026-11-04', 3)).toBeNull(); // today is the week start
    expect(nextWeekStart('2026-11-04', null)).toBeNull(); // nothing is assumed
    expect(nextWeekStart('not a date', 1)).toBeNull();
    // Across a month and a year.
    expect(nextWeekStart('2026-12-30', 1)).toBe('2027-01-04');
  });

  it('a start is mid-week only when a week start is saved and the day is not it', () => {
    expect(startsMidWeek('2026-11-04', 1)).toBe(true);
    expect(startsMidWeek('2026-11-02', 1)).toBe(false);
    expect(startsMidWeek('2026-11-04', null)).toBe(false);
  });

  it('a start before the goal started or after it ends is a problem; a goal with no end has no latest start', () => {
    const goal = { startDate: '2026-10-27', endDate: '2026-12-18' };
    expect(startProblem('2026-10-26', goal)).toBe('too_early');
    expect(startProblem('2026-10-27', goal)).toBeNull();
    expect(startProblem('2026-12-18', goal)).toBeNull();
    expect(startProblem('2026-12-19', goal)).toBe('too_late');
    expect(startProblem('2030-01-01', { startDate: '2026-10-27', endDate: null })).toBeNull();
  });
});

describe('the quick-path card’s words when it finishes an addition', () => {
  it('uses the owner’s button and heading, and says what is true in the "almost done" line (that line is not in the approved list)', async () => {
    const { ADD_QUICK_WORDS } = await import('@/lib/setup/addWords');
    expect(ADD_QUICK_WORDS.save).toBe('Add it');
    expect(ADD_QUICK_WORDS.saving).toBe('Adding…');
    expect(ADD_QUICK_WORDS.readyTop).toBe("Here's what will be added");
    expect(ADD_QUICK_WORDS.topLine(1)).toBe('Almost done: 1 quick step and it is ready to add');
    expect(ADD_QUICK_WORDS.topLine(3)).toBe('Almost done: 3 quick steps and it is ready to add');
  });
});
