# Cycle 54 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 21db1921
**Reviewer:** security-reviewer

## Inventory of Reviewed Files

- `src/proxy.ts`
- `src/lib/auth/config.ts`
- `src/lib/security/api-rate-limit.ts`
- `src/lib/security/in-memory-rate-limit.ts`
- `src/lib/security/sanitize-html.ts`
- `src/lib/security/derive-key.ts`
- `src/lib/security/ip.ts`
- `src/lib/security/csrf.ts`
- `src/lib/assignments/recruiting-invitations.ts`
- `src/lib/assignments/exam-sessions.ts`
- `src/app/api/v1/submissions/[id]/events/route.ts`
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
- `src/app/api/v1/contests/quick-create/route.ts`
- `src/components/exam/anti-cheat-monitor.tsx`

## Findings

No new security findings this cycle. Delta from cycle 53 is a documentation-only commit (review + plan files).

### Carry-Over Confirmations

- **SEC-2 (cycle 43):** Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache (LOW/LOW) — deferred.
- **SEC-3:** Anti-cheat copies user text content up to 80 chars (LOW/LOW) — deferred.
- **SEC-4:** Docker build error leaks paths (LOW/LOW) — deferred.
- **SEC-5:** `atomicConsumeRateLimit` uses `Date.now()` in hot path (MEDIUM/MEDIUM) — deferred.

### Security Observations

1. XSS: `sanitizeHtml()` uses DOMPurify allowlist; `rel="noopener noreferrer"` enforced; `safeJsonForScript()` remains the only `dangerouslySetInnerHTML` surface.
2. SQL: Drizzle-parameterized queries throughout; `escapeLikePattern()` with `ESCAPE '\\'` covers LIKE surfaces.
3. Auth tokens: Recruiting tokens stored as SHA-256; atomic status+expiry guard on redemption UPDATE prevents TOCTOU.
4. Rate-limiting: IP, user, and endpoint tiers; login exponential backoff; proxy auth cache excludes negative results.
5. CSRF/CSP: Per-request CSP nonce; `frame-ancestors: 'none'`; HSTS on HTTPS.
6. Secrets: No hardcoded credentials; `RUNNER_AUTH_TOKEN` validated to be present in production config.
7. `src/lib/auth/config.ts` preserved as-is per CLAUDE.md deployment rule.
