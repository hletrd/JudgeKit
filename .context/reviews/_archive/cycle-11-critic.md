# Cycle 11 Critic Review Report

**Reviewer:** critic
**Date:** 2026-04-19
**Base commit:** 6c99b15c
**Scope:** Multi-perspective critique of the whole change surface

## Critique Perspective

This review examines the codebase from multiple stakeholder perspectives: developer experience, operational safety, and product correctness. It focuses on issues that prior specialist reviews may have underweighted.

## Findings

### CR11-CT1 — [MEDIUM] Auth field mapping refactoring is still a half-measure — 3 inline construction sites remain

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR11-CR1, architect CR11-AR3
- **Evidence:** The cycle 10 remediation introduced `AUTH_PREFERENCE_FIELDS`, `AUTH_CORE_FIELDS`, and `AUTH_USER_COLUMNS` constants. This reduced the number of places to update from 6 to 4. But 3 inline `AuthUserRecord` construction sites remain: `authorize()` (line 317-336), `jwt` callback `if (user)` branch (line 408-430), and `jwt` callback `freshUser` branch (line 462-480). The `authorize()` function constructs an inline object, then passes it to `createSuccessfulLoginResponse` which calls `mapUserToAuthFields(user)` — but the inline object IS the `user` parameter, so any missing field silently falls back to the default. This is the same pattern that caused the `acceptedSolutionsAnonymous` bug.
- **Why it matters:** The root cause of the `acceptedSolutionsAnonymous` bug was an inline construction site that was missing a field. The refactoring reduced the number of such sites but did not eliminate them. The same class of bug can happen again.
- **Suggested fix:** Eliminate all inline `AuthUserRecord` construction by passing the DB user object directly to `mapUserToAuthFields`. The DB queries already fetch all necessary columns.

### CR11-CT2 — [LOW] Workspace-to-public migration Phase 3 remains stalled — the critical path

- **Confidence:** HIGH
- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Cross-agent agreement:** cycle-10 critic CR10-CT3, architect CR11-AR4
- **Evidence:** The migration has been at Phase 2 complete for multiple cycles. Phase 3 requires making the top navbar visible on dashboard pages — a concrete, implementable step. The plan already lists this as the first step of Phase 3 but no work has started.
- **Suggested fix:** Break Phase 3 into smaller sub-tasks and start with task 1 this cycle: add PublicHeader to the dashboard layout.

### CR11-CT3 — [LOW] `shareAcceptedSolutions` default-true still not documented

- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-10 critic CR10-CT4
- **Evidence:** The `shareAcceptedSolutions` field defaults to `true` in `mapUserToAuthFields` (line 107). There is no comment explaining the privacy rationale for opt-out being the default. This is a user-facing privacy setting.
- **Suggested fix:** Add a comment in `mapUserToAuthFields` explaining why opt-out is the default.
