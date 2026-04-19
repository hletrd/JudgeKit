# Cycle 1 Review Remediation Plan

**Date:** 2026-04-19  
**Source:** `.context/reviews/cycle-1-comprehensive-review.md`, `.context/reviews/_aggregate.md`  
**Status:** COMPLETE

## Deduplication note
The existing plan at `plans/open/2026-04-18-comprehensive-review-remediation.md` already addressed CRIT-1 (heartbeat plaintext token), HIGH-4 (heartbeat activeTasks clobber), CRIT-7 (loginEvents retention + legal hold). This plan covers findings that are genuinely NEW or were not addressed in the prior plan.

---

## Implementation Stories

### SEC-01: Fix timing leak in judge worker secret comparison
**Severity:** HIGH | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/judge/deregister/route.ts:43-47`
- `src/app/api/v1/judge/heartbeat/route.ts:55-59`

**Problem:** Both routes do `a.length !== b.length || !timingSafeEqual(a, b)` which leaks the hash length via timing. The codebase already has `safeTokenCompare()` in `src/lib/security/timing.ts` that avoids this by HMAC'ing both inputs first.

**Fix:** Replace manual `timingSafeEqual` + length check with `safeTokenCompare(hashToken(workerSecret), worker.secretTokenHash)`. Remove the `timingSafeEqual` import from `node:crypto` and add `safeTokenCompare` import from `@/lib/security/timing`.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### SEC-02: Add missing `updatedAt` on submission update operations [FALSE POSITIVE]
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Status:** FALSE POSITIVE -- The `submissions` table does NOT have an `updatedAt` column (only `submittedAt`). The original finding was based on an incorrect assumption about the schema. No code change needed.

---

### LOGIC-02: Restrict column selection in apiKeys PATCH/DELETE
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Files:**
- `src/app/api/v1/admin/api-keys/[id]/route.ts:49,99`

**Problem:** `db.select().from(apiKeys)` returns all columns including `keyHash` and `encryptedKey`. Only `id` and `name` are needed for audit logging.

**Fix:** Replace with `db.select({ id: apiKeys.id, name: apiKeys.name }).from(apiKeys)`.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### ARCH-02: Start rate limit eviction timer on application bootstrap [FALSE POSITIVE]
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Quick win

**Status:** FALSE POSITIVE -- `startRateLimitEviction()` is already called in `src/instrumentation.ts` line 20 alongside `startAuditEventPruning()` and `startSensitiveDataPruning()`. No code change needed.

---

### ARCH-01: Add error handler to fire-and-forget API key lastUsedAt update
**Severity:** MEDIUM | **Confidence:** MEDIUM | **Effort:** Quick win

**File:** `src/lib/api/api-key-auth.ts:91-93`

**Problem:** `void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(...)` has no `.catch()`. If the update fails, the error is silently swallowed with no logging.

**Fix:** Add `.catch((err) => logger.warn({ err, apiKeyId: candidate.id }, "[api-key-auth] Failed to update lastUsedAt"))` and import `logger` if not already imported.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### ARCH-03: Replace `console.warn` with `logger` in encryption module
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**File:** `src/lib/security/encryption.ts:36,70`

**Problem:** Uses `console.warn()` instead of the project's pino logger. These warnings won't appear in structured logs.

**Fix:** Import `logger` from `@/lib/logger` and replace `console.warn(...)` with `logger.warn(...)`.

**Verification:** `npx tsc --noEmit`

---

### PERF-01: Batched DELETE for data retention pruning
**Severity:** MEDIUM | **Confidence:** HIGH | **Effort:** Moderate

**Files:**
- `src/lib/data-retention-maintenance.ts:7-53`
- `src/lib/audit/events.ts:176-188`

**Problem:** Each prune function issues an unbounded `DELETE ... WHERE createdAt < cutoff` with no `LIMIT`. For large tables, this holds locks for a long time and generates huge WAL.

**Fix:** Refactor each prune function to use batched deletion in a loop (e.g., 5000 rows per batch) until no more rows match. Follow the pattern from `src/lib/db/cleanup.ts` which already uses `LIMIT ${BATCH_SIZE}`.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### LOGIC-01: Remove dead `claimValid` code in judge/poll
**Severity:** LOW | **Confidence:** MEDIUM | **Effort:** Quick win

**File:** `src/app/api/v1/judge/poll/route.ts:129-179`

**Problem:** The `claimValid` flag can never be `false` at line 177 because the `"invalidJudgeClaim"` error is caught and returned at line 171-172, and any other error is re-thrown.

**Fix:** Remove the `claimValid` variable and the `if (!claimValid)` check on line 177-179.

**Verification:** `npx tsc --noEmit`, `npx vitest run`

---

### DOCS-01: Remove obsolete `better-sqlite3.d.ts` type declaration
**Severity:** LOW | **Confidence:** HIGH | **Effort:** Quick win

**File:** `src/types/better-sqlite3.d.ts`

**Problem:** The project has fully migrated to PostgreSQL. This type declaration is leftover from the SQLite era.

**Fix:** Delete the file.

**Verification:** `npx tsc --noEmit`

---

## Deferred Items

These findings are explicitly deferred per the review. Each records the file+line citation, original severity/confidence, concrete reason, and exit criterion.

| ID | Finding | Severity | Confidence | Reason for deferral | Exit criterion |
|----|---------|----------|------------|---------------------|----------------|
| SEC-03 | Judge claim sends hidden test case expectedOutput | LOW | HIGH | By-design: judge worker is in the trusted boundary and needs expectedOutput for comparison. Mitigating would require a fundamentally different architecture (e.g., homomorphic comparison). | Architect review determines the trust boundary must be narrowed |
| PERF-02 | Unbounded `select().from(testCases)` in claim route | LOW | HIGH | The judge worker needs all test case data. Column restriction would require restructuring the wire protocol. | Performance profiling shows this is a bottleneck for large problem sets |
| OPS-01 | IPv6 CIDR matching in judge IP allowlist | LOW | HIGH | Current deployment uses IPv4-only internal networking. IPv6 support is nice-to-have but not currently needed. | Deployment moves to IPv6-capable internal network |
| OPS-02 | `judgeWorkers` table lacks `updatedAt` column | LOW | HIGH | Adding a column requires a DB migration and coordination with the Rust worker. The `lastHeartbeatAt` column partially serves this purpose. | Next scheduled DB migration window |
| TEST-01 | Missing tests for judge claim/poll/deregister/heartbeat | MEDIUM | HIGH | Test infrastructure for judge routes requires mocking the worker protocol. Will be addressed in a dedicated test sprint. | Next test coverage sprint |
| TEST-02 | Missing tests for submission visibility sanitization | LOW | HIGH | Will be addressed alongside TEST-01 in the test sprint. | Next test coverage sprint |
| TEST-03 | Missing tests for CSRF validation | LOW | HIGH | Will be addressed alongside TEST-01 in the test sprint. | Next test coverage sprint |

---

## Progress Ledger

| Story | Status | Commit |
|---|---|---|
| SEC-01 | Done | `1b7af7b9` |
| SEC-02 | False Positive | N/A (submissions table has no updatedAt column) |
| LOGIC-02 | Done | `7a5e8fa7` |
| ARCH-02 | False Positive | N/A (startRateLimitEviction already called in instrumentation.ts) |
| ARCH-01 | Done | `ce53912c` |
| ARCH-03 | Done | `5043452d` |
| PERF-01 | Done | `05f2ae9d` |
| LOGIC-01 | Done | `06c88695` |
| DOCS-01 | Done | `9acf6bba` |
