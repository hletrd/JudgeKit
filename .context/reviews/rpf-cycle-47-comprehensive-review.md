# Comprehensive Code Review — RPF Cycle 47

**Date:** 2026-04-25
**Reviewer:** comprehensive-reviewer (fresh pass, multi-angle)
**Scope:** Full `src/` tree, with focus on cycle 46 fixes, recently modified files, and previously under-reviewed frontend chart components

## Files Reviewed

### Core Infrastructure (verified cycle 46 fixes)
- `src/lib/files/image-processing.ts` — Buffer size + pixel limit (cycle 46 AGG-2)
- `src/components/exam/anti-cheat-monitor.tsx` — Retry after partial flush (cycle 46 AGG-1)
- `src/lib/assignments/contest-scoring.ts` — Math.max spread replaced with reduce (cycle 46 AGG-3)
- `src/lib/docker/client.ts` — Head+tail buffer (cycle 45)
- `src/lib/judge/auto-review.ts` — Buffer.byteLength (cycle 45)
- `src/lib/security/in-memory-rate-limit.ts` — Single-pass eviction (cycle 45)
- `src/lib/api/handler.ts` — API handler factory
- `src/proxy.ts` — Middleware (auth, CSP, locale)
- `src/lib/auth/config.ts` — NextAuth config
- `src/lib/compiler/execute.ts` — Docker-sandboxed code execution
- `src/lib/realtime/realtime-coordination.ts` — Multi-instance SSE coordination
- `src/lib/recruiting/request-cache.ts` — Per-request ALS cache
- `src/lib/files/storage.ts` — File storage operations
- `src/app/api/v1/submissions/[id]/events/route.ts` — SSE events
- `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts` — Similarity check
- `src/app/api/v1/files/bulk-delete/route.ts` — Bulk file deletion
- `src/components/exam/countdown-timer.tsx` — Exam countdown timer
- `src/components/seo/json-ld.tsx` — JSON-LD structured data
- `src/components/contest/analytics-charts.tsx` — Contest analytics SVG charts
- `src/components/contest/score-timeline-chart.tsx` — Score timeline SVG chart
- `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx` — Student detail page

## Previously Fixed Items (confirmed in current code)

All prior cycle 46 fixes verified:
- AGG-1 (cycle 46): `anti-cheat-monitor.tsx` schedules retry after partial flush failure — lines 109-131 confirmed
- AGG-2 (cycle 46): `image-processing.ts` has `MAX_INPUT_BUFFER_BYTES` and `limitInputPixels` — lines 13-18, 35-39 confirmed
- AGG-3 (cycle 46): `contest-scoring.ts` uses `reduce` instead of `Math.max(...)` spread — lines 376-378 confirmed

## New Findings

### NEW-1: [MEDIUM] `analytics-charts.tsx` uses `Math.max(...array)` on unbounded data — can throw `RangeError` on very large datasets

**Confidence:** MEDIUM
**File:** `src/components/contest/analytics-charts.tsx:77, 308`
**Also:** `src/components/contest/score-timeline-chart.tsx:47`
**Also:** `src/app/(dashboard)/dashboard/contests/[assignmentId]/students/[userId]/page.tsx:114`

The same `Math.max(...array)` pattern that was fixed in `contest-scoring.ts` (cycle 46 AGG-3) still exists in 4 frontend locations. The `analytics-charts.tsx` uses it on `data.map((d) => d.value)` (line 77) and `data.flatMap((p) => [p.medianMinutes, p.meanMinutes])` (line 308). The `score-timeline-chart.tsx` uses it on `selected.points.map((point) => point.totalScore)` (line 47). The student page uses it on `problemSubs.map((s) => s.score ?? 0)` (line 114).

While these are client-side (not server-critical), a contest with an extremely large number of submissions or score distribution buckets could cause a `RangeError` that crashes the analytics page entirely, with no fallback.

**Concrete failure scenario:** A contest with 100,000+ submissions (or an analytics API response with 100,000+ histogram buckets due to a data bug) causes `Math.max(...data.map(...))` to throw `RangeError: Maximum call stack size exceeded`. The analytics page crashes with an unhandled error, showing the error fallback UI instead of the charts.

**Fix:** Replace `Math.max(...arr, fallback)` with `arr.reduce((max, v) => Math.max(max, v), fallback)` in all four locations, consistent with the fix applied to `contest-scoring.ts` in cycle 46.

---

### NEW-2: [LOW] `anti-cheat-monitor.tsx` inline retry callback duplicates flush logic instead of reusing `flushPendingEvents`

**Confidence:** MEDIUM
**File:** `src/components/exam/anti-cheat-monitor.tsx:117-131`

The cycle 46 fix added an inline retry callback inside `flushPendingEvents` (lines 117-131) that duplicates the flush logic (load, send, save) rather than calling `flushPendingEvents` again. The comment on line 121 explains this is to "avoid a circular dependency that triggers react-hooks/immutability", but the duplication means bug fixes to the flush logic must be applied in two places.

The inline retry callback also lacks the `retries` increment logic: on lines 126-127, it increments `ev.retries` when `sendEvent` fails, but this is a new event object created from `ev` (not from `loadPendingEvents`). If the retry also fails, the next retry will read from localStorage and increment again. This is functionally correct but the duplication is a maintenance risk.

**Concrete failure scenario:** A future change to the flush logic (e.g., adding a deduplication key to prevent double-sending) is applied to `flushPendingEvents` but the inline retry callback on line 122 is missed, causing inconsistent behavior between the initial flush and retries.

**Fix:** Extract the flush logic into a standalone function (not a hook) that both `flushPendingEvents` and the retry callback can call, or use a ref to the latest `flushPendingEvents` callback and call it from the retry timer.

---

### NEW-3: [LOW] `image-processing.ts` `MAX_INPUT_BUFFER_BYTES` is not configurable via environment variable

**Confidence:** LOW
**File:** `src/lib/files/image-processing.ts:13`

The `MAX_INPUT_BUFFER_BYTES` constant is hardcoded at 10MB. Other system limits (compiler time limit, SSE timeout, max SSE connections) are configurable via `getConfiguredSettings()` backed by the database. This means the image size limit cannot be adjusted without a code change and deployment.

This is not a bug, but it creates an operational inconsistency. If a deployment needs a larger limit (e.g., a photo-heavy course), it requires a code change. Other size-related limits in the system are configurable.

**Concrete failure scenario:** A deployment needs to accept 20MB images for a photography course. They must modify the source code and redeploy, while all other limits can be changed via the admin settings UI.

**Fix:** Consider making `MAX_INPUT_BUFFER_BYTES` configurable via the system settings (consistent with other limits), or at minimum via an environment variable. This is a LOW priority enhancement, not a bug.

---

### NEW-4: [LOW] `bulk-delete/route.ts` does not enforce a maximum number of file IDs in the request body

**Confidence:** LOW
**File:** `src/app/api/v1/files/bulk-delete/route.ts:22`

The `fileDeleteSchema` validates the structure of the request body, but there is no upper bound on the number of file IDs in `body.ids`. An admin could send a request with thousands of file IDs, which would generate a large `IN` clause in the SQL query and a sequential disk deletion loop.

While the capability check (`files.manage`) limits this to admin users, and the rate limit (`files:bulk_delete`) prevents rapid-fire requests, a single request with 50,000 file IDs could still cause a slow query and disk I/O spike.

**Concrete failure scenario:** An admin selects all files in the system and clicks "delete all". The request contains 10,000+ file IDs. The SQL `IN` clause is large, the sequential disk deletion loop takes several seconds, and the database connection is held for the duration of both the query and the disk operations.

**Fix:** Add a maximum array length to `fileDeleteSchema` (e.g., `z.array(z.string()).max(500)`). Return a 400 if the limit is exceeded. For larger deletions, the client should paginate.

---

## Sweep for Commonly Missed Issues

1. **Empty catch blocks in production API routes**: No empty `catch {}` blocks in route handlers — good.
2. **Unvalidated env vars**: `AUTH_CACHE_TTL_MS` uses `Number.isFinite` and `> 0` — good. `COMPILER_RUNNER_URL`/`RUNNER_AUTH_TOKEN` validated with production guard — good.
3. **SQL injection**: All SQL uses parameterized queries via `rawQueryAll`/`rawQueryOne` with named params or Drizzle ORM — good.
4. **Path traversal in file storage**: `resolveStoredPath` rejects `..`, `/`, `\` — good.
5. **HTML sanitization**: DOMPurify with restrictive allowlist — good.
6. **CSRF protection**: `createApiHandler` enforces CSRF for mutations — good.
7. **Auth token validation**: Token invalidation check uses DB server time — good.
8. **Docker image validation**: `isAllowedJudgeDockerImage` with trusted registries — good.
9. **Shell command injection**: `validateShellCommandStrict` with denylist — good.
10. **Race conditions in SSE**: Connection tracking uses Set+Map with proper cleanup — good.
11. **Memory limits in Docker**: `--memory`, `--pids-limit`, output truncation at 4MB — good.
12. **Image bomb protection**: `MAX_INPUT_BUFFER_BYTES` and `limitInputPixels` — good (cycle 46 fix confirmed).
13. **Anti-cheat retry resilience**: Flush retry with exponential backoff — good (cycle 46 fix confirmed).
14. **Math.max spread in scoring**: Replaced with `reduce` — good (cycle 46 fix confirmed).

---

## Summary

| ID | Severity | Confidence | File | Issue |
|----|----------|------------|------|-------|
| NEW-1 | MEDIUM | MEDIUM | analytics-charts.tsx, score-timeline-chart.tsx, students/[userId]/page.tsx | Math.max spread on unbounded data (same pattern as cycle 46 AGG-3) |
| NEW-2 | LOW | MEDIUM | anti-cheat-monitor.tsx:117-131 | Inline retry callback duplicates flush logic |
| NEW-3 | LOW | LOW | image-processing.ts:13 | MAX_INPUT_BUFFER_BYTES not configurable |
| NEW-4 | LOW | LOW | bulk-delete/route.ts:22 | No max array length on file IDs |

Total new findings: 4 (1 MEDIUM, 3 LOW)
