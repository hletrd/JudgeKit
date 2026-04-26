# RPF Cycle 21 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md` (cycle 21)
**Status:** Done (M1, L1-L5 all complete)

## Scope

This cycle addresses NEW findings from the RPF cycle 21 aggregate review:
- AGG-1: `anti-cheat-dashboard.tsx` `formatDetailsJson` not migrated to i18n (MEDIUM/HIGH, 7-agent signal)
- AGG-2: `window.location.origin` for URL construction — 4 instances (carried DEFER-24, 2 new)
- AGG-3: `role-editor-dialog.tsx` `Number(e.target.value)` NaN risk (LOW/MEDIUM, 5-agent signal)
- AGG-4: `contest-replay.tsx` `setInterval` without visibility awareness (LOW/MEDIUM)
- AGG-5: Inconsistent `Number()` vs `parseInt()` across form inputs (LOW/MEDIUM)
- AGG-6: `anti-cheat-dashboard.tsx` expand/collapse lack `aria-controls` (LOW/LOW)
- AGG-7: `contest-replay.tsx` range slider lacks `aria-valuetext` (LOW/LOW)
- AGG-8: `active-timed-assignment-sidebar-panel.tsx` progress bar `aria-valuenow` rounded (LOW/LOW, carried)

No cycle-21 review finding is silently dropped. No new refactor-only work is added under deferred.

---

## Implementation lanes

### M1: Migrate `anti-cheat-dashboard.tsx` `formatDetailsJson` to i18n-aware version (AGG-1)

- **Source:** AGG-1
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/contest/anti-cheat-dashboard.tsx:91-97`
- **Problem:** The `formatDetailsJson` function only pretty-prints JSON. When an anti-cheat event has a `target` field (e.g., `{"target": "code-editor"}`), the dashboard shows raw JSON while the participant timeline shows "Target: Code editor" (localized). The i18n keys already exist in both `en.json` and `ko.json` (`detailTargetLabel`, `detailTargets.*`).
- **Plan:**
  1. Change `formatDetailsJson` signature to accept `t` parameter: `function formatDetailsJson(raw: string, t: (key: string) => string): string`
  2. Add target field handling matching the timeline version: parse JSON, check `parsed.target`, look up i18n key, return localized string
  3. Update call site at line 550 to pass `t` function
  4. Verify all gates pass
- **Status:** DONE

---

### L1: Fix `role-editor-dialog.tsx` `Number()` to `parseInt()` for level input (AGG-3)

- **Source:** AGG-3
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/app/(dashboard)/dashboard/admin/roles/role-editor-dialog.tsx:187`
- **Problem:** `Number(e.target.value)` can produce `NaN` from non-numeric paste. The established pattern is `parseInt()` with fallback.
- **Plan:**
  1. Change line 187: `onChange={(e) => setLevel(parseInt(e.target.value, 10) || 0)}`
  2. Verify all gates pass
- **Status:** DONE

---

### L2: Standardize `Number()` to `parseInt()` in `quick-create-contest-form.tsx` (AGG-5 partial)

- **Source:** AGG-5
- **Severity / confidence:** LOW / MEDIUM
- **Citations:**
  - `src/components/contest/quick-create-contest-form.tsx:133`
  - `src/components/contest/quick-create-contest-form.tsx:172`
- **Problem:** Uses `Number(e.target.value) || 60` and `Number(e.target.value) || 100`. While the `||` fallback handles NaN, `Number("12abc")` is NaN while `parseInt("12abc", 10)` is 12. The codebase convention is `parseInt`.
- **Plan:**
  1. Change line 133: `onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 60)}`
  2. Change line 172: `onChange={(e) => updateProblemPoints(i, parseInt(e.target.value, 10) || 100)}`
  3. Verify all gates pass
- **Status:** DONE

---

### L3: Add `aria-controls` to `anti-cheat-dashboard.tsx` expand/collapse buttons (AGG-6)

- **Source:** AGG-6
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/anti-cheat-dashboard.tsx:534`
- **Problem:** Expand/collapse buttons have `aria-expanded` but no `aria-controls`.
- **Plan:**
  1. Generate a unique `id` for each expanded `<pre>` element (e.g., `anti-cheat-detail-${event.id}`)
  2. Add `aria-controls={anti-cheat-detail-${event.id}}` to each button
  3. Add `id={anti-cheat-detail-${event.id}}` to the corresponding `<pre>` element
  4. Verify all gates pass
- **Status:** DONE

---

### L4: Add `aria-valuetext` to `contest-replay.tsx` range slider (AGG-7)

- **Source:** AGG-7
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:159-168`
- **Problem:** Range slider has numeric values but no `aria-valuetext` for screen reader context.
- **Plan:**
  1. Add `aria-valuetext={selectedSnapshot.label}` to the range input
  2. Verify all gates pass
- **Status:** DONE

---

### L5: Fix `active-timed-assignment-sidebar-panel.tsx` progress bar `aria-valuenow` precision (AGG-8)

- **Source:** AGG-8 (carried from cycle 18 DES-3)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:172`
- **Problem:** `aria-valuenow={Math.round(progressPercent)}` while visual shows one decimal place.
- **Plan:**
  1. Change to `aria-valuenow={progressPercent}`
  2. Verify all gates pass
- **Status:** DONE

---

## Deferred items

### DEFER-1: Practice page progress-filter SQL CTE optimization (carried from cycle 18)

- **Source:** rpf-cycle-18 DEFER-1, rpf-cycle-19 DEFER-1, rpf-cycle-20 DEFER-1
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:** `src/app/(public)/practice/page.tsx:410-519`
- **Reason for deferral:** Significant refactoring scope. Current code works correctly for existing problem counts.
- **Exit criterion:** Problem count exceeds 5,000 or a performance benchmark shows >2s page load time with progress filters.

### DEFER-2: `window.location.origin` for URL construction (AGG-2, carried from DEFER-24)

- **Source:** AGG-2, DEFER-24
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Citations:**
  - `src/components/contest/access-code-manager.tsx:137`
  - `src/components/contest/recruiting-invitations-panel.tsx:99`
  - `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
  - `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:148`
- **Reason for deferral:** Requires server-side mechanism to provide public URL (e.g., environment variable or API endpoint). All four instances need a coordinated change. The `workers-client.tsx` and `file-management-client.tsx` instances generate command snippets that are only used in admin contexts — the risk is lower for those.
- **Exit criterion:** When a `NEXT_PUBLIC_APP_URL` or server-provided public URL mechanism is implemented.

### DEFER-3: `contest-replay.tsx` `setInterval` without visibility awareness (AGG-4)

- **Source:** AGG-4
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/components/contest/contest-replay.tsx:77-87`
- **Reason for deferral:** The replay is a cosmetic animation feature. When the tab is hidden, the interval may be throttled but no data is lost — the user can adjust the slider when they return. The `setInterval` cleanup on unmount is correct.
- **Exit criterion:** When a user reports replay behaving unexpectedly after tab switch, or when a shared visibility-aware interval hook is created.

### DEFER-4: `recruiter-candidates-panel.tsx` full export fetch (carried as DEFER-29)

- **Source:** PERF-1, DEFER-29
- **Severity / confidence:** MEDIUM / HIGH (original preserved)
- **Citations:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
- **Reason for deferral:** Requires new server-side endpoint with pagination, search, and sort. Significant backend change.
- **Exit criterion:** When a dedicated `/api/v1/contests/${assignmentId}/candidates` endpoint is created.

### DEFER-5: Component tests for anti-cheat-dashboard, role-editor-dialog, contest-replay (TE-1 through TE-4)

- **Source:** TE-1 through TE-4 (cycle 21)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** See test-engineer.md for specific file citations
- **Reason for deferral:** Test infrastructure for component-level mocking of `apiFetch` needs setup. Large scope.
- **Exit criterion:** When component test coverage pass is scheduled.

### DEFER-6: Gemini model name URL interpolation (carried from cycle 18 SEC-3)

- **Source:** SEC-3 (cycle 18)
- **Severity / confidence:** LOW / MEDIUM (original preserved)
- **Citations:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:127`
- **Reason for deferral:** `SAFE_GEMINI_MODEL_PATTERN` already restricts to safe characters. Defense-in-depth only.
- **Exit criterion:** When the chat-widget plugin API is refactored.

### DEFER-7: Encryption plaintext fallback (carried from cycle 11)

- **Source:** SEC-4 (cycle 11)
- **Severity / confidence:** MEDIUM / MEDIUM (original preserved)
- **Reason for deferral:** Architectural decision needed on whether encryption should be mandatory.
- **Exit criterion:** When a security policy decision is made on mandatory encryption.

---

## Progress log

- 2026-04-22: Plan created from RPF cycle 21 aggregate review. 8 tasks (M1, L1-L5, plus 2 carried LOW items). 7 deferred items.
- 2026-04-22: All 6 tasks implemented (M1, L1-L5). 7 commits pushed. All gates pass (eslint, next build, vitest unit).
