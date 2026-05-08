# Aggregate Review — Cycle 31

**Date:** 2026-04-24
**Reviewers:** comprehensive-reviewer
**Total findings:** 7 new (4 MEDIUM, 3 LOW) + 11 carried deferred re-validated + 2 fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] API key auto-dismiss timer uses `setInterval` — inconsistent with codebase convention

**Sources:** NEW-1 | **Confidence:** HIGH

The auto-dismiss useEffect in `api-keys-client.tsx:124` uses `setInterval(() => {...}, 1000)` for the countdown. The codebase has established recursive `setTimeout` as the standard for all client-side timers (countdown-timer.tsx, active-timed-assignment-sidebar-panel.tsx, useVisibilityPolling). This is the last remaining client-side timer using `setInterval`. When an admin switches tabs during the countdown, accumulated `setInterval` callbacks fire in rapid succession on tab return, causing burst state updates.

**Fix:** Replace with recursive `setTimeout` pattern using `cancelled` flag.

---

### AGG-2: [MEDIUM] `start-exam-button.tsx` throw-then-match anti-pattern with raw API error

**Sources:** NEW-2 | **Confidence:** HIGH

The component throws `new Error((payload as { error?: string }).error || "examSessionStartFailed")` and then matches `error.message === "assignmentClosed"` in the catch. This throw-then-match pattern is fragile and is the same class of issue fixed in `contest-join-client.tsx` (cycle 30). Additionally uses the unsafe `as { error?: string }` cast (AGG-9/DEFER-28 pattern).

**Fix:** Handle error inline without throwing. Map known API error codes directly to toast messages.

---

### AGG-3: [MEDIUM] `problem-set-form.tsx` uses throw-then-match anti-pattern in 4 handlers

**Sources:** NEW-4 | **Confidence:** HIGH

Four separate handlers (lines 130, 159, 181, 216) throw with raw API error strings, and the catch block on line 226-244 matches against `knownKeys`. The double `knownKeys.includes(msg)` check is confusing but correct. Uses the unsafe `as { error?: string }` cast (DEFER-28 pattern).

**Fix:** Handle errors inline without throwing. Use `parseApiError()` when available (DEFER-28).

---

### AGG-4: [MEDIUM] `contest-scoring.ts` uses `Date.now()` for cache write timestamps — inconsistent with analytics route

**Sources:** NEW-5 | **Confidence:** MEDIUM

The analytics route was fixed in cycle 30 to use `getDbNowMs()` for all cache timestamps. `contest-scoring.ts` still uses `Date.now()` for cache write timestamps (and the staleness check, which is documented as acceptable). The write timestamps should use authoritative DB time for consistency.

**Fix:** Use `getDbNowMs()` for cache write timestamps in `contest-scoring.ts`.

---

### AGG-5: [LOW] `database-backup-restore.tsx` creates `new Set()` on every handler invocation

**Sources:** NEW-3 | **Confidence:** LOW

The `knownErrors` set is created inside `handleDownload()` on every invocation. It is constant and should be hoisted to module scope.

**Fix:** Hoist to module-level constant.

---

### AGG-6: [LOW] `edit-group-dialog.tsx` throws with raw API error unnecessarily

**Sources:** NEW-6 | **Confidence:** LOW

Same throw-then-match pattern as AGG-2/AGG-3. The thrown error message is never displayed — the catch always shows `toast.error(t("updateError"))`.

**Fix:** Handle error inline without throwing.

---

### AGG-7: [LOW] `group-members-manager.tsx:222` throws with raw API error unnecessarily

**Sources:** NEW-7 | **Confidence:** LOW

Same throw-then-match pattern. The catch always shows `toast.error(t("memberRemoveFailed"))`.

**Fix:** Handle error inline without throwing.

---

## Previously Fixed Findings (verified this cycle)

- DEFER-26/AGG-7: Chat widget test-connection route — FIXED (uses `createApiHandler` with auth)
- DEFER-31/AGG-13: `files/[id]` GET route exposes `storedName` — FIXED (explicit `.select()`)
- All cycle 30 implementation fixes verified correct

## Carried Deferred Items (unchanged)

- DEFER-22 (AGG-2): `.json()` before `response.ok` — 60+ instances
- DEFER-23 (AGG-3): Raw API error strings without translation — partially fixed
- DEFER-24 (AGG-4): `migrate/import` unsafe casts — Zod validation not yet built
- DEFER-25 (AGG-5): `LectureModeContext` value instability
- DEFER-27 (AGG-8): Missing AbortController on polling fetches
- DEFER-28 (AGG-9): `as { error?: string }` pattern — 22+ instances
- DEFER-29 (AGG-10): Admin routes bypass `createApiHandler`
- DEFER-30 (AGG-12): Recruiting validate token brute-force
- DEFER-32 (AGG-14): Admin settings exposes DB host/port
- DEFER-33 (AGG-15): Missing error boundaries
- DEFER-34 (AGG-17): Hardcoded English fallback strings
- DEFER-35 (AGG-18): Hardcoded English strings in editor title attributes
- DEFER-36 (AGG-19): `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention

## No Agent Failures

The comprehensive review completed successfully.
