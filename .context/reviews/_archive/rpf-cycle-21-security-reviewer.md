# Security Review — RPF Cycle 21

**Reviewer:** security-reviewer
**Date:** 2026-04-24
**Scope:** Full repository, OWASP top 10, auth/authz, secrets, unsafe patterns

---

## S-1: [MEDIUM] Anti-cheat heartbeat dedup uses `Date.now()` — clock-skew bypasses rate limiting

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:92-96`
**Confidence:** HIGH

(Same root cause as CR-1, but security angle.)

If the app server clock is behind the DB clock, a student could send heartbeats more frequently than the intended 60-second interval. The `Date.now()` check on the app server would think more time has passed than the DB records, allowing faster-than-intended heartbeat insertion. While heartbeats are not directly exploitable, the pattern is a precedent: other in-memory rate-limiting that uses `Date.now()` for boundary checks could have similar clock-skew bypass issues.

The in-memory rate limiter in `src/lib/security/in-memory-rate-limit.ts` also uses `Date.now()` for all its checks. However, that module is used for login rate limiting where the window is much larger (minutes), making small clock skew less impactful. The anti-cheat heartbeat case is more sensitive because the 60-second window is small.

**Fix:** Same as CR-1 — use the DB `now` value already fetched on line 67 for the heartbeat dedup comparison.

---

## S-2: [LOW] `decrypt()` with `allowPlaintextFallback: true` in hcaptcha verification

**File:** `src/lib/security/hcaptcha.ts:23`
**Confidence:** MEDIUM

The hcaptcha verification calls `decrypt(hcaptchaSecret, { allowPlaintextFallback: true })`. While this is needed for backward compatibility during migration from plaintext to encrypted storage, the `allowPlaintextFallback` option means that if an attacker can write a plaintext value to the `hcaptchaSecret` column (e.g., via a SQL injection or a restore from a tampered backup), the `decrypt()` function would return it without verification. The production default for `allowPlaintextFallback` is `false`, so the explicit `true` override weakens this defense.

The system already logs a warning in production when a plaintext value is encountered. However, the warning is at `logger.warn` level, which may not be monitored in all deployments.

**Fix:** This is a known migration tradeoff. Consider adding a startup check that verifies all `hcaptchaSecret` values in the DB are encrypted (start with `enc:`), and refuse to start if any plaintext values are found in production mode.

---

## S-3: [LOW] Recruiting validate endpoint is unauthenticated — token hash could be brute-forced

**File:** `src/app/api/v1/recruiting/validate/route.ts:9-68`
**Confidence:** LOW

The `/api/v1/recruiting/validate` endpoint does not require authentication (no `auth` in the handler config). It is rate-limited, which mitigates brute-force attacks. However, the rate limit key is `recruiting:validate`, which is a shared key — a determined attacker could use multiple IPs to exceed the per-IP limit. The token is SHA-256 hashed, making preimage attacks infeasible, but the endpoint leaks whether a token is valid, revoked, or expired through the uniform `{ data: { valid: true/false } }` response (which is good).

The rate limiting appears adequate for the threat model. No change needed, but documenting for awareness.

---

## Positive Security Observations

- CSRF protection is robust: `X-Requested-With` header + `Sec-Fetch-Site` + Origin validation
- IP extraction uses hop-based XFF validation with `TRUSTED_PROXY_HOPS`
- API key authentication uses SHA-256 hashing with domain-separated HKDF encryption
- Password verification includes timing-safe comparison with dummy hash for non-existent users
- Backup/restore requires password re-confirmation
- All temporal boundary checks in contest/exam flows use DB server time
- Export redaction maps are now complete (hcaptchaSecret added in cycle 19)
- File path traversal is prevented in `resolveStoredPath()`
- CSP headers are properly configured with nonce-based script-src
