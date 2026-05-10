# Performance Reviewer — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## New Findings

### C29-PERF-1: Chat widget double DB query per request

- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:210-230`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** The chat handler queries the DB twice for plugin config (once redacted, once raw). Under load this doubles round-trips.
- **Fix:** Consider short-lived cache for decrypted keys or accept security tradeoff.

---

## Carry-Forward Findings

### C26-PERF-2: `safeJsonForScript` RegExp creation per render
- **File:** `src/components/seo/json-ld.tsx:17-18`
- **Status:** Still present.

### C26-PERF-3: `consumedRequestKeys` WeakMap overhead
- **File:** `src/lib/security/api-rate-limit.ts:62-72`
- **Status:** Still present.

---

## Verified Optimizations (no change)

- Docker stale image check: `pLimit(5)` concurrency cap
- Auto-review: `pLimit(2)` caps concurrent AI calls
- SSE: bounded at `MAX_TRACKED_CONNECTIONS = 1000`
- Docker build: head+tail buffering (32KB + ~2MB)
- Judge claim: `SKIP LOCKED` mitigates lock contention
