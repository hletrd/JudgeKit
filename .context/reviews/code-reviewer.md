# Code Reviewer Review — Cycle 4/100

**Date:** 2026-05-08
**Scope:** Full codebase review focused on correctness, maintainability, and edge cases
**Approach:** Static analysis of components, hooks, and i18n patterns

---

## Findings

### C1 — Timer leak in SubmissionListAutoRefresh causes post-unmount network requests
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/submission-list-auto-refresh.tsx:60-74`
- **Problem:** `scheduleNext()` creates a `setTimeout` whose callback awaits `tick()` then recursively calls `scheduleNext()`. If the component unmounts while `tick()` is awaiting the fetch, the cleanup function clears `timerRef.current` but the async callback continues. After `tick()` resolves, it calls `scheduleNext()` unconditionally, creating a new timer that fires indefinitely.
- **Failure scenario:** Admin navigates to Submissions page, then quickly navigates away. Background network requests to `/api/v1/time` continue indefinitely, wasting bandwidth and triggering unnecessary `router.refresh()` calls.
- **Fix:** Guard `scheduleNext()` against post-unmount execution:
  ```tsx
  function scheduleNext() {
    timerRef.current = setTimeout(async () => {
      await tick();
      if (timerRef.current !== null) {
        scheduleNext();
      }
    }, getBackoffInterval());
  }
  ```
- **Cross-agent agreement:** Also flagged by perf-reviewer as P1.

### C2 — Missing i18n key "discussions" in nav namespace
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/layout/breadcrumb.tsx:27`, `messages/en.json`, `messages/ko.json`
- **Problem:** The breadcrumb component maps URL segment `discussions` to `tNav("discussions")`, but this key does not exist in the `nav` namespace of either locale file. next-intl falls back to rendering the raw key path `nav.discussions`.
- **Failure scenario:** Any user visiting `/dashboard/admin/discussions` sees the literal text "nav.discussions" in the breadcrumb instead of a human-readable label.
- **Fix:** Add `"discussions": "Discussion Moderation"` to `messages/en.json` nav namespace and `"discussions": "토론 관리"` to `messages/ko.json` nav namespace.
- **Cross-agent agreement:** Also flagged by designer as D1.

### C3 — Missing i18n keys "workspace" and "home" in nav namespace
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/components/layout/breadcrumb.tsx:23-24`
- **Problem:** Segments `workspace` and `control` map to `tNav("workspace")` and `tNav("home")` respectively, but neither key exists in the nav namespace.
- **Failure scenario:** If future routes introduce `/dashboard/workspace` or `/dashboard/control`, their breadcrumbs will show raw i18n keys.
- **Fix:** Add the missing keys to both locale files, or remove the mappings if unused.

### C4 — Missing nav i18n keys for publicShell segments that appear in dashboard breadcrumbs
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/layout/breadcrumb.tsx`
- **Problem:** The breadcrumb maps `practice`, `playground`, `community`, and `assignments` to nav keys. While `assignments` maps to `"problemSets"` (which exists), the other three map to keys that exist in `publicShell.nav` but NOT in `nav`. If these segments ever appear under the dashboard layout's breadcrumb, they will show raw keys.
- **Note:** These segments may never appear in the dashboard layout breadcrumb in practice, since they belong to the public route group. This is a low-confidence finding.

---

## No Other Code Issues Found

All API routes use proper auth middleware. Form validation uses Zod schemas. Error handling is consistent. No TypeScript strict-mode violations observed. Event listeners have proper cleanup. The hash-tabs component correctly avoids SSR mismatch with rAF.
