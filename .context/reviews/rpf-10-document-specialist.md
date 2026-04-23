# Cycle 10 Document Specialist Review

**Date:** 2026-04-20
**Reviewer:** document-specialist
**Base commit:** fae77858

## Findings

### DOC-1: `withUpdatedAt()` docstring accurately documents the clock-skew risk but doesn't prevent it [LOW/LOW]

**Files:** `src/lib/db/helpers.ts:8-10`
**Description:** The docstring correctly warns: "By default, uses `new Date()` (app server clock). For routes that have already fetched DB time via `getDbNowUncached()`, pass it as the second argument." This is accurate but purely advisory. The code allows the risky default.
**Fix:** No doc change needed — the doc is correct. The fix is architectural (see ARCH-1).
**Confidence:** High

### DOC-2: `access-codes.ts` comments explain DB-time usage for deadline check but don't note the inconsistency with write timestamps [LOW/LOW]

**Files:** `src/lib/assignments/access-codes.ts:128-129`
**Description:** Line 128-129 has a comment explaining why `SELECT NOW()` is used for the deadline check. But there's no comment explaining why `enrolledAt` and `redeemedAt` use `new Date()` instead of `now`. This is because the inconsistency was unintentional (missed during migration).
**Fix:** This will be resolved when the code is fixed.
**Confidence:** High

## Verified Safe

- API documentation in route handlers is comprehensive.
- Code comments accurately describe security-sensitive decisions.
- README and project docs are up to date.
