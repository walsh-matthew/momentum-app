# Momentum Backlog

Working list of tasks not yet scheduled into a Jira epic. Items move to Jira (`MOM` project) once they are picked up. Source of truth for upcoming work is Jira; this file captures what was found along the way.

## Discovered In-Flight

Items found while working on tickets. Add new items at the bottom with the ticket they came from.

- [ ] Phases and gates have no table. Add a `phases` table, or `phase_label` and `gate_note` on `micro_tasks`. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §7.*
- [ ] Weekly review notes need a record (week plus the eight feedback-loop note fields). *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §6, §7.*
- [ ] Carry-over history: `carried_from_week` records one hop only. Decide whether to keep a chain. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §7.*
- [ ] Failure log entries (dated: asked, model got wrong, why) and lane tracking have no table. *Source: `docs/NINETY_DAY_PLAN_CONTEXT.md` §6, §7.*
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` handling check: confirm no `NEXT_PUBLIC_` prefix is ever used for it. *Source: MOM-8 `.env.example`.*
