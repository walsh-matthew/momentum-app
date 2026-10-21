// Wizard input validation and the micro-task plan contract (PRODUCT_STRATEGY.md §4, AI Guardrails:
// dynamic task generators return strictly validated JSON matching Zod schemas).
//
// Today the plan comes from a deterministic stub. When the Claude generator replaces it, its raw
// output goes through parseTaskPlan() unchanged, so the contract does not move.
//
// Invariants encoded here (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5, §10):
// - A generated task has no `status`. The user owns completion; generated tasks always start as todo.
// - A plan is only additive: there is no delete or cut action in the schema.

import { z } from 'zod';
import { PLAN_WEEKS, TASK_TYPES, type TaskType } from '@/types/database.types';
import {
  CONSTRAINTS,
  GOAL_TYPES,
  GOAL_TYPE_LABELS,
  PACES,
  REVIEW_PROMPTS,
  REVIEW_PROMPT_LABELS,
  type GoalType,
  type Pace,
  type ReviewPrompt,
} from './vocabulary';

export const TITLE_MAX_LENGTH = 80;
export const DEFAULT_HORIZON_DAYS = 90;

export const WizardInputSchema = z.object({
  title: z.string().trim().min(1, 'Give the goal a title.').max(TITLE_MAX_LENGTH, 'Keep the title under 80 characters.'),
  goalType: z.enum(GOAL_TYPES),
  constraints: z.array(z.enum(CONSTRAINTS)).max(CONSTRAINTS.length),
  pace: z.enum(PACES).nullable(),
  reviewPrompts: z.array(z.enum(REVIEW_PROMPTS)).max(REVIEW_PROMPTS.length),
});
export type WizardInput = z.infer<typeof WizardInputSchema>;

// Mirrors the micro_tasks columns the generator is allowed to set. `.strict()` rejects extras such as
// `status`, so a model cannot hand back a task that is already done.
export const GeneratedTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    taskType: z.enum(TASK_TYPES),
    minutes: z.number().int().min(1).max(480),
    weekOf: z.number().int().min(1).max(PLAN_WEEKS),
  })
  .strict();
export type GeneratedTask = z.infer<typeof GeneratedTaskSchema>;

export const TaskPlanSchema = z.object({
  tasks: z.array(GeneratedTaskSchema).min(1).max(100),
});
export type TaskPlan = z.infer<typeof TaskPlanSchema>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' ') };
}

export const parseWizardInput = (raw: unknown) => parseWith(WizardInputSchema, raw);
// Entry point for any task generator's output, stub or model.
export const parseTaskPlan = (raw: unknown) => parseWith(TaskPlanSchema, raw);

// ---------------------------------------------------------------------------
// Stub generator
// ---------------------------------------------------------------------------

interface TemplateTask {
  title: string;
  taskType: TaskType;
  minutes: number;
}

// Week 1 starter tasks per goal type, in the "Label, N min." style of the real plan (§3).
const WEEK_ONE_TEMPLATES: Record<GoalType, TemplateTask[]> = {
  career_pivot: [
    { title: 'Run the daily job search and triage the results', taskType: 'job_search', minutes: 10 },
    { title: 'Build the core flow of the first prototype end to end', taskType: 'build', minutes: 60 },
    { title: 'Watch one lesson on how models work', taskType: 'learn', minutes: 45 },
    { title: 'Register for two networking events', taskType: 'position', minutes: 15 },
  ],
  get_certified: [
    { title: 'Pick the certification and book the exam date', taskType: 'certify', minutes: 30 },
    { title: 'Study the first exam domain', taskType: 'certify', minutes: 45 },
    { title: 'Take a short practice quiz, then review weak areas', taskType: 'certify', minutes: 30 },
  ],
  portfolio_piece: [
    { title: 'Scope the smallest version that still shows the idea', taskType: 'build', minutes: 30 },
    { title: 'Build the core flow end to end', taskType: 'build', minutes: 60 },
    { title: 'Draft the one-page write-up outline', taskType: 'position', minutes: 30 },
  ],
  interview_prep: [
    { title: 'Write one story from my own evidence', taskType: 'interview_prep', minutes: 30 },
    { title: 'Answer one open interview question', taskType: 'interview_fill_in', minutes: 15 },
    { title: 'Run the daily job search and triage the results', taskType: 'job_search', minutes: 10 },
  ],
  grow_network: [
    { title: 'Register for two networking events', taskType: 'position', minutes: 15 },
    { title: 'Draft three short outreach notes for approval', taskType: 'position', minutes: 30 },
    { title: 'Draft one public post for review', taskType: 'publish', minutes: 20 },
  ],
};

// Pace only resizes a plan that is being created. "Behind", "ahead" and "carry over" describe a week
// that already exists and are acted on by rebalancing (MOM-15), so they leave the new plan unchanged.
const PACE_MINUTES_FACTOR: Partial<Record<Pace, number>> = { lighter: 0.5, heavier: 1.5 };

const roundToFive = (n: number) => Math.max(5, Math.round(n / 5) * 5);

function reviewTaskTitle(prompts: ReviewPrompt[]): string {
  if (prompts.length === 0) return 'Friday review: tick tasks and fill in notes';
  const asks = prompts.map((p) => REVIEW_PROMPT_LABELS[p].toLowerCase()).join(', ');
  return `Friday review: tick tasks and note ${asks}`;
}

export function buildStubTaskPlan(input: WizardInput): TaskPlan {
  const factor = (input.pace && PACE_MINUTES_FACTOR[input.pace]) || 1;
  const tasks: GeneratedTask[] = WEEK_ONE_TEMPLATES[input.goalType].map((t) => ({
    title: t.title,
    taskType: t.taskType,
    minutes: factor === 1 ? t.minutes : roundToFive(t.minutes * factor),
    weekOf: 1,
  }));
  tasks.push({ title: reviewTaskTitle(input.reviewPrompts), taskType: 'review', minutes: 30, weekOf: 1 });

  // Validate our own output so the stub and a future model are held to the same contract.
  const plan = parseTaskPlan({ tasks });
  if (!plan.ok) throw new Error(`Stub task plan failed validation: ${plan.error}`);
  return plan.data;
}

export const defaultTitleFor = (goalType: GoalType) => GOAL_TYPE_LABELS[goalType];
