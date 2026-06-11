# Code Reviewer — Cycle 25

**Date:** 2026-04-24
**Scope:** Full repository review

---

## CR-1: [MEDIUM] `getAssignmentStatusRows` duplicates late-penalty scoring SQL instead of reusing `buildIoiLatePenaltyCaseExpr`

**Confidence:** HIGH
**Citations:** `src/lib/assignments/submissions.ts:568-578`

The `getAssignmentStatusRows` function in `submissions.ts` contains an inline CASE expression for IOI late-penalty scoring that duplicates the logic in `buildIoiLatePenaltyCaseExpr()` from `scoring.ts`. The inline version only handles the non-windowed branch (comparing `s.submitted_at > @deadline`) but misses the windowed-exam branch (comparing against `personal_deadline`). Meanwhile, the leaderboard query and stats endpoint both use `buildIoiLatePenaltyCaseExpr()` which correctly handles both branches.

**Concrete failure scenario:** An instructor views the assignment status page for a windowed exam with a late penalty. Students who submitted after their `personal_deadline` but before the global deadline see their scores penalized on the leaderboard (via `buildIoiLatePenaltyCaseExpr`) but see unpenalized scores on the status page (via the inline CASE). The instructor sees inconsistent data between the two views.

**Fix:** Replace the inline CASE expression in `getAssignmentStatusRows` with a call to `buildIoiLatePenaltyCaseExpr("s.score", "COALESCE(ap.points, 100)", "s.submitted_at", "es.personal_deadline")`, adding a LEFT JOIN to `exam_sessions` in the CTE.

---

## CR-2: [LOW] `rateLimitedResponse` falls back to `Date.now()` when `nowMs` is undefined

**Confidence:** MEDIUM
**Citations:** `src/lib/security/api-rate-limit.ts:125`

The `rateLimitedResponse` helper uses `(nowMs ?? Date.now()) + (windowMs ?? 60_000)` for the `X-RateLimit-Reset` header. When `nowMs` is undefined, it falls back to `Date.now()` (app-server time), but the actual rate-limit window was computed using `getDbNowMs()` (DB-server time). This means the `X-RateLimit-Reset` header can be off by the clock skew between the two servers.

**Concrete failure scenario:** App server clock is 5 seconds ahead of DB server. A client receives a 429 with `X-RateLimit-Reset` pointing 5 seconds into the future relative to when the window actually expires. The client waits 5 seconds longer than necessary before retrying.

**Fix:** Ensure `nowMs` is always passed to `rateLimitedResponse` from the caller (it already is in `consumeApiRateLimit` and `consumeUserApiRateLimit`), and remove the `Date.now()` fallback or guard it with a development-only check.

---

## CR-3: [LOW] `syncProblemTags` deletes then re-inserts all tags — not idempotent under concurrent edits

**Confidence:** LOW
**Citations:** `src/lib/problem-management.ts:174-184`

`syncProblemTags` deletes all existing `problemTags` rows for a problem, then re-inserts them. If two concurrent requests are editing the same problem's tags, the delete-insert sequence is not atomic (it runs in a transaction, but the caller `updateProblemWithTestCases` does use `execTransaction`). The concern is minor because the transaction provides row-level locking, but the delete-all-then-insert pattern is inherently fragile — any new tag rows added between the delete and insert by a different process would be lost.

**Fix:** This is a low-risk finding because `execTransaction` serializes access. No immediate fix required, but consider an upsert-based approach in a future refactor.

---

## Positive Observations

- `createApiHandler` correctly awaits `params` for Next.js 16 compatibility
- `namedToPositional` validates parameter names and prevents SQL injection
- `resolveStoredPath` properly prevents path traversal in file operations
- `escapeLikePattern` is used correctly with `ESCAPE '\\'` clauses
- All clock-skew-sensitive paths consistently use `getDbNowMs()` or `getDbNowUncached()`
- Password hashing uses Argon2id with OWASP-recommended parameters
- Dummy password hash prevents user-enumeration via timing
- No `eval()`, `new Function()`, or `Math.random()` in security contexts
- No `as any` type casts in server code
- DOMPurify sanitization is well-configured with narrow tag/attribute allowlists
- ZIP validation now uses metadata instead of decompressing (cycle 24 fix)
- Argon2 `needsRehash` is now properly implemented (cycle 24 fix)
