# Critic Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** critic
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 critic findings are fixed:
- CRI-1 (systemic unguarded `res.json()` pattern): Partially fixed — `apiFetchJson` helper created, 4 components migrated, but 2 components remain
- CRI-2 (double `res.json()` in create-problem-form): Fixed
- CRI-3 (contest-join-client variable shadowing): Fixed
- CRI-4 (problem-export-button null-safety): Fixed

## Findings

### CRI-1: `apiFetchJson` adoption incomplete — 4 success-path `.json()` calls remain [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:137,152`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235,241`

**Description:** The cycle 14 `apiFetchJson` refactor addressed the root cause identified across cycles 11-14 by creating a centralized helper. However, the refactor was not fully applied — 4 `.json()` calls in 2 components were missed. This means the systemic issue identified across 4 cycles is not fully resolved.

The `recruiting-invitations-panel.tsx` is in the same feature area as the 4 refactored components, making the inconsistency particularly jarring. A developer working on contest features would see two different patterns in adjacent components.

**Fix:** Complete the `apiFetchJson` migration for these 2 remaining components.

**Confidence:** HIGH

---

### CRI-2: `recruiting-invitations-panel.tsx` metadata remove button lacks `aria-label` [LOW/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:479-485`

**Description:** The "remove metadata field" button is icon-only (Trash2 icon) but has no `aria-label`. This is the same class of accessibility issue that was fixed in cycles 11-13 for icon-only buttons. While this button uses `size="sm"` instead of `size="icon"`, it is functionally an icon-only button with no visible text label.

**Fix:** Add `aria-label={t("removeField")}` or similar i18n key.

**Confidence:** HIGH

---

### CRI-3: Anti-cheat dashboard polling re-renders on every tick without data comparison — carried from CRI-1 (cycle 14) [MEDIUM/LOW]

**File:** `src/components/contest/anti-cheat-dashboard.tsx:128-136`

**Description:** Carried from cycle 14. The polling callback always creates a new events array via `setEvents()`, even when the server data is identical. This causes unnecessary React re-renders and DOM updates every 30 seconds.

**Fix:** Add shallow comparison in the `setEvents` updater to skip updates when data is unchanged.

**Confidence:** MEDIUM

---

## Final Sweep

The `apiFetchJson` helper was the right architectural fix, but its incomplete adoption means the systemic unguarded `.json()` issue is not fully resolved. The remaining 4 calls in 2 components should be a quick migration. A minor accessibility regression (icon-only button without `aria-label`) was found in the recruiting invitations panel's metadata section.
