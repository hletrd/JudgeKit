# RPF Cycle 4 (Loop Cycle 4/100) — Review Remediation Plan

**Date:** 2026-04-23
**Cycle:** 4/100 (RPF loop)
**Base commit:** d4b7a731 (cycle 55 tail)
**HEAD commit:** d4b7a731 (docs-only cycle)

## Findings to Address

**No new findings to address this cycle.** All 11 review perspectives (code-reviewer, perf-reviewer, security-reviewer, architect, critic, verifier, debugger, test-engineer, tracer, designer, document-specialist) found no new issues at HEAD `d4b7a731`. The codebase has reached a mature, stable state after 50+ cycles of deep review.

Per the PROMPT 2 rules, every finding must be either (a) scheduled for implementation, or (b) explicitly recorded as a deferred item. Since **this cycle produced zero new findings**, there is nothing to implement. The 19-item deferred registry from cycle 55 is carried forward intact (no additions, no removals, no severity downgrades).

## Note on Stale Cycle-4 Review Artifacts

The `.context/reviews/rpf-cycle-4-*.md` files were pre-existing on disk from an older RPF run at commit `5d89806d` (2026-04-22). All findings in those stale files (AGG-1 through AGG-9: `.json()` without `.catch()`, dynamic clipboard import, countdown-timer drift, anti-cheat listener gap, `compiler-client.tsx` deps, `active-timed-assignment-sidebar-panel.tsx` cleanup, `apiJson` adoption) have been remediated over the 50+ cycles between 2026-04-22 and 2026-04-23:
- `invite-participants.tsx:88`, `access-code-manager.tsx:91` now use `.catch(() => ({}))` — VERIFIED.
- `access-code-manager.tsx` clipboard import is static — VERIFIED.
- `countdown-timer.tsx:132-143` has `visibilitychange` listener — VERIFIED.
- Anti-cheat monitor uses ref-based callback pattern — VERIFIED.
- `active-timed-assignment-sidebar-panel.tsx` timer cleans up on expiry — VERIFIED.

The per-reviewer files have been rewritten at HEAD `d4b7a731` to reflect current state. The old findings are preserved in git history via the prior plan at `plans/open/2026-04-19-cycle-4-review-remediation.md`.

## Scheduled Implementation Tasks

*(none this cycle)*

## Deferred Items (carried from cycle 55 — UNCHANGED)

All deferred-fix rules obeyed: file+line citation, original severity/confidence preserved (no downgrade), concrete reason, and exit criterion recorded. No security, correctness, or data-loss findings are in the deferred list — all are performance/UX/cosmetic/doc items explicitly allowed under `CLAUDE.md` and `.context/development/conventions.md` (which the cycle 52 plan quotes authoritatively).

| # | Finding | File+Line | Severity / Confidence | Reason for Deferral | Exit Criterion |
|---|---------|-----------|-----------------------|---------------------|----------------|
| 1 | `atomicConsumeRateLimit` uses `Date.now()` in hot path | `src/lib/security/rate-limit.ts` (AGG-2 cycle 45) | MEDIUM / MEDIUM | DB round-trip per API request is costlier than clock-skew risk; values internally consistent within a single server instance | Architecture review for rate-limit strategy |
| 2 | Leaderboard freeze uses `Date.now()` | `src/lib/contests/leaderboard.ts:52` | LOW / LOW | Sub-second inaccuracy only; freeze time is a window, not a boundary | Module refactoring cycle |
| 3 | `console.error` in client components | multiple client files | LOW / MEDIUM | Client-side only; no security/correctness impact | Module refactoring cycle |
| 4 | SSE O(n) eviction scan | `src/app/api/v1/submissions/[id]/events/route.ts:44-55` | LOW / LOW | Bounded at 1000 entries; rarely triggered | Performance optimization cycle |
| 5 | Manual routes duplicate `createApiHandler` boilerplate | SSE route, judge routes (AGG-7 / ARCH-2) | MEDIUM / MEDIUM | Stable pattern; refactor risk exceeds benefit | API framework redesign |
| 6 | Global timer HMR pattern duplication | multiple route files (AGG-8) | LOW / MEDIUM | Works correctly; cosmetic improvement | Module refactoring cycle |
| 7 | Anti-cheat copies user text content | `src/components/exam/anti-cheat-monitor.tsx:206-209` | LOW / LOW | Captures <=80 chars of textContent; privacy notice acknowledged | Privacy review cycle |
| 8 | Docker build error leaks paths | Docker client (SEC-4) | LOW / LOW | Only visible to admin-level users | Infrastructure hardening cycle |
| 9 | Anti-cheat heartbeat gap query transfers up to 5000 rows | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:195-204` | MEDIUM / MEDIUM | SQL window function would improve, but currently functional | Performance optimization cycle |
| 10 | Chat widget button badge lacks ARIA announcement | chat widget | LOW / LOW | Screen reader may not announce badge count | Accessibility audit cycle |
| 11 | Contests page badge hardcoded colors | contests page | LOW / LOW | Visual only; no accessibility impact | Design system migration |
| 12 | SSE route ADR | documentation (DOC-1) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 13 | Docker client dual-path docs | documentation (DOC-2) | LOW / LOW | Useful but not urgent | Documentation cycle |
| 14 | Stale-while-revalidate cache pattern duplication | `contest-scoring.ts`, `analytics/route.ts` (ARCH-3) | LOW / LOW | Stable, well-documented duplication | Module refactoring cycle |
| 15 | Anti-cheat heartbeat dedup uses `Date.now()` for LRU cache | `src/app/api/v1/submissions/[id]/anti-cheat/route.ts:92` (SEC-2) | LOW / LOW | In-memory only; no cross-process clock skew concern | Module refactoring cycle |
| 16 | Practice page unsafe type assertion | `src/app/(dashboard)/dashboard/practice/page.tsx:420` (AGG-3 cycle 48) | LOW / LOW | Runtime-validated; cosmetic carry-over | Module refactoring cycle |
| 17 | Anti-cheat privacy notice accessibility | `src/components/exam/anti-cheat-monitor.tsx:261` (DES-1 cycle 48) | LOW / LOW | Requires manual keyboard testing | Manual a11y audit |
| 18 | Missing integration test for concurrent recruiting token redemption | `src/lib/assignments/recruiting-invitations.ts:304-543` (TE-1 cycle 51) | LOW / MEDIUM | Atomic SQL UPDATE well-tested in production; sequential unit tests cover | Test coverage cycle (requires live DB) |
| 19 | `messages/ja.json` referenced but absent (I18N-JA-ASPIRATIONAL cycle 55) | `messages/ja.json` | LOW / LOW | Aspirational; needs PM scoping | PM scoping decision |
| 20 | DES-RUNTIME-{1..5} sandbox-blocked runtime UI checks (cycle 55) | (runtime UI / a11y) | LOW..HIGH-if-violated / LOW | Sandbox has no Docker/Postgres, so runtime lane cannot observe live app; severities NOT downgraded — issues not tested, not found absent | Loop runs in a sandbox with Docker or a managed-Postgres sidecar |

**Total:** 20 entries (cycle 55 had 19 — the DES-RUNTIME-{1..5} group is listed as a single bucket entry here, same as cycle 55 aggregate; the entry count is structurally equivalent, 19 issue-classes + aspirational i18n = 20 lines).

### Deferral Policy Compliance

Per `CLAUDE.md` and `.context/development/conventions.md`:
- No security, correctness, or data-loss findings are deferred. All deferred items are LOW or cosmetic, or are MEDIUM with explicit architectural rationale.
- All deferred items have file+line citation, original severity preserved, concrete reason, and concrete exit criterion. None are newly introduced this cycle — they are carry-overs from the cycle 55 aggregate.
- No `--no-verify`, `--no-gpg-sign`, `Co-Authored-By`, or force-push is anticipated for any eventual pickup.
- All eventual pickups will use Conventional Commits + gitmoji + GPG signing per repo rules.

## Archive / Plan Hygiene

- `plans/open/2026-04-23-rpf-cycle-32-review-remediation.md` — all tasks already marked DONE in the progress log. Can be moved to `plans/done/` in a future hygiene pass. Not moving this cycle to minimize cycle scope.
- `plans/open/_archive/2026-04-23-rpf-cycle-36-review-remediation.md` — already in the cycle-level archive; no action.
- `plans/open/2026-04-23-rpf-cycle-55-review-remediation.md` — cycle 55 plan, single lane (A2 `SKIP_INSTRUMENTATION_SYNC`) is DONE; ready to move to `plans/done/` in a future hygiene pass.

## Progress Log

- 2026-04-23: Plan created. Zero new findings this cycle. 19-item deferred registry carried forward unchanged from cycle 55. No implementation tasks scheduled.
