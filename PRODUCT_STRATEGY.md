# PRODUCT STRATEGY & SYSTEM CONTEXT

## 1. Project Meta-Goals & Dual-Purpose Mandate

This repository serves a dual-purpose strategy:

1. **Dual Objective 1: Personal Career Re-entry & AI PM Upskilling ("Vibe Coding")**
   - **Context:** Built by an aspiring AI Product Manager working to bridge a multi-year career gap through direct hands-on execution.
   - **Methodology:** Rapid iterative development using AI-assisted coding tools ("vibe coding" via Claude Code/Cursor). The development process must focus on strong product architecture, clean data schemas, API integrations, and user-centric UX patterns that reflect high-level AI PM competence.
   - **Key Artifacts Needed:** Clean Git commits, well-architected technical decisions, user story backlogs, and explicit PRD-to-code traceability.

2. **Dual Objective 2: Commercial Product Viability & Monetization Path**
   - **Context:** Build a production-grade, extensible application designed for public deployment and eventual monetization.
   - **Standards:** Production-ready code, scalable database architecture, secure third-party API management, and privacy-first data design.

---

## 2. Product Vision & Positioning Statement

### Target Audience
High-intent achievers navigating multi-faceted personal and professional transitions (e.g., job seekers, career pivoters, solopreneurs, and active goal trackers).

### Problem Statement
Standard task managers are static check-lists; health apps operate in silos; calendars schedule time without tracking intent. Users lack a single operational dashboard that converts high-level multi-month goals into dynamic daily task completion scores using existing digital footprint data.

### Value Proposition
An AI-powered "Life Operating System" and momentum engine that automatically translates high-level multi-channel plans into prioritized daily micro-tasks, aggregates execution data across third-party tools (calendar, health, wearables), and gamifies daily completion percentages.

---

## 3. Core Architectural Pillars & Feature Requirements

When implementing features, code generator tools must align with these four architectural pillars:

### Pillar 1: Dynamic Goal Channels & Roadmaps
- **Description:** Structured multi-channel goal planning (e.g., *Career Pivot*, *Physical Fitness*, *Personal Brand*).
- **Core Engine:** Time-bound goal breaking (90-day cycles -> 12 weekly themes -> daily action items).
- **AI Component:** Auto-breakdown of high-level goals into realistic daily action units based on past completion velocity.

### Pillar 2: Passive Data & Integration Layer
- **Description:** Multi-source data ingestion to verify task completion without requiring heavy manual input.
- **Integrations Framework:** 
  - Health/Fitness: Apple HealthKit / Google Fit API / Strava.
  - Productivity: Google Calendar / Apple Reminders / Todoist.
  - Professional Network: LinkedIn / Content publishing hooks.

### Pillar 3: Gamification & Velocity Engine
- **Daily Completion Score:** Standardized score (0 - 100%) based on daily micro-task execution across active goal channels.
- **Momentum Index:** Channel-level indicators (*Ahead of Schedule*, *On Track*, *Needs Focus*).
- **Adaptive Recalibration:** AI-driven re-balancing when tasks are missed, preserving streaks while preventing check-box burnout.

### Pillar 4: Cross-Platform Architecture
- **Web App (Desktop):** Optimized for high-level roadmap creation, deep analytics, and integration management.
- **Mobile/Tablet App:** Optimized for daily execution, quick-check widgets, and rapid task logging.

---

## 4. Engineering & AI-PM Execution Principles for Claude Code

When writing code, refactoring, or generating features, adhere to the following principles:

1. **Product-First Modular Design:** Write code in feature-based modular structures. Keep backend API routes, third-party integration abstractions, and UI components clearly decoupled.
2. **Explicit Schema & State Strategy:** Maintain clean, documented data models (User, GoalChannel, Milestone, DailyTask, IntegrationCredential, VelocityMetrics).
3. **Telemetry & Analytics-Ready:** Instrument core user actions (e.g., task completed, goal created, integration connected) to evaluate product usage metrics.
4. **Adaptive Error & API Handling:** Third-party API calls must gracefully handle rate limits, disconnected tokens, and offline states without breaking the core UI.
5. **AI Guardrails:** Ensure AI dynamic task generators return strictly validated JSON matching standard Zod schemas.

---

## 5. Monetization & Growth Architecture (Future Proofing)

Keep code paths structured to support freemium tier logic:
- **Free Tier:** 1 Active Goal Channel, manual task logging, standard dashboard.
- **Pro Tier ($12–$15/mo):** Unlimited channels, AI dynamic roadmap generator, third-party wearable/calendar API sync.
- **Executive Tier ($29–$49/mo):** AI Accountability Coach (voice/text daily check-ins & automated adaptive schedule adjustments).