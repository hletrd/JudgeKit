# Architectural Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

- ARCH-2 (icon-only buttons missing aria-label): Fixed — workers-client.tsx and group-instructors-manager.tsx now have `aria-label`

## Findings

### ARCH-1: No centralized `res.json()` safety pattern — 4 cycles of piecemeal fixes [MEDIUM/HIGH]

**Files:** 11+ components across the codebase (see code-reviewer CR-1 for full list)

**Description:** This is the fourth cycle where unguarded `res.json()` calls are being identified and fixed piecemeal. The pattern keeps recurring because there is no codified, enforced approach. The codebase has three distinct patterns:
1. With `.catch()` on error paths only (documented in `apiFetch` JSDoc)
2. Without `.catch()` on success paths (most components)
3. Without `res.ok` check at all (rare, but found in chat-logs-client)

The root cause is architectural: there is no centralized helper that combines `apiFetch` + `res.ok` check + `.json()` parsing into a single, safe operation. Each component implements its own pattern, leading to inconsistency.

**Fix:** Create an `apiFetchJson<T>(url, options, fallback): Promise<T>` helper that:
1. Calls `apiFetch(url, options)`
2. Checks `res.ok` and throws a typed error if not OK
3. Calls `res.json().catch(() => fallback)` for safe parsing
4. Returns typed data

This would eliminate the entire class of unguarded `.json()` bugs in one refactor.

**Confidence:** HIGH

---

### ARCH-2: `create-problem-form.tsx` double `res.json()` — response body consumed pattern [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:332,336` and `423,427`

**Description:** The code calls `await res.json()` twice on the same Response object. The first call consumes the body, making the second call fail. This is currently safe because the error path throws before the second call, but it is a latent bug. This is a consequence of the lack of a centralized response handling pattern (ARCH-1).

**Fix:** Parse response once and branch on `res.ok`. A centralized `apiFetchJson` helper would prevent this pattern entirely.

**Confidence:** HIGH

---

### ARCH-3: `language-config-table.tsx` is 688 lines — should be decomposed [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`

**Description:** Carried from ARCH-3 (cycle 13). This component contains: the main table, edit sheet, add sheet, confirmation dialog, image status fetching, build/remove/prune handlers, search filtering, and disk usage display. At 688 lines it is difficult to maintain.

**Fix:** Extract `LanguageEditSheet`, `LanguageAddSheet`, and `LanguageConfirmDialog` as separate components.

**Confidence:** LOW

---

## Final Sweep

The key architectural concern is the lack of a centralized `res.json()` safety pattern (ARCH-1), which has led to four cycles of piecemeal fixes. The double `res.json()` in create-problem-form.tsx (ARCH-2) is a direct consequence of this gap. Creating a centralized helper would eliminate both the unguarded `.json()` class of bugs and the double-read pattern in one refactor.
