# Cycle 13 — Remediation Plan (2026-05-03)

**HEAD:** `9ecb3caa`
**Source:** `_aggregate-cycle-13.md`
**Findings:** 0 HIGH, 0 MEDIUM, 2 LOW

---

## Finding C13-1 — Discussion moderation "open" state filter semantics

**File:** `src/lib/discussions/data.ts:276-287`
**Severity:** LOW | **Confidence:** Medium

### Problem

`listModerationDiscussionThreads` defines "open" state as `isNull(lockedAt) AND isNull(pinnedAt)`. A thread that is both pinned AND locked simultaneously would be excluded from all four state filter results (only "all" would show it). While pinned+locked is uncommon, it is a valid DB state.

### Fix

Change the "open" filter to `isNull(lockedAt)` only. "Open" should mean "not locked" regardless of pin status. Pinning is an organizational action, not a state that makes a thread "closed."

### Steps

1. In `src/lib/discussions/data.ts`, change the "open" state filter from:
   ```ts
   conditions.push(
     and(
       isNull(discussionThreads.lockedAt),
       isNull(discussionThreads.pinnedAt),
     )!
   );
   ```
   to:
   ```ts
   conditions.push(isNull(discussionThreads.lockedAt));
   ```

2. Verify the change doesn't break existing behavior by running tests.

### Status: [x] Done (commit `e451e995`)

---

## Finding C13-2 — Recruiting validate route lacks CSRF protection

**File:** `src/app/api/v1/recruiting/validate/route.ts`
**Severity:** LOW | **Confidence:** High

### Problem

This standalone POST handler lacks CSRF protection. All other POST endpoints use `createApiHandler` which enforces CSRF via `csrfForbidden()`. This route manually calls `consumeApiRateLimit` but never checks CSRF headers. Impact is low: it is a public, read-only validation endpoint that does not mutate state.

### Fix

Add CSRF validation to the route by importing and calling `validateCsrf` (or refactor to use `createApiHandler`). The simplest approach is to add the CSRF check inline, matching the pattern used by other standalone routes.

### Steps

1. In `src/app/api/v1/recruiting/validate/route.ts`, add import for `validateCsrf` from `@/lib/security/csrf`.
2. Add CSRF validation after rate limiting:
   ```ts
   const csrfError = validateCsrf(req);
   if (csrfError) return csrfError;
   ```

3. Verify the change doesn't break existing behavior by running tests.

### Status: [x] Done (commit `1075728a` + `370479cd`)

---

## Deferred items

All 20 carry-forward deferred items from prior cycles remain deferred with unchanged exit criteria. See `_aggregate-cycle-13.md` for the full list.

---

## Implementation order

1. C13-1 (discussions filter semantics) — simple, isolated change
2. C13-2 (CSRF on recruiting validate) — simple, isolated change

Both are LOW severity and can be committed independently.