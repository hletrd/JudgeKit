# Verifier

**Date:** 2026-04-19
**Base commit:** b91dac5b
**Angle:** Evidence-based correctness check against stated behavior

---

## F1: Tags API `limit` NaN — verified against code, bug confirmed

- **File**: `src/app/api/v1/tags/route.ts:17`
- **Severity**: MEDIUM
- **Confidence**: HIGH
- **Description**: Verified: `Math.min(Number(searchParams.get("limit") ?? "50"), 100)` produces `NaN` when `limit` param is non-numeric. The `?? "50"` only handles null/undefined, not non-numeric strings. `Number("abc")` is `NaN`, and `Math.min(NaN, 100)` is `NaN`. Drizzle ORM's `.limit(NaN)` is undefined behavior.
- **Fix**: Same as code-reviewer F1.

## F2: Proxy `x-forwarded-host` deletion is safe for current matcher — verified

- **File**: `src/proxy.ts:148, 301-319`
- **Severity**: INFO
- **Confidence**: HIGH
- **Description**: Verified that auth routes (`/api/auth/`) are NOT in the proxy matcher, so the `x-forwarded-host` deletion at line 148 does not affect auth callbacks. The proxy matcher includes `/api/v1/:path*` but not `/api/auth/:path*`. This is safe by construction but fragile (see security-reviewer F1).

## F3: SSE connection tracking eviction may cause per-user count undercount — verified

- **File**: `src/app/api/v1/submissions/[id]/events/route.ts:41-44`
- **Severity**: LOW
- **Confidence**: MEDIUM
- **Description**: Verified the eviction logic: when `connectionInfoMap.size >= MAX_TRACKED_CONNECTIONS`, the oldest entry is removed. The `removeConnection` function decrements `userConnectionCounts` and deletes from `activeConnectionSet`. If the evicted connection is still active (the SSE stream is still open), the per-user count is decremented incorrectly. This means `userConnectionCounts` can become inconsistent with actual active connections.
- **Fix**: Same as debugger F2.

## Previously Verified Safe (Prior Cycles)

- `ROUND` in `computeSingleUserLiveRank` IOI rank query — added in cycle 21 (commit 71b2c3c1)
- Anti-cheat `limit`/`offset` NaN — fixed in cycle 21
