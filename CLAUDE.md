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

## Development & Jira Workflow Hygiene

### 1. Jira Project Configuration
- **Project Key:** `MOM`
- **Workflow Statuses:** `To Do` | `In Progress` | `In Review` | `Done`
- **Core Epics:**
  - `MOM-4`: EPIC 1: Architecture & OS Layout
  - `MOM-5`: EPIC 2: Goal Channel Architect
  - `MOM-6`: EPIC 3: Non-Technical Integration Hub
  - `MOM-7`: EPIC 4: Adaptive Velocity & Rebalancing

### 2. Git Branching Standard
- **Rule:** Never commit directly to `main` during feature development.
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
- [ ] Code implemented in Next.js / Supabase without TypeScript or build errors.
- [ ] Verified locally via `npm run dev` / `npm run build`.
- [ ] Code committed using `feat(MOM-X)` message format.
- [ ] Branch merged to `main` and Jira ticket moved to `Done`.

---

## Coding Standards & Environment Safeguards
- **Security:** Maintain strict RLS policies in Supabase. Never expose service role keys on the client.
- **Environment Files:** Ensure `.env.local` remains explicitly ignored in `.gitignore`.
- **UI Design System:** Clean 3-column desktop layout collapsing to single-column mobile execution cards. Focus on high contrast, low clutter, and rapid feedback loops.