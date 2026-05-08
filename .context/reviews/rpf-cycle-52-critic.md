# Cycle 52 — Critic

**Date:** 2026-04-23
**Base commit:** 1117564e
**Reviewer:** critic

## Inventory of Reviewed Files

- `src/proxy.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/security/sanitize-html.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/auth/config.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/contests/quick-create/route.ts` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)

## Findings

No new findings this cycle. The codebase has reached a mature, stable state after 52 cycles of deep review.

### Multi-Perspective Critique

**Correctness:** All critical paths use DB server time for temporal comparisons. The recruiting token redemption flow uses atomic SQL UPDATE with status + expiry check in a single WHERE clause. The exam session start uses DB time within the transaction. The leaderboard freeze uses `Date.now()` against a DB-sourced `freezeLeaderboardAt` — this is the known carry-over AGG-2, deferred as LOW/LOW.

**Security:** XSS, SQL injection, CSRF, and auth token handling are all solid. No secrets in code. Rate limiting is comprehensive with IP, user, and endpoint dimensions.

**Performance:** The shared SSE polling, O(1) user connection counts, and stale-while-revalidate caching are well-designed. The known MEDIUM/MEDIUM items (atomicConsumeRateLimit Date.now(), heartbeat gap 5000-row transfer) are appropriately deferred.

**Maintainability:** The `buildIoiLatePenaltyCaseExpr` extraction prevents scoring logic drift between contest-scoring.ts and leaderboard.ts. The `mapUserToAuthFields` function prevents field-list drift across JWT callbacks. The stale-while-revalidate pattern is duplicated but well-documented.

**Privacy:** The anti-cheat text content capture (up to 80 chars) is the known SEC-3 carry-over. The privacy notice dialog in anti-cheat-monitor.tsx properly informs users before monitoring begins.

### Carry-Over Confirmations

All 17 deferred items from prior cycles remain valid and properly documented with file+line citations, original severity/confidence (not downgraded), concrete reasons, and exit criteria.
