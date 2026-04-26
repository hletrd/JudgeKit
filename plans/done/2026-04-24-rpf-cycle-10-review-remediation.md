# RPF Cycle 10 (Loop Cycle 10/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 10/100 (current RPF loop)
**Base commit:** b6151c2a (cycle 9 — no new findings)
**HEAD commit:** b6151c2a

## Findings to Address

**No new findings to address this cycle.** Deep code review across all critical paths found no new issues. No source code has changed since cycle 9.

Per the PROMPT 2 rules, every finding must be either (a) scheduled for implementation, or (b) explicitly recorded as a deferred item. Since **this cycle produced zero new findings**, there is nothing to implement. The 21-item deferred registry from cycle 4 is carried forward intact (no additions, no removals, no severity downgrades).

### Refinement to Deferred Item #1

The `atomicConsumeRateLimit` ↔ `checkServerActionRateLimit` time source inconsistency within `src/lib/security/api-rate-limit.ts` (lines 56 vs 223) makes deferred item #1's impact more concrete: it is not just clock skew vs DB round-trip, but also internal consistency within the same module. The severity (MEDIUM) and recommended fix (use `getDbNowUncached()`) remain unchanged. No implementation change to the deferred item — this is additional context only.

## Verified Prior Fixes (from old loop, confirmed this cycle)

| ID | Finding | Status | Evidence |
|----|---------|--------|----------|
| F1 | `json_extract()` SQLite function in PostgreSQL path | FIXED | Grep returns no matches |
| F2 | `DELETE ... LIMIT` invalid PostgreSQL syntax | FIXED | All use `ctid IN (SELECT ctid ... LIMIT)` |
| CR9-CR1 | Auth field mapping duplication across 3 locations | FIXED | `mapUserToAuthFields()` centralizes |
| CR9-SR1 | SSE re-auth race — fire-and-forget allows one more event | FIXED | Re-auth awaits before processing |
| CR9-SR3 | Tags route lacks rate limiting | FIXED | Uses `createApiHandler` with `rateLimit: "tags:read"` |

## Scheduled Implementation Tasks

*(none this cycle)*

## Deferred Items (carried from cycle 4 — UNCHANGED)

All deferred-fix rules obeyed: file+line citation, original severity/confidence preserved (no downgrade), concrete reason, and exit criterion recorded. No security, correctness, or data-loss findings are in the deferred list — all are performance/UX/cosmetic/doc items explicitly allowed under `CLAUDE.md` and `.context/development/conventions.md`.

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 1 | `atomicConsumeRateLimit` uses `Date.now()` in hot path | `src/lib/security/rate-limit.ts` (AGG-2 cycle 45) | MEDIUM / MEDIUM | DB round-trip per API request is costlier than clock-skew risk | Architecture review for rate-limit strategy |
| 2 | Leaderboard freeze uses `Date.now()` | `src/lib/assignments/leaderboard.ts:52` | LOW / LOW | Sub-second inaccuracy only | Module refactoring cycle |
| 3 | `console.error` in client components | multiple client files | LOW / MEDIUM | Client-side only; no security/correctness impact | Module refactoring cycle |
| 4 | SSE O(n) eviction scan | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` | LOW / LOW | Bounded at 1000 entries | Performance optimization cycle |
| 5 | Manual routes duplicate `createApiHandler` boilerplate | SSE route, judge routes (AGG-7 / ARCH-2) | MEDIUM / MEDIUM | Stable pattern; refactor risk exceeds benefit | API framework redesign |
| 6 | Global timer HMR pattern duplication | multiple route files (AGG-8) | LOW / MEDIUM | Works correctly; cosmetic improvement | Module refactoring cycle |
| 7 | Anti-cheat copies user text content | `src/components/exam/anti-cheat-monitor.tsx:206-209` (SEC-3) | LOW / LOW | Captures <=80 chars; privacy notice acknowledged | Privacy review cycle |
| 8 | Docker build error leaks paths | Docker client (SEC-4) | LOW / LOW | Only visible to admin-level users | Infrastructure hardening cycle |
| 9 | Anti-cheat heartbeat gap query transfers up to 5000 rows | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:195-204` (PERF-3) | MEDIUM / MEDIUM | Currently functional | Performance optimization cycle |
| 10 | Chat widget button badge lacks ARIA announcement | chat widget (DES-1) | LOW / LOW | Screen reader may not announce badge count | Accessibility audit cycle |
| 11 | Contests page badge hardcoded colors | contests page (DES-1 cycle 46) | LOW / LOW | Visual only | Design system migration |
| 12 | SSE route ADR | documentation (DOC-1) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 13 | Docker client dual-path docs | documentation (DOC-2) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 14 | Stale-while-revalidate cache pattern duplication | `contest-scoring.ts`, `analytics/route.ts` (ARCH-3) | LOW / LOW | Stable, well-documented duplication | Module refactoring cycle |
| 15 | Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:92` (SEC-2) | LOW / LOW | In-memory only | Module refactoring cycle |
| 16 | Practice page unsafe type assertion | `src/app/(dashboard)/dashboard/practice/page.tsx:420` (AGG-3 cycle 48) | LOW / LOW | Runtime-validated | Module refactoring cycle |
| 17 | Anti-cheat privacy notice accessibility | `src/components/exam/anti-cheat-monitor.tsx:261` (DES-1 cycle 48) | LOW / LOW | Requires manual keyboard testing | Manual a11y audit |
| 18 | Missing integration test for concurrent recruiting token redemption | `src/lib/assignments/recruiting-invitations.ts:304-543` (TE-1 cycle 51) | LOW / MEDIUM | Atomic SQL UPDATE well-tested in production | Test coverage cycle |
| 19 | `messages/ja.json` referenced but absent | `messages/ja.json` | LOW / LOW | Aspirational; needs PM scoping | PM scoping decision |
| 20 | DES-RUNTIME-{1..5} sandbox-blocked runtime UI checks | (runtime UI / a11y) | LOW..HIGH-if-violated / LOW | Sandbox has no Docker/Postgres | Sandbox with Docker or Postgres sidecar |
| 21 | Unit-suite `submissions.route.test.ts` fails under parallel vitest workers | `tests/unit/api/submissions.route.test.ts:212-228` (cycle 4) | LOW / MEDIUM | Not a code regression; sandbox CPU/IO contention | Tune vitest pool or higher-CPU sandbox |

**Total:** 21 entries.

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred.
- All deferred items have file+line citation, original severity preserved, concrete reason, and exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push anticipated.

## Progress Log

- 2026-04-24: Plan created. Zero new production-code findings this cycle. 21-item deferred registry carried forward unchanged. 5 prior fixes from old loop verified as present in current codebase. Refinement to deferred item #1 recorded (time source inconsistency within `api-rate-limit.ts`).
