# Cycle 1 Comprehensive Code Review

**Date:** 2026-04-19  
**Reviewer:** General-purpose agent (multi-angle review)  
**Scope:** Full repository — 565 TypeScript/TSX source files, Rust judge worker, Docker infrastructure

---

## CRITICAL / HIGH SEVERITY FINDINGS

### SEC-01: Timing leak in judge worker secret comparison (deregister + heartbeat)
**Files:** `src/app/api/v1/judge/deregister/route.ts:43-47`, `src/app/api/v1/judge/heartbeat/route.ts:55-59`  
**Severity:** HIGH | **Confidence:** HIGH | **Category:** Security

Both routes do a manual `a.length !== b.length || !timingSafeEqual(a, b)` comparison on the hashed worker secret. The length check before `timingSafeEqual` leaks the hash length via timing, which can help an attacker narrow down candidate values. The codebase already has a `safeTokenCompare()` utility in `src/lib/security/timing.ts` that avoids this by HMAC'ing both inputs first.

**Failure scenario:** Attacker measures response time differences for different-length inputs to narrow the search space for the worker secret hash.

**Fix:** Replace the manual `timingSafeEqual` usage with `safeTokenCompare()` from `@/lib/security/timing`.

---

### SEC-02: Missing `updatedAt` on multiple DB update operations
**Files:** Multiple API routes  
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Data integrity

The codebase has a `withUpdatedAt()` helper and schema comments explicitly warning that `$defaultFn` only fires on INSERT. However, several update operations omit `updatedAt`:

1. `src/app/api/v1/judge/deregister/route.ts:52` — `judgeWorkers` update (no `updatedAt` column on judgeWorkers, so N/A)
2. `src/app/api/v1/judge/heartbeat/route.ts:64` — `judgeWorkers` update (N/A — no updatedAt column)
3. `src/app/api/v1/judge/poll/route.ts:73,132` — `submissions` update omits `updatedAt`
4. `src/app/api/v1/judge/poll/route.ts:162` — `judgeWorkers` update (N/A)
5. `src/app/api/v1/admin/submissions/rejudge/route.ts:51` — `submissions` update omits `updatedAt`
6. `src/app/api/v1/judge/deregister/route.ts:82` — `submissions` update omits `updatedAt`
7. `src/app/api/v1/groups/[id]/instructors/route.ts:91` — `groupInstructors` update (no updatedAt column, N/A)
8. `src/app/api/v1/admin/api-keys/[id]/route.ts:77` — `apiKeys` update correctly includes `updatedAt` (good)
9. `src/app/api/v1/community/threads/[id]/route.ts:40` — `discussionThreads` update includes `updatedAt` (good)
10. `src/app/api/v1/community/votes/route.ts:85` — `communityVotes` update includes `updatedAt` (good)

The `submissions` table has an `updatedAt` column but these paths don't update it, meaning audit/replication queries that rely on `updatedAt` will show stale data for judged/rejudged/deregistered submissions.

**> RESOLUTION: FALSE POSITIVE.** The `submissions` table schema (in `src/lib/db/schema.pg.ts`) does NOT have an `updatedAt` column -- it only has `submittedAt`. Items 3, 5, and 6 above were based on an incorrect assumption about the schema. Items 1, 2, 4, and 7 were already noted as N/A. No code change needed.

**Fix:** ~~Add `updatedAt: new Date()` to all `.set()` calls on tables that have the `updatedAt` column, or use `withUpdatedAt()`.~~ Not applicable.

---

### SEC-03: Judge claim route sends ALL test case data including hidden test cases' expectedOutput
**File:** `src/app/api/v1/judge/claim/route.ts:301-305`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Information exposure

`db.select().from(testCases)` returns all columns including `expectedOutput` for hidden test cases. This is **by design** — the judge worker needs expected output to compare. However, the worker receives `expectedOutput` for ALL test cases regardless of visibility, and the worker is typically a separate service. If the worker is compromised, hidden test case answers leak.

This is a trust boundary issue rather than a bug — the judge worker is already in the trusted boundary. But the blast radius of a compromised worker is higher than necessary.

**Risk assessment:** LOW — the judge worker runs in a Docker sandbox on a trusted host.

**Mitigation (optional):** Consider sending only `isVisible: false` test cases' expected output as a hash for comparison when the comparison mode is `exact`, so the worker can compare without seeing plaintext answers.

---

### PERF-01: Data retention prunes are unbatched and run without rate limiting
**File:** `src/lib/data-retention-maintenance.ts:7-53`  
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Performance / Operations

Each `prune*()` function issues a single `DELETE ... WHERE createdAt < cutoff` with no `LIMIT`. For tables with millions of rows (submissions, audit events, login events), this produces a single massive DELETE that:
- Holds locks for a long time, blocking concurrent reads/writes
- Generates huge WAL entries
- Can cause statement timeout on busy production databases

The `src/lib/audit/events.ts:183` prune has the same problem.

Meanwhile, `src/lib/db/cleanup.ts:21,31` correctly uses `LIMIT ${BATCH_SIZE}` for batched deletion. The data retention code should follow the same pattern.

**Fix:** Add batched deletion with `LIMIT` (e.g., 5000 rows per batch) in a loop until no more rows match, similar to `cleanup.ts`.

---

### PERF-02: `db.select().from(testCases)` returns all columns in claim route
**File:** `src/app/api/v1/judge/claim/route.ts:301-305`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Performance

`db.select().from(testCases)` returns ALL columns for all test cases. For problems with many test cases or very large inputs/expected outputs, this can produce a very large JSON response. A column-restricted select would be more efficient, though the worker does need all the data.

**Risk:** LOW — operational concern only for very large problem sets.

---

### LOGIC-01: `claimValid` flag set inside transaction but checked after — redundant dead code path
**File:** `src/app/api/v1/judge/poll/route.ts:129-179`  
**Severity:** LOW | **Confidence:** MEDIUM | **Category:** Code quality / Logic

The variable `claimValid` is set to `true` inside the transaction (line 168) and checked after the try/catch (line 177). However, if the transaction throws `"invalidJudgeClaim"`, it's caught and returns 403 immediately. If it throws any other error, the catch re-throws it. So the only way to reach line 177 with `claimValid === false` is if the transaction succeeds but the rowCount was 0 — but in that case, the `throw new Error("invalidJudgeClaim")` on line 149 would have already thrown. So `claimValid` can never be `false` at line 177.

The `if (!claimValid)` check on line 177 is dead code. It's harmless but adds cognitive overhead.

**Fix:** Remove the `claimValid` flag and the dead-code check, or convert it to an assertion for documentation purposes.

---

### LOGIC-02: `select().from(apiKeys)` exposes encrypted key hash in PATCH and DELETE handlers
**File:** `src/app/api/v1/admin/api-keys/[id]/route.ts:49,99`  
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Security / Information exposure

Both PATCH and DELETE handlers do `db.select().from(apiKeys)` which returns ALL columns including `keyHash`, `encryptedKey`, and `keyPrefix`. Only `id` and `name` are needed for the audit log. The `keyHash` and `encryptedKey` are sensitive cryptographic material that should not be in memory unnecessarily.

The GET handler on line 22 already demonstrates the correct pattern — it selects only the columns it needs.

**Fix:** Replace `db.select().from(apiKeys)` with a column-restricted select: `db.select({ id: apiKeys.id, name: apiKeys.name }).from(apiKeys)`.

---

### ARCH-01: No global error handling for unhandled promise rejections
**Severity:** MEDIUM | **Confidence:** MEDIUM | **Category:** Architecture / Reliability

The application uses `void db.insert(...)` and `void db.update(...)` for fire-and-forget DB writes (audit events, API key lastUsedAt updates, login events). If these silently fail without logging, operational issues can go undetected. The audit event system handles this well (buffer + flush + error tracking), but the `api-key-auth.ts:91` `void db.update(...)` for `lastUsedAt` has no error handler at all.

**Fix:** Add `.catch((err) => logger.warn(...))` to the fire-and-forget `lastUsedAt` update in `api-key-auth.ts`.

---

### ARCH-02: Rate limit eviction timer is never started automatically
**File:** `src/lib/security/rate-limit.ts:50-55`  
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Architecture / Operations

`startRateLimitEviction()` is exported but never called in the codebase. The timer that cleans up stale rate limit entries from the database needs to be started during application bootstrap. Without it, the `rate_limits` table will grow indefinitely.

**> RESOLUTION: FALSE POSITIVE.** `startRateLimitEviction()` IS already called in `src/instrumentation.ts` line 20, alongside `startAuditEventPruning()` and `startSensitiveDataPruning()`. The initial grep search missed this usage. No code change needed.

**Fix:** ~~Call `startRateLimitEviction()` in the instrumentation file or startup hook, alongside `startAuditEventPruning()` and `startSensitiveDataPruning()`.~~ Not applicable.

---

### ARCH-03: `console.warn` used instead of `logger` in encryption module
**File:** `src/lib/security/encryption.ts:36,70`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Code quality

The encryption module uses `console.warn()` for warnings about missing `NODE_ENCRYPTION_KEY`, while the rest of the codebase uses the pino logger. This means these warnings won't appear in structured logs and may be missed in production monitoring.

**Fix:** Replace `console.warn(...)` with `logger.warn(...)`.

---

### UI-01: No `letter-spacing` violations for Korean text detected
**Severity:** N/A (compliance check) | **Confidence:** HIGH

Scanned for `letter-spacing`, `tracking-*`, and similar Tailwind utilities. No violations of the Korean typography rule from CLAUDE.md were found in the codebase.

---

### TEST-01: Missing test coverage for judge claim/poll/deregister/heartbeat routes
**Severity:** MEDIUM | **Confidence:** HIGH | **Category:** Test gaps

The `tests/unit/` directory contains tests for many components but there are no unit tests for the critical judge API routes (`claim`, `poll`, `deregister`, `heartbeat`). These are the most security-sensitive endpoints in the system (they handle auth token validation, atomic DB operations, concurrency control). The existing `admin-workers.route.test.ts` covers the admin CRUD routes but not the judge worker protocol routes.

**Fix:** Add unit tests for judge claim/poll/deregister/heartbeat routes covering: auth rejection, claim token validation, stale claim reclamation, deregister submission release, and heartbeat staleness sweep.

---

### TEST-02: Missing test coverage for submission visibility sanitization
**Severity:** LOW | **Confidence:** HIGH | **Category:** Test gaps

`src/lib/submissions/visibility.ts` contains critical logic for hiding hidden test case output from students, but has no dedicated test file. This is a security-relevant code path that could lead to information disclosure if broken.

**Fix:** Add unit tests for `sanitizeSubmissionForViewer` covering: owner vs non-owner, visible vs hidden test cases, showDetailedResults=false, hideScores=true, canViewAllResults capability.

---

### TEST-03: Missing test coverage for CSRF validation
**Severity:** LOW | **Confidence:** HIGH | **Category:** Test gaps

`src/lib/security/csrf.ts` has no dedicated test file. This is a core security mechanism.

**Fix:** Add unit tests covering: safe methods bypass, missing X-Requested-With header, origin validation, sec-fetch-site validation, API key auth bypass.

---

### OPS-01: Judge IP allowlist does not support IPv6
**File:** `src/lib/judge/ip-allowlist.ts:45-71`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Operations

The `ipMatchesAllowlistEntry()` function only handles IPv4 addresses. The IPv6 validation in `extractClientIp()` works fine, but if a worker connects via IPv6, the allowlist matching will always fail (returns `false` because CIDR matching only handles 4-part dotted notation). The exact-match path works for IPv6 but CIDR does not.

**Fix:** Add IPv6 CIDR matching support to `ipMatchesAllowlistEntry()`.

---

### OPS-02: `judgeWorkers` table update operations don't set `updatedAt` (column missing)
**File:** `src/lib/db/schema.pg.ts:409-442`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Schema

The `judgeWorkers` table lacks an `updatedAt` column. All other tables with mutable state have one. This makes it impossible to determine when a worker's configuration was last changed, which complicates operational debugging.

**Fix:** Add `updatedAt` column to `judgeWorkers` table (with migration).

---

### DOCS-01: `better-sqlite3.d.ts` type declaration is obsolete
**File:** `src/types/better-sqlite3.d.ts`  
**Severity:** LOW | **Confidence:** HIGH | **Category:** Documentation / Code hygiene

The file declares `const Database: any;` for `better-sqlite3`, but the project has fully migrated to PostgreSQL (schema.pg.ts, node-postgres driver). This type declaration is leftover from the SQLite era and should be removed.

**Fix:** Delete `src/types/better-sqlite3.d.ts`.

---

## POSITIVE OBSERVATIONS

1. **Security posture is strong overall:** Timing-safe comparisons, Argon2id password hashing with bcrypt migration, per-worker secret token hashing, CSRF protection with origin validation, CSP with nonces via proxy middleware, IP allowlisting for judge routes, rate limiting with exponential backoff, API key encryption with HKDF domain separation.

2. **Atomic operations:** The claim route uses `FOR UPDATE SKIP LOCKED` and `pg_advisory_xact_lock` for correct concurrent submission handling. The submission creation route uses advisory locks to prevent rate limit bypass.

3. **Proper data sanitization:** DOMPurify with strict allowlists for HTML, markdown sanitization, submission visibility gating based on test case visibility and user capabilities.

4. **Audit trail:** Comprehensive audit event logging with buffered batch writes, health monitoring, and data retention pruning.

5. **Session security:** Token invalidation tracking, User-Agent hashing, must-change-password enforcement, proper cookie security (Secure, HttpOnly, SameSite=Lax).

6. **Container sandboxing:** Docker containers for code execution use comprehensive security measures: `--network=none`, `--cap-drop=ALL`, `--read-only`, seccomp profiles, `--user 65534:65534`, PID limits, memory limits.

---

## SUMMARY TABLE

| ID | Severity | Category | File(s) | Confidence |
|----|----------|----------|---------|------------|
| SEC-01 | HIGH | Security | judge/deregister, judge/heartbeat | HIGH |
| SEC-02 | MEDIUM | Data integrity | Multiple (submissions updates) | HIGH |
| SEC-03 | LOW | Information exposure | judge/claim | HIGH |
| PERF-01 | MEDIUM | Performance | data-retention-maintenance, audit/events | HIGH |
| PERF-02 | LOW | Performance | judge/claim | HIGH |
| LOGIC-01 | LOW | Code quality | judge/poll | MEDIUM |
| LOGIC-02 | MEDIUM | Security | admin/api-keys/[id] | HIGH |
| ARCH-01 | MEDIUM | Reliability | api-key-auth | MEDIUM |
| ARCH-02 | MEDIUM | Operations | rate-limit | HIGH |
| ARCH-03 | LOW | Code quality | encryption | HIGH |
| TEST-01 | MEDIUM | Test gaps | judge routes | HIGH |
| TEST-02 | LOW | Test gaps | submissions/visibility | HIGH |
| TEST-03 | LOW | Test gaps | security/csrf | HIGH |
| OPS-01 | LOW | Operations | judge/ip-allowlist | HIGH |
| OPS-02 | LOW | Schema | db/schema.pg | HIGH |
| DOCS-01 | LOW | Code hygiene | types/better-sqlite3.d.ts | HIGH |
