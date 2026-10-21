# Momentum Roadmap

High-level direction. Jira (`MOM`) holds the actual tickets; epics are noted in `CLAUDE.md`.

## 🐛 Known Bugs & Tech Debt

No confirmed bugs yet. Record them here as they are found, with the ticket that will fix them.

- Schema gaps for phases, weekly reviews, carry-over history, and failure log: tracked in `BACKLOG.md` under *Discovered In-Flight*.

## 🚀 Phase 1.5 Roadmap

Work after the MVP (Phase 1) that makes Momentum usable beyond a single English-speaking user on a local machine.

- **Multi-Lingual support.** Move user-facing strings out of components into translation files, add a locale setting per user, and keep stored statuses and task types as lowercase machine keys (see `docs/NINETY_DAY_PLAN_CONTEXT.md` §7) so translations stay presentation-only.
- **Vercel Deployment.** Deploy the Next.js app to Vercel with production Supabase, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and `HEVY_API_KEY` in Vercel environment settings (never in the repo), and confirm RLS policies are enforced on the deployed database.
