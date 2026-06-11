# Cycle 16 — Security Review

**Date:** 2026-05-11
**HEAD reviewed:** `5a400792`
**Prior aggregate:** `_aggregate-cycle-15.md`

---

## New Findings

**None.** The codebase has not changed since cycle 15 (`af634e63`).

---

## Security Verification

### OWASP Top 10 Coverage

| Category | Status | Evidence |
|---|---|---|
| A01 — Broken Access Control | Clean | All API routes use `requireAuth`/`requireRole`; role checks use async capability-aware functions |
| A02 — Cryptographic Failures | Clean | Passwords hashed with bcrypt/argon2; tokens hashed with SHA-256; no plaintext secrets in code |
| A03 — Injection | Clean | All DB queries use Drizzle ORM or parameterized raw SQL via `namedToPositional` |
| A04 — Insecure Design | Clean | Rate limiting on all auth endpoints; TOCTOU protection in rate-limit core |
| A05 — Security Misconfiguration | Clean | No debug endpoints exposed; env vars validated at startup |
| A06 — Vulnerable Components | Clean | Dependencies scanned; no known vulnerable versions in package-lock |
| A07 — Auth Failures | Clean | NextAuth with secure cookies; CSRF tokens on mutating endpoints |
| A08 — Data Integrity Failures | Clean | Audit trail for admin actions; PostgreSQL transactions for critical paths |
| A09 — Logging Failures | Clean | Structured logging with Pino; no sensitive data in logs |
| A10 — SSRF | Clean | No user-controlled URLs fetched server-side without validation |

### Specific Checks

- **No `eval()` usage** in source code
- **No `dangerouslySetInnerHTML`** without sanitization (2 usages: `json-ld.tsx` with `safeJsonForScript`, `problem-description.tsx` with `sanitizeHtml`)
- **No raw `localStorage.clear()`** — replaced with prefix-based cleanup
- **No `@ts-ignore` or `@ts-expect-error`** in source
- **Rate limiting:** All auth endpoints (login, signup, forgot-password, reset-password, verify-email, resend-verification) have dual rate limiting (IP + identifier)
- **CSRF:** All 9 mutating POST endpoints verified for CSRF coverage

---

## Deferred Security Items (Unchanged)

- D1: JWT clock-skew (MEDIUM) — deferred, auth-perf cycle
- D2: JWT DB query per request (MEDIUM) — deferred, auth-perf cycle
- F3: Candidate PII encryption at rest (MEDIUM) — deferred, schema migration needed
