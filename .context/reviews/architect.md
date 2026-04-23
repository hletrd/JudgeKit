# Architectural Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** architect
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

- ARCH-1 (centralized `apiFetchJson` helper): Fixed — helper created and used in 4 contest components
- ARCH-2 (double `res.json()` in create-problem-form): Fixed — now uses single parse + branch

## Findings

### ARCH-1: Incomplete `apiFetchJson` adoption — 4 success-path `.json()` calls still use raw `apiFetch` [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:133-152`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:230-245`

**Description:** The cycle 14 `apiFetchJson` refactor was a significant architectural improvement that eliminated the unguarded `.json()` pattern in 4 components. However, the refactor was incomplete — 2 components still use raw `apiFetch` + manual `.json()` parsing without `.catch()` guards. This creates an inconsistent codebase where some components use the centralized safe pattern and others don't.

The `recruiting-invitations-panel.tsx` is particularly notable because it's in the same `contest` feature area as the 4 refactored components. Having different patterns in the same feature area makes the code harder to maintain and increases the risk of the unguarded pattern being copied as a template.

**Fix:** Migrate both components to use `apiFetchJson`. The `recruiting-invitations-panel.tsx` fetch functions can use:
```ts
const { ok, data: json } = await apiFetchJson<{ data: Invitation[] }>(
  `/api/v1/contests/${assignmentId}/recruiting-invitations?${query}`,
  { signal: controller.signal },
  { data: [] }
);
```

The `workers-client.tsx` can use `apiFetchJson` for both the workers and stats endpoints.

**Confidence:** HIGH

---

### ARCH-2: `language-config-table.tsx` is 688 lines — should be decomposed [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx`

**Description:** Carried from ARCH-3 (cycle 14). This component contains: the main table, edit sheet, add sheet, confirmation dialog, image status fetching, build/remove/prune handlers, search filtering, and disk usage display. At 688 lines it is difficult to maintain.

**Fix:** Extract `LanguageEditSheet`, `LanguageAddSheet`, and `LanguageConfirmDialog` as separate components.

**Confidence:** LOW

---

## Final Sweep

The `apiFetchJson` helper was the right architectural fix for the recurring unguarded `.json()` pattern. The remaining gap is incomplete adoption — 2 components with 4 calls still use the old raw pattern. Completing the migration would make the codebase consistent and prevent future instances of the same bug class. The `language-config-table.tsx` decomposition remains a low-priority structural improvement.
