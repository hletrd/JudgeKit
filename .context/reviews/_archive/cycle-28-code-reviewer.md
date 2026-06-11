# Cycle 28 Code Review

**Date:** 2026-04-20
**Reviewer:** code-reviewer
**Base commit:** d4489054

## Findings

### CR-1: `compiler-client.tsx` localStorage write without try/catch [LOW/MEDIUM]

**File:** `src/components/code/compiler-client.tsx:183`
**Code:** `localStorage.setItem("compiler:language", language);`
**Problem:** The language persistence effect writes directly to `localStorage` without a try/catch guard. In private browsing mode or when storage quota is exceeded, this throws an unhandled `DOMException` that crashes the component. All other `localStorage` calls in the codebase (use-source-draft.ts, anti-cheat-monitor.tsx) are wrapped in try/catch.
**Concrete failure scenario:** User opens the playground in Safari private browsing mode, changes language, and the component throws a `QuotaExceededError`.
**Fix:** Wrap the `localStorage.setItem` in a try/catch block, consistent with the codebase convention.

### CR-2: `submission-detail-client.tsx` localStorage write without try/catch [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/submissions/[id]/submission-detail-client.tsx:94`
**Code:** `localStorage.setItem(key, JSON.stringify(payload));`
**Problem:** The `handleResubmit` function writes the draft payload to localStorage without a try/catch guard. Same class of issue as CR-1.
**Concrete failure scenario:** User clicks "Resubmit" in Safari private browsing, the handler throws `QuotaExceededError`, and the page navigation is blocked.
**Fix:** Wrap the `localStorage.setItem` in a try/catch block. The fallback (no draft saved) is acceptable since the navigation still works.

### CR-3: `contest-clarifications.tsx` and `contest-announcements.tsx` duplicated polling pattern [LOW/LOW]

**Files:**
- `src/components/contest/contest-clarifications.tsx:87-111`
- `src/components/contest/contest-announcements.tsx:71-95`

**Problem:** Both components implement the exact same visibility-aware polling pattern (syncVisibility, setInterval, visibilitychange event). This is a DRY violation. The same pattern also appears in `participant-anti-cheat-timeline.tsx` and `use-submission-polling.ts` (via initFetchPolling). A shared hook would eliminate ~25 lines of duplicated logic per consumer.
**Concrete failure scenario:** If a bug is found in the polling pattern (e.g., interval leak on rapid visibility toggling), it must be fixed in 4+ places independently.
**Fix:** Low priority — extract a shared `useVisibilityAwarePolling(callback, intervalMs)` hook. The existing code works correctly; this is a maintainability improvement.

### CR-4: `compiler-client.tsx` uses `defaultValue` fallback on all `t()` calls [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx` (lines 232, 271, 292, 346, 362, 371, etc.)
**Problem:** The compiler client uses `t("key", { defaultValue: "..." })` extensively while no other component in the codebase does this. This suggests the i18n keys may not be properly registered in the translation files, and the `defaultValue` fallbacks are masking missing translations.
**Concrete failure scenario:** A Korean user sees English fallback text if the translation key is missing from the `ko` locale file.
**Fix:** Verify all `compiler.*` keys exist in both locale files and remove the `defaultValue` parameters if they do. If keys are missing, add the proper translations.

## Verified Safe / No Issue

- Error boundaries now properly gate `console.error` behind dev checks (cycle 27 fix confirmed).
- `create-problem-form.tsx` `console.warn` gated behind dev check (cycle 27 fix confirmed).
- `not-found.tsx` has Korean-locale documentation comment on 404 tracking (cycle 27 fix confirmed).
- `dangerouslySetInnerHTML` uses `safeJsonForScript` and `sanitizeHtml` respectively.
- No `as any` casts in production code.
- No `@ts-ignore` or `@ts-expect-error`.
- Only 2 `eslint-disable` directives, both with justification comments.
- No silently swallowed catch blocks (all `.catch(() => {})` calls are for fire-and-forget operations like fullscreen, preference persistence, and container cleanup where failure is acceptable).
- Korean letter-spacing compliance is thorough across all components.
- Workspace-to-public migration Phase 5 complete (sidebar hidden for non-admin, nav items cleaned up).
