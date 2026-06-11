# Cycle 51 — Security Reviewer

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** security-reviewer

## Inventory of Reviewed Files

- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/rate-limit.ts` (reference)
- `src/lib/security/rate-limiter-client.ts` (reference)
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
- `src/lib/security/sanitize-html.ts` (reference)
- `src/components/seo/json-ld.tsx` (reference)
- `src/components/problem-description.tsx` (reference)

## Findings

No new security findings this cycle.

### Carry-Over Confirmations

- **SEC-2:** Anti-cheat heartbeat LRU Date.now() dedup (LOW/LOW) — deferred, in-memory only, no DB consistency concern
- **SEC-3:** Anti-cheat copies user text content in `describeElement` (LOW/LOW) — deferred. The `handleCopy` and `handlePaste` handlers in `anti-cheat-monitor.tsx:215-225` capture element descriptions including text snippets (up to 80 chars). This is a privacy consideration, not a vulnerability.
- **SEC-4:** Docker build error leaks paths (LOW/LOW) — deferred

## Security Positive Observations

1. All SQL queries use parameterized inputs via Drizzle ORM or `rawQueryOne`/`rawQueryAll` — no SQL injection vectors.
2. `escapeLikePattern` is used consistently for LIKE/ILIKE queries in practice page and recruiting invitations.
3. CSP headers properly set with nonce-based script-src in `proxy.ts:192-204`.
4. HSTS properly configured with `max-age=31536000; includeSubDomains` for HTTPS requests.
5. Recruiting tokens stored as SHA-256 hashes, not plaintext — `hashToken(token)` at `recruiting-invitations.ts:25-27`.
6. Judge claim route uses `getDbNowUncached()` for DB-consistent timestamps — fixed in cycle 48.
7. API rate-limit header uses DB-consistent time via `rateLimitedResponse` — fixed in cycle 48.
8. No `eval`, `innerHTML`, or `document.cookie` auth patterns found.
9. `safeJsonForScript` properly escapes `</script` and `<!--` sequences.
10. `sanitizeHtml` used for all `dangerouslySetInnerHTML` and comment content.
11. No secrets or credentials in source code.
12. `safeTokenCompare` used for judge worker secret validation — timing-safe comparison.
13. Anti-cheat route validates user access before recording events (enrollment or access token check).
14. `redeemRecruitingToken` transaction uses atomic SQL `UPDATE ... WHERE status = 'pending'` to prevent race conditions.
