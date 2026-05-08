# Performance Review — Cycle 8

## Findings

### C8-PERF-1: Public contest page: expensive uncached analytics on every request
- **File**: `src/app/(public)/contests/[id]/page.tsx` lines 449-455
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: For expired/closed contests, `computeContestAnalytics`, `computeLeaderboard`, and `computeContestReplay` run on every page load with zero caching. `computeContestReplay` iterates over all submissions in time order, `computeLeaderboard` aggregates scores across all participants, and `computeContestAnalytics` computes distributions. For large contests (1000+ participants, 10+ problems), these queries can take 500ms+. Since the data is immutable after contest close, there is no reason to recompute on every request.
- **Fix**: Cache results with a 5-minute TTL using React `cache()` + time-based invalidation, or store precomputed results in the DB.

### C8-PERF-2: `getApiUser` makes two sequential DB queries for cookie+API key auth
- **File**: `src/lib/api/auth.ts` lines 61-74
- **Severity**: MEDIUM | **Confidence**: High
- **Issue**: `getApiUser` first attempts JWT token extraction (which triggers a DB query via `getActiveAuthUserById`), and only if that fails, attempts API key auth (which also triggers a DB query). For API-key-only clients (e.g., CI/CD), every request makes an unnecessary JWT lookup + DB query before the API key check. The JWT token extraction itself is fast, but `getActiveAuthUserById` at line 69 queries the DB every time.
- **Fix**: Check the Authorization header first for API key prefix; only fall back to JWT if no Bearer token is present.

### C8-PERF-3: `recruiting-access.ts` loads all assignment IDs then all problem IDs sequentially
- **File**: `src/lib/recruiting/access.ts` lines 54-73
- **Severity**: LOW | **Confidence**: High
- **Issue**: `loadRecruitingAccessContext` first fetches assignment IDs, then fetches problem IDs in a separate query. For a candidate invited to multiple contests, these could be a single JOIN query.
- **Fix**: Combine into a single query with JOIN.

### C8-PERF-4: `isAnyKeyRateLimited` issues N separate SELECT FOR UPDATE queries
- **File**: `src/lib/security/rate-limit.ts` lines 162-171
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: Each key passed to `isAnyKeyRateLimited` triggers a separate SELECT FOR UPDATE via `getEntry()`. Under high auth load, this creates multiple DB round-trips per check. A single `WHERE key IN (...)` query would be more efficient.
- **Fix**: Replace with a single batched query.

### C8-PERF-5: Contest detail page makes 12+ parallel async calls for enrolled students
- **File**: `src/app/(public)/contests/[id]/page.tsx` lines 91-106, 130-166
- **Severity**: MEDIUM | **Confidence**: Medium
- **Issue**: The enrolled-student path of the contest detail page makes: `Promise.all` with 11 translations + settings + auth, then a separate `getRecruitingAccessContext`, `getDbNow`, `getStudentProblemStatuses`, a raw DB query for submissions, and `getResolvedSystemTimeZone`. While these are parallelized within each `Promise.all`, the sequential chain of 3 `Promise.all` blocks still takes 3 round-trip latencies. Some of these could be merged into a single parallel block.
- **Fix**: Merge the sequential `Promise.all` blocks into one where dependencies allow.

### C8-PERF-6: Submission creation acquires advisory lock even for non-exam submissions
- **File**: `src/app/api/v1/submissions/route.ts` lines 248-255
- **Severity**: LOW | **Confidence**: Medium
- **Issue**: `pg_advisory_xact_lock` is acquired on every submission creation, including practice submissions that don't need the serialization. The advisory lock is primarily needed for exam submissions to prevent deadline bypass via concurrent requests. For practice mode, the lock adds unnecessary serialization overhead.
- **Fix**: Only acquire the advisory lock when the assignment has exam mode enabled.
