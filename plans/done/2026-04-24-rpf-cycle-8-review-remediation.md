# RPF Cycle 8 (Loop Cycle 8/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 8/100 (new RPF loop)
**Base commit:** c5644a05 (cycle 7 — all tasks completed)
**HEAD commit:** c5644a05

## Findings to Address

This cycle found **0 new findings** across 11 review agents. The codebase remains in a stable, mature state with no production code changes since cycle 7.

## Scheduled Implementation Tasks

**None.** No new findings require implementation.

## Deferred Items

### Carry-Over Deferred Items (28 active — unchanged from cycle 7)

All 28 deferred items from cycle 7 remain active with original severity/confidence preserved. No items were upgraded or downgraded this cycle.

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 1 | `atomicConsumeRateLimit` uses `Date.now()` | `src/lib/security/api-rate-limit.ts:56` (AGG-2) | MEDIUM / MEDIUM | Internally consistent within single instance; multi-instance clock skew is the real risk | Multi-instance deployment or clock-skew audit |
| 2 | Leaderboard freeze uses `Date.now()` | `src/lib/assignments/leaderboard.ts:52` | LOW / LOW | Freeze timing not security-critical; window is typically minutes/hours | Precision timing requirement |
| 3 | `console.error` in client components | multiple files (AGG-5/8) | LOW / MEDIUM | Client-side only; no security/correctness impact | Module refactoring cycle |
| 4 | SSE O(n) eviction scan | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` (AGG-6) | LOW / LOW | Bounded at 1000 entries; rarely at capacity | Performance optimization cycle |
| 5 | In-memory rate limit O(n log n) eviction | `src/lib/security/in-memory-rate-limit.ts:41-47` (AGG-4) | LOW / LOW | Bounded at 10000 entries; inline sort only on overflow | Performance optimization cycle |
| 6 | Manual routes duplicate `createApiHandler` | multiple files (AGG-7/ARCH-2) | MEDIUM / MEDIUM | SSE/backup/restore have legitimate reasons for custom handling | API framework enhancement cycle |
| 7 | Global timer HMR pattern duplication | multiple files (AGG-8) | LOW / MEDIUM | Pattern is correct; only the duplication is an issue | Utility extraction cycle |
| 8 | Practice page unsafe type assertion | `src/app/(public)/practice/problems/[id]/page.tsx` (AGG-3/c48) | LOW / LOW | Narrow type assertion; runtime behavior is correct | Type safety improvement cycle |
| 9 | Anti-cheat heartbeat dedup uses `Date.now()` | `src/lib/security/in-memory-rate-limit.ts` (SEC-2) | LOW / LOW | In-memory cache resets on process restart; acceptable trade-off | Shared coordination migration |
| 10 | Anti-cheat copies user text content | `src/components/exam/anti-cheat-monitor.tsx` (SEC-3) | LOW / LOW | By design for plagiarism detection; documented | Privacy review cycle |
| 11 | Docker build error leaks paths | `src/lib/compiler/execute.ts` (SEC-4) | LOW / LOW | Only visible to admin users; build paths not sensitive | Error message sanitization cycle |
| 12 | Anti-cheat heartbeat gap query 5000 rows | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:195-204` (PERF-3) | MEDIUM / MEDIUM | Bounded at 5000 rows; could be significant for very long contests | Query optimization cycle |
| 13 | Chat widget badge lacks ARIA | `src/components/plugins/chat-widget-loader.tsx` (DES-1) | LOW / LOW | Badge count change not announced to screen readers | Accessibility audit cycle |
| 14 | Contests page badge hardcoded colors | multiple files (DES-1/c46) | LOW / LOW | Badge colors don't adapt to dark mode in all cases | Dark mode audit cycle |
| 15 | Anti-cheat privacy notice accessibility | `src/components/exam/anti-cheat-monitor.tsx` (DES-1/c48) | LOW / LOW | Accept button focus management could be improved | Accessibility audit cycle |
| 16 | SSE route ADR missing | `src/app/api/v1/submissions/[id]/events/route.ts` (DOC-1) | LOW / LOW | No architecture decision record for SSE polling design | Documentation cycle |
| 17 | Docker client dual-path docs | `src/lib/docker/client.ts` (DOC-2) | LOW / LOW | Relationship with compiler execute module unclear | Documentation cycle |
| 18 | Stale-while-revalidate cache duplication | `src/lib/system-settings-config.ts` etc. (ARCH-3) | LOW / LOW | Three modules implement similar cache pattern | Utility extraction cycle |
| 19 | Missing concurrent recruiting token test | `tests/` (TE-1/c51) | LOW / MEDIUM | Atomic SQL handles it; test would validate under load | Test coverage cycle |
| 20 | `messages/ja.json` absent | `messages/` (I18N-JA) | LOW / LOW | Japanese localization not yet implemented | Localization cycle |
| 21 | Blocked-by-sandbox runtime findings | `DES-RUNTIME-{1..5}/c55` | LOW..HIGH / if-violated | Constraints documented for sandbox runtime | Sandbox runtime review |
| 22 | vitest unit parallel-contention flakes | `tests/` (#21) | LOW / MEDIUM | Flaky tests under parallel execution | Test infrastructure cycle |
| 23 | No lint guard against `Date.now()` in DB transactions | `src/` (ARCH-4/c4) | LOW / MEDIUM | Would catch future clock-skew introductions | Lint rule addition cycle |
| 24 | No unit test for `authenticatedAt` clock-skew | `tests/` (TE-3/c5) | LOW / LOW | Code path is simple; test would document expected behavior | Test coverage cycle |
| 25 | No test for participant-status time boundaries | `src/lib/assignments/participant-status.ts` (AGG-6/c7) | LOW / MEDIUM | Functions accept injectable `now` param; correct design | Test coverage cycle |
| 26 | `console.error`/`console.warn` in 19 client components | multiple files (AGG-8/c7) | LOW / HIGH | Client-side only; no security/correctness impact | Module refactoring cycle |
| 27 | Dual rate-limiting module documentation | `src/lib/security/rate-limit*.ts` (AGG-9/c7) | LOW / MEDIUM | Advisory; no code change needed | Documentation cycle |
| 28 | SSE connection tracking O(n) eviction (new numbering) | `src/app/api/v1/submissions/[id]/events/route.ts` (AGG-3/c7) | LOW / LOW | Bounded at 1000 entries | Performance optimization cycle |

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred. All MEDIUM+ security/correctness items from prior cycles have been implemented.
- All deferred items have file+line citation, original severity preserved, concrete reason, and concrete exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push anticipated.

## Progress Log

- 2026-04-24: Plan created. 0 new tasks scheduled. 28 carry-over deferred items. No new findings this cycle.
