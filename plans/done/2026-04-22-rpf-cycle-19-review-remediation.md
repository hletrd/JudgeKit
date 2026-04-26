# RPF Cycle 19 — Review Remediation Plan (Updated)

**Date:** 2026-04-22
**Source:** `.context/reviews/rpf-cycle-19-aggregate.md`
**Status:** In progress (M1-M3, L1-L2 implemented, awaiting gate verification)

## Scope

This cycle addresses NEW findings from the updated RPF cycle 19 aggregate review:
- AGG-NEW-1: Unguarded `.json()` on success paths — 5+ locations risk SyntaxError crash
- AGG-NEW-2: Raw server error messages leaked to users via toast — potential information disclosure
- AGG-NEW-3: contest-join-client navigates to `/dashboard/contests/undefined` when JSON parse fallback fires
- AGG-NEW-4: `forceNavigate` has no JSDoc documenting appropriate usage

Additionally carries forward:
- Cycle 8 L2: `Number(event.target.value)` NaN risk in assignment-form-dialog (latePenalty already fixed, but points field on line 651 still uses `Number()`)
- Cycle 28 Task 1: `normalizePage` — already fixed (uses parseInt + MAX_PAGE)

No cycle-19 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Add `.catch()` guards to unguarded `response.json()` on success paths (AGG-NEW-1)

- **Source:** AGG-NEW-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:128,185`
  - `src/components/problem/problem-submission-form.tsx:188,252`
  - `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:184`
  - `src/hooks/use-submission-polling.ts:238`
  - `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:218`
- **Problem:** After checking `response.ok`, these locations call `await response.json()` without `.catch()`. If the server returns a 200 with a non-JSON body, this throws an unhandled `SyntaxError`.
- **Plan:**
  1. Add `.catch(() => ({ data: {} }))` to each success-path `.json()` call
  2. Ensure type casts handle the `data: {}` fallback gracefully (check `payload.data` before use)
  3. Verify all gates pass
- **Status:** DONE

---

### M2: Replace raw server error display with localized labels (AGG-NEW-2)

- **Source:** AGG-NEW-2
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/submissions/[id]/_components/comment-section.tsx:78`
  - `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:214`
- **Problem:** These locations display raw server error strings directly to users via `toast.error((errorBody as { error?: string }).error ?? fallbackLabel)`. This could expose internal implementation details (SQL constraints, stack traces).
- **Plan:**
  1. In `comment-section.tsx:78`: Replace with `console.error("Comment submit failed:", (errorBody as { error?: string }).error); toast.error(tComments("submitError"));`
  2. In `bulk-create-dialog.tsx:214`: Replace with `console.error("Bulk create failed:", (errorBody as { error?: string }).error); toast.error(tCommon("error"));`
  3. Verify all gates pass
- **Status:** DONE

---

### M3: Guard contest-join-client against undefined assignmentId after JSON parse failure (AGG-NEW-3)

- **Source:** AGG-NEW-3
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:49,58`
- **Problem:** After `res.ok`, line 49 calls `res.json().catch(() => ({ data: {} }))`. If `.catch()` fires, `payload.data.assignmentId` is `undefined` and line 58 navigates to `/dashboard/contests/undefined`.
- **Plan:**
  1. After line 49, add: `if (!payload.data?.assignmentId) { toast.error(t("joinFailed")); return; }`
  2. Verify all gates pass
- **Status:** DONE

---

### L1: Add JSDoc to `forceNavigate` (AGG-NEW-4)

- **Source:** AGG-NEW-4
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/navigation/client.ts:3-5`
- **Problem:** `forceNavigate` uses `window.location.assign()` which causes a full page reload, bypassing Next.js client-side routing. No JSDoc warns future developers about the tradeoff.
- **Plan:**
  1. Add JSDoc: `/** Force a full-page navigation via window.location.assign(). Prefer router.push() for in-app navigation; use this only when a full reload is required (e.g., locale change). */`
  2. Verify all gates pass
- **Status:** DONE

### L2: Fix `Number(event.target.value)` NaN risk in assignment-form-dialog points field (carried from cycle 8)

- **Source:** Cycle 8 AGG-4 (partial)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:651`
- **Problem:** `Number(event.target.value)` for `points` can produce NaN. The latePenalty field was already fixed to use `parseFloat(value) || 0`, but the points field still uses `Number()`.
- **Plan:**
  1. Change `Number(event.target.value)` to `parseFloat(event.target.value) || 0` on line 651
  2. Verify all gates pass
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page Path B progress filter — fetches all into memory (carried from cycles 18-19)

- **Source:** PERF-1 (cycle 19)
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Requires SQL CTE/subquery implementation. Significant backend change.
- **Exit criterion:** Progress filter logic moved to SQL query.

### DEFER-2: Mobile menu sign-out button touch target (carried from cycle 19)

- **Source:** AGG-11 (cycle 19)
- **Severity / confidence:** LOW / LOW (original preserved)
- **Citations:** `src/components/layout/public-header.tsx:319`
- **Reason for deferral:** Meets WCAG 2.2 minimum (24px) but below recommended 44px for touch targets.
- **Exit criterion:** When an accessibility improvement pass is scheduled.

---

## Progress log

- 2026-04-22: Plan created from updated RPF cycle 19 aggregate review. 5 tasks (M1-M3, L1-L2). 2 deferred items. All findings from the aggregate review are either scheduled for implementation or explicitly deferred.
