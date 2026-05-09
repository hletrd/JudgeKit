# Performance Review — Cycle 25

Reviewer: perf-reviewer
Date: 2026-05-09
Scope: React rendering, database queries, API efficiency, resource usage
Base commit: 75d82a17

## Summary

No critical performance issues identified. The codebase shows optimized patterns throughout. Two minor observations about unbounded concurrency.

---

## Findings

### PERF-25-1: Unbounded concurrency in `getStaleImages`

- **File**: `src/app/api/v1/admin/docker/images/route.ts:16-38`
- **Severity**: Low
- **Confidence**: High

**Description**: `Promise.all(images.map(...))` over all Docker images (100+) spawns concurrent `stat` + `inspectDockerImage` calls without limit. This can cause filesystem and Docker daemon contention.

**Fix**: Add `pLimit(5)` for the concurrent checks.

### PERF-25-2: `consumedRequestKeys` WeakMap overhead with minimal benefit

- **File**: `src/lib/security/api-rate-limit.ts:62-72`
- **Severity**: Low
- **Confidence**: Medium

**Description**: The WeakMap-based per-request deduplication adds complexity but rarely fires due to Next.js creating new request objects at middleware boundaries.

**Fix**: Remove or simplify — the per-endpoint deduplication within a single handler is the only case that works, and that's rare.

---

## Verified Optimized Patterns

- `Promise.all` used for parallel DB queries where applicable
- Proper memoization (`useMemo`, `useCallback`) throughout components
- Docker container spawning limited by `pLimit(Math.max(cpus().length - 1, 1))`
- File upload streams use buffer accumulation, not string concatenation
- Rate limiter sidecar uses circuit breaker with 500ms timeout
- Compiler runner fetch timeout scaled to time limit (max 120s)
- SSE polling uses shared timer to avoid N concurrent timers
- `skipHtml` on ReactMarkdown avoids HTML parsing overhead
- Image processing uses sharp with dimension limits

---

## Final Sweep

No N+1 query patterns, no missing React.memo on heavy components, no unnecessary re-renders found.
