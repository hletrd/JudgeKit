# Cycle 1 — Aggregate Review Findings

> Generated: 2026-05-13
> Reviewer: single-pass comprehensive review (no registered subagents available)
> Files examined: 599 source files, 436 test files, 3 Rust crates

---

## Table of Contents

1. [Security](#security)
2. [Correctness](#correctness)
3. [Performance](#performance)
4. [Test Coverage](#test-coverage)
5. [Architecture / Design](#architecture--design)
6. [Documentation / Code Mismatch](#documentation--code-mismatch)
7. [Deferred Findings Summary](#deferred-findings-summary)

---

## Security

### SEC-1: `namedToPositional` regex matches inside SQL string literals
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/db/queries.ts:105`  

The `@(\\w+)` regex used for named parameter substitution is naive: it will match `@name` patterns anywhere in the SQL string, including inside string literals. Example: `WHERE email = 'user@example.com'` would incorrectly extract `example` as a parameter name.

**Failure scenario:** A SQL query that contains an email address in a literal would fail with "Missing SQL parameter: example" or, worse, if a parameter named `example` happened to exist, it would be silently substituted into the string literal.

**Fix:** Use a smarter regex that avoids matches inside single/double-quoted strings, or require callers to use a SQL-aware parameter syntax.

**Citations:**
- `src/lib/db/queries.ts:105-106` — `@(\\w+)` regex
- `src/lib/db/queries.ts:97-122` — `namedToPositional` implementation

---

### SEC-2: `consumeApiRateLimit` WeakMap deduplication is unreliable across Next.js boundaries
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/security/api-rate-limit.ts:62-72`

The `consumedRequestKeys` WeakMap uses `NextRequest` object identity for deduplication. Next.js creates new request objects at middleware/route handler boundaries, so the same logical HTTP request will have different `NextRequest` instances in middleware vs. route handler. This means rate limit consumption is NOT deduplicated across these boundaries, and a single request could be double-counted if both middleware and route handler call the rate limiter.

**Failure scenario:** If a middleware and a route handler both call `consumeApiRateLimit` with the same key, the request counts twice against the limit.

**Fix:** Use a request-id header or correlation ID for deduplication instead of object identity.

**Citations:**
- `src/lib/security/api-rate-limit.ts:62` — `consumedRequestKeys` WeakMap declaration
- `src/lib/security/api-rate-limit.ts:64-72` — `rememberRequestKey` / `hasConsumedRequestKey`

---

### SEC-3: Proxy auth cache does not cache negative results — DoS vector
**Severity:** Medium  
**Confidence:** High  
**File:** `src/proxy.ts:66-99`

The `authUserCache` in `proxy.ts` only caches positive auth results (active users with valid tokens). Negative results (user not found, inactive, token invalidated) are NOT cached. An attacker can send requests with random/invalid tokens, and each one triggers a DB query via `getActiveAuthUserById`.

**Failure scenario:** A simple scripted attack with thousands of random session cookies would generate thousands of DB queries, potentially exhausting the connection pool or degrading performance.

**Fix:** Cache negative results with a short TTL (e.g., 1-2 seconds), or add a Bloom filter / fast-reject for obviously invalid token formats.

**Citations:**
- `src/proxy.ts:66-75` — `getCachedAuthUser` only returns cached entries
- `src/proxy.ts:296-299` — negative results are not cached

---

### SEC-4: Chat widget tool execution has no query timeout
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/plugins/chat-widget/tools.ts`

The `executeTool` function (and its underlying DB queries) has no query timeout. A slow query in the tool execution path could block the entire agent loop, consuming one of the `MAX_TOOL_ITERATIONS` slots with a hanging query.

**Failure scenario:** If the submissions table is locked or under heavy load, a `get_submission_history` tool call could hang indefinitely, consuming server resources and eventually timing out the HTTP response.

**Fix:** Add a query timeout to all tool-executed DB queries, or wrap tool execution in a Promise.race with a timeout.

**Citations:**
- `src/lib/plugins/chat-widget/tools.ts:63-250` — tool execution functions
- `src/app/api/v1/plugins/chat-widget/chat/route.ts:475-484` — tool execution loop

---

### SEC-5: File upload `originalName` is not sanitized before DB insert
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/app/api/v1/files/route.ts:96`

The `file.name` from the multipart upload is inserted directly into the database without sanitization. While the DB column is text and not executable, the name could contain malicious content (e.g., XSS payloads, newlines for header injection) that could be rendered unsafely in downstream consumers.

**Failure scenario:** If the original name is rendered in HTML without escaping, an attacker could upload a file named `<img src=x onerror=alert(1)>.txt`.

**Fix:** Sanitize `originalName` before DB insert (remove control characters, limit length). The file download route (`src/app/api/v1/files/[id]/route.ts:117`) already sanitizes for headers but the upload route does not.

**Citations:**
- `src/app/api/v1/files/route.ts:96` — direct insertion of `file.name`
- `src/app/api/v1/files/[id]/route.ts:117` — download route sanitization

---

### SEC-6: `verifyFileMagicBytes` text-type check is limited to first 8KB
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/lib/files/validation.ts:175-178`

For text MIME types (`text/plain`, `text/csv`, `text/markdown`), the validation only checks the first 8KB for null bytes. An attacker could craft a file with 8KB of valid text followed by binary content.

**Failure scenario:** A file that passes as `text/plain` but contains executable content after the first 8KB could be processed by downstream consumers that read the full file.

**Fix:** Check the entire file for null bytes, or sample multiple regions.

**Citations:**
- `src/lib/files/validation.ts:175-178` — null byte check limited to 8KB

---

## Correctness

### COR-1: Judge claim problem lookup is outside the claim transaction
**Severity:** Medium  
**Confidence:** High  
**File:** `src/app/api/v1/judge/claim/route.ts:341-384`

After the atomic SQL claim (lines 278-283), the code looks up the problem (lines 341-350) and language config (lines 401-410) outside of any transaction. If the problem is deleted between claim and lookup, the code resets the submission to pending (lines 359-384). However, this creates a TOCTOU race: another worker could claim the same submission in the gap.

**Failure scenario:** Under concurrent load with problem deletion, a submission could be claimed by worker A, then worker B claims it after A's problem lookup fails and A resets it.

**Fix:** Include the problem and language config lookups in the same transaction as the claim, or use a stronger isolation level.

**Citations:**
- `src/app/api/v1/judge/claim/route.ts:278-283` — atomic claim
- `src/app/api/v1/judge/claim/route.ts:341-350` — problem lookup outside tx
- `src/app/api/v1/judge/claim/route.ts:359-384` — reset on missing problem

---

### COR-2: `coerceNullableNumber` accepts scientific notation
**Severity:** Low  
**Confidence:** High  
**File:** `src/app/api/v1/judge/claim/route.ts:27-34`

The `coerceNullableNumber` schema uses `Number(s)` which accepts scientific notation (e.g., `"1e10"`, `"Infinity"`). While `Number.isNaN` rejects `"NaN"`, it does not reject `"1e10"` or `"Infinity"`. The `z.number().refine` does check `!Number.isNaN(n)` but also doesn't reject `Infinity`.

**Failure scenario:** A corrupted DB row with string `"Infinity"` for `executionTimeMs` would parse as `Infinity`, which could cause downstream arithmetic issues or JSON serialization problems.

**Fix:** Add `Number.isFinite(n)` check to the refine predicate.

**Citations:**
- `src/app/api/v1/judge/claim/route.ts:27-34` — `coerceNullableNumber` definition

---

### COR-3: Rate limit `blockedUntil` equality edge case when windowMs is 0
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/lib/security/api-rate-limit.ts:107-133`

If `windowMs` is misconfigured to 0, `blockedUntil` is set to `now + 0 = now` when the limit is hit. The check at line 107 uses `existing.blockedUntil > now`, so a `blockedUntil` equal to `now` would pass (not be blocked), allowing immediate retry.

**Failure scenario:** With `windowMs = 0`, rate limiting is effectively disabled — every request after the first limit hit would be allowed.

**Fix:** Use `>=` instead of `>` for the blockedUntil check, or validate that `windowMs > 0` at config load time.

**Citations:**
- `src/lib/security/api-rate-limit.ts:107` — `existing.blockedUntil > now`
- `src/lib/security/api-rate-limit.ts:123` — `blocked = newAttempts >= apiMax ? now + windowMs : null`

---

### COR-4: `rawQueryOne` cannot participate in Drizzle transactions
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/db/queries.ts:48-56`

As documented in the warnings, `rawQueryOne` always runs on the global connection pool and cannot participate in Drizzle transactions. The judge claim endpoint uses `rawQueryOne` for its atomic claim (which is fine — it's a single atomic CTE query). However, other callers might incorrectly assume transaction safety.

**Failure scenario:** A future developer could call `rawQueryOne` inside an `execTransaction` callback, expecting it to participate in the transaction. It would not, potentially causing consistency issues.

**Fix:** Add runtime detection: if `rawQueryOne` is called while inside a transaction context, throw an error or log a warning.

**Citations:**
- `src/lib/db/queries.ts:48-56` — `rawQueryOne` implementation
- `src/lib/db/queries.ts:30-44` — documented warnings

---

## Performance

### PERF-1: Proxy auth cache lazy cleanup allows brief overgrowth
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/proxy.ts:77-99`

The `authUserCache` cleanup only happens on reads (expired entry removal) or when the cache reaches 90% capacity. During a burst of requests with unique tokens, the cache could grow beyond `AUTH_CACHE_MAX_SIZE` before any cleanup occurs.

**Failure scenario:** A burst of 1000 requests with unique tokens would add 1000 entries to the cache. The cleanup only runs when the cache hits 450 entries (90% of 500). The remaining entries would consume memory until subsequent reads trigger cleanup.

**Fix:** Use a size-bounded LRU cache instead of lazy FIFO eviction, or tighten the cleanup threshold.

**Citations:**
- `src/proxy.ts:84-99` — lazy cleanup logic

---

### PERF-2: `getStaleImages` stat/inspect is sequential within pLimit batch
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/app/api/v1/admin/docker/images/route.ts:14-46`

The `getStaleImages` function checks each image for staleness by doing both `stat` and `inspectDockerImage` per image, limited to 5 concurrent. With 102 images, this is ~21 sequential batches. On a slow filesystem or remote Docker daemon, this could take seconds.

**Fix:** Consider caching Dockerfile mtimes or using a single `docker inspect` batch call.

**Citations:**
- `src/app/api/v1/admin/docker/images/route.ts:14-46` — `getStaleImages` implementation

---

## Test Coverage

### TEST-1: No tests for `namedToPositional` edge cases
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/db/queries.ts`

There are no unit tests for `namedToPositional` covering edge cases like:
- Parameters inside SQL string literals
- Duplicate parameter names
- Missing parameters
- Special characters in parameter names

**Fix:** Add unit tests in `tests/unit/db/`.

---

### TEST-2: No tests for proxy auth cache negative-result behavior
**Severity:** Medium  
**Confidence:** High  
**File:** `src/proxy.ts`

There are no tests verifying that negative auth results (invalid token, inactive user) are NOT cached, and that this behavior is intentional.

**Fix:** Add unit tests for the auth cache behavior.

---

### TEST-3: No tests for rate limit deduplication across request boundaries
**Severity:** Medium  
**Confidence:** High  
**File:** `src/lib/security/api-rate-limit.ts`

There are no tests verifying that `consumeApiRateLimit` deduplication works (or documenting that it doesn't work across Next.js boundaries).

**Fix:** Add tests or documentation clarifying the deduplication scope.

---

### TEST-4: No tests for Docker image validation edge cases
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/lib/judge/docker-image-validation.ts`

Limited test coverage for `isAllowedJudgeDockerImage` with edge cases like:
- Empty trusted registries list
- Registry prefix spoofing (e.g., `registry.io.evil.com/judge-foo`)
- Double slashes, URL-encoded characters

**Fix:** Add unit tests for validation edge cases.

---

## Architecture / Design

### ARCH-1: `createApiHandler` catches all errors with generic 500
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/lib/api/handler.ts:204-207`

The `createApiHandler` wrapper catches all errors and returns a generic 500. While this is good for security (prevents leaking internal details), it makes debugging production issues harder since the original error context is only in logs.

**Fix:** Consider adding an error classification layer that returns more specific error codes for known error types (e.g., DB connection errors vs. logic errors) while still avoiding information leakage.

**Citations:**
- `src/lib/api/handler.ts:204-207` — generic error catch

---

### ARCH-2: Judge worker auth uses two separate token systems
**Severity:** Low  
**Confidence:** Medium  
**File:** `src/app/api/v1/judge/claim/route.ts:128-165`

The judge claim endpoint supports both per-worker tokens (via `secretTokenHash`) and a shared `JUDGE_AUTH_TOKEN`. This dual-auth system increases complexity. The code handles both paths but the interaction between them is subtle.

**Fix:** Document the auth fallback hierarchy clearly, or consider deprecating the shared token in favor of per-worker tokens.

**Citations:**
- `src/app/api/v1/judge/claim/route.ts:128-136` — dual auth path
- `src/app/api/v1/judge/claim/route.ts:156-165` — per-worker secret validation

---

## Documentation / Code Mismatch

### DOC-1: AGENTS.md says "PostgreSQL 18 runtime" — no such version exists
**Severity:** Low  
**Confidence:** High  
**File:** `AGENTS.md:265`

The document states "PostgreSQL 18 runtime" but the latest PostgreSQL major version is 17 (as of 2026). The `pg` package version is `^8.20.0` (driver), not the server version.

**Fix:** Correct the PostgreSQL version number. The actual runtime should be verified on the deployment target.

**Citations:**
- `AGENTS.md:265` — "PostgreSQL 18 runtime"

---

### DOC-2: AGENTS.md Docker image table claims 102 images but only lists ~46
**Severity:** Low  
**Confidence:** Medium  
**File:** `AGENTS.md:179-227`

The document states "102 images" and "Total: ~25 GB across 102 images" but the table only contains ~46 rows. There's a mismatch between the claimed count and the listed images.

**Fix:** Update the table to include all images or correct the count.

**Citations:**
- `AGENTS.md:228` — "Total: ~25 GB across 102 images"

---

## Deferred Findings Summary

None of the findings above are deferred. All are actionable within this cycle or should be addressed in subsequent cycles. Security findings SEC-3 (DoS via uncached negative auth) and SEC-2 (rate limit double-counting) are the highest priority.
