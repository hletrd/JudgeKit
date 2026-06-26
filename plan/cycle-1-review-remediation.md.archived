# Cycle 1 Review Remediation Plan

Date: 2026-06-24
Source: `.context/reviews/_aggregate.md` (Cycle 1)

## Critical Fixes (implement this cycle)

### [FIX] AGG1-2 — Replace hand-rolled Gregorian calendar with chrono in dead-letter timestamp

**File:** `judge-worker-rs/src/executor.rs:972-1025`
**Severity:** Medium
**Confidence:** Medium

**Problem:** The `report_with_retry` function contains a complex hand-rolled Gregorian calendar calculation for formatting dead-letter timestamps. This is error-prone and duplicates standard library functionality.

**Implementation:**
1. Add `chrono` to `judge-worker-rs/Cargo.toml` if not already present
2. Replace the custom calendar calculation (lines 972-1025) with `chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string()`
3. Remove the `failed_at` variable calculation block
4. Update the `DeadLetterEntry` struct to use the chrono-formatted string

**Exit criterion:** Dead-letter timestamps are formatted correctly using chrono, all existing tests pass.

---

### [FIX] AGG1-3 — Require trusted registries in production for Docker image validation

**File:** `judge-worker-rs/src/validation.rs:52-61`
**Severity:** Medium
**Confidence:** Medium

**Problem:** When `TRUSTED_DOCKER_REGISTRIES` is empty, images without registry prefixes (e.g., `judge-python:latest`) pass validation. This could allow arbitrary Docker Hub images in production.

**Implementation:**
1. In `validate_docker_image`, check if we're in production mode (e.g., via an env var like `JUDGE_PRODUCTION_MODE` or `NODE_ENV` equivalent)
2. In production, if `trusted` is empty, return `false` for all images
3. Add tests for the production-mode behavior

**Exit criterion:** Docker image validation rejects non-registry images when no trusted registries are configured in production.

---

### [FIX] AGG1-12 — Replace `var` with `let` in global declaration

**File:** `src/lib/data-retention-maintenance.ts:168`
**Severity:** Low
**Confidence:** High

**Problem:** Line 168 uses `var` in a `declare global` block, which is non-idiomatic TypeScript.

**Implementation:**
1. Change `var __sensitiveDataPruneTimer` to `let __sensitiveDataPruneTimer`

**Exit criterion:** TypeScript compilation succeeds, no lint errors.

---

## Medium Fixes (plan for next cycle)

### [PLAN] AGG1-1 — Audit and harden sanitizeHtml for XSS prevention

**File:** `src/components/problem-description.tsx`, `src/lib/security/sanitize-html.ts`
**Severity:** Medium
**Confidence:** Medium

**Problem:** The `ProblemDescription` component uses `dangerouslySetInnerHTML` with `sanitizeHtml`. The security depends on the sanitizer implementation.

**Plan:**
1. Read `src/lib/security/sanitize-html.ts` to verify current implementation
2. Ensure it uses a strict allowlist (no `script`, `style`, event handlers)
3. Ensure it strips `javascript:` URLs from `href`/`src` attributes
4. Add automated tests for common XSS payloads
5. Consider adding CSP `script-src` directive as defense-in-depth

**Exit criterion:** sanitizeHtml passes all XSS test payloads, CSP headers are configured.

---

### [PLAN] AGG1-4 — Allow handlers to throw ClientError for custom status codes

**File:** `src/lib/api/handler.ts:204-207`
**Severity:** Medium
**Confidence:** Medium

**Problem:** All handler errors are caught and returned as generic 500, masking business logic errors.

**Plan:**
1. Define a `ClientError` class with `statusCode` and `message` properties
2. In the catch block, check if the error is a `ClientError` and pass through its status/message
3. Keep generic 500 for unexpected errors
4. Update handlers to use `ClientError` where appropriate

**Exit criterion:** Business logic errors return appropriate status codes, unexpected errors still return 500.

---

### [PLAN] AGG1-5 — Add rate limiting for API key authentication failures

**File:** `src/lib/api/auth.ts:61-83`
**Severity:** Medium
**Confidence:** Medium

**Problem:** Failed API key authentication attempts are not rate-limited.

**Plan:**
1. Add a separate rate limit key for API key auth failures (e.g., `auth:api-key`)
2. Track failed attempts per IP or per API key prefix
3. Apply exponential backoff after repeated failures

**Exit criterion:** API key brute-force attempts are rate-limited.

---

### [PLAN] AGG1-6 — Document and audit plugin secret encryption key derivation

**File:** `src/lib/plugins/secrets.ts:36-50`
**Severity:** Medium
**Confidence:** Medium

**Problem:** The encryption key derivation source is not clear from the code.

**Plan:**
1. Read `src/lib/security/derive-key.ts` to understand key derivation
2. Document the key derivation process and rotation procedure
3. Consider adding key versioning to the encryption format

**Exit criterion:** Key derivation is documented, rotation procedure is defined.

---

### [PLAN] AGG1-7 — Add bounds checking to parse_timestamp_epoch_ms

**File:** `judge-worker-rs/src/docker.rs:91-130`
**Severity:** Medium
**Confidence:** Low

**Problem:** The days calculation could overflow `i64` for extreme year values.

**Plan:**
1. Add bounds checking for year (e.g., 1970-3000)
2. Return `None` for out-of-bounds values
3. Add tests for extreme year values

**Exit criterion:** Out-of-bounds timestamps return `None` instead of panicking or overflowing.

---

## Deferred Fixes (low priority)

### [DEFERRED] AGG1-8 — Add jitter to data retention pruning timer

**File:** `src/lib/data-retention-maintenance.ts:173`
**Severity:** Low
**Confidence:** Medium
**Reason for deferral:** Requires multi-instance deployment to be a real issue. Current single-instance deployment is not affected.
**Exit criterion:** When multi-instance deployment is planned.

---

### [DEFERRED] AGG1-9 — Optimize getApiUser to avoid unnecessary DB queries

**File:** `src/lib/api/auth.ts:61-83`
**Severity:** Low
**Confidence:** Low
**Reason for deferral:** Performance optimization, not a correctness issue. Current behavior is functionally correct.
**Exit criterion:** When profiling shows auth as a bottleneck.

---

### [DEFERRED] AGG1-10 — Sanitize error objects before logging

**File:** `src/lib/api/handler.ts:204-205`
**Severity:** Low
**Confidence:** Low
**Reason for deferral:** The current logging setup may already redact sensitive fields. Need to verify logger configuration first.
**Exit criterion:** After auditing logger configuration.

---

### [DEFERRED] AGG1-11 — Use constants for admin capability names

**File:** `src/lib/api/auth.ts:114-118`
**Severity:** Low
**Confidence:** Low
**Reason for deferral:** Code style improvement, no functional impact.
**Exit criterion:** When capability system is next refactored.

---

### [DEFERRED] AGG1-13 — Add strict permissions to dead-letter directory

**File:** `judge-worker-rs/src/executor.rs:1040`
**Severity:** Low
**Confidence:** Low
**Reason for deferral:** The directory is already created by the worker process. Need to verify actual deployment permissions.
**Exit criterion:** When reviewing deployment configuration.

---

### [DEFERRED] AGG1-14 — Move pruning timer to module-level private variable

**File:** `src/lib/data-retention-maintenance.ts:166-178`
**Severity:** Low
**Confidence:** Low
**Reason for deferral:** Minor code style issue in a Node.js server context where global access is not a real security concern.
**Exit criterion:** When refactoring data retention module.

---

## Progress Tracking

- [ ] AGG1-2: Replace hand-rolled calendar with chrono
- [ ] AGG1-3: Require trusted registries in production
- [ ] AGG1-12: Replace `var` with `let`
- [ ] AGG1-1: Audit sanitizeHtml (planned)
- [ ] AGG1-4: ClientError support (planned)
- [ ] AGG1-5: API key rate limiting (planned)
- [ ] AGG1-6: Document key derivation (planned)
- [ ] AGG1-7: Bounds checking for timestamps (planned)
