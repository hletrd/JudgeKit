# Cycle 53 — Security Reviewer

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
- `src/lib/security/csrf.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)

## Findings

No new security findings this cycle.

### Carry-Over Confirmations

- **SEC-2 (from cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache (LOW/LOW) — deferred. In-memory only; no cross-process clock skew concern.
- **SEC-3:** Anti-cheat copies user text content up to 80 chars (LOW/LOW) — deferred.
- **SEC-4:** Docker build error leaks paths (LOW/LOW) — deferred.
- **SEC-5:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred.

### Security Observations

1. XSS: `sanitizeHtml()` uses DOMPurify allowlist; `rel="noopener noreferrer"` enforced; `safeJsonForScript()` is the only `dangerouslySetInnerHTML` surface.
2. SQL: All dynamic queries are parameterized via Drizzle. LIKE patterns escape via `escapeLikePattern()` with `ESCAPE '\\'`.
3. Auth tokens: Recruiting tokens stored as SHA-256 only; atomic SQL UPDATE on (status, expiry) prevents TOCTOU.
4. Rate-limiting: IP, user, and endpoint tiers; login exponential backoff; proxy cache 2s TTL excludes negative results.
5. CSRF/CSP: Per-request CSP nonce; `frame-ancestors: 'none'`; HSTS on HTTPS.
6. Secrets: No hardcoded credentials; `RUNNER_AUTH_TOKEN` validated to be present in production config.
