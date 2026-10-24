# TEST PLAN (a fixture for tests/build-plan-format.test.ts)

> **Date:** 2026-10-24 | **Active Epic:** MOM-16 | **Base Commit:** abc1234

## Today's runbook

Type these in order, one per block.

| # | Type | Session setting | What to check at the gate |
| --- | --- | --- | --- |
| 1 | `/run-block MOM-101` | Sonnet / Medium | The new screen shows the state and the tests pass. |
| 2 | `/run-block MOM-102` | Sonnet / High | The migration dry run is shown and nothing is pushed yet. |

## Standing Rules

- A fixture only.

# SESSION 1: FIRST SESSION

**Your prerequisites before this session:** none.

## Block 1.1: Thing 1 (MOM-101)

* **Objective & Scope:** A fixture block.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-101: thing 1.

Task Instructions:
1. Read ticket MOM-101 in Jira first.
2. Create the feature branch `feature/MOM-101-thing-1` off a clean `main`.
3. Commit with "feat(MOM-101): add thing 1". Push the feature branch after my OK and never merge into main locally.
```

* **User Verification Gate:**
  - [ ] The first check.
  - [ ] The second check.

---

## Block 1.2: Thing 2 (MOM-102)

* **Objective & Scope:** A fixture block.
* **CLI Session Config:** Model: Sonnet | Effort: Medium

#### Exact Copy-Paste Prompt for Claude Code CLI

```text
Implement MOM-102: thing 2.

Task Instructions:
1. Read ticket MOM-102 in Jira first.
2. Create the feature branch `feature/MOM-102-thing-2` off a clean `main`.
3. Commit with "feat(MOM-101): add thing 2". Push the feature branch after my OK and never merge into main locally.
```

* **User Verification Gate:**
  - [ ] The first check.
  - [ ] The second check.

---

