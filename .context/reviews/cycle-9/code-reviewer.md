# Code Reviewer — Cycle 9

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76`
**Change surface:** 0 new commits since cycle 8; review focuses on carry-forward validation and final sweep.

---

## Finding C9-CR-1: SIGINT handler forces process exit, inconsistent with SIGTERM (LOW)

**File:** `src/lib/audit/node-shutdown.ts:49`
**Confidence:** High

The SIGINT handler calls `processLike.exit?.(130)` inside a `.finally()` block, which forces immediate process termination. This is inconsistent with the SIGTERM handler (fixed in cycle 8) which allows Node.js to exit naturally after the event loop drains. Forcing exit on SIGINT prevents other registered cleanup handlers from running, including any future modules that register `beforeExit` or `exit` listeners.

**Suggested fix:** Remove the `processLike.exit?.(130)` call from SIGINT, matching the SIGTERM pattern. If a specific exit code is needed, rely on the natural exit code (130 for SIGINT is the default).

---

## Finding C9-CR-2: countdown-timer leaks AbortController on visibility-change sync (LOW)

**File:** `src/components/exam/countdown-timer.tsx:186`
**Confidence:** High

`syncTime()` creates an AbortController and a timeout timer, then returns a cleanup function. In `handleVisibilityChange`, `syncTime()` is called but its return value (the cleanup function) is discarded. If the component unmounts while a visibility-change-initiated sync is in flight, neither the fetch nor the timeout timer is cleaned up.

**Suggested fix:** Store the cleanup function from `syncTime()` in a ref and call it before initiating a new sync, or in the component cleanup.

---

## Finding C9-CR-3: Malformed JSON success responses treated as success in auth forms (LOW)

**Files:**
- `src/app/(auth)/verify-email/page.tsx:38-50`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx:34-55`
- `src/app/(auth)/reset-password/reset-password-form.tsx:52-73`
**Confidence:** High

All three auth forms follow the same anti-pattern: they parse JSON with `.catch(() => ({ error: "unknown" }))` and then check `if (!res.ok)`. If the server returns a 200 OK status with a non-JSON body (e.g., due to a misconfigured proxy or middleware), the JSON parse fails and produces `{ error: "unknown" }`, but since `res.ok` is true, the code proceeds to the success path. This leads to false-positive success states.

**Suggested fix:** Check both `res.ok` AND successful JSON parsing before entering the success path. The `apiFetchJson` helper already implements this correctly.

---

## Finding C9-CR-4: create-problem-form image upload treats malformed JSON as success (LOW)

**File:** `src/app/(public)/problems/create/create-problem-form.tsx:343-356`
**Confidence:** High

Same pattern as C9-CR-3: `const uploadData = await res.json().catch(() => ({ data: {} }));` followed by `if (!res.ok)`. If the server returns 200 with invalid JSON, `uploadData` becomes `{ data: {} }`, `getApiData` returns `{}`, `originalName` and `url` are undefined, and the markdown becomes `![undefined](undefined)`.

**Suggested fix:** Check parse success alongside `res.ok`, or use `apiFetchJson`.

---

## Finding C9-CR-5: apiFetch timer leak in fallback path for old browsers (LOW)

**File:** `src/lib/api/client.ts:97-98`
**Confidence:** Medium

When `apiFetch` is called without an external signal, it uses `createTimeoutSignal(30_000)`. In the fallback path (`typeof AbortSignal.timeout !== "function"`), a `setTimeout` is created that cannot be cancelled if the fetch completes before the timeout fires. Modern browsers support `AbortSignal.timeout`, so this only affects very old browsers, but the leak is real.

**Suggested fix:** Always clean up the timeout signal, similar to how `withTimeout` signals are cleaned up in the branch above.

---

## Final Sweep

No additional logic bugs, missed edge cases, or invalid assumptions were found in the remaining codebase. All carry-forward deferred items from previous cycles were re-validated and remain correctly deferred with appropriate exit criteria.
