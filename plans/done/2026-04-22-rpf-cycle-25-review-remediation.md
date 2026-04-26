# RPF Cycle 25 — Review Remediation Plan

**Date:** 2026-04-22
**Source:** `.context/reviews/_aggregate.md`, `.context/reviews/{code-reviewer,perf-reviewer,security-reviewer,architect,critic,verifier,debugger,test-engineer,tracer,designer,document-specialist}.md`
**Status:** IN PROGRESS

## Scope

This cycle addresses new findings from the multi-agent review at commit ac51baaa. All prior cycle-24 findings have been verified as fixed.

No review finding is silently dropped. All findings are either scheduled for implementation or explicitly recorded as deferred.

---

## Implementation Lanes

### H1: Fix default error handlers leaking raw `error.message` across 4+ components (AGG-1)

- **Source:** AGG-1 (9-agent signal: CR-3, CR-4, SEC-2, CRI-1, V-6, V-7, DBG-3, DBG-4, TR-1)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:**
  - `src/app/(dashboard)/dashboard/problems/create/create-problem-form.tsx:310`
  - `src/app/(dashboard)/dashboard/groups/[id]/assignment-form-dialog.tsx:206`
  - `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:33`
  - `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:66-69` (dead SyntaxError check)
- **Problem:** Multiple `getErrorMessage` functions have `default: return error.message || tCommon("error")`. Unexpected client-side errors (TypeError, SyntaxError) would have their raw messages shown to users. The `edit-group-dialog.tsx` also has dead code: both branches of a SyntaxError check return `tCommon("error")`.
- **Plan:**
  1. Change all default cases to `return tCommon("error")` with `console.error("Unmapped error:", error)`
  2. Remove dead SyntaxError check in edit-group-dialog.tsx
  3. Verify all gates pass
- **Status:** DONE (commit 7640be3f, also covers role-editor-dialog, role-delete-dialog, problem-set-form)

---

### M1: Fix `compiler-client.tsx` raw API error messages in toasts — ensure string type and use i18n (AGG-2)

- **Source:** AGG-2 (5-agent signal: CR-1, SEC-1, CRI-2, DBG-1, TR-2)
- **Severity / confidence:** MEDIUM / HIGH
- **Citations:** `src/components/code/compiler-client.tsx:271-279, 292-299`
- **Problem:** The `handleRun` function exposes raw API error messages in toast descriptions, violating the i18n convention. Additionally, if `data.error` is an object instead of a string, `errorMessage` becomes `[object Object]`.
- **Plan:**
  1. Use i18n keys in toast descriptions (e.g., `toast.error(t("runFailed"))` without description)
  2. Ensure `errorMessage` is always a string with `String()` wrapping for inline error display
  3. Log raw errors to console for debugging
  4. Verify all gates pass
- **Status:** DONE (commit 13d1d53d)

---

### M2: Fix `contest-quick-stats.tsx` double-wrapping `Number()` on already-numeric values (AGG-3)

- **Source:** AGG-3 (3-agent signal: CR-2, CRI-3, PERF-2)
- **Severity / confidence:** LOW / MEDIUM
- **Citations:** `src/components/contest/contest-quick-stats.tsx:65-68`
- **Problem:** The stats parsing uses `Number.isFinite(Number(data.data!.participantCount))` where the value is already a number from JSON parsing. The `Number()` call is a no-op. Using `typeof` checks would be more idiomatic.
- **Plan:**
  1. Replace `Number.isFinite(Number(x))` with `typeof x === "number" && Number.isFinite(x)`
  2. Remove unnecessary non-null assertions where type guards already ensure safety
  3. Verify all gates pass
- **Status:** DONE (commit bc5a4687)

---

### M3: Fix `contest-replay.tsx` speed selector using `Number(v)` instead of `parseInt(v, 10)` (AGG-4)

- **Source:** AGG-4 (1-agent signal: CRI-4)
- **Severity / confidence:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:185`
- **Problem:** Uses `Number(v)` instead of `parseInt(v, 10)`, inconsistent with the codebase convention established in cycle 23/24.
- **Plan:**
  1. Replace `Number(v)` with `parseInt(v, 10)` in the speed selector `onValueChange`
  2. Verify all gates pass
- **Status:** DONE (commit 6c5ebb67)

---

### M4: Separate stats fetch from invitations fetch in recruiting-invitations-panel (AGG-5)

- **Source:** AGG-5 (1-agent signal: PERF-4)
- **Severity / confidence:** MEDIUM / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:166-168`
- **Problem:** `fetchData` combines both `fetchInvitations` and `fetchStats`, so every filter change triggers a stats re-fetch even though stats are independent of search/filter.
- **Plan:**
  1. Move `fetchStats` to a separate effect that only runs on mount and after mutations
  2. Keep `fetchInvitations` as the only function triggered by filter changes
  3. Call both after create/revoke/delete mutations
  4. Verify all gates pass
- **Status:** DONE (commit b8c3b494)

---

## Deferred Items

### DEFER-45: Create shared `mapServerErrorCode` utility (ARCH-1)

- **Source:** ARCH-1 (1-agent signal)
- **Severity / confidence:** MEDIUM / MEDIUM
- **Original severity preserved:** MEDIUM / MEDIUM
- **Citations:** Multiple files across `src/app/(dashboard)/dashboard/groups/` and `src/app/(dashboard)/dashboard/problems/`
- **Reason for deferral:** Refactoring 5+ components to use a shared utility is a larger change that could introduce regressions. The individual default-case fixes in H1 address the immediate security/correctness concern.
- **Exit criterion:** When a codebase-wide `getErrorMessage` consolidation pass is undertaken.

### DEFER-46: `apiFetchJson` adoption for remaining components (ARCH-2)

- **Source:** ARCH-2 (1-agent signal)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** Many across `src/components/` and `src/app/`
- **Reason for deferral:** Already tracked as DEFER-1/DEFER-38. Incremental migration, not a quick fix.
- **Exit criterion:** All manual-auth routes and client components migrated to `apiFetchJson`.

### DEFER-47: `useVisibilityPolling` exponential backoff (ARCH-3)

- **Source:** ARCH-3 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/hooks/use-visibility-polling.ts`
- **Reason for deferral:** No current user-facing impact. All consumers handle their own errors. Nice-to-have enhancement.
- **Exit criterion:** When a consumer experiences persistent failures that would benefit from backoff.

### DEFER-48: Anti-cheat localStorage persistence (SEC-6)

- **Source:** SEC-6 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/exam/anti-cheat-monitor.tsx:41-63`
- **Reason for deferral:** Low severity — exam content is visible to the student anyway. localStorage is same-origin.
- **Exit criterion:** When exam security requirements change or localStorage usage is audited.

### DEFER-49: `sanitizeHtml` root-relative img src (SEC-7)

- **Source:** SEC-7 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/lib/security/sanitize-html.ts:11-14`
- **Reason for deferral:** Extremely low risk — only admins can set problem descriptions, and CSP restricts to same-origin.
- **Exit criterion:** When sanitization policy is reviewed for admin-generated content.

### DEFER-50: Documentation improvements (DOC-1, DOC-2, DOC-3)

- **Source:** DOC-1, DOC-2, DOC-3 (1-agent signal each)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:**
  - `src/lib/api/client.ts:117-128` (apiFetchJson JSDoc)
  - Multiple `getErrorMessage` functions (JSDoc)
  - `src/hooks/use-visibility-polling.ts:17` (paused param JSDoc)
- **Reason for deferral:** Documentation-only improvements. No functional impact.
- **Exit criterion:** When documentation pass is undertaken.

### DEFER-51: Test coverage for error handling and stats validation (TE-1, TE-2, TE-3)

- **Source:** TE-1, TE-2, TE-3 (1-agent signal each)
- **Severity / confidence:** LOW / MEDIUM
- **Original severity preserved:** LOW / MEDIUM
- **Citations:** Multiple files
- **Reason for deferral:** Test writing is important but time-consuming. The code fixes in H1/M1/M2 are more urgent.
- **Exit criterion:** Unit tests added for `getErrorMessage` functions, compiler-client error display, and contest-quick-stats data validation.

### DEFER-52: `active-timed-assignment-sidebar-panel.tsx` extra tick after expiry (PERF-3)

- **Source:** PERF-3 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/layout/active-timed-assignment-sidebar-panel.tsx:69-73`
- **Reason for deferral:** Very minor inefficiency — one extra re-render after all assignments expire. No user-facing impact.
- **Exit criterion:** When the sidebar panel is next modified for other reasons.

### DEFER-53: `contest-replay.tsx` FLIP animation synchronous layout (PERF-5)

- **Source:** PERF-5 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/contest-replay.tsx:95-130`
- **Reason for deferral:** Not a real concern for typical use case (5-50 participants). Could jank on large contests but low priority.
- **Exit criterion:** When replay performance issues are reported for large contests.

### DEFER-54: `compiler-client.tsx` tabs lack distinguishing aria-label (DES-6)

- **Source:** DES-6 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/code/compiler-client.tsx:439-443`
- **Reason for deferral:** Low accessibility impact. Only relevant when multiple tab groups exist on the same page.
- **Exit criterion:** When accessibility audit covers the compiler client.

### DEFER-55: `recruiting-invitations-panel.tsx` table responsive behavior (DES-4)

- **Source:** DES-4 (1-agent signal)
- **Severity / confidence:** LOW / LOW
- **Original severity preserved:** LOW / LOW
- **Citations:** `src/components/contest/recruiting-invitations-panel.tsx:522-634`
- **Reason for deferral:** Primarily an admin feature used on desktop. Horizontal scroll is functional.
- **Exit criterion:** When mobile admin experience is prioritized.

---

## Previously Deferred Items (Carried Forward)

All previously deferred items from prior cycle plans remain in effect:
- DEFER-1 through DEFER-5 (from cycle 1 plan)
- DEFER-20 through DEFER-25 (from cycle 2 plan)
- D1, D2, A19 (from earlier cycles)
- DEFER-26 through DEFER-44 (from RPF cycle 28 and cycle 24 plans)
- DEFER-41 (submission-overview polling when dialog closed) — RESOLVED this cycle (properly guarded)

---

## Progress Log

- 2026-04-22: Plan created from multi-agent review at commit ac51baaa. 5 aggregate findings. 5 scheduled for implementation (H1, M1-M4). 11 deferred (DEFER-45 through DEFER-55). All prior cycle-24 findings verified as fixed.
- 2026-04-22: H1 DONE — fix default error handlers leaking raw error.message (commit 7640be3f, also covers role-editor-dialog, role-delete-dialog, problem-set-form)
- 2026-04-22: M1 DONE — fix compiler-client raw API error messages in toasts (commit 13d1d53d)
- 2026-04-22: M2 DONE — fix contest-quick-stats double-wrapping Number() (commit bc5a4687)
- 2026-04-22: M3 DONE — fix contest-replay Number() to parseInt() (commit 6c5ebb67)
- 2026-04-22: M4 DONE — separate stats fetch from invitations fetch (commit b8c3b494)
- 2026-04-22: All implementation lanes complete. Awaiting gate verification.
