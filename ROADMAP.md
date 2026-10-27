# Momentum Roadmap

High-level direction. Jira (`MOM`) holds the actual tickets; epics are noted in `CLAUDE.md`.

## 🐛 Known Bugs & Tech Debt

No confirmed bugs yet. Record them here as they are found, with the ticket that will fix them.

- Schema gaps for phases, weekly reviews, carry-over history, and failure log: tracked in `BACKLOG.md` under *Discovered In-Flight*. *(Superseded 2026-10-26: the phases, weekly-review and failure-log gaps are replaced by the goal model in `docs/DOMAIN_MODEL.md`; their tickets are Closed.)*

## 🎯 Next: Goal Model Thin Slice (EPIC 6, MOM-105)

Approved 2026-10-26. The new goal model in `docs/DOMAIN_MODEL.md` replaces the career-only, checkbox, 13-week model. The plan is to build the thin slice in about 5 build days (MOM-106 to MOM-116, items in `BACKLOG.md`), then run a two-week family trial against the kill criteria (design record §5), then a second round with testers outside the household. The first follow-ons, built during the trial, are the person's own tracker sheet as a source (MOM-117) and a career playbook (MOM-118). Later: out-of-app reminders, stretch levels and ceilings, dated capacity exceptions, more adapters ranked by what testers already use, and household sharing.

- **Minors safeguards.** The family trial is adults only (2026-10-26); an under-18 user waits for the minors-safeguards item in `BACKLOG.md`.

## 🚀 Phase 1.5 Roadmap

Work after the MVP (Phase 1) that makes Momentum usable beyond a single English-speaking user on a local machine.

- **Multi-Lingual support.** Move user-facing strings out of components into translation files, add a locale setting per user, and keep stored statuses and task types as lowercase machine keys (see `docs/NINETY_DAY_PLAN_CONTEXT.md` §7, a rule that carries over to `docs/DOMAIN_MODEL.md`) so translations stay presentation-only.
- **Vercel Deployment.** Done in MOM-60 (2026-10-22): the app is live on Vercel with production Supabase, and RLS was verified on the deployed database (`supabase/verify/`). Original scope: deploy the Next.js app to Vercel with production Supabase, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `HEVY_API_KEY` in Vercel environment settings (never in the repo), and confirm RLS policies are enforced on the deployed database.
