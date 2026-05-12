# Aggregate Review — Cycle 12

**Date:** 2026-05-12
**Scope:** Comprehensive review of entire codebase: auth, email, API routes, database queries, transactions, judge system, compiler, file uploads, SSE, Docker client, and anti-cheat
**Previous cycles reviewed:** C6 aggregate (all findings were fixed in cycle 6)

---

## MEDIUM Severity

### C12-AGG-1: Email token delete/insert not atomic — leaves user with no tokens on insert failure

**File:** `src/lib/email/index.ts:56-68` (sendPasswordResetEmail) and `src/lib/email/index.ts:222-235` (sendEmailVerification)
**Confidence:** High

Both `sendPasswordResetEmail` and `sendEmailVerification` delete old tokens and insert new ones as separate, non-transactional operations. If the insert fails after the delete (e.g., DB connection lost, constraint violation, disk full), the user is left with no active tokens.

**Concrete failure scenario:**
1. User requests password reset
2. `sendPasswordResetEmail` deletes the old token (line 56-58)
3. Network blip or DB primary failover occurs before the insert (line 64-68)
4. The insert throws and the function returns `{ success: false, error: "send_failed" }`
5. User has no valid password reset token in the database
6. User retries but the same race can occur again
7. Only recovery: wait for token TTL to fully expire or admin intervention

Same pattern exists in `sendEmailVerification` (lines 222-235) where old verification tokens are deleted before new ones are inserted.

**Fix:** Wrap delete+insert in `db.transaction()`.
**Status:** Fixed in commit `90999aa8`.

---

## LOW Severity

### C12-AGG-2: `sendEmailVerification` returns misleading error for missing email

**File:** `src/lib/email/index.ts:218-219`
**Confidence:** High

When a user exists but has no email address, `sendEmailVerification` returns `"user_not_found"` instead of a more descriptive error. The user was found — they simply lack an email. This mismatch can confuse API consumers and logging/alerting systems.

**Fix:** Return `"no_email"` instead of `"user_not_found"` at line 219.
**Status:** Fixed in commit `90999aa8`.

---

## Verified Safe Patterns (new this cycle)

| Pattern | Location | Assessment |
|---|---|---|
| Judge claim CTE atomicity | `judge/claim/route.ts:175-283` | Correct — raw SQL CTE handles claim atomically |
| Judge poll final transaction | `judge/poll/route.ts:138-181` | Correct — status update + results in tx |
| Bulk rejudge permission + mutation | `admin/submissions/rejudge/route.ts:35-69` | Correct — permission check inside execTransaction |
| Single rejudge cache invalidation | `submissions/[id]/rejudge/route.ts:57-64` | Correct — fire-and-forget with error handling |
| File upload cleanup | `files/route.ts:91-113` | Correct — orphaned file deleted on DB insert failure |
| Rate limit atomic consume | `api-rate-limit.ts:80-137` | Correct — SELECT FOR UPDATE inside transaction |
| Shell command validation | `compiler/execute.ts:170-244` | Correct — dangerous patterns rejected |
| Docker image validation | `judge/docker-image-validation.ts:32-51` | Correct — prefix + name enforced |
| API handler return type | `api/handler.ts:65-213` | Correct — Response type supports streaming |
| SSE connection cleanup | `submissions/[id]/events/route.ts:531-548` | Correct — slot released on error |
| Compiler sandboxing | `compiler/execute.ts:323-519` | Correct — seccomp, no-new-privs, unprivileged user |
| Export redaction | `db/export.ts:103-105` | Correct — sanitized + always-redacted merged |
