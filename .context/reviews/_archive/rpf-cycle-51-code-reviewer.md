# Cycle 51 — Code Reviewer

**Date:** 2026-04-23
**Base commit:** 778a019f
**Reviewer:** code-reviewer

## Inventory of Reviewed Files

- `src/lib/assignments/recruiting-invitations.ts` (full)
- `src/lib/assignments/contest-scoring.ts` (full)
- `src/lib/assignments/leaderboard.ts` (full)
- `src/lib/assignments/exam-sessions.ts` (full)
- `src/lib/assignments/participant-status.ts` (full)
- `src/lib/assignments/scoring.ts` (full)
- `src/lib/realtime/realtime-coordination.ts` (full)
- `src/lib/security/api-rate-limit.ts` (full)
- `src/lib/security/in-memory-rate-limit.ts` (full)
- `src/lib/data-retention.ts` (full)
- `src/proxy.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts` (full)
- `src/app/api/v1/submissions/[id]/events/route.ts` (full)
- `src/app/api/v1/judge/claim/route.ts` (full)
- `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` (full)
- `src/app/(public)/practice/page.tsx` (full)
- `src/components/exam/anti-cheat-monitor.tsx` (full)
- `src/lib/db-time.ts` (reference)

Pattern searches: `Map.get()!`, `as any`, `innerHTML`, `eval()`, `Date.now()` in server code, `console.error` in client components, `dangerouslySetInnerHTML`, `catch {}`, `sanitizeHtml`, `safeJsonForScript`.

## Findings

No new findings this cycle. The codebase remains stable with all prior fixes intact.

### Carry-Over Confirmations

- **CR-1:** Stale-while-revalidate cache pattern duplication between contest-scoring and analytics route (LOW/MEDIUM) — deferred
- **Console.error in client components** (LOW/MEDIUM) — deferred. 20+ instances found in discussion, compiler, group, problem, and submission client components. These should use the `logger` utility or structured error reporting instead of raw `console.error`, but the risk is low (informational only).
- **Manual routes duplicate createApiHandler boilerplate** (MEDIUM/MEDIUM) — deferred. SSE route (`submissions/[id]/events`) is the primary example with manual auth/check logic.
- **Global timer HMR pattern duplication** (LOW/MEDIUM) — deferred. SSE cleanup timer uses `globalThis.__sseCleanupTimer` pattern.
- **Practice page unsafe type assertion** (LOW/LOW) — deferred. `const uid = userId!` on line 420 of practice/page.tsx is guarded by the surrounding `if` condition but uses a non-null assertion instead of a type-safe narrow.

## Sweep Notes

- No `Map.get()!` patterns found — all previously fixed.
- No `as any` casts found in server code.
- No `innerHTML` or `eval()` usage.
- `dangerouslySetInnerHTML` used exactly twice: `json-ld.tsx` (with `safeJsonForScript`) and `problem-description.tsx` (with `sanitizeHtml`) — both properly sanitized.
- All `Date.now()` uses in server code fall into documented categories (in-memory caches, client-side code, deferred hot-path, health/ops, single-process coordination).
- The ICPC tie-breaker fix from cycle 49 (deterministic userId sort) is verified in place at `contest-scoring.ts:358`.
- The `redeemRecruitingToken` transaction properly uses `getDbNowUncached()` for all DB-consistent timestamps.
- The `exam-sessions.ts` uses `rawQueryOne("SELECT NOW()")` for DB-consistent time — correct.
