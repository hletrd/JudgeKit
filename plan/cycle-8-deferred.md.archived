# Cycle 8 Deferred Findings

**Cycle:** 8/100
**Date:** 2026-05-08

## Deferred-Fix Rules Compliance

Per repo rules (`CLAUDE.md`): Security, correctness, and data-loss findings are NOT deferrable unless repo rules explicitly allow it. The repo rules do not explicitly permit deferral of such findings. All HIGH and MEDIUM findings from the cycle 8 review are scheduled for implementation in `cycle-8-review-remediation.md`.

The following LOW-severity findings are deferred per the skill's deferred-fix rules (LOW impact, no security/correctness/data-loss risk):

---

### C8-LO-1 — LocaleSwitcher uses bare `location` global
**File:** `src/components/layout/locale-switcher.tsx:43`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** Cosmetic consistency issue. `location` is a browser-standard global alias for `window.location`. No functional impact in any supported environment.
**Exit criterion:** Locale switcher refactor or i18n overhaul cycle.

### C8-LO-2 — SettingsTabs missing hash hydration on mount
**File:** `src/app/(dashboard)/dashboard/admin/settings/settings-tabs.tsx:10-16`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** UX inconsistency only. The settings tabs work correctly; they just don't restore the active tab from URL hash on page refresh. The admin settings page is rarely deep-linked.
**Exit criterion:** Admin settings UX overhaul or hash-tabs component unification.

### C8-LO-3 — public-signup.ts constraint substring matching
**File:** `src/lib/actions/public-signup.ts:124-130`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** The `includes("username")` / `includes("email")` checks are defensive fallbacks after explicit `isUsernameTaken` / `isEmailTaken` checks inside the transaction. The primary path is safe; this is a secondary error-path refinement.
**Exit criterion:** Auth error-handling refactor cycle.

### C8-LO-4 — db/export.ts sql.raw lacks safety comment
**File:** `src/lib/db/export.ts:60`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** The `sql.raw` argument is a hardcoded constant string with no user-controlled interpolation. Zero production risk today.
**Exit criterion:** DB export module refactor or security audit cycle.

### C8-LO-5 — JsonLd dangerouslySetInnerHTML escaping is minimal
**File:** `src/components/seo/json-ld.tsx:21`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** The `data` prop is application-controlled (not user input). The escaping covers the primary breakout vectors (`</script`, `<!--`).
**Exit criterion:** SEO component security audit or CSP hardening cycle.

### C8-LO-6 — EditorThemePicker rebuilds editor without loading state
**File:** `src/app/(public)/profile/editor-theme-picker.tsx:94-153`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** UX polish. The editor briefly disappears during theme switch. This is a profile settings page with low traffic.
**Exit criterion:** Profile settings UX overhaul or CodeMirror upgrade.

### C8-LO-7 — useVisibilityPolling consumers create new wrapper every render
**File:** `src/hooks/use-visibility-polling.ts` (consumers)
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** The hook internally uses a ref to track the latest callback, so the behavior is correct. The callback identity churn is slightly wasteful but has no user-visible impact.
**Exit criterion:** Hook performance optimization cycle.

### C8-LO-8 — CompilerClient keyboard shortcut re-registers on dependency change
**File:** `src/components/code/compiler-client.tsx:310-321`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** The keyboard listener is re-added infrequently (only when `handleRun` dependencies change). No functional bug.
**Exit criterion:** CompilerClient refactor or keyboard shortcuts overhaul.

### C8-LO-9 — useSubmissionPolling SSE fallback cleanup race
**File:** `src/hooks/use-submission-polling.ts:132-178`
**Severity:** LOW
**Confidence:** LOW
**Reason for deferral:** Theoretical race. The `fallbackCleanup` is assigned synchronously in `startFetchPolling` before any async work begins. The window for the race is extremely narrow.
**Exit criterion:** Submission polling refactor or race-condition audit cycle.
