# Security Reviewer — Cycle 23

**Date:** 2026-04-24
**Scope:** Full repository deep security review

---

## S-1: [MEDIUM] `contestAccessTokens` lacks expiry mechanism — tokens valid forever

**Confidence:** MEDIUM
**Citations:** `src/app/api/v1/contests/[assignmentId]/access-code/route.ts`, schema `contest_access_tokens`

Contest access tokens created via the access-code flow do not have an expiration timestamp. Once a token is created for a user, they retain access indefinitely even after the contest ends and the assignment is archived. The access check in the anti-cheat route (`src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:51-56`) and stats route check enrollment OR access token, but never verify the token is still valid relative to the contest's deadline.

**Concrete failure scenario:** A student receives a contest access token for a 2-hour exam. The exam ends. The student can still use the token to access the anti-cheat event stream and stats endpoint indefinitely, as long as the token row exists in the database.

**Fix:** Add an `expiresAt` column to `contest_access_tokens` or check the assignment's deadline in the access verification queries.

---

## S-2: [LOW] `namedToPositional` regex-based parameter substitution could miss edge cases

**Confidence:** LOW
**Citations:** `src/lib/db/queries.ts:74`

The `namedToPositional` function uses a regex `/@(\w+)/g` to find named parameters. If a `@` appears inside a string literal in the SQL (e.g., in an email address `'user@example.com'`), the regex would incorrectly try to substitute `example` as a parameter name. The validation `!/^[a-zA-Z_]\w*$/.test(name)` would catch some cases but not all, and the error message would be confusing.

**Concrete failure scenario:** A developer writes a raw query with an email literal: `WHERE email = 'admin@judgekit.com'`. The regex matches `@judgekit` and tries to substitute `judgekit` as a parameter, throwing "Missing SQL parameter: judgekit".

**Fix:** Use a proper SQL tokenizer that understands string literals, or at minimum document that `@` in string literals must be avoided. In practice, all current queries use parameterized values for user input, so the risk is low.

---

## S-3: [LOW] Backup restore password verification uses constant-time comparison but no rate limit on the restore endpoint itself

**Confidence:** LOW
**Citations:** `src/app/api/v1/admin/restore/route.ts:34-58`

The restore endpoint requires the admin's password, which is verified against the stored bcrypt hash (constant-time via `verifyAndRehashPassword`). However, the `admin:restore` rate limit may not be restrictive enough for brute-force attempts. The default API rate limit is 30 requests per minute, which means an attacker with admin credentials but not the password could attempt 30 password guesses per minute.

**Concrete failure scenario:** An attacker obtains an admin session cookie (not the password). They can attempt to brute-force the restore endpoint's password check at 30 attempts/minute. With a strong 8+ character password, this is infeasible, but the rate limit should ideally be much lower for this destructive endpoint.

**Fix:** Add a specific, lower rate limit for the restore endpoint (e.g., 3 per minute) separate from the general API rate limit.

---

## Summary

- Total findings: 3
- MEDIUM: 1 (S-1)
- LOW: 2 (S-2, S-3)
