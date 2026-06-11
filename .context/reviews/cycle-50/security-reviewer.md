# Cycle 50 — Security Reviewer

**Date:** 2026-05-13
**HEAD reviewed:** `898684e6`
**Prior aggregate:** `_aggregate-cycle-49.md` (HEAD `17a35892`)

## Scope
Security-focused review of all changes since cycle 49. Examined auth, rate limiting, SQL injection, TOCTOU races, secret handling, and input validation.

---

## NEW Findings

### C50-SR-1: Rate limit added to auth endpoints — correct but missing token-scoped limits on resend-verification
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/auth/resend-verification/route.ts:22-23`
- **Problem:** The route uses both `createApiHandler`'s `rateLimit: "auth:resend-verification"` AND an inner `consumeRateLimitAttemptMulti(rateLimitKey, userRateLimitKey)`. The inner rate limit provides per-IP and per-user limits, but the outer `createApiHandler` limit is a single global bucket. If the outer limit is stricter, it could block legitimate users before the per-user limit is hit.
- **Note:** This is a design observation, not a vulnerability. The defense-in-depth is appropriate.
- **Fix:** Ensure the `api-rate-limit` config for `"auth:resend-verification"` is not stricter than the per-user limit in `rate-limit.ts`.

### C50-SR-2: chat-logs raw SQL parameter safety verified
- **Severity:** N/A (verification finding)
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/chat-logs/route.ts:74`
- **Observation:** The `@userId::text` parameter is passed through `namedToPositional()` which converts it to a `$N` positional parameter. Safe from SQL injection. The `::text` cast prevents type mismatches when `userId` is null. Correct fix.

### C50-SR-3: Import route rejects sanitized exports
- **Severity:** N/A (verification finding)
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/migrate/import/route.ts:93-95`
- **Observation:** `isSanitizedExport(data)` correctly blocks imports of sanitized exports. This prevents accidentally restoring a scrubbed database (where user-identifying fields were removed). Good security enhancement.

### C50-SR-4: Bulk rejudge TOCTOU protection verified
- **Severity:** N/A (verification finding)
- **Confidence:** HIGH
- **File:** `src/app/api/v1/admin/submissions/rejudge/route.ts:35-69`
- **Observation:** Permission check and mutation are now inside the same transaction. The `permittedSubmissionRows.length !== uniqueSubmissionIds.length` check prevents partial bulk rejudges. Correct fix for C49-1 predecessor.

---

## Carry-forward Security Items
- No HIGH or MEDIUM security findings from prior cycles remain unaddressed.
- All rate-limit additions (reset-password, verify-email, group assignments, contest invite, anti-cheat) are correctly implemented.
- Token operations (password reset, email verify) are now transaction-wrapped with TOCTOU protection.

## Agent Failure Note
Subagent fan-out unavailable — `Agent` tool not registered. Performed as single-agent comprehensive security review.
