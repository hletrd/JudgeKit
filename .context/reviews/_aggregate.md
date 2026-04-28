# Aggregate Review — Cycle 1 (New Session)

**Date:** 2026-04-28
**Reviewers:** code-reviewer, security-reviewer, perf-reviewer, test-engineer, architect, debugger, verifier, critic, tracer, designer, document-specialist (11 lanes)
**Total findings:** 2 HIGH, 5 MEDIUM, 8 LOW (deduplicated)

---

## Cross-Agent Convergence Map

| Topic | Agents flagging | Severity peak |
|-------|-----------------|---------------|
| `totalPoints` reduce initial value is 100 instead of 0 | CR-1, DBG-1, VER-1, CRIT-1, TRC-1, ARCH-3 | HIGH (5-agent convergence — confirmed bug) |
| `StartExamButton` passes `durationMinutes={0}` on problem detail page | CR-2, DBG-2, VER-2, CRIT-2, TRC-2, ARCH-3 | MEDIUM (5-agent convergence — confirmed bug) |
| Redundant queries in enrolled contest detail flow | PERF-1, ARCH-1, TRC-3 | MEDIUM (3-agent convergence) |
| DB import error messages leak PostgreSQL internals | SEC-1 | MEDIUM |
| `error.message` control-flow discrimination | CR-3, SEC-2 | MEDIUM (2-agent convergence) |
| Import route unsafe cast | CR-4 | MEDIUM |
| No tests for new public pages | TE-1, TE-2, CRIT-4 | MEDIUM (3-agent convergence) |
| Contest layout workaround depends on `#main-content` | CR-5, DBG-4 | LOW |
| Redundant getExamSession fallback | DBG-3, CRIT-3 | LOW |
| Deprecated JSON import path still fully functional | SEC-3 | LOW |
| Problem detail page query batching | PERF-3 | LOW |
| `resolveCapabilities` called twice | PERF-4 | LOW |
| Badge colors not dark-mode adaptive | DES-1 | LOW |
| Virtual Practice section context confusion | DES-2 | LOW |
| Layout comment missing upstream issue link | DOC-1 | LOW |
| assignmentContext type missing examDurationMinutes comment | DOC-2 | LOW |

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] `totalPoints` reduce initial value is 100 instead of 0 — student-facing data integrity bug

**Sources:** CR-1, DBG-1, VER-1, CRIT-1, TRC-1 | **Confidence:** HIGH (5-agent convergence)

`src/app/(public)/contests/[id]/page.tsx:187` — The `reduce` call uses `100` as the initial value instead of `0`, inflating the displayed total points by 100. The value is passed to `AssignmentOverview` and displayed to students.

**Fix:** Change initial value from `100` to `0`.

---

### AGG-2: [MEDIUM] `StartExamButton` on problem detail page passes `durationMinutes={0}` — breaks windowed exams

**Sources:** CR-2, DBG-2, VER-2, CRIT-2, TRC-2, ARCH-3 | **Confidence:** HIGH (6-agent convergence)

`src/app/(public)/practice/problems/[id]/page.tsx:478` — The `assignmentContext` type and DB query do not include `examDurationMinutes`, so the StartExamButton always receives 0. This could cause immediate exam session expiration.

**Fix:** Add `examDurationMinutes` to the DB query columns (line 177-186), the `assignmentContext` type (lines 152-162), and pass it to `StartExamButton`.

---

### AGG-3: [MEDIUM] Redundant DB queries in enrolled contest detail flow

**Sources:** PERF-1, ARCH-1, TRC-3 | **Confidence:** MEDIUM (3-agent convergence)

`src/app/(public)/contests/[id]/page.tsx:123-176` — `getUserContestAccess` and `getEnrolledContestDetail` are called sequentially, resulting in 2-3 redundant DB roundtrips (same assignment row queried twice, enrollment checked twice, capabilities resolved twice, exam session queried twice).

**Fix:** Merge the two functions into a single `getContestDetailForUser()` that returns both access level and detail.

---

### AGG-4: [MEDIUM] DB import error messages leak PostgreSQL internals to API responses

**Sources:** SEC-1 | **Confidence:** HIGH

`src/lib/db/import.ts:134,198,214` — When table truncation or batch insert fails, `err.message` (including PostgreSQL constraint/table names) propagates through `importDatabase` result to the API response.

**Fix:** Sanitize error messages before including in `result.errors`. Use generic messages for API responses; log detailed errors server-side only.

---

### AGG-5: [MEDIUM] `error.message` used as control-flow discriminator across 15+ API routes

**Sources:** CR-3, SEC-2 | **Confidence:** HIGH (carried from previous cycles)

Multiple API route handlers use `error.message === "someString"` or `switch (error.message)` to discriminate error types. This anti-pattern is fragile and can leak internal application structure.

**Fix:** Introduce custom error classes with error codes. Plan incrementally.

---

### AGG-6: [MEDIUM] Import route JSON path still uses unsafe `as JudgeKitExport` cast

**Sources:** CR-4 | **Confidence:** HIGH (carried from previous cycles)

`src/app/api/v1/admin/migrate/import/route.ts:164-166` — The Zod schema defines `data: z.unknown().optional()`, then the data is cast with `as JudgeKitExport` or `as unknown as JudgeKitExport`.

**Fix:** Create a proper Zod schema for `JudgeKitExport` and use it as the `data` field type.

---

### AGG-7: [MEDIUM] No tests for new public contest detail enrolled view or assignment context

**Sources:** TE-1, TE-2, CRIT-4 | **Confidence:** HIGH (3-agent convergence)

The enrolled contest detail view and the assignment context on the problem detail page have zero test coverage. The `totalPoints` and `examDurationMinutes` bugs would not be caught by any existing test.

**Fix:** Add component/integration tests for both views.

---

### AGG-8: [LOW] Contest layout workaround depends on `#main-content` element

**Sources:** CR-5, DBG-4 | **Confidence:** LOW

`src/app/(public)/contests/[id]/layout.tsx:36-37` — If `#main-content` does not exist, the click handler is never attached and hard-navigation silently fails.

**Fix:** Add development-only warning if `#main-content` is not found.

---

### AGG-9: [LOW] Redundant `getExamSession` fallback call in contest detail page

**Sources:** DBG-3, CRIT-3 | **Confidence:** LOW

`src/app/(public)/contests/[id]/page.tsx:173-176` — `getEnrolledContestDetail` already queries exam sessions, making the fallback `getExamSession` call redundant.

**Fix:** Remove the redundant fallback call.

---

### AGG-10: [LOW] Deprecated JSON import path still fully functional

**Sources:** SEC-3 | **Confidence:** LOW

`src/app/api/v1/admin/migrate/import/route.ts:120-199` — The JSON body import path is deprecated but has the same rate limit as the multipart path.

**Fix:** Add stricter rate limit for the deprecated path, or disable after sunset date.

---

### AGG-11: [LOW] Problem detail page query batching could be optimized

**Sources:** PERF-3 | **Confidence:** LOW

`src/app/(public)/practice/problems/[id]/page.tsx:125-143` — Translation/locale queries block the problem query but are independent.

**Fix:** Parallelize with `Promise.all`.

---

### AGG-12: [LOW] `resolveCapabilities` called twice in sequence

**Sources:** PERF-4 | **Confidence:** LOW

`src/lib/assignments/public-contests.ts:209,277` — Both `getUserContestAccess` and `getEnrolledContestDetail` call `resolveCapabilities(role)`. The function has a cache, but the redundant call adds overhead.

**Fix:** Pass the capabilities set between functions or merge the functions.

---

### AGG-13: [LOW] Badge colors not dark-mode adaptive

**Sources:** DES-1 | **Confidence:** MEDIUM

`src/app/(public)/contests/[id]/page.tsx:236-237` — Hardcoded `bg-blue-500`/`bg-purple-500` classes do not adapt to dark mode.

**Fix:** Use the Badge component's variant system or `dark:` prefixed classes.

---

### AGG-14: [LOW] Virtual Practice section links lose contest context

**Sources:** DES-2 | **Confidence:** LOW

`src/app/(public)/contests/[id]/page.tsx:660-677` — Links to `/practice/problems/[id]` without `assignmentId` parameter.

**Fix:** Add `assignmentId` parameter or add a note about context change.

---

### AGG-15: [LOW] Layout comment missing upstream Next.js issue link

**Sources:** DOC-1 | **Confidence:** LOW

`src/app/(public)/contests/[id]/layout.tsx:7-9` — No link to upstream issue for the RSC streaming bug.

**Fix:** Add issue link if filed, or note that it needs to be reported.

---

## Previously Resolved Items (confirmed in this review)

- AGG-4 (previous cycles): Anti-cheat `describeElement` text capture — RESOLVED (verified by VER-3)
- AGG-5 (previous cycles): CountdownTimer server time sync — RESOLVED (verified by VER-4)
- AGG-6 (previous cycles): SSE connection tracking O(n) eviction — RESOLVED (verified by VER-6)

---

## Carried Deferred Items (unchanged from previous cycles)

- DEFER-22: `.json()` before `response.ok` — 60+ instances
- DEFER-23: Raw API error strings without translation — partially fixed
- DEFER-24: `migrate/import` unsafe casts — partially addressed by AGG-6
- DEFER-27: Missing AbortController on polling fetches
- DEFER-28: `as { error?: string }` pattern — 22+ instances
- DEFER-29: Admin routes bypass `createApiHandler`
- DEFER-30: Recruiting validate token brute-force
- DEFER-32: Admin settings exposes DB host/port
- DEFER-33: Missing error boundaries
- DEFER-34: Hardcoded English fallback strings
- DEFER-35: Hardcoded English strings in editor title attributes
- DEFER-36: `formData.get()` cast assertions
- DEFER-43: Docker client leaks `err.message` in build responses
- DEFER-44: No documentation for timer pattern convention

---

## No Agent Failures

All 11 reviewer lanes completed successfully. No retries needed.

---

## Plannable Tasks for This Cycle

1. **AGG-1** (HIGH, 5-agent convergence) — Fix `totalPoints` reduce initial value from 100 to 0
2. **AGG-2** (MEDIUM, 6-agent convergence) — Add `examDurationMinutes` to assignmentContext type and DB query
3. **AGG-9** (LOW) — Remove redundant `getExamSession` fallback call
4. **AGG-13** (LOW) — Fix badge colors for dark mode
5. **AGG-15** (LOW) — Add upstream issue link to layout comment
6. **AGG-7** (MEDIUM) — Add tests for new public pages (test coverage gap)
