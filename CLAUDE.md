# CLAUDE.md — Momentum AI Life OS Instruction File

## Project Overview
Momentum is an AI-powered Life Operating System designed around guided Goal Channels, continuous velocity tracking, and automated workload rebalancing. Built for speed, clarity, and continuous execution.

## Core Technical Stack
- **Framework:** Next.js (App Router, React 19, TypeScript)
- **Styling:** Tailwind CSS, shadcn/ui components
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, Realtime)
- **AI Integration:** Claude API / Vercel AI SDK
- **Task & Build Tracking:** Jira (`MOM` project key)

---

## Domain Directives (Binding Source of Truth)

Before writing or changing any domain logic, read these files. They override assumptions and defaults.

- **`docs/NINETY_DAY_PLAN_CONTEXT.md`**: the 90-day plan structure, task anatomy, invariants, schema mapping, and seed data. Read it before MOM-9 (seed data), MOM-11 (wizard prompt chips), MOM-14 (velocity), and MOM-15 (rebalancing). Its invariants (e.g., never cut unfinished work, user owns completion) must be encoded in the code.
- **`docs/INTEGRATIONS_SPEC.md`**: the integration layer, the `InboundActivityPayload` contract, provider mapping rules, and the Phase 1 vs. Phase 2 scope boundary. All provider adapters must output this contract.
- If code and these docs disagree, stop and flag it. Do not silently pick one.
- Known gaps and deferred work go in `BACKLOG.md`. Planned work beyond the MVP goes in `ROADMAP.md`.

## Architectural Directives for Iteration-Friendly Architecture

1. **Service Layer Isolation (`@/lib/services/`):**
   - React UI components must **never** call raw Supabase database queries directly (e.g., `supabase.from('goal_channels').select()`).
   - Place all database interactions inside dedicated service modules (e.g., `@/lib/services/goals.ts`, `@/lib/services/tasks.ts`, `@/lib/services/integrations.ts`).
   - UI components must call these service methods to fetch or mutate data.
   - Provider adapters and the ingestion engine follow the same isolation: adapters normalize payloads in `@/lib/services/integrations.ts`, and only services touch Supabase. No component calls a third-party API (Hevy, Google, Anthropic) directly.
   - Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `HEVY_API_KEY`) are read only in server-side service code. Never import them into a client component.

2. **Centralized Types (`@/types/database.types.ts`):**
   - Data models (`GoalChannel`, `MicroTask`, `ConnectedApp`) must be imported from a single source of truth in `@/types/database.types.ts`.
   - Do not define duplicate inline interface definitions inside individual UI component files.

3. **Modular Component Structure:**
   - Organize UI domain components inside `@/components/[domain]` (e.g., `@/components/goals`, `@/components/tasks`).
   - Every component must export clear, strongly-typed props (`interface ComponentProps`).

---

## Development & Jira Workflow Hygiene

### 1. Jira Project Configuration
- **Project Key:** `MOM`
- **Workflow Statuses:** `To Do` | `In Progress` | `In Review` | `Done` | `Closed` (use `Closed`, with a comment saying why, for a ticket that is obsolete or redundant; `Done` means the work was delivered)
- **Core Epics:**
  - `MOM-4`: EPIC 1: Architecture & OS Layout
  - `MOM-5`: EPIC 2: Goal Channel Architect
  - `MOM-6`: EPIC 3: Non-Technical Integration Hub
  - `MOM-7`: EPIC 4: Adaptive Velocity & Rebalancing

### 2. Git Branching Standard
- **Rule:** Never commit directly to `main`. Work on a feature branch and merge it through a pull request.
- **`main` is protected** in GitHub: a pull request needs the CI jobs `checks` and `database` (`.github/workflows/ci.yml`) to pass before it can merge, and nothing is pushed to `main` directly.
- **Pushing and pull requests:** push the feature branch and open the pull request only when the owner says so (at day-end). Merge it with a merge commit once CI is green, then delete the branch.
- **Branch Naming Pattern:** `feature/MOM-<number>-short-description`
- **Examples:**
  - `feature/MOM-8-project-safeguards`
  - `feature/MOM-9-supabase-migration`
  - `feature/MOM-10-3-column-layout`

### 3. Commit Message Formatting
- **Rule:** Prefix every commit message with the associated Jira issue key.
- **Pattern:** `feat(MOM-<number>): concise description of changes`
- **Examples:**
  - `feat(MOM-8): setup baseline project instructions and git hygiene rules`
  - `feat(MOM-9): implement core Supabase schema and seed data`

### 4. Definition of Done (Per Ticket)
- [ ] Feature branch created off clean `main`.
- [ ] Code implemented in Next.js / Supabase with clean service abstractions and central types.
- [ ] Static type verification passes (`npx tsc --noEmit`).
- [ ] Unit and component tests pass (`npm test`). Add or update tests in `tests/` for any change to domain logic, services, components or SQL migrations.
- [ ] Browser tests pass (`npm run test:e2e`; needs Docker and `npx supabase start`) for any change to pages, layout, auth, the goal wizard or the rebalance drawer. Stop `npm run dev` first.
- [ ] SQL verify scripts pass (`npm run verify:sql`; needs `npx supabase start`) for any change to a migration or a script in `supabase/verify/`. A new migration gets a verify script.
- [ ] Verified locally via `npm run dev`.
- [ ] Code committed using the `type(MOM-X)` message format (`feat`, `fix`, `test`, `docs`).
- [ ] Pull request open with CI (`checks` and `database`) green, then merged to `main` through the pull request, and the Jira ticket moved to `Done`.

### 5. Daily Build Loop (MOM-75)
A build day is run from `docs/plans/NEXT_BUILD_PLAN.md` with three Claude Code commands in `.claude/commands/`. They read whatever plan is current and never name a ticket.
1. `/day-start` runs first. It is read-only: it reports uncommitted files, whether `main` matches `origin/main`, branches and pull requests left over from earlier days, whether the plan passes the format check, and missing environment variable names (names only, never values), and it prints the plan's "Today's runbook". The standing smoke-test account is a manual check ("confirm in the dashboard").
2. `/run-block MOM-<n>` runs once per block, in the runbook's order. It finds the block by key, runs the preflight, and shows the block's `CLI Session Config`. It cannot switch your model or effort: on a mismatch it stops and prints the `/model` and `/effort` to type, and it always asks you to confirm effort. It checks the block's prerequisites by name only, resumes an existing feature branch, then follows the block's own prompt and keeps every stop in it. It commits on the feature branch and never merges or pushes.
3. `/day-end` runs after the last block, in the order A (build checks), B (production database verification), D (backlog and Jira sync, with the RAID and failure log review), E (archive the finished plan and generate tomorrow's), then one approval stop to push the day's feature branches (never `main`). Once the pull requests have merged it lists the Jira "Done" transitions with each ticket's acceptance criteria and waits for your OK (step D never moves a ticket to Done, because nothing has merged yet), and then runs C (live checks) when Vercel has deployed.

Rules the commands follow: git steps run one at a time and stop on the first error; they never stage `docs/FAILURE_LOG.md`, `docs/RAID_LOG.md`, `AGENTS.md`, `supabase/.branches/` or `supabase/snippets/` unless the day-end review approved log entries; they never push, merge or apply a migration to production without your explicit OK; and `.claude/settings.json` allows only read-only commands, with `git push`, `supabase db push`, `gh pr merge` and `vercel env` set to ask.

`npm run plan:check` checks the plan against the format contract (it also runs in `npm test`, so a plan that breaks the contract fails the build); `npm run plan:check -- --block MOM-<n>` shows one block. The contract is in `docs/mom-75-plan-execution-spec.md` section 3.

---

## Coding Standards & Environment Safeguards
- **Security:** Maintain strict RLS policies in Supabase. Never expose service role keys on the client.
- **Environment Files:** Ensure `.env.local` remains explicitly ignored in `.gitignore`.
- **UI Design System:** Clean 3-column desktop layout collapsing to single-column mobile execution cards. Focus on high contrast, low clutter, and rapid feedback loops.
---

## RAID and Failure Logs (MOM-92)

Two logs run alongside the build: `docs/RAID_LOG.md` (risks, assumptions, issues, dependencies) and `docs/FAILURE_LOG.md` (each place an AI tool got it wrong, and why). The owner reviews; the build agent does the writing.

- **Capture as you go.** When the owner corrects you, a check fails, or something you said or wrote turns out false (a status, a "done", a command, a file or function name), append a failure-log entry marked `unreviewed`: asked, what went wrong, why, how it was caught, source (`build tool` or `in-product`). When work turns up a new risk, assumption, issue or dependency, append a RAID row marked `unreviewed` with a suggested owner, trigger, response and NIST function. The owner can also say "log that" at any time.
- **The repo is public.** RAID rows name a category of risk, never its location: no table, column, function, endpoint, environment-variable or key names, no exploit steps, no personal data, and owners as roles, not names. Failure entries follow the same rule for secrets and personal data. Specifics belong in Jira.
- **Review at day-end, in plain language.** The day-end backlog step lists the unreviewed entries, asks "predicted it? yes / no / partly" for each failure, and commits only what the owner approves. Never ask the owner to edit these files or run commands for them.
- **Work goes through the backlog.** A RAID response that needs build work gets a `BACKLOG.md` item (and a Jira key at day-end); the RAID row points to that key.
