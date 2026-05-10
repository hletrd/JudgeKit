# Security Reviewer — Cycle 29

**Date:** 2026-05-09
**Cycle:** 29 of 100
**Base commit:** 81c5daa8
**Current HEAD:** 81c5daa8 (clean working tree)

---

## New Findings

### C29-SEC-1: Recruiting token length unbounded — DoS vector

- **File:** `src/lib/auth/config.ts:208`
- **Cross-reference:** C29-CR-1
- **Severity:** Medium
- **Confidence:** High
- **Summary:** The recruiting token validation regex `/^[-A-Za-z0-9_]{16,}$/` has no upper bound. An attacker can send an arbitrarily long token causing memory exhaustion before regex rejection. This is a denial-of-service vector against the login endpoint.
- **Fix:** Add upper bound: `/^[-A-Za-z0-9_]{16,128}$/`.

### C29-SEC-2: Rate limit key collision for shared auth tokens

- **File:** `src/app/api/v1/judge/claim/route.ts:87-94`
- **Severity:** Low
- **Confidence:** Medium
- **Summary:** When neither workerId nor clientIp is available, rate limit scope falls back to a hash of the Authorization header. Workers sharing the same JUDGE_AUTH_TOKEN share a rate-limit bucket.
- **Impact:** Intentional design per comment, but could cause fairness issues.

---

## Carry-Forward Findings

### C27-SEC-1: Type-unsafe cast in Docker inspect
- **File:** `src/app/api/v1/admin/docker/images/route.ts:30`
- **Status:** Still present.

### C27-SEC-2: DELETE Docker image audit gap
- **File:** `src/app/api/v1/admin/docker/images/route.ts:129-135`
- **Status:** Still present.

### C27-SEC-3: Prompt injection sanitization gap
- **File:** `src/lib/judge/prompt-sanitization.ts:12`
- **Status:** Still present.

---

## Verified Secure (no change)

- SQL parameterization via `namedToPositional` with proper validation
- Auth: Argon2id, timing-safe dummy hash, token invalidation
- CSP, HSTS, CSRF protections robust
- Docker: path validation, array-based spawn
- File upload: MIME validation, magic bytes, ZIP bomb protection
- Rate limiting: Two-tier DB-backed
