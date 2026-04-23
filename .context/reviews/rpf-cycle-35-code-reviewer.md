# RPF Cycle 35 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 218a1a93

## CR-1: Import route Sunset header date is in the past [MEDIUM/HIGH]

**File:** `src/app/api/v1/admin/migrate/import/route.ts:183, 191`

**Description:** The `Sunset` header on the deprecated JSON body path reads `"Sat, 01 Nov 2025 00:00:00 GMT"`, which is over 5 months in the past. Per RFC 8594, a Sunset date in the past signals that the endpoint has already been retired, yet the route still accepts requests. Clients that honor the Sunset header will assume the endpoint is gone and may stop using it entirely, causing breakage if they have not migrated. Alternatively, it misleads developers who see the header into thinking the removal already happened.

**Concrete failure scenario:** An automated client that respects Sunset headers sees a past date, stops sending JSON body requests immediately without having implemented the multipart path, and all imports break.

**Fix:** Update the Sunset date to a future date (e.g., 6 months from now). Consider using a date like `"Sun, 01 Nov 2026 00:00:00 GMT"`.

**Confidence:** HIGH

---

## CR-2: Discussion components use `console.error` instead of structured logger [LOW/MEDIUM]

**Files:** `src/components/discussions/discussion-post-form.tsx:48,57`, `discussion-thread-form.tsx:54,64`, `discussion-post-delete-button.tsx:30,39`, `discussion-thread-moderation-controls.tsx:78,86,103,112`

**Description:** Six discussion component files use `console.error` for error reporting instead of the structured `logger` used elsewhere in the codebase. In production, `console.error` output goes to stderr without structured context (no request ID, no user context, no timestamp formatting), making these errors harder to search and correlate in log aggregation systems.

**Concrete failure scenario:** A user reports a discussion creation failure. The ops team searches the structured logs for `[discussions]` but finds nothing, because the error was logged via `console.error` and was not ingested by the structured logging pipeline.

**Fix:** Replace `console.error` with `logger.error` (imported from `@/lib/logger`) with structured context objects.

**Confidence:** MEDIUM

---

## CR-3: create-group-dialog uses `console.error` for unmapped errors [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/create-group-dialog.tsx:44`, `edit-group-dialog.tsx:67`, `assignment-form-dialog.tsx:206`, `error.tsx:20`

**Description:** Several dashboard group components use `console.error` instead of the structured logger, same pattern as CR-2.

**Fix:** Replace with `logger.error` with structured context.

**Confidence:** MEDIUM

---

## CR-4: Anti-cheat monitor heartbeat schedule is not cleaned up when privacy notice is dismissed [MEDIUM/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:152-173`

**Description:** The heartbeat scheduling effect depends on `[enabled, showPrivacyNotice]`. When the privacy notice is dismissed (`showPrivacyNotice` becomes `false`), the effect runs and starts the heartbeat timer. However, the `reportEventRef.current("heartbeat")` call at line 155 is a fire-and-forget `void` call that runs before the timer is scheduled. If the component re-renders rapidly (e.g., due to parent state changes), the effect cleanup may not run before the next effect fires, potentially causing duplicate heartbeat sends. More importantly, the initial `reportEventRef.current("heartbeat")` outside of the timer is not tracked for cleanup — if the component unmounts before this promise resolves, it could attempt to update state on an unmounted component.

**Concrete failure scenario:** Student clicks "Accept" on privacy notice, the initial heartbeat fires, then the component immediately unmounts (e.g., exam ends due to deadline). The pending `apiFetch` resolves and tries to call `reportEvent`, which may attempt to update refs/state on a cleaned-up component.

**Fix:** Use an `active` flag that is set to `false` in the cleanup function, and check it before updating any state. Alternatively, use an `AbortController` that is aborted on cleanup.

**Confidence:** MEDIUM

---

## CR-5: In-memory rate limiter eviction iterates Map during modification [LOW/LOW]

**File:** `src/lib/security/in-memory-rate-limit.ts:27-48`

**Description:** The `maybeEvict` function iterates over `store` entries using `for...of` while potentially deleting entries from the same map. In JavaScript, this is technically safe (the spec guarantees that entries deleted during iteration are not visited), but the second eviction pass (lines 41-47) creates a sorted array copy of the entire map, which could be expensive if the map is at the 10K cap. This is a pre-existing pattern noted as deferred in prior cycles.

**Confidence:** LOW

---

## CR-6: Problem import button lacks server-side file size validation consistency [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-28`

**Description:** The client-side import button checks `file.size > 10 * 1024 * 1024` (10 MB) before reading the file. However, the server-side import route at `/api/v1/problems/import` may use `MAX_IMPORT_BYTES` from `import-transfer.ts`, which could be a different limit. If the server limit is lower, a file passes client validation but fails server validation with a confusing error. If the server limit is higher, the client rejects valid files unnecessarily.

**Fix:** Either use the same constant for both client and server, or ensure the server returns a clear error message when the file exceeds its limit.

**Confidence:** MEDIUM
