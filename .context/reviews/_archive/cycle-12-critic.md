# Cycle 12 — Critic

**Date:** 2026-04-19
**Base commit:** 2339c7ea

## Findings

### CR12-CT1 — [MEDIUM] `authorizeRecruitingToken` bypasses `mapUserToAuthFields` — undermines the centralized mapping pattern established in cycle 11

- **File:** `src/lib/auth/recruiting-token.ts:55-72`
- **Confidence:** HIGH
- **Evidence:** Cycle 11 AGG-1 eliminated inline AuthUserRecord construction from `config.ts` by refactoring to use `mapUserToAuthFields`. However, `authorizeRecruitingToken` still manually constructs the return value with an inline field list. This is the exact same anti-pattern. If a new preference field is added to AUTH_PREFERENCE_FIELDS and mapUserToAuthFields, the recruiting token path will miss it silently. This undermines the architectural improvement from cycle 11.
- **Suggested fix:** Refactor `authorizeRecruitingToken` to use `mapUserToAuthFields(user)` and spread the result.

### CR12-CT2 — [LOW] Workspace-to-public migration Phase 3 stalled — only PublicHeader added, no further refinement

- **File:** `plans/open/2026-04-19-workspace-to-public-migration.md`
- **Confidence:** HIGH
- **Evidence:** Phase 3 was marked "IN PROGRESS (cycle 11)" with the PublicHeader addition. The remaining items (slim AppSidebar, move breadcrumb to top navbar, evaluate control route group merge) have not been started. The current dashboard layout has a double-header pattern that's confusing for users.
- **Suggested fix:** Continue Phase 3 in this cycle — at minimum, move the sidebar trigger into PublicHeader.

### CR12-CT3 — [LOW] `recordRateLimitFailure` and `recordRateLimitFailureMulti` are near-duplicates of `consumeRateLimitAttemptMulti`

- **File:** `src/lib/security/rate-limit.ts:195-269`
- **Confidence:** MEDIUM
- **Evidence:** Three functions (`consumeRateLimitAttemptMulti`, `recordRateLimitFailure`, `recordRateLimitFailureMulti`) all implement the same pattern: read entry, increment attempts, check threshold, calculate block duration, write back. The only difference is whether they return a boolean (rate limited?) or void. This is a maintenance hazard — any change to the block duration calculation must be applied in three places.
- **Suggested fix:** Extract a shared `incrementAndMaybeBlock` helper that all three call.

### CR12-CT4 — [LOW] `localStorage.clear()` in AppSidebar signOut still clears all origin storage

- **File:** `src/components/layout/app-sidebar.tsx:240-241`
- **Confidence:** LOW
- **Evidence:** This was identified in cycle 10 (D8) and deferred. It's still present. `localStorage.clear()` removes all localStorage data for the origin, not just the app's namespaced keys. In multi-app dev environments sharing the same origin, this would wipe other apps' data.
- **Suggested fix:** Replace with selective key removal using a known namespace prefix.
