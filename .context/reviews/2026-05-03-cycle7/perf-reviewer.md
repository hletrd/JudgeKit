# Performance Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-PR-1: Submissions list page double-query on page-beyond-end (LOW, High confidence)

**File:** `src/app/(public)/submissions/page.tsx:219-249`

When a user requests a page beyond the last page (e.g., page=999), the code first queries at the requested offset (line 219-227), gets an empty result, then re-queries at offset 0 (line 238-247). This is the correct fallback behavior, but it means two DB queries in the worst case. The COUNT(*) OVER() window function already provides the total count from the first query — but only when the result set is non-empty.

This is a known trade-off documented at line 190-193 (C6-5). The optimization was to query at the requested offset first (common case: valid page = 1 query) rather than always querying offset 0 first. The worst case (page beyond end = 2 queries) is acceptable since it's triggered by user navigation, not automated scraping.

**Verdict:** Acceptable trade-off. No fix needed.

---

### C7-PR-2: Recruit results page runs parallel queries without timeouts (LOW, Low confidence)

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:167-198`

The `Promise.all` fetching assignment problems and candidate submissions (lines 167-198) has no timeout. If one query hangs (e.g., DB connection pool exhaustion), the entire page render blocks indefinitely. This is consistent with the rest of the codebase which also doesn't use query timeouts.

**Verdict:** Low risk for a candidate-facing page. A DB connection pool limit would be a more systemic fix. Defer.

---

### C7-PR-3: Rate limit DB transaction per request for recruit start page could be avoided (LOW, Low confidence)

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:66-71`

The rate limit check on the results page hits the DB (`checkServerActionRateLimit` uses `execTransaction`) on every page load. If C7-SR-1 is fixed and rate limiting is added to the start page too, both pages would incur a DB transaction per request before even checking the token.

For high-traffic recruiting events, this doubles the per-request DB cost. The sidecar fast-path (`rate-limiter-client.ts`) mitigates this when configured, but the DB path is always the authoritative fallback.

**Verdict:** Acceptable. The sidecar handles the fast path. The DB transaction is the authoritative fallback and is needed for cross-instance consistency.
