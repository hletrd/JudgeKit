# Code Quality Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** code-reviewer
**Base commit:** d32f2517

## CR-1: `recruiter-candidates-panel.tsx` fetches full export endpoint just for display — mismatched API usage [MEDIUM/HIGH]

**File:** `src/components/contest/recruiter-candidates-panel.tsx:50-53`
**Confidence:** HIGH

The component fetches `/api/v1/contests/${assignmentId}/export?format=json` to display a candidate table. The export endpoint is designed for data export (CSV/JSON download), not for in-memory display. This means:
1. The full dataset is loaded into the browser even when paginated display would suffice.
2. If the export endpoint returns additional fields or changes shape for export purposes, the display component breaks.
3. No server-side pagination or filtering — all candidates loaded client-side.

**Concrete failure:** A contest with 5000 candidates loads all 5000 records into browser memory, then does client-side search and sort.

**Fix:** Create a dedicated `/api/v1/contests/${assignmentId}/candidates` endpoint with server-side pagination, search, and sorting. Previously identified as DEFER-29 but re-flagged because the current implementation directly impacts performance at scale.

---

## CR-2: `api-keys-client.tsx` uses raw `apiFetch` for GET/POST instead of `apiFetchJson` — inconsistent pattern [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx:137-155, 176-191`
**Confidence:** MEDIUM

The `fetchKeys` function uses raw `apiFetch` + manual `res.json().catch()`, while most other GET patterns have been migrated to `apiFetchJson`. The `handleCreate` function also uses raw `apiFetch` + `res.json().catch()` for the POST response. These should use `apiFetchJson` for consistency with the rest of the codebase.

**Fix:** Migrate `fetchKeys` and `handleCreate` to use `apiFetchJson`.

---

## CR-3: `code-timeline-panel.tsx` mini-timeline buttons lack accessible labels [LOW/MEDIUM]

**File:** `src/components/contest/code-timeline-panel.tsx:170-179`
**Confidence:** HIGH

The snapshot mini-timeline uses `<button>` elements with only `title` attributes for accessibility. Screen readers do not reliably announce `title` attributes. Each dot should have an `aria-label` describing which snapshot it represents (e.g., "Snapshot 3 of 10").

**Fix:** Add `aria-label` to each timeline dot button.

---

## CR-4: `participant-anti-cheat-timeline.tsx` `formatDetailsJson` has hardcoded English strings [MEDIUM/MEDIUM]

**File:** `src/components/contest/participant-anti-cheat-timeline.tsx:51-57`
**Confidence:** HIGH

The `formatDetailsJson` function returns English strings like `"Target: Code editor"`. Since this is a display function, it should use i18n keys. The component already uses `useTranslations` but the helper function doesn't have access to the `t` function.

**Concrete failure:** A Korean user sees "Target: Code editor" instead of the localized string.

**Fix:** Pass `t` function to `formatDetailsJson` or convert to a component method.

---

## CR-5: `contest-announcements.tsx` and `contest-clarifications.tsx` throw Error with raw string instead of using structured approach [LOW/LOW]

**Files:**
- `src/components/contest/contest-announcements.tsx:97-98`
- `src/components/contest/contest-clarifications.tsx:120-121`

**Confidence:** HIGH

Both components throw `new Error("contestAnnouncementSaveFailed")` and similar. While these errors are caught and the i18n toast is shown, the error message string is never used — only the catch block's toast.error matters. The thrown error is unnecessary ceremony; an early return would be cleaner.

---

## Verified Safe

- All `res.json()` calls have `.catch()` guards
- `apiFetchJson` is consistently used for GET polling patterns
- All `dangerouslySetInnerHTML` uses are properly sanitized
- No `innerHTML` assignments in the codebase
- `copyToClipboard` utility properly handles execCommand fallback with return value check
- All icon-only buttons have proper `aria-label` attributes
- No `as any` or `@ts-ignore` found
- Korean letter-spacing is properly conditional throughout
