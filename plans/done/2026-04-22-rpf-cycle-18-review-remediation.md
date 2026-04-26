# RPF Cycle 18 Review Remediation Plan

**Date:** 2026-04-22
**Base commit:** d32f2517
**Status:** DONE

## Tasks

### H1: Fix `formatDetailsJson` hardcoded English strings in anti-cheat timeline [MEDIUM/HIGH]
**Status:** DONE
**Source:** AGG-1 (5 perspectives: CR-4, ARCH-3, CRI-1, V-3, DOC-1)
**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:45-63`
**Action:**
1. Convert `formatDetailsJson` from a standalone function to a method that accepts the `t` function
2. Move the labels mapping ("code-editor" -> "Target: Code editor") to i18n keys
3. Add corresponding Korean translations
4. Add i18n keys for "Target:" prefix label
**Exit criteria:** No hardcoded English strings in `formatDetailsJson`; Korean locale shows localized labels.

---

### M1: Migrate `api-keys-client.tsx` to `apiFetchJson` [MEDIUM/MEDIUM]
**Status:** DONE
**Source:** AGG-4 (3 perspectives: CR-2, ARCH-1, V-2)
**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:137-191`
**Action:**
1. Migrate `fetchKeys` to use `apiFetchJson`
2. Migrate `handleCreate` response parsing to use `apiFetchJson`
3. Remove manual `res.json().catch()` calls
**Exit criteria:** No raw `apiFetch` + `res.json().catch()` pattern in `api-keys-client.tsx`.

---

### M2: Fix anti-cheat timeline polling offset drift — reset on poll refresh [MEDIUM/MEDIUM]
**Status:** DONE
**Source:** AGG-3 (3 perspectives: DBG-1, V-1, TR-1)
**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:96-114`
**Action:**
1. When polling refreshes in `fetchEvents`, reset `events` to just the first page
2. Reset `offset` to the length of the first page
**Exit criteria:** No duplicate or missing events at page boundary during polling.

---

### M3: Add `aria-label` to code-timeline-panel mini-timeline dots [LOW/MEDIUM]
**Status:** DONE
**Source:** AGG-8 (2 perspectives: CR-3, DES-1)
**File:** `src/components/contest/code-timeline-panel.tsx:170-179`
**Action:**
1. Add `aria-label` to each snapshot dot button (e.g., "Snapshot 3 of 10")
2. Add i18n key for the label format
**Exit criteria:** Each mini-timeline dot has an accessible label announced by screen readers.

---

### M4: Fix `quick-create-contest-form.tsx` silent failure when `assignmentId` is missing [LOW/MEDIUM]
**Status:** DONE
**Source:** AGG-9 (2 perspectives: DBG-3, TR-3)
**File:** `src/components/contest/quick-create-contest-form.tsx:79-84`
**Action:**
1. After `res.ok` + `res.json()`, check if `json.data?.assignmentId` exists
2. If missing, redirect to the contests list
**Exit criteria:** User always gets navigated away from the create form after successful creation.

---

### M5: Add visibility awareness to sidebar timer [LOW/MEDIUM]
**Status:** DONE
**Source:** AGG-6 (2 perspectives: PERF-3, DBG-2)
**File:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:72-84`
**Action:**
1. Add `visibilitychange` listener to immediately recalculate `nowMs` when the tab becomes visible
2. This ensures the timer doesn't show stale values after tab switch
**Exit criteria:** Sidebar timer shows correct time immediately on tab return.

---

### M6: Consolidate `formatDuration` into shared utility [LOW/MEDIUM]
**Status:** DONE
**Source:** AGG-7 (2 perspectives: ARCH-4, CRI-2)
**Files:**
- `src/components/exam/countdown-timer.tsx:17-24`
- `src/components/layout/active-timed-assignment-sidebar-panel.tsx:16-23`
**Action:**
1. Add `formatDuration` to `src/lib/formatting.ts`
2. Import from both components, removing the local copies
3. Add unit tests for `formatDuration` edge cases
**Exit criteria:** Single `formatDuration` in `formatting.ts`, imported by both components.

---

## Deferred Items

### DEFER-58: `recruiter-candidates-panel.tsx` full export endpoint for display — needs new API endpoint [MEDIUM/MEDIUM]
**Source:** AGG-2 (3 perspectives: CR-1, PERF-1, CRI-4), DEFER-29
**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
**Reason for deferral:** Requires creating a new server-side API endpoint with pagination, search, and sorting. This is a significant feature addition that needs design review. The current implementation works correctly at small scale.
**Exit criterion:** New `/api/v1/contests/${assignmentId}/candidates` endpoint created with pagination.

### DEFER-59: `window.location.origin` for invitation URL construction [MEDIUM/MEDIUM]
**Source:** AGG-5, DEFER-24
**Files:** `src/components/contest/access-code-manager.tsx:137`, `src/components/contest/recruiting-invitations-panel.tsx:99`
**Reason for deferral:** Requires server-side configuration for the public URL. This affects multiple components and needs a coordinated approach (config endpoint or environment variable).
**Exit criterion:** Server-provided public URL or configurable base URL used for invitation links.

### DEFER-60: Practice page Path B progress filter [MEDIUM/MEDIUM]
**Source:** PERF-2, carried from cycles 18-19
**File:** `src/app/(public)/practice/page.tsx:410-519`
**Reason for deferral:** Requires SQL CTE/subquery implementation. Significant backend change.
**Exit criterion:** Progress filter logic moved to SQL query.

### DEFER-61: `participant-anti-cheat-timeline.tsx` expand/collapse `aria-controls` [LOW/LOW]
**Source:** AGG-10, DES-2
**Reason for deferral:** Minor accessibility enhancement. Low impact.
**Exit criterion:** `aria-controls` added to expand/collapse buttons.

### DEFER-62: Unit tests for `formatDetailsJson`, `quick-create-contest-form`, `api-keys-client` [LOW/MEDIUM]
**Source:** TE-1, TE-3, TE-4
**Reason for deferral:** Test coverage improvements. Important but not blocking. (formatDuration tests already added as part of M6.)
**Exit criterion:** Tests added for each component/utility.
