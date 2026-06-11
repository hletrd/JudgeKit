# Cycle 50 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 6463cdda
**Reviewer:** security-reviewer

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (full)
- `src/lib/security/rate-limiter-client.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/ip.ts` (reference)
- `src/proxy.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/lib/data-retention.ts` (full)
- `src/lib/auth/config.ts` (partial)

## Findings

No new security findings this cycle.

### Carry-Over Confirmations

- SEC-2: Anti-cheat heartbeat LRU Date.now() dedup (LOW/LOW) — deferred, in-memory only
- SEC-3: Anti-cheat copies user text content (LOW/LOW) — deferred
- SEC-4: Docker build error leaks paths (LOW/LOW) — deferred
- `atomicConsumeRateLimit` Date.now() in hot path (MEDIUM/MEDIUM) — deferred for performance

## Security Positive Observations

1. All SQL queries use parameterized inputs via Drizzle ORM or `rawQueryOne`/`rawQueryAll`
2. `escapeLikePattern` is used consistently for LIKE queries
3. CSP headers properly set with nonce-based script-src
4. HSTS properly configured
5. Recruiting tokens stored as SHA-256 hashes, not plaintext
6. Judge claim route now uses `getDbNowUncached()` for DB-consistent timestamps (fixed cycle 48)
7. API rate-limit header now uses DB-consistent time (fixed cycle 48)
8. No `eval`, `innerHTML`, or `document.cookie` auth patterns found
9. `safeJsonForScript` properly escapes `</script` and `<!--` sequences
10. No secrets or credentials in source code
