# Cycle 1 RPF Review Remediation Plan

> Date: 2026-05-13
> Source: `.context/reviews/_aggregate.md`

## Summary

This plan addresses 14 findings from the cycle 1 deep code review across security,
correctness, performance, test coverage, and documentation categories.

---

## Phase 1: Security Fixes (High Priority)

### SEC-3: Cache negative auth results in proxy
**File:** `src/proxy.ts`
**Severity:** Medium
**Description:** The authUserCache only caches positive results. Negative results
(invalid token, inactive user) trigger a DB query every time, creating a DoS vector.
**Action:** Add negative-result caching with a short TTL (1 second).
**Exit criterion:** Invalid tokens no longer trigger DB queries on every request.

### SEC-2: Fix rate limit deduplication
**File:** `src/lib/security/api-rate-limit.ts`
**Severity:** Medium
**Description:** WeakMap-based dedup using NextRequest object identity fails across
Next.js boundaries (middleware vs route handler create different request objects).
**Action:** Replace WeakMap dedup with a header-based correlation ID approach, or
remove the dedup entirely and document the limitation.
**Exit criterion:** Rate limit consumption is not double-counted.

### SEC-1: Fix namedToPositional regex for SQL string literals
**File:** `src/lib/db/queries.ts`
**Severity:** Medium
**Description:** The `@(\w+)` regex matches parameter patterns inside SQL string
literals (e.g., `'user@example.com'` extracts `example` as a parameter).
**Action:** Replace naive regex with one that skips quoted string literals, or use
a state-machine parser.
**Exit criterion:** Email addresses and other `@`-containing literals in SQL are
not incorrectly treated as parameters.

### SEC-5: Sanitize file.originalName before DB insert
**File:** `src/app/api/v1/files/route.ts`
**Severity:** Low
**Description:** Uploaded file names are inserted into DB without sanitization,
potentially allowing XSS payloads in downstream rendering.
**Action:** Strip control characters and limit length before insert, matching the
sanitization already done in the download route.
**Exit criterion:** File names with control characters are sanitized before DB insert.

---

## Phase 2: Correctness Fixes

### COR-2: Reject Infinity in coerceNullableNumber
**File:** `src/app/api/v1/judge/claim/route.ts`
**Severity:** Low
**Description:** The coerceNullableNumber schema accepts "Infinity" and scientific
notation via Number(s).
**Action:** Add Number.isFinite(n) check to the z.number().refine predicate.
**Exit criterion:** "Infinity" and "1e1000" are rejected by the schema.

### COR-3: Fix rate limit blockedUntil comparison
**File:** `src/lib/security/api-rate-limit.ts`
**Severity:** Low
**Description:** When windowMs=0, blockedUntil equals now, but the check uses `>`
so equal values pass through.
**Action:** Change `existing.blockedUntil > now` to `existing.blockedUntil >= now`.
**Exit criterion:** windowMs=0 correctly blocks requests at the limit.

### COR-4: Guard rawQueryOne against transaction misuse
**File:** `src/lib/db/queries.ts`
**Severity:** Medium
**Description:** rawQueryOne runs on the global pool and cannot participate in
Drizzle transactions. Future callers might misuse it.
**Action:** Add an AsyncLocalStorage context to detect transaction scope and warn/throw
if rawQueryOne is called inside a transaction callback.
**Exit criterion:** Calling rawQueryOne inside execTransaction logs a warning.

---

## Phase 3: Performance & Test Coverage

### PERF-1: Improve proxy auth cache eviction
**File:** `src/proxy.ts`
**Severity:** Low
**Description:** Lazy FIFO eviction allows brief overgrowth during token bursts.
**Action:** Tighten cleanup threshold or switch to an LRU with hard bounds.
**Deferred:** Low impact, can be addressed in a future cycle.
**Exit criterion:** Cache never exceeds max size + 10%.

### TEST-1: Add tests for namedToPositional
**File:** `tests/unit/db/queries.test.ts` (new)
**Severity:** Medium
**Action:** Create unit tests covering parameter extraction, string literal handling,
duplicate names, and missing parameters.
**Exit criterion:** Tests cover all edge cases for namedToPositional.

### TEST-2: Add tests for proxy auth cache
**File:** `tests/unit/proxy/auth-cache.test.ts` (new)
**Severity:** Medium
**Action:** Test caching of positive results, non-caching of negative results,
TTL expiration, and FIFO eviction.
**Exit criterion:** Auth cache behavior is fully tested.

### TEST-3: Add tests for rate limit deduplication
**File:** `tests/unit/security/api-rate-limit.test.ts` (new or existing)
**Severity:** Medium
**Action:** Document and test the deduplication behavior.
**Exit criterion:** Deduplication scope is clearly documented and tested.

### TEST-4: Add tests for Docker image validation
**File:** `tests/unit/judge/docker-image-validation.test.ts` (new or existing)
**Severity:** Low
**Action:** Add edge case tests for registry spoofing, empty registries, etc.
**Exit criterion:** Edge cases are covered by tests.

---

## Phase 4: Documentation Fixes

### DOC-1: Fix PostgreSQL version in AGENTS.md
**File:** `AGENTS.md`
**Severity:** Low
**Action:** Correct "PostgreSQL 18" to the actual runtime version.
**Exit criterion:** AGENTS.md reflects correct PostgreSQL version.

### DOC-2: Fix Docker image count in AGENTS.md
**File:** `AGENTS.md`
**Severity:** Low
**Action:** Align the claimed image count with the actual table contents.
**Exit criterion:** Image count claim matches the table.

---

## Deferred Items

### COR-1: Judge claim problem lookup outside transaction
**File:** `src/app/api/v1/judge/claim/route.ts`
**Severity:** Medium
**Reason for deferral:** The atomic claim CTE is already transaction-safe. Moving
the problem lookup inside the claim would require significant refactoring of the raw
SQL CTE to include the problem JOIN. The existing fallback (reset to pending) handles
the race safely. This is a correctness improvement, not a security issue.
**Exit criterion:** Revisit when refactoring the judge claim endpoint.

### PERF-2: getStaleImages sequential batching
**File:** `src/app/api/v1/admin/docker/images/route.ts`
**Severity:** Low
**Reason for deferral:** Low impact — admin-only endpoint, called infrequently.
The pLimit(5) provides reasonable concurrency.
**Exit criterion:** Revisit if admin page load times become problematic.

### SEC-4: Chat widget tool execution timeout
**File:** `src/lib/plugins/chat-widget/tools.ts`
**Severity:** Medium
**Reason for deferral:** The DB pool has its own connection timeout. Adding
application-level query timeouts requires careful handling to avoid leaving
connections in an unknown state. This needs dedicated testing before deployment.
**Exit criterion:** Revisit after adding connection-level query timeout support.

### SEC-6: verifyFileMagicBytes full-file text check
**File:** `src/lib/files/validation.ts`
**Severity:** Low
**Reason for deferral:** The 8KB check is a deliberate performance tradeoff.
Text files are not executed directly; they are stored and served with appropriate
Content-Type headers. Full-file scanning would be expensive for large uploads.
**Exit criterion:** Revisit if text files are processed by interpreters.

### ARCH-1: createApiHandler generic 500 error
**File:** `src/lib/api/handler.ts`
**Severity:** Low
**Reason for deferral:** The current behavior is intentional for security.
The error is logged server-side with full context. Adding error classification
is a nice-to-have observability improvement.
**Exit criterion:** Revisit when improving production observability.

### ARCH-2: Judge worker dual token system
**File:** `src/app/api/v1/judge/claim/route.ts`
**Severity:** Low
**Reason for deferral:** Both auth paths are well-documented and tested. Removing
the shared token would require updating all deployed workers.
**Exit criterion:** Revisit during a judge worker auth refactor.
