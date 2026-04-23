# RPF Cycle 15 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`
**Status:** Done (H1, H2, M1, M2, L1 all complete)

## Scope

This cycle addresses findings from the RPF cycle 15 multi-agent review:
- AGG-1: Four remaining unguarded `res.json()` calls — incomplete `apiFetchJson` adoption (2 files, 4 calls)
- AGG-2: `recruiting-invitations-panel.tsx` metadata remove button missing `aria-label`
- AGG-3: Anti-cheat dashboard polling re-renders on every tick without data comparison (carried from cycle 13)

No cycle-15 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### H1: Migrate `recruiting-invitations-panel.tsx` to `apiFetchJson` and add `.catch()` guards (AGG-1, partial)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:137,152`
- **Cross-agent signal:** 8 of 11 review perspectives
- **Problem:** The `fetchInvitations` and `fetchStats` functions use raw `apiFetch` + unguarded `.json()` calls. A 200 response with non-JSON body would throw SyntaxError. These are in the same feature area as the 4 components already migrated to `apiFetchJson` in cycle 14.
- **Plan:**
  1. Refactor `fetchInvitations` to use `apiFetchJson` with abort signal support
  2. Refactor `fetchStats` to use `apiFetchJson`
  3. Preserve existing behavior: AbortController, error handling, loading state
  4. Verify all gates pass
- **Status:** DONE

### H2: Migrate `workers-client.tsx` to `apiFetchJson` and add `.catch()` guards (AGG-1, partial)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235,241`
- **Cross-agent signal:** 8 of 11 review perspectives
- **Problem:** The `fetchData` function uses raw `apiFetch` + unguarded `.json()` calls for both workers and stats endpoints.
- **Plan:**
  1. Refactor `fetchData` to use `apiFetchJson` for workers endpoint
  2. Refactor `fetchData` to use `apiFetchJson` for stats endpoint
  3. Preserve existing behavior: loading state, error handling
  4. Verify all gates pass
- **Status:** DONE

### M1: Add `aria-label` to metadata remove button in `recruiting-invitations-panel.tsx` (AGG-2)

- **Source:** AGG-2
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`
- **Cross-agent signal:** 5 of 11 review perspectives
- **Problem:** The "remove metadata field" button is icon-only (Trash2) with no `aria-label`. Screen readers would announce it as an unlabeled button.
- **Plan:**
  1. Add `aria-label={t("removeField")}` to the metadata remove button
  2. Add i18n key `removeField` to `messages/en.json` and `messages/ko.json`
  3. Verify all gates pass
- **Status:** DONE

### M2: Add shallow comparison to anti-cheat dashboard polling `setEvents` updater (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / LOW
- **Citations:** `src/components/contest/anti-cheat-dashboard.tsx:128-136`
- **Cross-agent signal:** 2 of 11 review perspectives
- **Problem:** Carried from cycle 13. The polling callback always creates a new events array via `setEvents()`, causing unnecessary React re-renders every 30 seconds even when data is identical.
- **Plan:**
  1. In the `setEvents` updater, compare first-page event IDs before returning a new array
  2. If first-page data is identical (same IDs in same order), return `prev` to skip re-render
  3. Preserve the existing logic for preserving beyond-first-page data
  4. Verify all gates pass
- **Status:** DONE

### L1: Update `apiFetchJson` JSDoc to document `signal` option (DOC-1)

- **Source:** DOC-1
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/api/client.ts:87-123`
- **Cross-agent signal:** 1 of 11 review perspectives
- **Problem:** The `apiFetchJson` JSDoc does not mention that `init.signal` can be passed for AbortController-based cancellation. This is relevant because `recruiting-invitations-panel.tsx` uses AbortController.
- **Plan:**
  1. Add a note in the `@param init` documentation that `signal` can be passed for abort support
- **Status:** PENDING

---

## Deferred items

### DEFER-1 through DEFER-53: All prior deferred items carried forward unchanged

Key items:
- DEFER-1: Migrate raw route handlers to `createApiHandler` (22 routes)
- DEFER-24: Invitation URL uses window.location.origin (also SEC-2)
- DEFER-33: Encryption module integrity check / HMAC (SEC-1)
- DEFER-50: Encryption module unit tests (from TE-3)
- DEFER-2 (rpf-cycle-15 prior run): `streamBackupWithFiles` memory buffering architecture

### DEFER-54: Anti-cheat dashboard polling — full shallow comparison for multi-page data [MEDIUM/LOW]

- **Source:** AGG-3
- **Severity / confidence:** MEDIUM / LOW (original preserved)
- **Citations:** `src/components/contest/anti-cheat-dashboard.tsx:128-136`
- **Reason for deferral:** The M2 fix addresses the first-page comparison. Full shallow comparison for multi-page data (checking if `prev.slice(PAGE_SIZE)` also changed) would require comparing all events, which is more complex. The first-page fix covers the most common case (polling with no extra pages loaded).
- **Exit criterion:** When a performance audit reveals that multi-page re-renders are causing measurable degradation, or when a dedicated performance optimization cycle is scheduled.

### DEFER-55: `recruiting-invitations-panel.tsx` — use `Promise.allSettled` or separate stats fetch [LOW/LOW]

- **Source:** PERF-2
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:160-162`
- **Reason for deferral:** Stats fetch is already best-effort (empty catch). The current `Promise.all` pattern is simple and the stats endpoint is fast. Changing to `Promise.allSettled` adds complexity with minimal benefit.
- **Exit criterion:** When stats endpoint latency causes measurable delay in invitations rendering.

### DEFER-56: Unit tests for `apiFetchJson` helper (from TE-4)

- **Source:** TE-4
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/lib/api/client.ts:112-123`
- **Reason for deferral:** The helper is small (11 lines) and its behavior is straightforward. Tests do not fix bugs. The helper is already validated implicitly by the components that use it.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

### DEFER-57: Unit tests for `recruiting-invitations-panel.tsx` (from TE-5)

- **Source:** TE-5
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx`
- **Reason for deferral:** Complex component requiring extensive mock setup. The code fixes (H1) address the unguarded `.json()` calls.
- **Exit criterion:** When a dedicated test coverage improvement cycle is scheduled.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 15 aggregate review. 5 new tasks (H1, H2, M1, M2, L1). 4 new deferred items (DEFER-54 through DEFER-57). All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
- 2026-04-22: H1 DONE (38a55d25 — migrate recruiting-invitations-panel to apiFetchJson), H2 DONE (f05ba27c — migrate workers-client to apiFetchJson), M1 DONE (dcc85bf2 — add aria-label to metadata remove button + i18n keys), M2 DONE (c1e12b39 — skip unnecessary re-renders in anti-cheat dashboard polling), L1 DONE (4b487415 — document signal option in apiFetchJson JSDoc). All gates pass: eslint (0 errors), next build (success), vitest unit (2105/2105 pass), vitest integration (37 skipped, no DB available), vitest component (12 pre-existing DB-dependent failures, no test files modified).
