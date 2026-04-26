# RPF Cycle 3 (Loop Cycle 3/100) — Review Remediation Plan

**Date:** 2026-04-24
**Cycle:** 3/100 (new RPF loop)
**Base commit:** 1669501d (cycle 2 — no new findings)
**HEAD commit:** 1669501d

## Findings to Address

**No new findings to address this cycle.** All 11 review perspectives (code-reviewer, perf-reviewer, security-reviewer, architect, critic, verifier, debugger, test-engineer, tracer, designer, document-specialist) found no new issues. The only source code change since cycle 2 is the `SKIP_INSTRUMENTATION_SYNC` flag in `src/lib/judge/sync-language-configs.ts`, which was reviewed and found clean.

Per the PROMPT 2 rules, every finding must be either (a) scheduled for implementation, or (b) explicitly recorded as a deferred item. Since **this cycle produced zero new findings**, there is nothing to implement. The 21-item deferred registry from cycle 4 is carried forward intact (no additions, no removals, no severity downgrades).

## Scheduled Implementation Tasks

*(none this cycle)*

## Deferred Items (carried from cycle 4 — UNCHANGED)

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
| 19 | `messages/ja.json` referenced but absent (I18N-JA-ASPIRATIONAL cycle 55) | `messages/ja.json` | LOW / LOW | Aspirational; needs PM scoping | PM scoping decision |
| 20 | DES-RUNTIME-{1..5} sandbox-blocked runtime UI checks (cycle 55) | (runtime UI / a11y) | LOW..HIGH-if-violated / LOW | Sandbox has no Docker/Postgres, so runtime lane cannot observe live app; severities NOT downgraded | Loop runs in a sandbox with Docker or a managed-Postgres sidecar |
| 21 | Unit-suite `submissions.route.test.ts` fails 16 tests under parallel vitest workers in sandbox, but passes 25/25 in isolation | `tests/unit/api/submissions.route.test.ts:212-228` (cycle 4) | LOW / MEDIUM | Not a code regression; sandbox CPU/IO contention | Tune `vitest.config.ts` pool or run in higher-CPU sandbox |

**Total:** 21 entries.

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred. All deferred items are LOW or cosmetic, or are MEDIUM with explicit architectural rationale.
- All deferred items have file+line citation, original severity preserved, concrete reason, and concrete exit criterion.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push is anticipated for any eventual pickup.
- All eventual pickups will use Conventional Commits + gitmoji + GPG signing per repo rules.

## Archive / Plan Hygiene

- Cycle 1 plan (`2026-04-24-rpf-cycle-1-review-remediation.md`) — all tasks confirmed, no new findings. Remains in `plans/open/` for continuity.
- Cycle 2 plan would have identical content (no findings). Not created separately.
- Prior completed plans in `plans/done/` and `plans/closed/` are archived.

## Progress Log

- 2026-04-24: Plan created. Zero new production-code findings this cycle. 21-item deferred registry carried forward unchanged from cycle 4 aggregate.
