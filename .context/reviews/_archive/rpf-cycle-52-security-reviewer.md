# Cycle 52 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** security-reviewer

## Inventory of Reviewed Files

- `src/proxy.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/sanitize-html.ts` (full)
- `src/lib/security/derive-key.ts` (full)
- `src/lib/security/ip.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/components/seo/json-ld.tsx` (reference)
- `src/lib/seo.ts` (reference)

## Findings

No new security findings this cycle.

### Carry-Over Confirmations

- **SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache (LOW/LOW) — deferred. In-memory only; no cross-process clock skew concern.
- **SEC-3:** Anti-cheat copies user text content up to 80 chars (LOW/LOW) — deferred. Privacy risk is minimal.
- **SEC-4:** Docker build error leaks paths (LOW/LOW) — deferred. Only visible to admin-level users via judge API.
- **SEC-5:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred. DB round-trip per API request costlier than clock-skew risk.

### Security Observations

1. **XSS protection is solid:** `sanitizeHtml()` uses DOMPurify with a strict allowlist (no `div`/`span`/`class` attributes), URI regexp restricts to `https?`/`mailto`/root-relative, and `rel="noopener noreferrer"` is enforced on links. `sanitizeMarkdown()` strips null/control bytes. The `safeJsonForScript()` usage in `json-ld.tsx` is the only `dangerouslySetInnerHTML` usage, properly sanitized.

2. **SQL injection protection is solid:** All dynamic queries use Drizzle ORM parameterized queries. Raw SQL fragments use the `sql` template tag with proper parameter binding. LIKE patterns use `escapeLikePattern()` with `ESCAPE '\\'`. No string interpolation of user input into SQL.

3. **Auth token handling is solid:** Recruiting tokens are stored as SHA-256 hashes only; plaintext never persists. The `authorizeRecruitingToken` flow uses atomic SQL UPDATE with status + expiry check in a single WHERE clause to prevent TOCTOU races.

4. **Rate limiting is comprehensive:** IP-based, user-based, and endpoint-based rate limits. Login rate limiting uses exponential backoff for consecutive failures. The proxy cache has a 2-second TTL with negative-result exclusion (preventing cache-based user enumeration).

5. **CSRF protection:** CSP headers are set per-request with nonce-based `script-src`. `frame-ancestors: 'none'` prevents clickjacking. HSTS is set for HTTPS requests.

6. **No secrets in code:** `process.env` access is limited to well-defined, documented environment variables. No hardcoded credentials found. The `RUNNER_AUTH_TOKEN` is validated to be present in production.
