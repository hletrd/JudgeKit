# Cycle 50 — Code Reviewer

**Date:** 2026-05-13
**HEAD reviewed:** `898684e6`
**Prior aggregate:** `_aggregate-cycle-49.md` (HEAD `17a35892`)

## Scope
Reviewed all source files changed since cycle 49 (~25 commits, ~50 source files). Focused on logic correctness, type safety, error handling, and code consistency.

---

## NEW Findings

### C50-CR-1: Cursor pagination skips same-timestamp submissions
- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/(public)/submissions/page.tsx`
- **Lines:** 60-79 (cursor filter), 112-115 (cursor encoding)
- **Problem:** The cursor-based pagination filter uses only `submittedAt` as the tie-breaker:
  ```typescript
  cursorFilter = lt(submissions.submittedAt, cursorSubmittedAt);
  ```
  The cursor encodes both `id` and `t` (submittedAt), but the filter only uses `t`. If two submissions share the exact same `submittedAt` millisecond, the second one is excluded from the next page because `submittedAt < cursorSubmittedAt` is false for the matching timestamp.
- **Failure scenario:** Two rapid submissions in the same millisecond. The first appears on page N; the second is silently skipped on page N+1.
- **Fix:** Include `id` in the filter: `and(lt(submissions.submittedAt, cursorSubmittedAt), ne(submissions.id, cursorId))` or switch to tuple comparison if the dialect supports it.

### C50-CR-2: Manual JSON parse with silent swallow
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/auth/verify-email/route.ts:11`, `src/app/api/v1/auth/reset-password/route.ts:13`
- **Problem:** Both routes use `req.json().catch(() => ({}))` which silently swallows JSON parse errors. An empty object then passes to Zod, which fails with a generic "invalidRequest" instead of the more accurate "invalidJson" that `createApiHandler` returns.
- **Failure scenario:** A client sends malformed JSON (trailing comma, unclosed brace). The server returns 400 with "invalidRequest" instead of "invalidJson", confusing API consumers.
- **Fix:** Mirror the `createApiHandler` pattern: try/catch JSON parsing and return explicit "invalidJson" on SyntaxError. Or migrate these routes to `createApiHandler`.

### C50-CR-3: Inconsistent handler patterns (verify-email, reset-password)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/auth/verify-email/route.ts`, `src/app/api/v1/auth/reset-password/route.ts`
- **Problem:** These routes do not use `createApiHandler`, unlike the rest of the API surface. They manually handle auth (none required), rate limiting, body parsing, and CSRF. This creates inconsistency and means they miss automatic `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` headers.
- **Fix:** Migrate to `createApiHandler` with `auth: false` and appropriate rate limit keys.

### C50-CR-4: Missing `.limit()` on anti-cheat aggregation query
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/assignments/participant-timeline.ts:177-184`
- **Problem:** The `antiCheatEvents` aggregation query (GROUP BY eventType) has no LIMIT. While the number of distinct event types is small (bounded by the enum), adding LIMIT is defensive.
- **Note:** Already fixed for submissions (5000) and snapshots (1000). Anti-cheat query should follow suit.

---

## Verified Fixes (from prior cycles)
- C49-1 (orphaned queued submission): Fixed at `898684e6` — claim-failure reset wrapped in transaction with claim-token verification.
- C49-3 (formatDuration hours): Fixed — `formatDuration` now handles hours correctly.
- C49-4/C49-5 (hardcoded English): Partially fixed — translation keys added for timeline strings.
- C49-6 (snapshot Link href="#"): Fixed — snapshots are now plain divs without Link.
- C49-7 (mixed Date/number types): Fixed — explicit normalization in `participant-timeline-view.tsx`.
- C49-9 (submissions LIMIT): Fixed — `.limit(5000)` added.

## Carry-forward
- C49-8 (mini timeline React key collision): Still present at line 335. Not addressed in any commit since cycle 49.
- C49-2 (CSS-only tooltips): Still present. No keyboard/touch accessibility for timeline tooltips.

---

## Methodology
1. Read all changed source files since cycle 49 HEAD.
2. Verified cycle 48/49 fixes are intact.
3. Targeted grep sweeps: `eval()`, `dangerouslySetInnerHTML`, `@ts-ignore`, empty catches, `Math.random()`, `console.*`, raw SQL patterns, `Promise.all`, Korean `tracking-*`.
4. No `eval()` or `dangerouslySetInnerHTML` found in source (only in CSP config and Gleam judge command string).
5. All `@ts-ignore` instances removed (clean).
6. No security-critical findings.
