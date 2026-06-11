# Cycle 10 Critic Review Report

**Reviewer:** critic
**Date:** 2026-04-19
**Base commit:** 56e78d62
**Scope:** Multi-perspective critique of the whole change surface

## Critique Perspective

This review examines the codebase from multiple stakeholder perspectives: developer experience, operational safety, and product correctness. It focuses on issues that prior specialist reviews may have underweighted.

## Findings

### CR10-CT1 — [MEDIUM] Auth field mapping refactoring is a half-measure that creates false confidence

- **Confidence:** HIGH
- **Cross-agent agreement:** code-reviewer CR10-CR1, architect CR10-AR1
- **Evidence:** The `mapUserToAuthFields` extraction (commit 71df1c30) was intended to solve the triple-mapping problem. It did — for `createSuccessfulLoginResponse` and `syncTokenWithUser`. But the `authorize()` function, the `jwt` callback's two branches, `clearAuthToken`, and the DB query `columns` list still maintain separate field lists. The refactoring reduced the number of places from 5 to 4, but more importantly it created a false sense that the problem is solved. A developer seeing `mapUserToAuthFields` with the comment "Add new preference fields HERE ONLY" would reasonably assume all auth field mapping goes through this function — but it doesn't.
- **Why it matters:** The highest-risk maintenance hazard in the codebase (auth field mapping) was partially addressed but the root cause remains. The refactoring should either be completed (single source of truth) or the comment on `mapUserToAuthFields` should be updated to list ALL places that must be updated.
- **Suggested fix:** Complete the refactoring by making `authorize()` and `jwt` callback branches use `mapUserToAuthFields`, or add a prominent comment listing all 6 locations that must be updated.

### CR10-CT2 — [MEDIUM] `PublicHeader` uses hardcoded role checks while `AppSidebar` uses capability-based filtering — navigation could diverge

- **Confidence:** HIGH
- **File:** `src/components/layout/public-header.tsx:50-71`, `src/components/layout/app-sidebar.tsx:198-233`
- **Evidence:** `PublicHeader`'s `getDropdownItems` function (line 50-71) checks `role === "instructor" || role === "admin" || role === "super_admin"` and `role === "admin" || role === "super_admin"`. These are hardcoded role checks. `AppSidebar`'s `filterItems` function (line 216-233) uses capability-based filtering via `capsSet.has(item.capability)`. A custom role with `problems.create` capability but not `"instructor"` role would see the "Problems" link in the sidebar but not in the public header dropdown. This is an inconsistency in the dual-navigation paradigm.
- **Why it matters:** As custom roles are added (the capability system supports them), the public header and sidebar will show different navigation items for the same user. This is confusing and could be reported as a bug.
- **Suggested fix:** Refactor `getDropdownItems` in `PublicHeader` to accept a `capabilities` set (like `AppSidebar` does) and use capability-based filtering instead of hardcoded role checks.

### CR10-CT3 — [LOW] Workspace-to-public migration remains stalled — Phase 3 is the critical path

- **Confidence:** HIGH
- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Cross-agent agreement:** cycle-9 critic CR9-CT3, architect CR10-AR4
- **Evidence:** The migration has been at Phase 2 complete for multiple cycles. The prerequisites section lists 4 unchecked items. The plan says Phase 3 requires "consider converting AppSidebar" and "ensure the top navbar is visible on dashboard pages" — these are design decisions, not code changes. The plan needs breaking down into smaller, implementable steps.
- **Suggested fix:** Break Phase 3 into concrete sub-tasks: (1) Add PublicHeader to dashboard layout (minimal), (2) Add "back to public" link replacement, (3) Slim down AppSidebar to icon-only mode. Start with task 1 this cycle.

### CR10-CT4 — [LOW] `shareAcceptedSolutions` default-true still not documented

- **Confidence:** MEDIUM
- **Cross-agent agreement:** cycle-9 critic CR9-CT4, security-reviewer CR9-SR2
- **Evidence:** The `shareAcceptedSolutions` field defaults to `true` in 4 places (`mapUserToAuthFields`, `mapTokenToSession`, `authorize()`, and the DB schema default). There's no comment explaining the privacy rationale. This is a user-facing privacy setting.
- **Suggested fix:** Add a comment in `AuthUserRecord` or `mapUserToAuthFields` explaining why opt-out is the default.

## Assessment Summary

The auth field mapping refactoring is the most critical finding (CR10-CT1). It was intended to solve a systemic risk but was left incomplete, creating false confidence. The second priority is the navigation divergence between PublicHeader and AppSidebar (CR10-CT2), which will worsen as custom roles are adopted.
