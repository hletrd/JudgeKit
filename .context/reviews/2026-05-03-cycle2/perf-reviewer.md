# Performance Review — Cycle 2 (2026-05-03)

**Reviewer:** perf-reviewer
**HEAD:** `689cf61d`

---

## C2-PERF-1 (MEDIUM, HIGH confidence) — JWT callback DB query on every authenticated request (carry-forward from F5)

**File:** `src/lib/auth/config.ts:394-407`

The `jwt()` callback runs `db.query.users.findFirst` on every API request that checks auth. Under load, this creates one DB query per authenticated request. The query is necessary for token invalidation checks but creates a hot-path dependency on DB latency.

This was identified as F5 in cycle 1 and deferred pending "auth-perf cycle with telemetry data showing DB query bottleneck." The finding is re-confirmed and the exit criterion remains unmet.

**Fix (repeated):** Cache the user record in the JWT for a short TTL (60s). Only re-query when `token.authenticatedAt` is older than the TTL, or when `tokenInvalidatedAt` has changed. The existing `tokenInvalidatedAt` check still provides revocation guarantees within the TTL window.

---

## C2-PERF-2 (LOW, MEDIUM confidence) — Submission creation does two DB round-trips before the transaction

**File:** `src/app/api/v1/submissions/route.ts:182-229`

The POST handler first fetches the problem and language config in parallel (two queries), then optionally calls `getRequiredAssignmentContextsForProblem` and `validateAssignmentSubmission` (more queries), and only then enters the transaction. Under high submission volume, these pre-transaction queries add latency.

**Fix:** Move the problem/language existence checks into the transaction. The slight increase in transaction duration is offset by eliminating 2 round-trips.

---

## C2-PERF-3 (LOW, MEDIUM confidence) — Recruiting results page does 3 sequential DB queries

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:47-171`

The page: (1) fetches the invitation, (2) fetches the assignment, (3) fetches assignment problems and submissions in parallel. Steps 1 and 2 could be parallelized since the assignment ID comes from the invitation, but the code currently awaits the invitation before querying the assignment.

**Fix:** After the invitation is fetched (step 1), the assignment query (step 2) and the parallel queries (step 3) could be restructured. However, step 3 depends on `assignment.id` from step 2, so only 1 and 2 can't be parallelized without restructuring. The real win is that steps 2 and 3 can be combined into a single DB call.

---

## C2-PERF-4 (LOW, LOW confidence) — `getApiUser` calls `getToken` + DB query on every API request

**File:** `src/lib/api/auth.ts:61-74`

Every API route that uses `createApiHandler` calls `getApiUser`, which calls `getToken` (decrypts JWT) then `getActiveAuthUserById` (DB query). This means every authenticated API request results in a JWT decryption + DB query. Under load, this doubles the auth overhead compared to a cached approach.

**Fix:** Long-term, consider an auth context cache per request (similar to `withRecruitingContextCache`) that caches the user lookup within a single request. Short-term, the JWT TTL caching from C2-PERF-1 would also address this.

---

## Final Sweep

Checked for: N+1 query patterns, missing indexes, large response payloads, memory leaks (audit buffer is bounded), connection pool exhaustion (Drizzle uses pg pool), and SSE resource leaks (timer unref is in place). The main performance bottleneck remains the per-request DB query in the JWT callback.
