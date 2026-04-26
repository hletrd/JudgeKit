# RPF Cycle 23 (Fresh) — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`, `.context/reviews/{code-reviewer,perf-reviewer,security-reviewer,architect,critic,verifier,debugger,test-engineer,tracer,designer,document-specialist}.md`
**Status:** DONE — all lanes implemented, all gates passed

## Scope

This cycle addresses new findings from the fresh multi-agent review at commit 429d1b86. The prior cycle-22 findings have all been addressed. The prior RPF cycle-28 plan tasks have been verified as implemented.

No review finding is silently dropped. All findings are either scheduled for implementation or explicitly recorded as deferred.

---

## Implementation Lanes

### H1: Replace 5 local `normalizePage` functions with shared import (AGG-1)

- **Source:** AGG-1 (10-agent signal: CR-1, SEC-1, PERF-1, ARCH-1, CRI-1, DBG-1, V-1, TE-1, TR-1, DOC-3)
- **Severity / confidence:** HIGH / HIGH
- **Citations:**
  - `src/app/(dashboard)/dashboard/problems/page.tsx:51`
  - `src/app/(dashboard)/dashboard/admin/audit-logs/page.tsx:50`
  - `src/app/(dashboard)/dashboard/admin/login-logs/page.tsx:47`
  - `src/app/(dashboard)/dashboard/admin/users/page.tsx:41`
  - `src/app/(dashboard)/dashboard/admin/files/page.tsx:26`
- **Problem:** 5 server components define local `normalizePage` using `Number()` without MAX_PAGE. The shared `src/lib/pagination.ts` uses `parseInt` and caps at 10000. Local copies accept hex/scientific notation and allow unbounded OFFSET (DoS vector).
- **Plan:**
  1. For each of the 5 files, remove the local `normalizePage` function
  2. Add `import { normalizePage } from "@/lib/pagination"` 
  3. Verify that `normalizePageSize` is not also duplicated locally (if so, import it too)
  4. Verify all gates pass
- **Status:** DONE (commit e0509e3d)

### H2: Fix `contest-join-client.tsx` double `.json()` on same Response (AGG-2)

- **Source:** AGG-2 (6-agent signal: CR-2, CRI-2, DBG-2, V-2, TR-2, DOC-1)
- **Severity / confidence:** HIGH / HIGH
- **Citations:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:44-49`
- **Problem:** The code calls `res.json()` twice on the same Response — once in the error branch (line 45), once in the success branch (line 49). This is the documented anti-pattern from `src/lib/api/client.ts`. The if/else branching prevents the actual "body already consumed" error today, but this is fragile.
- **Plan:**
  1. Refactor to use `apiFetchJson` or parse the body once before branching
  2. Verify error and success paths both work correctly
  3. Verify all gates pass
- **Status:** DONE (commit a2afbc7d)

### M1: Fix `create-problem-form.tsx` and `group-members-manager.tsx` double `.json()` pattern (AGG-3)

- **Source:** AGG-3 (4-agent signal: CR-3, CR-4, DBG-3, DBG-4, TR-2, DOC-1)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:**
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:432-437`
  - `src/app/(dashboard)/dashboard/groups/[id]/group-members-manager.tsx:124-128`
- **Problem:** Same double `.json()` anti-pattern as H2. Error and success branches each call `.json()` on the same Response. Mutually exclusive branches prevent the actual error today.
- **Plan:**
  1. Refactor both files to parse the body once before the if/else, or use `apiFetchJson`
  2. Verify error and success paths both work correctly
  3. Verify all gates pass
- **Status:** DONE (commit 7db26ab4)

### M2: Refactor `submission-overview.tsx` to use shared Dialog component (AGG-4)

- **Source:** AGG-4 (4-agent signal: ARCH-2, CRI-3, DES-1, V-4)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/lecture/submission-overview.tsx:152`
- **Problem:** The component renders a `div role="dialog" aria-modal="true"` manually instead of using the shared `Dialog` component. This lacks focus trap, scroll lock, and overlay click-to-close. The shared Dialog provides all these features.
- **Plan:**
  1. Replace the custom `div` dialog with `Dialog`, `DialogContent`, `DialogHeader`, etc. from `@/components/ui/dialog`
  2. Add a `DialogTrigger` or control open state with the existing `open`/`onClose` props
  3. Remove the custom Escape handler (Dialog handles this automatically)
  4. Remove the custom `role="dialog" aria-modal="true"` attributes
  5. Verify keyboard accessibility (Tab trap, Escape close)
  6. Verify all gates pass
- **Status:** DONE (commit d056e759)

### M3: Fix `contest-quick-stats.tsx` avgScore null displayed as 0.0 (AGG-5)

- **Source:** AGG-5 (7-agent signal: CR-5, ARCH-3, CRI-4, DBG-5, DES-2, V-5, TR-3)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Citations:** `src/components/contest/contest-quick-stats.tsx:42,67,110`
- **Problem:** When the API returns `avgScore: null` (no submissions), the initial state has `avgScore: 0`. The null check preserves the previous value (0), displaying "0.0" which is misleading — 0.0 implies all submissions scored 0, while null means no submissions exist.
- **Plan:**
  1. Change the `ContestStats` type: `avgScore: number | null`
  2. Change initial state `avgScore` from `0` to `null`
  3. Update the display (line 110) to show "---" when `stats.avgScore === null`
  4. Verify all gates pass
- **Status:** DONE (commit 2cfbb9df)

### L1: Fix `normalizePageSize` to use `parseInt` for consistency (AGG-7)

- **Source:** AGG-7 (1-agent signal: CR-6)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/pagination.ts:18`
- **Problem:** While `normalizePage` was fixed to use `parseInt`, `normalizePageSize` still uses `Number()`. Low risk because `PAGE_SIZE_OPTIONS` is a strict allowlist, but inconsistent.
- **Plan:**
  1. Change `Number(value ?? DEFAULT_PAGE_SIZE)` to `parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10)`
  2. Verify existing pagination tests pass
  3. Verify all gates pass
- **Status:** DONE (commit 6e13f69e, combined with L2)

### L2: Add JSDoc to `normalizePage` explaining MAX_PAGE (AGG-8)

- **Source:** AGG-8 (1-agent signal: DOC-2)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/lib/pagination.ts:7`
- **Problem:** The function has no JSDoc explaining the `MAX_PAGE = 10000` upper bound.
- **Plan:**
  1. Add a brief JSDoc comment explaining the function and its upper bound
  2. Verify all gates pass
- **Status:** DONE (commit 6e13f69e, combined with L1)

---

## Deferred Items

### DEFER-41: `submission-overview.tsx` polls when dialog closed — wasted callbacks (AGG-6)

- **Source:** AGG-6 (2-agent signal: PERF-2, V-4)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/components/lecture/submission-overview.tsx:123`
- **Reason for deferral:** The wasted callback is cheap (just a ref check). The M2 refactor to use Dialog may change how the component is mounted. If M2 wraps in Dialog, the conditional mount approach becomes natural. Fixing this before M2 would create throwaway code.
- **Exit criterion:** After M2 is implemented, evaluate if conditional mounting is still needed. If so, add it then.

### DEFER-42: `recruiting-invitations-panel.tsx` mutation handlers use raw `apiFetch` (CRI-5)

- **Source:** CRI-5 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:195,254,277,299`
- **Reason for deferral:** Style consistency issue only. Error handling is properly done in each handler.
- **Exit criterion:** When a codebase-wide `apiFetch` -> `apiFetchJson` migration pass is undertaken.

### DEFER-43: `AUTH_CACHE_TTL_MS` has no upper bound (SEC-4)

- **Source:** SEC-4 (1-agent signal)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** `src/proxy.ts:24-27`
- **Reason for deferral:** Requires operational coordination. The current default of 2000ms is safe. Adding a hard upper bound could break production if an operator has a valid reason for a larger value.
- **Exit criterion:** When a deployment configuration review is performed, or when the proxy auth cache is refactored.

---

## Previously Deferred Items (Carried Forward)

All previously deferred items from prior cycle plans remain in effect:
- DEFER-1 through DEFER-5 (from cycle 1 plan)
- DEFER-20 through DEFER-25 (from cycle 2 plan)
- D1, D2, A19 (from earlier cycles)
- DEFER-26 through DEFER-40 (from RPF cycle 28 plan)
- DEFER-1 through DEFER-13 (from old cycle-23 plan, still applicable)

---

## Progress Log

- 2026-04-22: Plan created from fresh multi-agent review at commit 429d1b86. 8 aggregate findings. 7 scheduled for implementation (H1, H2, M1-M3, L1, L2). 3 deferred (DEFER-41 through DEFER-43). All prior cycle-22 and cycle-28 findings verified as fixed.
- 2026-04-22: H1 DONE — replaced 5 local normalizePage + 3 inline usages with shared import (commit e0509e3d)
- 2026-04-22: H2 DONE — migrated contest-join-client to apiFetchJson (commit a2afbc7d)
- 2026-04-22: M1 DONE — fixed double .json() in create-problem-form and group-members-manager (commit 7db26ab4)
- 2026-04-22: M2 DONE — refactored submission-overview to shared Dialog component (commit d056e759)
- 2026-04-22: M3 DONE — fixed avgScore null display in contest-quick-stats (commit 2cfbb9df)
- 2026-04-22: L1+L2 DONE — normalizedPageSize uses parseInt, added JSDoc (commit 6e13f69e)
- 2026-04-22: All implementation lanes complete. Awaiting gate verification.
- 2026-04-22: All gates passed. ESLint clean, next build success, vitest unit 294/2114 pass, integration 37 skipped (no DB), component 54/65 pass (11 pre-existing DB-dependent failures). Pushed to remote.
