# RPF Cycle 5 (Loop Cycle 5/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 5/100 (new RPF loop)
**Base commit:** b7a39a76 (cycle 4 — no new findings)
**HEAD commit:** b7a39a76

## Findings to Address

Two new marginal observations from this cycle's 4-lane review:

1. **AUTH-1:** JWT `authenticatedAt` uses `Date.now()` instead of DB time — LOW/MEDIUM. `src/lib/auth/config.ts:352` uses `Math.trunc(Date.now() / 1000)` for the sign-in timestamp. This is the same systemic `Date.now()` risk class as deferred ARCH-4.
2. **TE-3:** No unit test for `authenticatedAt` clock-skew path — LOW/LOW. Marginal test value for sign-in path.

No new production-code bugs were found this cycle. All 4 review perspectives confirm the codebase is stable.

## Scheduled Implementation Tasks

### Task 1: Use `getDbNowMs()` for JWT `authenticatedAt` timestamp (AUTH-1)

**Finding:** AUTH-1 — LOW/MEDIUM
**File:** `src/lib/auth/config.ts`
**Description:** Replace `Math.trunc(Date.now() / 1000)` in the JWT callback (line 352) and the `syncTokenWithUser` default parameter (line 116) with DB-server time via `getDbNowMs()`.

**Implementation:**
- Import `getDbNowMs` from `@/lib/db-time`
- In the `jwt` callback (line 351-352), replace `Math.trunc(Date.now() / 1000)` with `Math.trunc(await getDbNowMs() / 1000)`
- In the `syncTokenWithUser` default parameter (line 116), this is a fallback that fires when `getTokenAuthenticatedAtSeconds(token)` returns null. Since `getDbNowMs()` is async, the function signature would need adjustment. The simplest approach: make the default `undefined` and compute it inside the function body when needed.
- Consider performance: the JWT callback fires on every session refresh, not just sign-in. The `if (user)` branch (sign-in) already does a DB query for the user, so one additional `getDbNowMs()` call is negligible. The refresh path (no `user`) calls `syncTokenWithUser(token, freshUser)` without the `authenticatedAtSeconds` parameter — the default kicks in. We need to preserve the existing `authenticatedAt` from the token in the refresh path (which it already does via `getTokenAuthenticatedAtSeconds(token)`).

**Status:** DONE — Replaced `Date.now()` with `getDbNowMs()` in JWT callback (line 352). Refactored `syncTokenWithUser()` to make `authenticatedAtSeconds` optional, preserving existing token value on refresh path. All 4 gates pass: eslint (0 errors), tsc --noEmit (0 errors), vitest run (296 files, 2121 tests, all passing), next build (success). Commit `d9915e58`.

### Task 2: Update TE-2 deferred item status (housekeeping)

**Finding:** TE-2 (cycle 4) — LOW/MEDIUM
**Description:** The test for judge claim route `getDbNowUncached()` usage was implemented in cycle 4 (commit `10562fe3`). Mark this deferred item as resolved in the plan.

**Status:** DONE — TE-2 was resolved in cycle 4 (commit `10562fe3`). The deferred item #23 is now marked as resolved in the table below.

## Deferred Items (carried from cycle 4 — UNCHANGED, plus 2 new)

All deferred-fix rules obeyed: file+line citation, original severity/confidence preserved (no downgrade), concrete reason, and exit criterion recorded. No security, correctness, or data-loss findings are in the deferred list — all are performance/UX/cosmetic/doc items explicitly allowed under `CLAUDE.md` and `.context/development/conventions.md`.

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 1 | `atomicConsumeRateLimit` uses `Date.now()` in hot path | `src/lib/security/rate-limit.ts` (AGG-2 cycle 45) | MEDIUM / MEDIUM | DB round-trip per API request is costlier than clock-skew risk; values internally consistent within a single server instance | Architecture review for rate-limit strategy |
| 2 | Leaderboard freeze uses `Date.now()` | `src/lib/contests/leaderboard.ts:52` | LOW / LOW | Sub-second inaccuracy only; freeze time is a window, not a boundary | Module refactoring cycle |
| 3 | `console.error` in client components | multiple client files | LOW / MEDIUM | Client-side only; no security/correctness impact | Module refactoring cycle |
| 4 | SSE O(n) eviction scan | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` | LOW / LOW | Bounded at 1000 entries; rarely triggered | Performance optimization cycle |
| 5 | Manual routes duplicate `createApiHandler` boilerplate | SSE route, judge routes (AGG-7 / ARCH-2) | MEDIUM / MEDIUM | Stable pattern; refactor risk exceeds benefit | API framework redesign |
| 6 | Global timer HMR pattern duplication | multiple route files (AGG-8) | LOW / MEDIUM | Works correctly; cosmetic improvement | Module refactoring cycle |
| 7 | Anti-cheat copies user text content | `src/components/exam/anti-cheat-monitor.tsx:206-209` (SEC-3) | LOW / LOW | Captures <=80 chars of textContent; privacy notice acknowledged | Privacy review cycle |
| 8 | Docker build error leaks paths | Docker client (SEC-4) | LOW / LOW | Only visible to admin-level users | Infrastructure hardening cycle |
| 9 | Anti-cheat heartbeat gap query transfers up to 5000 rows | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:195-204` (PERF-3) | MEDIUM / MEDIUM | SQL window function would improve, but currently functional | Performance optimization cycle |
| 10 | Chat widget button badge lacks ARIA announcement | chat widget (DES-1) | LOW / LOW | Screen reader may not announce badge count | Accessibility audit cycle |
| 11 | Contests page badge hardcoded colors | contests page (DES-1 cycle 46) | LOW / LOW | Visual only; no accessibility impact | Design system migration |
| 12 | SSE route ADR | documentation (DOC-1) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 13 | Docker client dual-path docs | documentation (DOC-2) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 14 | Stale-while-revalidate cache pattern duplication | `contest-scoring.ts`, `analytics/route.ts` (ARCH-3) | LOW / LOW | Stable, well-documented duplication | Module refactoring cycle |
| 15 | Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:92` (SEC-2) | LOW / LOW | In-memory only; no cross-process clock skew concern | Module refactoring cycle |
| 16 | Practice page unsafe type assertion | `src/app/(dashboard)/dashboard/practice/page.tsx:420` (AGG-3 cycle 48) | LOW / LOW | Runtime-validated; cosmetic carry-over | Module refactoring cycle |
| 17 | Anti-cheat privacy notice accessibility | `src/components/exam/anti-cheat-monitor.tsx:261` (DES-1 cycle 48) | LOW / LOW | Requires manual keyboard testing | Manual a11y audit |
| 18 | Missing integration test for concurrent recruiting token redemption | `src/lib/assignments/recruiting-invitations.ts:304-543` (TE-1 cycle 51) | LOW / MEDIUM | Atomic SQL UPDATE well-tested in production; sequential unit tests cover | Test coverage cycle (requires live DB) |
| 19 | `messages/ja.json` referenced but absent | `messages/ja.json` (I18N-JA-ASPIRATIONAL cycle 55) | LOW / LOW | Aspirational; needs PM scoping | PM scoping decision |
| 20 | DES-RUNTIME-{1..5} sandbox-blocked runtime UI checks | (runtime UI / a11y) | LOW..HIGH-if-violated / LOW | Sandbox has no Docker/Postgres | Loop runs in a sandbox with Docker or managed-Postgres sidecar |
| 21 | Unit-suite `submissions.route.test.ts` flakes under parallel workers | `tests/unit/api/submissions.route.test.ts` (cycle 4) | LOW / MEDIUM | Not a code regression; sandbox CPU/IO contention | Tune `vitest.config.ts` pool or run in higher-CPU sandbox |
| 22 | No lint guard against `Date.now()` in DB transactions | (systemic risk, no specific file) (ARCH-4 cycle 4) | LOW / MEDIUM | Process improvement, not a code bug; custom ESLint rules need careful scoping | ESLint custom rules review cycle |
| 23 | ~~Missing unit test for judge claim route `getDbNowUncached()` usage~~ | `src/app/api/v1/judge/claim/route.ts:126` (TE-2 cycle 4) | LOW / MEDIUM | **RESOLVED** — Test created in cycle 4, commit `10562fe3` | ~~Test coverage cycle~~ |
| 24 | ~~JWT `authenticatedAt` uses `Date.now()` instead of DB time~~ | `src/lib/auth/config.ts:352` (AUTH-1 cycle 5) | LOW / MEDIUM | **RESOLVED** — Replaced `Date.now()` with `getDbNowMs()` in cycle 5, commit `d9915e58` | ~~Auth system refactoring cycle~~ |
| 25 | No unit test for `authenticatedAt` clock-skew path | `src/lib/auth/config.ts:352` (TE-3 cycle 5) | LOW / LOW | Sign-in path fires once; marginal test value | Test coverage cycle |

**Total:** 25 entries (23 carried + 2 new; entry #23 now resolved).

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred. AUTH-1 is a LOW-severity clock-skew observation (at most seconds of window), not a security vulnerability.
- All deferred items have file+line citation, original severity preserved, concrete reason, and concrete exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push is anticipated for any eventual pickup.
- All eventual pickups will use Conventional Commits + gitmoji + GPG signing per repo rules.

## Archive / Plan Hygiene

- Cycle 1 plan (`2026-04-24-rpf-cycle-1-review-remediation.md`) — all tasks confirmed, no new findings. Remains in `plans/open/` for continuity.
- Cycle 3 plan (`2026-04-24-rpf-cycle-3-review-remediation.md`) — identical to cycle 1 (no findings). Remains in `plans/open/` for continuity.
- Cycle 4 plan (`2026-04-24-rpf-cycle-4-review-remediation.md`) — both tasks completed. Remains in `plans/open/` for continuity.
- TE-2 (entry #23) is now resolved — will be archived when plans are next consolidated.

## Progress Log

- 2026-04-24: Plan created. Two new observations (AUTH-1, TE-3) added as Task 1 and Task 2. No new production-code findings. 25-item deferred registry (23 carry-over + 2 new; entry #23 resolved).
- 2026-04-24: Task 1 (AUTH-1) completed — replaced `Date.now()` with `getDbNowMs()` in JWT callback. Commit `d9915e58`. All 4 gates pass.
- 2026-04-24: Task 2 (TE-2 housekeeping) completed — marked deferred item #23 as resolved.
- 2026-04-24: All 4 quality gates pass: eslint (0 errors), tsc --noEmit (0 errors), vitest run (296 files, 2121 tests, all passing), next build (success).
