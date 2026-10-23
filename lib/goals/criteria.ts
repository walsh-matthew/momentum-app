// Starting criteria for a wizard goal (goal_channels.criteria). A goal is a checklist of concrete,
// verifiable outcomes (docs/NINETY_DAY_PLAN_CONTEXT.md §1). The wizard does not ask the user to write
// them; the goal type picks a template.
//
// Invariant (§3, §5 rule 6): the user owns completion. Every criterion starts unticked, and the schema
// below only accepts `done: false`, so nothing on the creation path can hand back a goal that already
// has progress. Migration 008 enforces the same rule on insert.
//
// career_pivot is the seven criteria from §1, with the keys seed_career_pivot() uses
// (tests/goal-criteria.test.ts checks the two lists have not drifted apart).

import { z } from 'zod';
import type { GoalCriterion, GoalType } from '@/types/database.types';

const CRITERION_KEY = /^[a-z][a-z0-9_]*$/;

export const InitialCriteriaSchema = z
  .array(
    z
      .object({
        key: z.string().regex(CRITERION_KEY),
        label: z.string().trim().min(1).max(200),
        done: z.literal(false),
      })
      .strict(),
  )
  .min(1)
  .refine((list) => new Set(list.map((c) => c.key)).size === list.length, 'Criterion keys must be unique.');

const unticked = (key: string, label: string): GoalCriterion => ({ key, label, done: false });

const CRITERIA_TEMPLATES: Record<GoalType, ReadonlyArray<Readonly<GoalCriterion>>> = {
  career_pivot: [
    unticked('prototype_with_demo', 'A working prototype used by a real user, with a recorded demo'),
    unticked('model_prototype_with_api', "A second prototype with a model inside it, reachable through the user's own API"),
    unticked('eval_before_after', 'An eval for it: labeled test set, scoring rubric, before/after accuracy'),
    unticked('two_model_comparison', 'A two-model comparison on accuracy and cost per item'),
    unticked('risk_register', 'A risk register for it'),
    unticked('two_certifications', 'Two professional certifications'),
    unticked('pro_bono_and_resume', 'One dated pro bono engagement and a resume entry that starts in the current year'),
  ],
  get_certified: [
    unticked('exam_booked', 'The exam is booked, with a date'),
    unticked('domains_studied', 'Every exam domain has been studied at least once'),
    unticked('practice_exam_reviewed', 'A full practice exam is taken and the weak areas are reviewed'),
    unticked('certification_earned', 'The certification is earned'),
  ],
  portfolio_piece: [
    unticked('scope_written', 'A scope small enough for the timebox, written down'),
    unticked('prototype_with_demo', 'A working prototype tried by a real user, with a recorded demo'),
    unticked('writeup_done', 'A one-page write-up of what it does and where it went wrong'),
    unticked('added_to_portfolio', 'The piece is on my portfolio, after my own review'),
  ],
  interview_prep: [
    unticked('stories_written', 'Five stories written from my own evidence, each with a result'),
    unticked('open_questions_answered', 'Every open interview question has an answer in my own words'),
    unticked('mock_interview_done', 'One timed mock interview done, with notes'),
    unticked('case_questions_practised', 'Two case questions answered out loud'),
  ],
  grow_network: [
    unticked('events_attended', 'Three networking events attended'),
    unticked('outreach_sent', 'Five outreach notes sent, each approved by me first'),
    unticked('conversations_followed_up', 'Three conversations held, each with a follow-up'),
    unticked('post_published', 'One public post published after my own review'),
  ],
};

// A fresh copy each call, so a caller cannot mutate a template.
export function criteriaFor(goalType: GoalType): GoalCriterion[] {
  return CRITERIA_TEMPLATES[goalType].map((c) => ({ ...c }));
}
