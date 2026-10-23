# 🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN

> **Date:** 2026-10-23 | **Active Epic:** MOM-16 | **Base Commit:** 9c3310b
>
> **Since the 2026-10-22 plan:** MOM-34, MOM-35 (live smoke test passed, MOM-83), MOM-36, MOM-44, MOM-84, MOM-86, MOM-87 and MOM-88 are done, MOM-31 was delivered inside MOM-44 (so its old Block 2.2 is gone), and the Phase 1 epics MOM-5 and MOM-6 are Done. Not built yet: **MOM-18, MOM-19, MOM-76, MOM-77, MOM-61** (all in Sessions 1 to 3 below). Production verification is now **171 checks across 8 scripts** in `supabase/verify/`; the next free migration number is **010**; `npm test` runs 1015 tests.

---

## Executive Overview & Architectural Invariants

This build cycle makes the app safe to hand to a first real user: a new account starts empty and gets sensible empty states (Session 1), the app looks and lays out like the original v0 wireframes (Session 2), real browser tests guard sign-up, route protection and the wizard's failure paths (Session 3), the external provider UIs and adapters connect (Session 4), CI plus LLM spend governance protect production (Session 5), and the daily build loop becomes three Claude Code commands instead of hand-pasted prompts (Session 6). Every block preserves the three non-negotiable invariants:

1. **Human-Only Completion:** Only the signed-in owner ever changes a task's `status` or `completed_at`. No background job, webhook, ingestion run or LLM may write them, and nothing creates a task as `done`. Enforced by the `micro_tasks_guard_completion` trigger (migration 002) and by source-level tests.
2. **No-Delete / Carry-Forward:** Unfinished work is never cut or hard-deleted. The only moves are `carry_over` and `pull_forward`; work that cannot fit is named in a `cannot_hold` warning. `task_rebalance_history` is append-only.
3. **Service-Layer RLS Enforcement:** The UI never queries Supabase. All access goes through `lib/services/`, scoped to the signed-in user by RLS. The service-role client lives only in server-only modules and is scoped to a user id the server verified. **Every new table or function needs explicit grants and RLS** (this project grants nothing to API roles by default; the MOM-37 lesson).

## Standing Rules (every prompt below repeats what it needs)

- **Read the Jira ticket first.** If its title, scope or acceptance criteria disagree with the prompt, stop and flag it.
- **Production changes need your approval.** A prompt stops before `supabase db push`, `vercel env`, or any push to `origin`, shows what will happen, and waits. Never use the SQL Editor. Tests never run against production and never use production credentials.
- **Database checks are not part of `npm test`.** The 171 checks live in 8 SQL scripts in `supabase/verify/` and run with `npx supabase db query --linked -f <file> -o table` (production) or `npx supabase db query --local -f <file> -o table` (local stack). After any migration, run **all** of them; every row must show `passed = true`.
- **New migrations** continue the numbering (check `ls supabase/migrations`; the next free number today is 010). Never edit an applied migration.
- **Nothing is pushed inside a block.** Each block merges to `main` locally; the single push happens in the Final Day-End section.
- **Standing smoke-test account.** Production keeps ONE standing test account, `smoke-test@momentum-app.test`, created by you in the Supabase dashboard (Authentication → Add user, Auto Confirm User on). Its password lives only in your password manager: Claude never asks for it, prints it or stores it in the repo, and never creates, edits or deletes users on production. Every live sign-in check in this plan says "sign in as the standing smoke-test account". Claude may read its data with **count-only** queries. If its data gets cluttered, you delete and recreate it in the dashboard (it starts empty once migration 010 is live). The SQL verify scripts create and delete their own passwordless temporary users inside one transaction and leave nothing behind, so production should always hold exactly one user. Browser tests (Session 3) use throwaway users on the **local** stack only.

## Session Preflight (run before every block)

```bash
cd C:\Users\matth\momentum-app
git checkout main && git pull --ff-only && git status --short   # expect clean (AGENTS.md, supabase/.branches/ and supabase/snippets/ may be untracked; MOM-68)
npm run plan -- MOM-<n>                                          # optional: the generator's view of the ticket
```

---

## High-Priority Ticket Sequence & Session Blocks

```text
SESSION 1: EMPTY STATES & CLEAN SIGNUP (MOM-18, MOM-19)
  - Real empty states first, then drop the signup seed so a new account starts empty
SESSION 2: WIREFRAME LOOK AND FEEL (MOM-76, MOM-77)
  - Dark design system from the v0 wireframes, then the wireframe layout with single-scroll mobile
SESSION 3: E2E, HYDRATION & COMPONENT TESTS (MOM-61)
  - supabase init, then Playwright against a local Supabase stack: sign-up, route guards, hydration at 390px and 1280px, and the wizard paths the live smoke test could not reach
SESSION 4: EXTERNAL INTEGRATIONS & UI (MOM-62, MOM-38)
  - Google consent flow and Hevy key forms, then real adapters and signed webhooks (MOM-38 needs Hevy samples from you)
SESSION 5: CI PROTECTION & COST GOVERNANCE (MOM-67, MOM-73)
  - GitHub Actions CI with a disposable database, then durable LLM rate limits, usage logging and spend caps
SESSION 6: PLAN EXECUTION COMMANDS (MOM-75)
  - /day-start, /run-block <MOM-n> and /day-end in .claude/commands/, a plan format test in npm test, and a "Today's runbook" section in the plan
```

*Order matters. In Session 1, MOM-19 comes last: the seed must not be removed until a new user sees a sensible empty state (MOM-18; the wizard already builds the plan: MOM-34, MOM-35, live-verified in MOM-83). Session 2 comes before the Playwright session so its component and hydration tests are written against the final UI, and before MOM-62 so the connect forms land on the new Connected Apps page; MOM-76 (styling) comes before MOM-77 (layout). MOM-61 comes after MOM-19 so its browser tests start from an empty new account, and before MOM-67 so CI has a browser suite to run. MOM-62 comes before MOM-38 because the adapters need the connect flows. MOM-75 comes last so its commands and format test are written against the final shape of this plan and its day-end section; it touches no app code and no production, so it can also run on its own on any later day. Safe stopping points: after Block 1.2 (a new user gets an empty account and the wizard), after each session. If the day runs short, stop after Session 3; Sessions 4 to 6 move to the next day, and Block 4.2 is the first to drop (it also waits on Hevy samples from you).*

---

# SESSION 1: EMPTY STATES & CLEAN SIGNUP

**Your prerequisites before this session:** none for Block 1.1. **One-time, during Block 1.2:** the standing smoke-test account already exists (recreated 2026-10-23 at about 15:50 UTC, **before** migration 010), so it holds the old Career Pivot seed. **After** Block 1.2 has pushed migration 010 (the CLI tells you when), delete it and create it again: Supabase dashboard → Authentication → Users → delete `smoke-test@momentum-app.test`, then Add user → same email, password from your password manager, **Auto Confirm User on**. Recreated after 010 it starts empty, which is the live proof of MOM-19. This is the first block that needs a live sign-in.

## Block 1.1: Distinguish Signed-Out, No-Goals, No-Tasks and All-Done Empty States (MOM-18)

* **Objective & Scope:** Replace the placeholder in `MainFeed` (and its `TODO(MOM-Phase2)`) with real states. The ticket predates MOM-36, MOM-44 and MOM-88: the focus task now comes from per-channel views (`buildChannelViews`), so the state is computed there, once, instead of the UI inferring it from emptiness. States: signed out (sign-in prompt), no goals (wizard call to action), a channel with no tasks, everything done (completion state that keeps the Recently done undo).
* **Core Invariants to Protect:** *Human-Only Completion*: "all done" is derived from the user's own ticks, never set by the system; no empty state creates or ticks a task. *Service RLS*: the UI receives a typed state; no Supabase call in a component.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-18: distinguish signed-out, no-tasks and all-done empty states in MainFeed.

Task Instructions:
1. Read ticket MOM-18 in Jira first; its acceptance criteria are the definition of done. NOTE: the ticket names getFocusTask, which no longer exists (MOM-44 replaced it with getPlanSnapshot and buildChannelViews). Follow the code as it is today and say so. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, app/page.tsx, components/layout/ (MainFeed, AppShell, NavSidebar), lib/utils/channelViews.ts, types/channelViews.ts, lib/utils/focusFeed.ts, types/focusFeed.ts, lib/services/auth.ts (getCurrentUser), lib/supabase/proxy.ts, components/tasks/, components/goals/GoalBuilderWizard.tsx, tests/channel-selection.test.tsx and tests/focus-card.test.tsx.
3. Create the feature branch `feature/MOM-18-empty-states` off a clean `main`.
4. State: add a discriminated FeedState ('signed_out' | 'no_goals' | 'no_tasks' | 'all_done' | 'tasks') to types/channelViews.ts and put it on every ChannelView, computed in the pure buildChannelViews: the all-channels view is 'no_goals' when there is no active goal; a channel (or all channels) whose goals have zero tasks is 'no_tasks'; one with finished tasks and nothing left to do is 'all_done'; otherwise 'tasks'. A channel's state looks only at that channel's tasks. 'signed_out' comes from app/page.tsx: ask getCurrentUser() and, when there is no session, pass a SIGNED_OUT_CHANNEL_VIEWS constant instead of reading anything. The UI never infers a state from emptiness.
5. Reachability: lib/supabase/proxy.ts already redirects signed-out visitors to /login, so the signed-out state is normally unreachable. Build it anyway as the safe default for a session that expires between the proxy and the render, do not change the proxy, and add a Jira comment on MOM-18 saying acceptance criterion 1 is met at the component and state level only, and why. Do not edit the ticket's criteria.
6. Components under components/tasks (exported ...Props interfaces, no Supabase calls, no service imports): SignedOutState (sign-in call to action linking /login), NoGoalsState (call to action that opens the goal wizard), NoTasksState (a channel with no tasks; offers to start another goal), AllDoneState (a completion state; keep rendering the existing RecentlyDoneList beneath it so the last task can still be reopened). Lift the wizard's open state from NavSidebar to AppShell so the call to action and "+ New Goal Wizard" open the same single GoalBuilderWizard (rendered once). Remove the TODO(MOM-Phase2) comment in MainFeed and the old placeholder.
7. Tests: the builder for every state, including a channel whose own tasks are all done while another channel still has work (that channel is all_done, the other is tasks), a paused goal, a goal with no tasks and the signed-out constant; jsdom component tests for each state component and for MainFeed choosing the right one, including the wizard call to action opening the dialog (jsdom has no showModal: use the stand-in from tests/channel-selection.test.tsx); a source-level test that app/page.tsx calls getCurrentUser and that no component imports a service. Update the tests that assert the old "No tasks yet." text (tests/channel-selection.test.tsx, tests/focus-card.test.tsx) and list each change.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
9. Update BACKLOG.md for MOM-18 (tick the Focus card empty-state item; add findings with Jira keys).
10. Commit with "feat(MOM-18): distinguish signed-out, no-goals, no-tasks and all-done empty states" and merge into main with --no-ff. Do not push.
11. Update MOM-18 in Jira: Done only if all four acceptance criteria are met (say plainly that criterion 1 is met at the component level, and why).

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] `npm test` passes and the CLI listed every test it changed for the old placeholder text.
  - [ ] The CLI explained why the signed-out state is built but normally unreachable (the proxy redirect) and commented that on MOM-18.
  - [ ] The live check of all four states needs an empty account, so it happens in Block 1.2's gate (sign in as the standing smoke-test account).

---

## Block 1.2: Remove the Career Pivot Seed from New-Account Signup (MOM-19)

* **Objective & Scope:** A new account starts empty and uses the wizard. Drop the `seed_career_pivot()` call from `handle_new_user()` in a **new** migration (010). Existing accounts keep their data (production has no users today). **Hazard:** six verify scripts (001, 002, 003, 004, 007, 008) rely on the signup seed to create their fixtures; each must be rewritten to build its own fixtures with every check preserved. Scripts 005 and 009 look independent but must be run to prove it.
* **Core Invariants to Protect:** *Service RLS*: `handle_new_user` stays SECURITY DEFINER with `search_path` pinned; its grants must not widen (MOM-65 owns closing them). *No-Delete*: nothing deletes existing users' goals or tasks.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-19: remove the Career Pivot seed from new-account signup.

Task Instructions:
1. Read ticket MOM-19 in Jira first; its acceptance criteria are the definition of done. MOM-18 must already be merged (a new user must see sensible empty states); the wizard and its Claude-written week 1 plan are already live (MOM-34, MOM-35, MOM-83). If MOM-18 is not merged, stop and tell me. If the ticket disagrees with these instructions, stop and flag it. Also read MOM-65: if it is still open, its second acceptance criterion ("signing up still seeds the default goal") stops being true after this ticket. Add a Jira comment on MOM-65 saying that criterion should now read "signing up still creates the users row, and a fresh signup has no goals", and leave MOM-65 otherwise unchanged.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md (the seed data section; if the docs say the seed is required, flag it), migration 001 (seed_career_pivot and handle_new_user), migration 004 (the micro_tasks_record_initial_move trigger), migration 008 (seed_career_pivot was re-created to record goal_type), migration 009, and every file in supabase/verify/.
3. Create the feature branch `feature/MOM-19-remove-signup-seed` off a clean `main`.
4. Inventory first: list every verify script and unit test that depends on the seeded Career Pivot channel, its 11 tasks or its one history row. Expected from my audit: verify 001, 002, 003, 004, 007 and 008 depend on it (003 reads the seeded tasks and counts 4 and 1 history rows; 008 checks the seed's goal_type and the backfill); 005 and 009 look independent (009 compares goal and task counts before and after) but you must prove it by running them. Unit tests that mention the seed: tests/goal-criteria.test.ts (reads the seed SQL in migration 008, which stays valid because migrations are never edited), tests/migrations.test.ts, tests/goals-service.test.ts, tests/rebalance-builder.test.ts, tests/rebalance-model.test.ts; check each. Show me the list.
5. Write supabase/migrations/010_remove_signup_seed.sql (never edit an applied migration) that replaces handle_new_user() without the seed call, keeping security definer and search_path = ''. `create or replace` keeps the existing grants; do not widen them. Keep seed_career_pivot() itself for dev seeding, still not executable by API roles. Do not touch existing users' rows.
6. Rewrite the dependent verify scripts so each builds its own fixtures as postgres instead of relying on signup: right after creating a throwaway user, call `perform public.seed_career_pivot(<user id>)` (postgres can; API roles cannot) wherever the script needs the seeded channel, tasks or history. A check that only tested "signing up seeds the goal" must change to the new truth, and you must list each one. All 171 existing checks must still be present and pass. Add checks that a fresh signup has zero goal channels, zero tasks and zero history rows but does have its users row, that handle_new_user is still not executable by API roles, and that a goal created through create_goal_with_week_one_plan with the key career_pivot succeeds on a fresh account with exactly that key (no _2 suffix).
7. Add a unit test that a wizard goal titled "Career pivot" gets the key career_pivot against an empty account (extend the fake if needed), and check toChannelKey/channelKeyFor need no change.
8. Verify locally first: `npx supabase db reset`, then run every file in supabase/verify/ with `npx supabase db query --local -f <file> -o table`; all must pass. The local test user `test@example.com` is wiped by the reset; that is expected.
9. STOP before production. Show me the migration, the diff of every verify script (grouped by script, with the changed checks listed) and `npx supabase db push --dry-run`. Wait for my go-ahead, then push and run ALL scripts in supabase/verify/ against production; all must pass. Then tell me to delete and recreate the standing smoke-test account in the dashboard (it was created before migration 010 and holds the old seed; see the plan's Session 1 prerequisites) and wait for my confirmation.
10. With my confirmation, run a COUNT-ONLY query on production for smoke-test@momentum-app.test: users row 1, goal channels 0, tasks 0, history rows 0. Print counts only, nothing else about the account.
11. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
12. Update BACKLOG.md for MOM-19 and any seed-related items (the two Wizard/Layout items that mention the seed).
13. Commit with "feat(MOM-19): remove the Career Pivot seed from new-account signup" and merge into main with --no-ff. Do not push.
14. Update MOM-19 in Jira: Done only if all three acceptance criteria are met (comment what shipped and how verified).

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You reviewed the verify-script diff: the same checks, now with explicit fixtures, and the signup-seed checks rewritten to the new truth.
  - [ ] After the push, the verify total is all passing (171 plus the new checks).
  - [ ] You deleted and recreated the standing smoke-test account in the dashboard **after** migration 010 was live; the CLI's count-only query shows zero goals, tasks and history for it.
  - [ ] After the day-end push, sign in as the standing smoke-test account: you see the **no-goals** state with the wizard call to action (Block 1.1), create a goal in the wizard, tick every task for that channel and see the **all-done** state with the undo still available. If its data gets cluttered, delete and recreate it in the dashboard.

---

# SESSION 2: WIREFRAME LOOK AND FEEL (MOM-76, MOM-77)

**Your prerequisites before this session:** (1) the v0 wireframe export stays **outside** the repo at `C:\Users\matth\momentum-samples\momentum-core-responsive-dashboard\` (it is there today; the prompts read it as reference and never copy its `package.json`, lockfile or `public/` placeholders); (2) the live wireframe open for comparison: https://momentum-teal-phi.vercel.app; (3) the standing smoke-test account exists (Session 1) for the look checks, run with `npm run dev`, which uses your `.env.local` backend. Decisions already made (2026-10-23): **dark only** for now (light mode is MOM-30), and **single scroll on mobile** (the tab bar goes; MOM-32 is Closed). The placement of MOM-76 and MOM-77 under the Phase 1 epic MOM-4 is intentional.

## Block 2.1: Adopt the Wireframe Design System, Dark (MOM-76)

* **Objective & Scope:** Port the wireframe's tokens, CSS classes, icons and Button onto the existing components so the app looks like the wireframe. Layout, navigation and data stay as they are (Block 2.2). Same stack as the wireframe (Next 16, React 19, Tailwind v4), so the CSS ports directly.
* **Core Invariants to Protect:** *Human-Only Completion*: the restyled task check is still the owner's own click and nothing else. *Service RLS*: styling only; no new data access. Behavior is unchanged, so existing test assertions must not change.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-76: adopt the wireframe design system (dark).

Task Instructions:
1. Read ticket MOM-76 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, app/globals.css, app/layout.tsx and every component under components/ (auth, goals, integrations, layout, rebalance, tasks including UpNextList, RecentlyDoneList and useTaskToggle, velocity). Then read the wireframe reference at C:\Users\matth\momentum-samples\momentum-core-responsive-dashboard\ (app/globals.css, app/layout.tsx, components/momentum-dashboard.tsx, components/ui/button.tsx, components.json). If that folder is missing, stop and ask me for the path. It is reference only: never copy its package.json, lockfile, analytics or public/ placeholders into this repo.
3. Create the feature branch `feature/MOM-76-wireframe-design-system` off a clean `main`.
4. Tokens: port the wireframe's dark tokens into app/globals.css (color-scheme dark, oklch palette, lime #c6f36d, radius 0.85rem, surface and channel colors). Map this repo's existing token names (background, foreground, panel, border, muted, accent) onto the new palette or update every use; nothing may be left pointing at the old indigo values. Set viewport themeColor #111513 in app/layout.tsx. Do not add a light palette or a theme toggle (that is MOM-30).
5. Classes: port only the wireframe classes this repo uses now (score card and ring, focus card and task check, connected-app row and toggle, eyebrow, badges, buttons, channel card and track). Leave the .desktop-* layout rules and .adaptive-sheet for MOM-77.
6. Add lucide-react and the shadcn/ui Button (npx shadcn add button, or port components/ui/button.tsx with its class-variance-authority dependency). Show me the package.json diff before installing anything else.
7. Restyle without changing behavior: VelocityHero (ring gauge with the score; keep the text alternative), FocusTaskCard, UpNextList, RecentlyDoneList, BurnoutRiskBadge, NavSidebar, MainFeed, IntegrationCardList, RebalanceSideCard, RebalanceDrawer, GoalBuilderWizard and the sign-in page (app/login/page.tsx, components/auth/SignInForm.tsx). Keep every role, aria attribute and label the tests rely on (the jsdom tests in tests/channel-selection.test.tsx and tests/focus-card.test.tsx query by role and name); color must never carry meaning alone; text stays WCAG AA on the dark background.
8. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. If a test fails, fix the style change, not the assertion; selector-only updates are allowed and must be listed.
9. Run `npm run dev`, and show me the main view at 390px and 1280px next to the wireframe (I sign in as the standing smoke-test account; you never see its password). Wait for my OK on the look before committing.
10. Update BACKLOG.md: tick the MOM-76 item, add anything deferred with its Jira key.
11. Commit with "feat(MOM-76): adopt the wireframe design system (dark)" and merge into main with --no-ff. Do not push.
12. Update MOM-76 in Jira: Done only if all acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Sign in as the standing smoke-test account. Locally at 390px and 1280px, the velocity ring, focus card, integration cards and rebalance card look like the wireframe, dark, with the lime accent.
  - [ ] Ticking and unticking the focus task still works, and the drawer still opens and applies only on your click.

---

## Block 2.2: Adopt the Wireframe Layout and Navigation, Single-Scroll Mobile (MOM-77)

* **Objective & Scope:** Match the wireframe's structure: a three-column desktop from 1200px (232px / fluid / 326px) with a sidebar workspace nav, goal cards with progress, the connected stack and an inline Momentum AI rebalance nudge; on mobile, one scrolling column with a header and the nudge as a dismissible bottom sheet. Remove `MobileTabBar`. Add a Connected Apps page (reachable on mobile and desktop) and a Settings stub with sign-out. No streak badge yet (MOM-78). Everything built since the last plan must keep working: channel selection in the URL (`?channel=<goal id>`, MOM-88), per-channel views and velocity (MOM-44), per-channel rebalancing (MOM-87) and the empty states (MOM-18).
* **Core Invariants to Protect:** *No-Delete / Carry-Forward* and *Human-Only Completion*: the nudge only summarises and opens the existing drawer; applying stays a user click in the drawer, and nothing auto-applies. *Service RLS*: progress counts come from the page's single `getPlanSnapshot` read through pure functions, scoped to the signed-in user.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-77: adopt the wireframe layout and navigation with a single-scroll mobile view.

Task Instructions:
1. Read ticket MOM-77 in Jira first; its acceptance criteria are the definition of done. Also read MOM-32 (Closed: superseded by this ticket), MOM-62 (its connect forms will land on the new Connected Apps page) and MOM-78 (streak, not in scope). If MOM-77 disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/NINETY_DAY_PLAN_CONTEXT.md section 5, app/page.tsx, app/layout.tsx, lib/supabase/proxy.ts (PUBLIC_PATHS), components/layout/ (AppShell, NavSidebar, MainFeed, ConnectedStackPanel, MobileTabBar, panels.ts), lib/utils/channelViews.ts, lib/utils/channelParam.ts, lib/utils/progress.ts, types/channelViews.ts, components/rebalance/, components/integrations/, components/auth/SignOutButton.tsx and tests/channel-selection.test.tsx. Then read the wireframe reference at C:\Users\matth\momentum-samples\momentum-core-responsive-dashboard\ (components/momentum-dashboard.tsx and the .desktop-*, .mobile-header, .goal-builder-* and .adaptive-sheet rules in app/globals.css). MOM-76 and MOM-18 must already be merged; if not, stop and tell me.
3. Create the feature branch `feature/MOM-77-wireframe-layout` off a clean `main`.
4. Desktop (from 1200px): three columns as in the wireframe. Left: logo mark, burnout badge, workspace nav (Daily Dashboard, Goal Channels, Connected Apps, Settings), active goals with progress, "Your pace" footer. Centre: the goal-builder banner (New Goal Wizard and Adjust Weekly Pace open what they open today; omit Review Milestones unless it has a real target, and tell me), date, headline, velocity ring, focus card, goal cards. Right: connected stack summary and the Momentum AI nudge. Choosing a goal keeps working through ?channel=<goal id> (withChannelParam, resolveChannel) and still changes the feed, velocity and rebalance proposal to that channel's.
5. Mobile (below 1200px): one scrolling column with a header (logo, burnout badge, avatar with the signed-in user's initials). Delete MobileTabBar and the per-panel view state in AppShell and components/layout/panels.ts. The rebalance nudge is a bottom sheet the user can dismiss; dismissal is per session and changes no data. Keep RebalanceDrawer rendered outside any hidden panel. With several active goals and All channels selected, the nudge keeps saying to choose a channel (ChannelView.rebalanceHint), as the side card does.
6. Pages: a Connected Apps page (app/connections/page.tsx) that renders IntegrationCardList, linked from the nav on desktop and from the mobile header or menu; a Settings stub page (app/settings/page.tsx) with sign-out. Both are authenticated routes: do NOT add them to PUBLIC_PATHS, and check the proxy redirects them to /login when signed out.
7. Goal progress: do NOT add a new service or a second read. listGoalProgress and the pure summarizeAllGoalProgress (lib/utils/progress.ts, MOM-86) already exist; build the sidebar and goal-card progress from the page's single getPlanSnapshot with summarizeAllGoalProgress, pass it down as props, and add tests for the wiring (another user's tasks never count; carried-over tasks count once). If you think listGoalProgress should be removed or reused, tell me rather than deciding.
8. The nudge shows the proposal summary from the selected channel's existing rebalance view and a "Review" action that opens the drawer. No new "Accept" path that applies without the drawer; if you want one, stop and ask me.
9. No streak badge (MOM-78). No Supabase call in any component; every new component exports an interface ...Props.
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. The "on a phone" tests in tests/channel-selection.test.tsx depend on MobileTabBar (the Channels and Feed tab buttons): update or remove them and list what you changed; keep every other assertion.
11. Run `npm run dev`; show me 390px and 1280px next to the wireframe, and confirm there are no hydration warnings in the console at either width. I sign in as the standing smoke-test account. Wait for my OK.
12. Update BACKLOG.md: tick the MOM-77 item, retire the MOM-32 item, note the Progress items it resolves, and add any follow-ups with Jira keys.
13. Commit with "feat(MOM-77): adopt the wireframe layout and single-scroll mobile view" and merge into main with --no-ff. Do not push.
14. Update MOM-77 in Jira: Done only if all acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Sign in as the standing smoke-test account (create two goals in the wizard if it has fewer). Locally at 1280px: three columns with the nav, goal cards with real progress, the connected stack and the nudge, matching the wireframe; picking a goal changes the feed, the ring and the nudge, and survives a reload.
  - [ ] Locally at 390px: one scroll, no tab bar; the nudge slides up and can be dismissed; Connected Apps opens from the menu.
  - [ ] "Review" opens the drawer and nothing moves until you apply there. After the day-end push, repeat on the live site as the standing smoke-test account.

---

# SESSION 3: E2E, HYDRATION & COMPONENT TESTS

## Block 3.1: Playwright E2E, Hydration Checks and Component Tests (MOM-61)

* **Objective & Scope:** Jira's three criteria: Playwright with `npm run test:e2e`; a console check that fails on any hydration error at 390px and 1280px; Testing Library with jsdom for component tests (already installed in MOM-36, so this block fills in the remaining component tests). This plan adds browser specs on top, run **only against a local Supabase stack** (`supabase start`, which needs Docker; confirmation emails are read from the local Mailpit inbox): sign-up, sign-in, protected-route guards, sign-out, and the wizard paths the MOM-83 live smoke test could not reach (the 20 second wait message, the Try again failure and "Use the starter plan instead"). It never signs up users on production and never touches the standing smoke-test account.
* **Core Invariants to Protect:** *Service RLS*: tests never use production URLs, keys or the real service-role key; the config refuses to run unless the Supabase URL is local. Protected routes must reject unauthenticated sessions. *Human-Only Completion*: component tests prove the UI offers no control that completes a task other than the owner's own toggle.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-61: Playwright E2E, hydration checks and component tests, plus local auth and wizard specs.

Task Instructions:
1. Read ticket MOM-61 in Jira first (its description is three bullets; treat them as the criteria), then the 2026-10-23 audit comment on it. Also read MOM-54, MOM-55 to MOM-59 and the BACKLOG.md "Tests" and "E2E" items. The browser specs below (auth, route guards, and the MOM-83 live paths) are an extension agreed in the build plan: add a Jira comment on MOM-61 saying so. If anything else disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, vitest.config.mts, tests/channel-selection.test.tsx and tests/focus-card.test.tsx (the jsdom pattern: a "// @vitest-environment jsdom" first line, server actions mocked, and a stand-in for next/navigation), components/, app/login/page.tsx, app/auth/callback/route.ts, lib/supabase/proxy.ts, lib/config/env.ts and lib/services/tasks.ts (generateWeekOnePlan and its 20 second cooldown). FIRST STEP: the repo has no supabase/config.toml, which `supabase start` needs. Run `npx supabase init` (do not run `supabase link` or change the linked project), enable local email confirmations (the sign-up must send a confirmation email) and keep the local Mailpit inbox on, and show me the generated supabase/config.toml before committing it; it must hold no secrets or production project ref. Check that supabase/.branches, supabase/.temp and supabase/snippets need no .gitignore entry beyond MOM-68's scope, and tell me.
3. Create the feature branch `feature/MOM-61-e2e-and-component-tests` off a clean `main`.
4. Component tests (jsdom and Testing Library are already installed; keep the vitest environment node by default and opt in per file): FocusTaskCard's own carried-over and pulled-forward markers and its "Moved N times" line; BurnoutRiskBadge at each risk level; RebalanceDrawer including a successful "Ask Claude to review" replacing the proposal on screen, and Apply, with the server actions mocked; GoalBuilderWizard with the actions mocked: the steps, Generate showing a plan labelled "Written by Claude", a failure showing its message with a Try again button and no automatic fallback, "Use the starter plan instead" showing a plan labelled as the starter plan and Create sending that plan to the create action, and the 20 second wait message shown when the action returns it.
5. Playwright: install it and add `npm run test:e2e`. The Playwright config starts `next dev` with env from `npx supabase status -o env` (never printed) and throws if NEXT_PUBLIC_SUPABASE_URL is not localhost or 127.0.0.1; add a unit test for that guard. It also makes sure ANTHROPIC_API_KEY is NOT set for the dev server (check how lib/config/env.ts treats an empty value) and the specs fail loudly if the key is present.
6. Specs against the local stack only (tests/e2e/): (a) hydration: /login and, once signed in, the home page, each at 390px and 1280px, failing on any console error or warning that mentions hydration. (b) auth: sign up with a unique throwaway email through the normal sign-up form, read the confirmation link from the local Mailpit inbox, land signed in, confirm "/" redirects to /login when signed out (also /connections and /settings if MOM-77 added them), sign out, sign in again. Do NOT create users through the local auth admin API: BACKLOG.md records that it returns 500 and leaves NULL token columns. (c) wizard paths from an empty new account (migration 010 means no seed): pick a goal type, reach Review, click Generate with no ANTHROPIC_API_KEY and assert the failure message and a working Try again; click Try again at once and assert the wait message (a failed request counts toward the 20 second limit; verify this against lib/services/tasks.ts); click "Use the starter plan instead", assert it is labelled as the starter plan, click Create, and assert the goal appears in the sidebar with unticked tasks, that reloading on ?channel=<goal id> keeps it, and that the back button returns to All channels. Adapt the exact texts to the code and tell me where they differ from my wording.
7. If Docker or the local stack is unavailable, tell me, still ship steps 4 and 5's guard and the hydration spec for /login, and list exactly which specs are blocked and why. Do not fake them.
8. Prove the hydration check can fail: temporarily introduce a mismatch, show the test failing, then revert.
9. Keep `npm test` fast and independent of Playwright. Propose wording to add both commands to CLAUDE.md's Definition of Done and apply it only if I approve.
10. Run `npx tsc --noEmit`, `npm test`, `npm run test:e2e` and `npm run build`; all must pass.
11. Update BACKLOG.md (tick the E2E items you cover, including the two I added on 2026-10-23). Update the 2026-10-23 audit comments on MOM-55 to MOM-59 with what is now covered; propose Done for any ticket whose criteria are ALL covered and tell me, but do not transition anything.
12. Commit with "test(MOM-61): add Playwright hydration checks, component tests and local auth and wizard specs" and merge into main with --no-ff. Do not push.
13. Update MOM-61 in Jira: Done only if all three Jira bullets are met; otherwise say what is blocked and leave it open.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the type(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] `npm test` and `npm run test:e2e` both pass locally (Docker running).
  - [ ] You watched the hydration test **fail** on the deliberately broken page.
  - [ ] The CLI showed the guard refusing a non-local Supabase URL, and listed any specs still blocked.
  - [ ] The wizard spec exercised the wait message, Try again and the starter plan for real (these were the three paths the live smoke test could not reach).
  - [ ] The standing smoke-test account was not used by any test.

---

# SESSION 4: EXTERNAL INTEGRATIONS & UI

**Your prerequisites before this session:** (1) a Google Cloud OAuth client (Web application, Calendar read-only scope) with redirect URIs `https://momentum-app-eight-chi.vercel.app/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`, yourself added as a test user; (2) `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Vercel Production and in `.env.local`; (3) for Block 4.2, a **redacted real Hevy API response** or the Hevy API documentation saved in the repo, and a Hevy Pro API key; (4) the standing smoke-test account for the live connection checks.

## Block 4.1: Google OAuth Consent Flow and Hevy API-Key Forms (MOM-62)

* **Objective & Scope:** The Google consent redirect and callback route `/api/auth/callback/google`, a Hevy key form, and connect/disconnect buttons wired to `lib/services/integrations.ts`, shown on the existing integration cards in `components/integrations/`, which MOM-77 (Block 2.2) renders on the Connected Apps page. Token storage, retrieval and refresh already exist (MOM-37). The provider catalog has two providers, Hevy and Google Calendar; there is no Jira provider. MOM-77 adds a Settings stub, but integration controls stay on the Connected Apps page, and no drawer is added.
* **Core Invariants to Protect:** *Service RLS / secrets*: no token, key or client secret reaches the browser (only `IntegrationAccount` does); the callback requires a verified session and takes the user id from it, never the request; `state` is checked. *Human-Only Completion*: connecting an app creates and completes no tasks.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-62: build the Google OAuth consent flow and Hevy API key UI forms.

Task Instructions:
1. Read ticket MOM-62 in Jira first (the description is a bullet list; treat each bullet as a criterion). If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (sections 3.C and 5), lib/services/integrations.ts (saveApiKey, saveOAuthTokens, disconnectIntegration, listIntegrationAccounts), types/integrations.ts, components/integrations/, app/actions/integrations.ts, lib/config/env.ts (getGoogleOAuthEnv) and lib/supabase/proxy.ts. Confirm GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set locally (names only; never print values) or tell me what is missing.
3. Create the feature branch `feature/MOM-62-connect-flows` off a clean `main`.
4. Google: a route that starts the consent redirect (state and PKCE in an httpOnly short-lived cookie, minimal scope calendar.readonly, access_type=offline) and the callback at app/api/auth/callback/google/route.ts that requires a signed-in session, verifies state, exchanges the code server-side, validates the response and calls saveOAuthTokens(). The callback is an authenticated route: do NOT add it to PUBLIC_PATHS. Handle denial, bad state and exchange failure with a friendly message and no token or provider text in URLs or logs.
5. Hevy: a Server Action form that calls saveApiKey(); the key is never echoed back or stored client-side.
6. UI: connect and disconnect buttons on each existing card from listIntegrationAccounts() (IntegrationAccount only), including a "needs reconnect" state for status needs_reauth. The cards live on the Connected Apps page from MOM-77. Only Google Calendar and Hevy exist as providers; do not add Jira, integration controls on the Settings page, or a drawer. If you think one is needed, stop and ask.
7. Remove the TODO(MOM-Phase2) comment about the connect flow in lib/services/integrations.ts.
8. Tests: state mismatch, missing session, exchange failure, denial, no token or secret in any returned value, and a boundary test that no component imports the Google exchange code. Mock the network.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass. Confirm the client output contains no secret names or values.
10. Update BACKLOG.md for MOM-62 (tick resolved items, add findings with Jira keys).
11. Commit with "feat(MOM-62): build the Google consent flow and Hevy key forms" and merge into main with --no-ff. Do not push.
12. Update MOM-62 in Jira: leave it open until I confirm both connections work live; comment what shipped and what I must test.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:** *(after the day-end push and deploy; sign in as the standing smoke-test account)*
  - [ ] Connect Google Calendar with your real Google account: the card shows connected. Revoke access in your Google account, trigger a refresh, and the card shows "needs reconnect".
  - [ ] Connect Hevy with your real key, then disconnect; ask the CLI for a **count-only** query confirming the credential row is gone.
  - [ ] In the browser Network tab during connect, no token, key or client secret appears in any response.

---

## Block 4.2: Hevy and Google HTTP Adapters and Signed Webhook Routes (MOM-38)

* **Objective & Scope:** Real clients in `lib/adapters/hevy.ts` and `lib/adapters/google.ts` whose output matches `InboundActivityPayload` (`docs/INTEGRATIONS_SPEC.md`), plus `app/api/webhooks/[provider]/route.ts` with signature verification. Adapters only normalize; they hand results to the existing ingestion engine (`lib/services/ingestion.ts`), and only services touch Supabase. **This block cannot be built honestly for Hevy without Hevy's real API documentation or a redacted sample response; the prompt stops if none is provided.**
* **Core Invariants to Protect:** *Human-Only Completion*: ingestion writes evidence and never `status` or `completed_at`, and never completes or creates a completed task. *Service RLS*: the Hevy key is **per user**, read server-side from `integration_credentials` via the integrations service; the global `HEVY_API_KEY` env var is vestigial (MOM-74) and must not be used. The webhook rejects unsigned or invalid requests before touching the database.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-38: Hevy and Google HTTP clients and provider webhook routes.

Task Instructions:
1. Read ticket MOM-38 in Jira first; its acceptance criteria are the definition of done. MOM-62 must already be merged; if not, stop and tell me. If anything disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, docs/INTEGRATIONS_SPEC.md (the InboundActivityPayload contract, sections 3, 5 and 6), lib/services/integrations.ts (getMockHevyActivity, getMockCalendarActivity, getAccessToken, getMyAccessToken), lib/services/ingestion.ts and tests/ingestion.test.ts.
3. Ask me for the Hevy API documentation or a redacted real /v1/workouts response. If I have not provided one, STOP before writing the Hevy adapter and tell me; do not invent field names. The Google Calendar adapter may proceed from Google's public API.
4. Create the feature branch `feature/MOM-38-real-adapters-and-webhooks` off a clean `main`.
5. Write lib/adapters/hevy.ts and lib/adapters/google.ts (HTTP clients; Zod-validate every response; output valid InboundActivityPayload objects). The Hevy key comes from the user's stored credential through the integrations service, sent as the `api-key` header. Do NOT read HEVY_API_KEY. Adapters never touch Supabase.
6. Write app/api/webhooks/[provider]/route.ts: verify the provider's signature or token (per the spec; if the spec does not define it for a provider, stop and ask) BEFORE any database access, reject unsigned or invalid requests with a generic 401, resolve the user from the verified payload and hand the normalized activities to the ingestion engine. Never log payload bodies or secrets.
7. Remove both TODO(MOM-Phase2) comments in lib/services/integrations.ts (the HTTP clients and the webhook handlers).
8. Tests (network mocked, using the redacted sample): each adapter returns valid payloads for real-shaped responses and rejects malformed ones; the webhook rejects unsigned, mis-signed and replayed requests; a source-level test that nothing in the adapter or webhook path writes status or completed_at.
9. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
10. No migration is expected; if one is needed, stop and ask me.
11. Update BACKLOG.md for MOM-38 (tick resolved items, add findings with Jira keys).
12. Commit with "feat(MOM-38): build Hevy and Google adapters and signed webhook routes" and merge into main with --no-ff. Do not push.
13. Update MOM-38 in Jira: Done only if all three acceptance criteria are met; otherwise comment what is unmet and leave it open.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You provided the Hevy sample before the Hevy adapter was written.
  - [ ] An unsigned `curl` POST to the webhook route returns 401 and changes nothing.
  - [ ] After the push, signed in as the standing smoke-test account, a real activity from your connected account shows up as evidence and **no task changes state**.

---

# SESSION 5: CI PROTECTION & COST GOVERNANCE

## Block 5.1: GitHub Actions CI with a Disposable Database (MOM-67)

* **Objective & Scope:** `.github/workflows/ci.yml` with two jobs. Job 1 runs `npx tsc --noEmit`, `npm test`, `npm run build` and `npm run test:e2e` (from MOM-61) on every push and PR. Job 2 starts a **local** Supabase stack, applies every migration, and runs every file in `supabase/verify/`, failing on any `passed = false` or error.
* **Core Invariants to Protect:** All three; this ticket exists to guard them. CI must **never** hold production credentials or the production project ref.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-67: run the SQL verify scripts, type check, tests and build in CI.

Task Instructions:
1. Read ticket MOM-67 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, package.json, supabase/config.toml (added by MOM-61; if it is missing, MOM-61 was not merged: stop and tell me), every file in supabase/verify/ and supabase/migrations/, and how the scripts report results (a table with a `passed` column). Production has 8 scripts and 171 checks today, plus whatever MOM-19 added.
3. Create the feature branch `feature/MOM-67-ci-pipeline` off a clean `main`.
4. Add .github/workflows/ci.yml with two jobs. Job 1: install, `npx tsc --noEmit`, `npm test`, `npm run build` with dummy NEXT_PUBLIC_SUPABASE_* values and no real secrets, and `npm run test:e2e` against the local stack (it needs Docker and `supabase start`, so run it in Job 2 if that is simpler, and say which). Job 2: supabase/setup-cli plus `supabase start`, apply every migration, run every file in supabase/verify/ against the local database, and fail if any script returns passed = false or errors. No production credentials, tokens or project ref anywhere in the workflow.
5. Put the verify runner in scripts/ (not inline YAML; scripts/generate-execution-plan.ts is the existing style) so it runs locally too, using `npx supabase db query --local -f <file> -o json`, with a unit test of its pass/fail parsing.
6. Verify what you can locally (run the runner against a local stack if Docker is available; say what you could not test). Do not push or open a PR.
7. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
8. CLAUDE.md currently describes direct merges to main. Propose wording for a PR-based workflow with branch protection and show me the diff; apply it only if I approve.
9. Update BACKLOG.md (tick the CI item, add anything new with Jira keys).
10. Commit with "feat(MOM-67): run type check, tests, build and SQL verify scripts in CI" and merge into main with --no-ff. Do not push. Tell me exactly which steps need me: pushing, opening a PR, and turning on branch protection in GitHub.
11. Update MOM-67 in Jira: leave it open until I confirm the workflow ran green on GitHub and a failing check blocks a merge; comment what is done and what is waiting on me.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] Push a throwaway branch and open a PR: both jobs run **green**.
  - [ ] Break one verify check on purpose: the PR goes **red** and cannot merge.
  - [ ] Enable branch protection requiring both checks on `main`; the ticket stays open until you do.
  - [ ] No production secret exists in the repository's Actions secrets.

---

## Block 5.2: LLM Rate Limiting, Usage Logging and Spend Caps (MOM-73)

* **Objective & Scope:** Jira's scope: a durable per-user rate limit and a daily cap per user and overall; per-call token and latency records with no prompt or answer content, and a way to read them; a written decision on the SDK choice and on server-side fallbacks. Applies to both Claude call sites: `requestModelRebalance` and the week 1 plan generator `generateWeekOnePlan` (MOM-35), whose 20 second limits live in server memory today.
* **Core Invariants to Protect:** *Service RLS*: the new `llm_usage_logs` table needs RLS and **explicit grants** (a signed-in user may read only their own rows; only server-only code scoped to a verified user id may write), plus a verify script. *Human-Only Completion*: governance code never touches tasks. A tripped limit must not silently substitute output: rebalance may fall back to the existing rule-based proposal, clearly labelled; the plan generator shows the limit message and offers the rule-based starter plan only as the user's explicit choice.
* **CLI Session Config:** Model: Sonnet | Effort: High

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-73: harden the Claude calls with a durable rate limit, spend cap, usage logging and an SDK and fallback decision.

Task Instructions:
1. Read ticket MOM-73 in Jira first; its acceptance criteria are the definition of done. If it disagrees with these instructions, stop and flag it.
2. Read CLAUDE.md, lib/ai/rebalance.ts, lib/ai/taskPlan.ts, lib/services/tasks.ts (requestModelRebalance(channelId, ...) and generateWeekOnePlan with their in-memory cooldown maps), lib/supabase/admin.ts, migrations 005 and 006 (how a server-only table is granted), migration 009 (a function granted to authenticated only) and supabase/verify/005.
3. Create the feature branch `feature/MOM-73-llm-governance` off a clean `main`.
4. Design before coding: the llm_usage_logs table (user_id, feature, model, input_tokens, output_tokens, latency_ms, outcome, created_at; NO prompt or answer content), who can read and write it, how the durable per-user limit and the daily per-user and overall caps are computed from it, and the fallback behaviour for each of the two call sites. Wait for my OK.
5. Implement lib/services/llm.ts (server-only) wrapping both Claude call sites: check the limit and caps before calling, record usage after, and return a typed "limited" result. Apply the fallback rules exactly: rebalance may use the rule-based proposal, labelled; plan generation shows the message and offers the starter plan only as the user's explicit choice. Never silently substitute. A refused channel id or a bad input must still not use up the limit (see the existing tests).
6. Write the next migration (011 if MOM-19 took 010) with RLS, explicit grants, and nothing for anon. Add supabase/verify/<n>_llm_usage_logs.sql: a user cannot read another user's rows, API roles cannot write directly, and the content columns do not exist.
7. STOP before production. Show me the migration and `npx supabase db push --dry-run`, wait for my go-ahead, then push and run ALL scripts in supabase/verify/; all must pass.
8. Write the SDK and fallback decision in docs (keep @anthropic-ai/sdk unless you find a reason; server-side fallbacks need a beta header, so do not enable them without testing against the real API, which needs my approval because it costs money).
9. Tests: the limit holds across simulated instances, the cap trips and falls back as specified for both call sites, usage rows carry no content, and nothing in the path writes status or completed_at.
10. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass.
11. Update BACKLOG.md for MOM-73 and its related items (the rebalance and wizard rate-limit items).
12. Commit with "feat(MOM-73): add durable rate limiting, usage logging and spend caps for LLM calls" and merge into main with --no-ff. Do not push.
13. Update MOM-73 in Jira: Done only if all three acceptance criteria are met.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes; committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] You approved the table design and the fallback rules before any migration was written.
  - [ ] The verify total is all passing.
  - [ ] After the push, signed in as the standing smoke-test account, two rapid "Ask Claude" clicks from two browser tabs: the second is refused. Ask the CLI for a **count-only** query showing usage rows exist and contain no text.

---

# SESSION 6: PLAN EXECUTION COMMANDS

**Your prerequisites before this session:** none. This session changes tooling only: no app code, no migration, nothing on production. It is safe to run on its own on any day. The spec's "run a full day by hand first" bar was met on 2026-10-23, and that day-end is the friction the commands should remove: the step B loop needed Git Bash, the smoke-test account had to be created by hand, the Vercel output needed explaining, and step D needed a pause before Jira transitions.

## Block 6.1: Plan Execution Commands and Plan Format Check (MOM-75)

* **Objective & Scope:** Implement `docs/mom-75-plan-execution-spec.md`: three Claude Code commands in `.claude/commands/` (`/day-start`, `/run-block <MOM-n>`, `/day-end`) that read whatever `docs/plans/NEXT_BUILD_PLAN.md` is current and never name tickets; a Vitest format check in `npm test`; a "Today's runbook" section in the plan; a read-only allowlist in `.claude/settings.json`; and the daily loop documented in `CLAUDE.md`. The commands orchestrate the plan's own prompts and keep every approval stop; automation removes copy-paste, not visibility.
* **Core Invariants to Protect:** *Production approval*: no command runs `supabase db push`, `git push`, `vercel env` or any production write without your explicit OK, and none of them is in the allowlist. *Secrets*: prerequisite checks name env vars only and never print values; the standing smoke-test account's password is never asked for. The three domain invariants are untouched: this block changes no app code.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-75: build the plan execution commands and the plan format check.

Task Instructions:
1. Read ticket MOM-75 in Jira first; its five acceptance criteria are the definition of done. Then read docs/mom-75-plan-execution-spec.md in full; it is the design. If the ticket and the spec disagree, stop and flag it.
2. Read CLAUDE.md, package.json, vitest.config.mts, scripts/generate-execution-plan.ts (the existing plan generator; keep its style), tests/ (how existing tests read repo files) and the whole of docs/plans/NEXT_BUILD_PLAN.md, including the Final Day-End section (steps A to F) and the Standing Rules (standing smoke-test account, production approval).
3. Before writing any command, look up the current Claude Code documentation for custom slash commands (file location, frontmatter, how $ARGUMENTS is passed), for allowlist syntax in .claude/settings.json, and for how a session's model and effort are read or set (the spec leaves effort as an open question). Tell me what you found and what each command can and cannot do automatically. Do not guess.
4. Create the feature branch `feature/MOM-75-plan-execution-commands` off a clean `main`.
5. Format check first: tests/build-plan-format.test.ts per spec sections 3 and 4. Headings in this plan look like `## Block 1.1: <title> (MOM-18)`; each block must have exactly one ticket key, a `CLI Session Config` line, exactly one fenced `text` prompt and a `User Verification Gate` checklist; the plan must have the metadata header and a "Today's runbook" section. Failing fixtures go in tests/fixtures/, one per rule, and each failure message names the block. The check reads the plan from disk but must not fail just because a session is not today's.
6. Add the "Today's runbook" section near the top of docs/plans/NEXT_BUILD_PLAN.md (block order, the one command to type per block, what to check at each gate, in plain language), so the test passes on the current plan. Update the plan's day-end step E prompt so tomorrow's generator always produces the runbook and the contract.
7. Commands in .claude/commands/, each short and orchestrating the plan rather than repeating it:
   - /run-block <MOM-n>: spec 2.1, steps 1 to 8. It finds the block by key, stops on zero or several matches, runs the preflight, shows the block's CLI Session Config and stops with the exact fix on a model mismatch, asks me to confirm effort, checks the block's prerequisites by name only, resumes an existing feature branch, says in one line what each step does before doing it, keeps every stop in the block's prompt, and ends with the gate (deferred post-push items appended to docs/plans/.pending-live-checks.md, git-ignored) and a five-line summary.
   - /day-start: spec 2.2. Read-only. Include: the standing smoke-test account is a manual check (it cannot be verified without production credentials, so it is listed as "confirm in the dashboard", not checked).
   - /day-end: spec 2.3, in the order A, B, D, E, one push, C, deferred gates. Lessons from 2026-10-23 to build in: on Windows the step B verify loop runs in Git Bash, which Claude Code already uses; the step B user count expects exactly 1 (the standing smoke-test account); step D pauses for my OK before any Jira transition to Closed or Done; E archives the finished plan to docs/plans/archive/YYYY-MM-DD.md before writing the new one and runs the format check on it; the single push waits for my explicit OK after showing `git log origin/main..main --oneline`; C reads the newest production deployment's status and explains it in one line.
8. Permissions: .claude/settings.json allowlist for the read-only commands in spec section 5 only. `supabase db push`, `git push`, `vercel env` and any production write must still ask. Show me the file before committing it.
9. Docs: document the three commands and the daily loop (/day-start, then /run-block per block, then /day-end) in CLAUDE.md, and add docs/plans/.pending-live-checks.md to .gitignore. Show me the CLAUDE.md diff and apply it only if I approve.
10. Dry run without side effects: run /day-start for real (it is read-only), and walk /run-block against one already-finished block in a read-only mode or by describing exactly what it would do, so I can see it find the block, show the config and the gate. Do not execute any block prompt and do not push.
11. Run `npx tsc --noEmit`, `npm test` and `npm run build`; all must pass, and the format test must fail on each fixture.
12. Update BACKLOG.md for MOM-75 (tick the Tooling item; add follow-ups with Jira keys) and mark docs/mom-75-plan-execution-spec.md as built, noting any part that differs from the spec and why.
13. Commit with "feat(MOM-75): add plan execution commands and the plan format check" and merge into main with --no-ff. Do not push.
14. Update MOM-75 in Jira: Done only if all five acceptance criteria are met; criterion 4 (/day-end end to end) can only be proven on a real day-end, so comment what was dry-run and leave the ticket open until I have run one.

Definition of Done: feature branch off clean main; tsc --noEmit passes; npm test passes (including the new format test); committed with the feat/fix(MOM-X) format; merged to main; Jira updated.
```

* **User Verification Gate:**
  - [ ] The CLI showed you what the Claude Code docs say about commands, the allowlist, and model and effort, before writing anything.
  - [ ] `npm test` passes on the current plan, and you saw the format test fail on a plan missing a key, a config line, a prompt and a gate.
  - [ ] `/day-start` ran and reported clearly; `/run-block` found a block by key and stopped on a model mismatch, without running the block.
  - [ ] `.claude/settings.json` allows only read-only commands; `git push` and `supabase db push` still ask.
  - [ ] On your next real day-end, run `/day-end` instead of steps A to F by hand; only then close MOM-75.

---

# FINAL DAY-END BUILD VERIFICATION & REMOTE PUSH

Run after the last block of the day. Stop on the first failure.

## A. Build and repository checks (PowerShell or Git Bash)

```bash
cd C:\Users\matth\momentum-app
git checkout main && git status --short            # clean (AGENTS.md, supabase/.branches/ and supabase/snippets/ may be untracked)
npx tsc --noEmit                                    # expect no output
npm test                                            # expect all passing (1015+)
npm run build                                       # expect "Compiled successfully"
npm run test:e2e                                    # only after Block 3.1 has been merged
npm run plan                                        # expect "Every open item has a Jira key."
```

## B. Database verification (production), only if migrations were applied today

**Git Bash only.** This loop uses `/tmp`, `grep`, `$(...)` and `for ... done`, which do not work in PowerShell. `npm test` does **not** run these scripts. Every script must report `false 0` and a non-zero `true` count (0 and 0 means the script errored).

```bash
npx supabase migration list                         # local and remote columns must match for every migration
T=0; F=0
for f in supabase/verify/*.sql; do
  npx supabase db query --linked -f "$f" -o table > /tmp/v.txt 2>&1
  t=$(grep -cE '│ true ' /tmp/v.txt); fl=$(grep -cE '│ false ' /tmp/v.txt)
  echo "$(basename $f): true $t false $fl"; T=$((T+t)); F=$((F+fl))
done; echo "TOTAL true $T false $F"                 # expect false 0 and true = 171 plus the checks added by Block 1.2 and any later migration
npx supabase db query --linked -o table "select count(*) as users from auth.users"   # expect 1: only the standing smoke-test account
```

## C. Remote push and live check

```bash
git log origin/main..main --oneline                 # review exactly what will be published
git push origin main
npx vercel ls --prod                                # needs the Vercel CLI (npm i -g vercel; not installed today); otherwise check the deployment in the Vercel dashboard. It must reach "Ready"
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://momentum-app-eight-chi.vercel.app/    # 307 to /login
curl -s -o /dev/null -w "%{http_code}\n" https://momentum-app-eight-chi.vercel.app/login               # 200
```

- [ ] Sign in as the standing smoke-test account and walk the flows you touched today.
- [ ] Only the standing smoke-test account exists (`users = 1` in step B, until real users exist). If its data is cluttered, delete and recreate it in the Supabase dashboard (Add user, Auto Confirm); never share or store its password.

## D. Automated End-of-Day Backlog, Obsolescence & Jira Sync (copy-paste)

```text
Perform end-of-day backlog synchronization, obsolescence audit, and ticket generation.

Task Instructions:
1. Scan BACKLOG.md, ROADMAP.md, code TODO tags and today's commits (`git log --since=midnight --no-merges`) for newly discovered gaps, TODOs or deferred items. Run `npm run plan` and treat every open item without a Jira key as un-ticketed.
2. Audit the "To Do" and "In Progress" tickets in Jira under the active Phase epic against the code on main:
   a. Read each candidate ticket's acceptance criteria and check them against the code and tests before judging. A ticket is obsolete, redundant or fully satisfied only if EVERY criterion is met or moot. Partly satisfied is not obsolete: add a comment saying what is done and what remains.
   b. Transition truly obsolete or redundant tickets to "Closed" with a brief comment explaining why; use "Done" only for delivered work.
   c. Annotate or remove the matching entries in BACKLOG.md (tick resolved items, re-key items pinned to closed tickets to the ticket that now owns the work).
   d. Check every epic in the MOM project, including the Phase 1 epics MOM-4 to MOM-7: if every child is Done or Closed, move the epic to Done with a comment listing its children. Leave an epic with any open child alone. Do not re-parent tickets.
3. Confirm the active Phase Epic key and that every ticket created today is its child.
4. For each un-ticketed item found, group related items, then:
   a. Write the ticket in our format (Title, Summary, Technical Scope, Acceptance Criteria);
   b. Create it in Jira under the active Phase Epic (check for duplicates first; if a call times out, search before retrying);
   c. Add the new Jira key to the item in BACKLOG.md and to the ticket table.
5. Audit today's tickets: everything finished today must be Done in Jira; anything with unmet acceptance criteria must say so in a comment. Report any mismatch between a Jira ticket's real scope and its key in BACKLOG.md instead of guessing.
6. PAUSE before any Jira transition to "Closed" or "Done" (tickets or epics): list every transition you intend to make, with the reason and the children or criteria that justify it, and wait for my OK. Comments and ticket creation do not need the pause.
7. Create a feature branch (`feature/MOM-16-eod-backlog-sync`; if it already exists and is fully merged, fast-forward it to main), commit BACKLOG.md (and ROADMAP.md if changed) with "chore(MOM-16): sync end-of-day backlog, prune obsolete tickets, and update Jira", merge into main with --no-ff. Do not push; the push is step F.

Definition of Done: tsc --noEmit passes; npm test passes; npm run plan reports every open item has a Jira key; merged to main.
```

## E. Day-End Master Plan Generator for Tomorrow (copy-paste)

```text
Audit the current repository state, BACKLOG.md, ROADMAP.md, and Jira board to generate our next Master Execution Plan.

Task Instructions:
1. Scan the codebase for remaining open items, deferred features, and active Jira tickets in "To Do" or "In Progress". Verify every file, function, route, provider and script a prompt names actually exists (or is created by an earlier block) before writing the prompt.
2. If new phase or follow-up tickets are needed, list them and wait for my OK before creating them under the active Phase Epic in Jira; then update BACKLOG.md with their keys.
3. Order the first session around the carry-overs I name, in dependency order. Keep the standing smoke-test account rule (one standing account on production, never ask for its password, "sign in as the standing smoke-test account" in every live gate, users = 1 in the day-end check).
4. Generate the complete "🚀 MOMENTUM BUILD: NEXT-PHASE MASTER EXECUTION PLAN" strictly following our established structure:
   - Metadata Header at the top: `> **Date:** YYYY-MM-DD | **Active Epic:** MOM-XX | **Base Commit:** <SHORT_HASH>`
   - Executive Overview & Architectural Invariants, and the Standing Rules (Jira first, production approval, verify scripts, no pushes inside blocks, standing smoke-test account).
   - Logical Session Blocks grouping high-priority tickets, in dependency order.
   - Dynamic CLI Session Config (Sonnet / High for architecture, security and database work; Sonnet / Medium or Low for standard UI and tests).
   - Copy-pasteable prompts including tsc --noEmit, npm test, npm run build, feature branching, merging to main (--no-ff), BACKLOG.md and Jira updates.
   - User Verification Gates for each block.
   - Final Day-End Build Verification & Remote Push section, with the step B verify loop marked Git Bash only and a pause for my OK before any Jira transition to Closed or Done in step D.
   - An updated Open Decisions and Risks table.
5. Save the generated plan to `docs/plans/NEXT_BUILD_PLAN.md`.
6. Create a feature branch `feature/MOM-XX-next-build-plan-doc`, commit `docs/plans/NEXT_BUILD_PLAN.md` with "docs(MOM-XX): add generated next build plan" (MOM-XX is the active Phase Epic), merge to main (--no-ff). Do not push; show me `git log origin/main..main --oneline` and wait. The push is step F.
```

## F. Synchronize Remote Repository (PowerShell)

```powershell
git checkout main
git status
git push origin main
```

---

## Open Decisions and Risks (read before starting)

| Item | Why it matters |
| --- | --- |
| **Standing smoke-test account** | `smoke-test@momentum-app.test` already exists on production but was created before migration 010, so it holds the old Career Pivot seed. **After** Block 1.2 has pushed migration 010, delete it and recreate it in the Supabase dashboard (Auto Confirm on) so it starts empty; Block 1.2's count-only check expects zero goals and tasks. Every live gate in this plan signs in as it; its password stays in your password manager. If its data gets cluttered, delete and recreate it. |
| **MOM-18: the signed-out state is normally unreachable** | `lib/supabase/proxy.ts` redirects signed-out visitors to `/login`, so criterion 1 ("signed-out shows a sign-in call to action") can only be met at the component level. Block 1.1 builds it as a safe default and comments on the ticket; decide whether to amend the ticket's wording. |
| **MOM-19 touches six verify scripts** | Scripts 001, 002, 003, 004, 007 and 008 rely on the signup seed for their fixtures. The prompt keeps all 171 checks by calling `seed_career_pivot()` explicitly as postgres and rewrites the few checks that tested signup seeding itself; review that diff before the push. |
| **Migration 010 and MOM-73's migration** | Block 1.2 takes 010 and shows you the migration and a dry run before anything is pushed; Block 5.2 then takes 011. Each stops for your approval. |
| **Hevy API samples** | Block 4.2 cannot build the Hevy adapter honestly without Hevy's API docs or a redacted `/v1/workouts` response. The prompt stops without them. |
| **Docker and the local stack** | Blocks 3.1 and 5.1 need Docker. The repo still has no `supabase/config.toml`; Block 3.1 creates it with `supabase init`. Creating users through the local auth **admin API** returned HTTP 500 and left NULL token columns on 2026-10-23, so the browser specs sign up through the normal form and read Mailpit. `supabase auth users create` does not exist in CLI v2.121. |
| **Google verification** | Calendar read-only is a sensitive scope. Testing mode (test users) is fine for you; wider use needs Google's app verification and a verified domain. |
| **Wireframe reference** | Session 2 reads the v0 export from `C:\Users\matth\momentum-samples\momentum-core-responsive-dashboard\` (present today). It must never be copied into the repo. MOM-76, MOM-77 and MOM-78 stay under the Phase 1 epics MOM-4 and MOM-7 on purpose, which is why those epics stay open. |
| **Dark only until MOM-30** | MOM-76 makes the app dark regardless of the device setting. Light mode with a follow-device default is MOM-30, not scheduled. |
| **Live Claude paths** | The MOM-83 smoke test did not exercise the wait message, Try again or the starter plan on production; Block 3.1 covers them against the local stack with the API key absent. Production has never seen the failure path. |
| **Model cost** | MOM-35's generator and MOM-47's rebalance call Claude Opus 5.5 per click; MOM-73 (Block 5.2) is what bounds that. Until it ships, do not invite real users. |
| **MOM-75 changes how you run a day** | After Block 6.1, a build day is `/day-start`, then `/run-block MOM-n` per block, then `/day-end`, instead of pasting prompts. The commands keep every approval stop and cannot switch the model for you. Until it ships, keep running this plan by hand. |
| **Direct pushes to `main`** | Every change is merged and pushed to `main` by hand. After MOM-67 and branch protection are on, step C becomes a pull request. |
| **Not scheduled, still recommended** | **MOM-45** (the plan week can be off by one around midnight outside UTC; you are in Pacific time), **MOM-65** (revoke EXECUTE on `handle_new_user` and `rls_auto_enable`; Block 1.2 comments on its outdated seed criterion), MOM-66 (table grants check), MOM-68 (`.env*` gitignore, now also the untracked `AGENTS.md`, `supabase/.branches/` and `supabase/snippets/`), MOM-74 (retire `HEVY_API_KEY`; delete it from Vercel Production afterwards), MOM-91 (`connection()` instead of `force-dynamic`; the selected-channel URL depends on the page being rendered per request). |
| **Not scheduled, product decisions** | MOM-79 (tick a goal criterion; also the only way to make the 7 criteria real), MOM-80 (review the drafted criteria), MOM-81 (plan-shape rules, including giving the generator the goal's criteria), MOM-82 (unused `createGoalChannel`), MOM-85 (reopen older completed tasks), MOM-89 (paused and finished goals are invisible), MOM-90 with MOM-53 (move the day-90 checkpoint when the plan cannot hold), MOM-20 to MOM-26 (schema), MOM-33 (AI chat), MOM-64 (password reset, abuse protection). |
