# Aggregate Review — Cycle 32

**Date:** 2026-04-25
**Reviewers:** comprehensive-reviewer
**Total findings:** 7 new (2 MEDIUM, 5 LOW) + 11 carried deferred re-validated + 6 verified fixed

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [MEDIUM] Ungated `console.error` calls in discussion client components (10 instances)

**Sources:** NEW-1 | **Confidence:** HIGH

The discussion components (`discussion-post-form.tsx`, `discussion-thread-form.tsx`, `discussion-post-delete-button.tsx`, `discussion-thread-moderation-controls.tsx`) have 10 `console.error()` calls that are NOT gated behind `process.env.NODE_ENV === "development"`. This is the same class of issue fixed in commit a8c41095 (cycle 29), which gated 7 ungated `console.error` calls. The discussion components were missed in that pass. Some of these calls leak raw API error strings via the `as { error?: string }` cast pattern (DEFER-28).

**Fix:** Gate all 10 `console.error` calls behind `process.env.NODE_ENV === "development"` checks.

---

### AGG-2: [MEDIUM] Ungated `console.error` calls in admin and group management client components (14 instances)

**Sources:** NEW-2 | **Confidence:** HIGH

Same class as AGG-1. These 14 `console.error`/`console.warn` calls in admin and group management client components are not gated behind dev-only checks. The `group-instructors-manager.tsx:74` call (`console.error(data)`) is especially concerning because it dumps the entire API error response object to the console. The `language-config-table.tsx` calls at lines 138, 164, 194 similarly dump `data.error` directly.

**Fix:** Gate all 14 `console.error`/`console.warn` calls behind `process.env.NODE_ENV === "development"` checks.

---

### AGG-3: [LOW] Throw-then-match anti-pattern in discussion components (2 instances)

**Sources:** NEW-3, NEW-4 | **Confidence:** LOW

`discussion-post-form.tsx:50` and `discussion-thread-form.tsx:56` use `throw new Error(errorLabel)` with i18n keys (not raw API errors). The throw-then-match is stylistically redundant but not a security concern since i18n keys are used. Lower priority than the same pattern fixed in cycles 30-31 which used raw API error strings.

**Fix:** Optional. Replace throws with inline error handling for consistency.

---

### AGG-4: [LOW] Throw-then-match anti-pattern in contest-clarifications.tsx (4 handlers)

**Sources:** NEW-5 | **Confidence:** LOW

Same class as AGG-3. Four handlers at lines 120, 146, 164, 178 use throw-then-match with i18n keys. Not a security concern.

**Fix:** Optional.

---

### AGG-5: [LOW] Throw-then-match anti-pattern in contest-announcements.tsx (3 handlers)

**Sources:** NEW-6 | **Confidence:** LOW

Same class as AGG-3. Three handlers at lines 97, 118, 141 use throw-then-match with i18n keys. Not a security concern.

**Fix:** Optional.

---

### AGG-6: [MEDIUM] `anti-cheat-monitor.tsx` captures user text snippets in copy/paste event details

**Sources:** NEW-7 | **Confidence:** MEDIUM

The `describeElement()` helper (line 206-209) captures up to 80 characters of element text content and includes it in anti-cheat event details sent to the server. This is intentional for anti-cheat monitoring but creates a data privacy/IP concern: problem content (potentially copyrighted) is stored in anti-cheat event logs. Should be documented in the privacy notice shown to students.

**Fix:** Consider removing text snippets from copy/paste event details (keep only element context), or documenting text capture in the privacy notice.

---

## Previously Fixed Findings (verified this cycle)

- AGG-1 (cycle 31): API keys auto-dismiss timer — FIXED (recursive setTimeout)
- AGG-2 (cycle 31): `start-exam-button.tsx` throw-then-match — FIXED (inline error handling)
- AGG-3 (cycle 31): `problem-set-form.tsx` throw-then-match — FIXED (mapApiError helper)
- AGG-4 (cycle 31): `contest-scoring.ts` timestamps — FALSE POSITIVE (already uses getDbNowMs)
- AGG-5 (cycle 31): `database-backup-restore.tsx` hoisted set — FIXED
- DEFER-26: Chat widget test-connection createApiHandler — FIXED
- DEFER-31: files/[id] explicit select — FIXED

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
