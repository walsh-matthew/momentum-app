// Source-level guards for the wizard's week 1 plan path (MOM-35). Behaviour is tested elsewhere
// (tests/week-one-plan.test.ts, supabase/verify/009_wizard_plan.sql); these read the code to catch the
// mistakes a behavioural test cannot see: a status or completion time creeping into the plan path, a
// second write route that skips the all-or-nothing function, the service role, or a model call that fires
// without a click.
//
// The user owns completion (docs/NINETY_DAY_PLAN_CONTEXT.md §3, §5 rule 6): nothing that creates a plan may
// write `status` or `completed_at`. Every new task takes the column default 'todo'.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
// Checkouts on Windows may have CRLF line endings; the patterns below expect LF.
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

// Comments say "never set status" and similar; only the code counts.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/--.*$/gm, '');

// The text of `export async function name` / `export function name`, up to the closing brace at column 0.
function bodyOf(source: string, name: string): string {
  const start = source.search(new RegExp(`export (async )?function ${name}\\b`));
  if (start < 0) throw new Error(`no function ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 3);
}

const tasksSource = read('lib', 'services', 'tasks.ts');
const generate = withoutComments(bodyOf(tasksSource, 'generateWeekOnePlan'));
const persist = withoutComments(bodyOf(tasksSource, 'createGoalWithWeekOnePlan'));
const aiSource = withoutComments(read('lib', 'ai', 'taskPlan.ts'));
const planSchemaSource = withoutComments(read('lib', 'goals', 'taskPlan.ts'));
const actionsSource = withoutComments(read('app', 'actions', 'goals.ts'));
const migration = withoutComments(read('supabase', 'migrations', '009_wizard_week_one_plan.sql'));

// (The model's prompt may say "mark anything done" to forbid it, and the AI module reads `error.status`, an
// HTTP code, to tell failures apart; the fields checked are a task's status and completion time.)
const STATUS_WORDS = /\bstatus\b|completed_at|completedAt/i;
const withoutHttpStatus = (code: string) => code.replace(/\berror\.status\b/g, '');

describe('nothing in the plan path writes status or completed_at', () => {
  it.each([
    ['generateWeekOnePlan', generate],
    ['createGoalWithWeekOnePlan', persist],
    ['lib/ai/taskPlan.ts', aiSource],
    ['lib/goals/taskPlan.ts (the schemas and the stub)', planSchemaSource],
    ['app/actions/goals.ts', actionsSource],
    ['the create_goal_with_week_one_plan function', migration],
  ])('%s', (_name, code) => {
    expect(withoutHttpStatus(code)).not.toMatch(STATUS_WORDS);
  });

  it('the function bodies were really found (so the checks above are not vacuous)', () => {
    expect(generate).toContain('requestWeekOnePlanFromModel');
    expect(persist).toContain("rpc('create_goal_with_week_one_plan'");
    expect(migration).toContain('create or replace function public.create_goal_with_week_one_plan');
  });
});

describe('the plan is saved only through the one all-or-nothing function', () => {
  it('createGoalWithWeekOnePlan makes one rpc call and no direct table write', () => {
    expect([...persist.matchAll(/\.rpc\(/g)]).toHaveLength(1);
    for (const write of ['.from(', '.insert(', '.update(', '.upsert(', '.delete(']) expect(persist).not.toContain(write);
  });

  it('generateWeekOnePlan touches no table at all: it only asks and validates', () => {
    for (const touch of ['.from(', '.rpc(', '.insert(', '.update(', '.upsert(', '.delete(']) expect(generate).not.toContain(touch);
  });

  it('uses the signed-in user\'s client, never the service role', () => {
    for (const code of [generate, persist, aiSource, actionsSource]) {
      expect(code).not.toMatch(/supabase\/admin|SERVICE_ROLE|createSupabaseAdminClient/i);
    }
    expect(tasksSource).not.toMatch(/supabase\/admin|SERVICE_ROLE/);
    expect(persist).toContain('createSupabaseServerClient');
  });

  it('passes the function no owner: the user id comes from the session inside the database', () => {
    expect(persist).not.toMatch(/p_user_id|user_id|auth\.user\.id/);
  });

  it('validates its input again, because a Server Action can be posted to directly', () => {
    expect(persist).toContain('parseWizardInput(rawInput)');
    expect(persist).toContain('parseWeekOnePlan(rawPlan)');
    expect(generate).toContain('parseWizardInput(rawInput)');
    expect(generate).toContain('parseWeekOnePlan(answer.raw)');
  });

  it("the model's raw output goes to the parser unchanged", () => {
    expect(generate).toMatch(/parseWeekOnePlan\(answer\.raw\)/);
    expect(generate).not.toMatch(/answer\.raw\s*[.[]|\.\.\.\s*answer\.raw|map\(|filter\(|JSON\.parse/);
  });

  it('a failure shows our fixed wording and substitutes nothing', () => {
    expect(generate).not.toContain('buildStubTaskPlan');
    expect(persist).not.toContain('buildStubTaskPlan');
    expect(tasksSource).not.toContain('buildStubTaskPlan');
  });
});

describe('the migration function is safe by construction', () => {
  it('runs as the caller, with an empty search path', () => {
    expect(migration).toMatch(/security invoker/i);
    expect(migration).not.toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = ''/);
  });

  it('takes the owner from auth.uid() and has no user id, status or completion parameter', () => {
    // The parameter list only: the function's own name has "week" in it.
    const signature = migration.slice(migration.indexOf('('), migration.indexOf('returns public.goal_channels'));
    expect(migration).toContain('auth.uid()');
    expect(signature).not.toMatch(/user|status|completed|done|week/i);
  });

  it('puts every task in week 1', () => {
    expect(migration).toMatch(/t\.minutes, 1, now\(\)/);
  });

  it('refuses any task key beyond title, task_type and minutes', () => {
    expect(migration).toMatch(/t - 'title' - 'task_type' - 'minutes'/);
  });

  it('is executable by signed-in users only', () => {
    const sig = 'public\\.create_goal_with_week_one_plan\\(text, text, text, jsonb, jsonb, date, date, jsonb\\)';
    expect(migration).toMatch(new RegExp(`revoke execute on function ${sig}\\s+from public, anon, authenticated, service_role`));
    expect(migration).toMatch(new RegExp(`grant execute on function ${sig}\\s+to authenticated;`));
  });
});

describe('the wizard asks Claude only when the user clicks', () => {
  const wizard = read('components', 'goals', 'GoalBuilderWizard.tsx');

  it('calls the generate action in exactly one place, the generate() handler', () => {
    const calls = [...wizard.matchAll(/generateWeekOnePlanAction\(/g)];
    expect(calls).toHaveLength(1);
    const before = wizard.slice(0, calls[0].index);
    expect(before.slice(before.lastIndexOf('function ')).startsWith('function generate()')).toBe(true);
  });

  it('wires generate() to a button click only', () => {
    expect(wizard).toMatch(/onClick=\{generate\}/);
    // The only `generate()` in the file is the declaration; nothing calls it as a statement.
    expect(wizard.match(/(^|[^\w.])generate\(\)/gm)).toHaveLength(1);
  });

  it('no effect or memo starts a model call', () => {
    for (const hook of ['useEffect(', 'useMemo(', 'useLayoutEffect(']) {
      let from = 0;
      for (let i = wizard.indexOf(hook, from); i >= 0; i = wizard.indexOf(hook, from)) {
        expect(wizard.slice(i, i + 250)).not.toMatch(/generate|generateWeekOnePlanAction/);
        from = i + hook.length;
      }
    }
  });

  it('says on screen what Claude sees', () => {
    expect(wizard).toContain('Claude sees only what you entered in this wizard');
  });

  it('saves through the one create action, and never the old goal-only action', () => {
    expect(wizard).toContain('createGoalWithPlanAction');
    expect(wizard).not.toContain('createGoalFromWizard');
  });

  it('only a click on Create goal saves, and only with a plan in hand', () => {
    expect(wizard).toMatch(/if \(plan\) submit\(\)/);
    expect(wizard).toMatch(/isLast && \(!parsed\.ok \|\| !plan\)/);
  });

  it('the starter plan is a button the user presses, never a fallback', () => {
    const uses = [...wizard.matchAll(/useStarterPlan/g)].length;
    // declaration + the one onClick
    expect(uses).toBe(2);
    expect(wizard).toMatch(/onClick=\{useStarterPlan\}/);
  });
});
