# Performance Reviewer — Cycle 26

**Date:** 2026-05-09
**Cycle:** 26 of 100
**Base commit:** 5594a074
**Current HEAD:** 5594a074 (clean working tree)

---

## C26-PERF-1: `getStaleImages` concurrency limited (FIXED in cycle 25)

- **File:** `src/app/api/v1/admin/docker/images/route.ts:16-38`
- **Status:** Fixed in commit 183af138
- **Verification:** `pLimit(5)` now wraps the stale check mapping. Previously unbounded `Promise.all(images.map(...))` over 100+ Docker images is now capped.

---

## C26-PERF-2: `safeJsonForScript` RegExp creation per render (carry-forward C25-8)

- **File:** `src/components/seo/json-ld.tsx:17-18`
- **Severity:** Low
- **Confidence:** Low
- **Summary:** Two `new RegExp(...)` objects created on every render for U+2028/U+2029 replacement. Micro-optimization — component renders once per page.
- **Fix:** Move patterns to module scope.

---

## C26-PERF-3: `consumedRequestKeys` WeakMap overhead (carry-forward C25-7)

- **File:** `src/lib/security/api-rate-limit.ts:62-72`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** WeakMap deduplication adds complexity with minimal benefit due to Next.js request object lifecycle.
- **Fix:** Remove or simplify.

---

## C26-PERF-4: Auto-review concurrency limiter

- **File:** `src/lib/judge/auto-review.ts:13`
- **Status:** Verified — `pLimit(2)` caps concurrent AI API calls. `MAX_REVIEW_QUEUE_SIZE = 20` prevents unbounded accumulation.
- **Note:** The `AUTO_REVIEW_MAX_SOURCE_CODE_BYTES = 8192` cap prevents large context windows. Good.

---

## C26-PERF-5: Docker build log buffering

- **File:** `src/lib/docker/client.ts:235-288`
- **Status:** Verified — Head+tail buffering strategy (32KB head + ~2MB tail) prevents unbounded memory growth during long builds.

---

## C26-PERF-6: SSE connection tracking

- **File:** `src/app/api/v1/submissions/[id]/events/route.ts`
- **Status:** Verified — In-memory connection tracking with periodic cleanup. Two-phase eviction (stale entries + FIFO) keeps Map size bounded at `MAX_TRACKED_CONNECTIONS = 1000`.

---

## Final Sweep

No additional performance issues found. The codebase shows good practices: concurrency limits, bounded buffers, cached thresholds with TTL, and streaming exports.
