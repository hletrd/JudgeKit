# RPF Cycle 17 — Test Engineer Report

**Date:** 2026-04-20
**Reviewer:** test-engineer
**Base commit:** HEAD (2af713d3)

---

## TE-1: No test coverage for client-side datetime formatting consistency [LOW/MEDIUM]

**Files:** Multiple client components using `toLocaleString`/`toLocaleDateString` without timezone
**Description:** There are no tests verifying that client-side datetime formatting uses the system-configured timezone. The server-side `formatDateTimeInTimeZone` is well-tested, but the 7+ client components that bypass it have no coverage for timezone consistency.

**Fix:** Add a test that imports each client component's datetime formatting logic and verifies it uses `formatDateTimeInTimeZone` with the system timezone, not raw `toLocaleString`.
**Confidence:** MEDIUM

---

## TE-2: No test for workers page `formatRelativeTime` locale awareness [LOW/LOW]

**Files:** `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:85-95`
**Description:** The `formatRelativeTime` function is untested and uses hardcoded English strings. No test verifies that it should be locale-aware.

**Fix:** Add a test verifying that the workers page uses `formatRelativeTimeFromNow` from `@/lib/datetime` instead of hardcoded English strings.
**Confidence:** LOW

---

## TE-3: No test for access-code-manager `confirm()` dialog usage [LOW/LOW]

**Files:** `src/components/contest/access-code-manager.tsx:88`
**Description:** The `handleRevoke` function uses the browser's native `confirm()` dialog. No test verifies this behavior or covers the alternative path (user cancels). Other destructive actions in the app use `AlertDialog` components which are testable via React Testing Library.

**Fix:** When the `confirm()` is replaced with `AlertDialog` (per SEC-2), add test coverage for the confirmation flow.
**Confidence:** LOW
