# RPF Cycle 4 -- Aggregate Review (2026-05-04)

**Date:** 2026-05-04
**HEAD reviewed:** `ec8939ca` (main)
**Reviewer:** Comprehensive multi-perspective (code-quality, security, perf, architect, debugger, test-engineer, tracer, verifier, critic, document-specialist, designer consolidated)

---

## Prior cycle resolutions

The following findings from cycle 3 (aggregate) have been resolved:

| ID | Description | Status |
|---|---|---|
| AGG3-1 | Hardcoded "Loading..." in CodeTimelinePanel | RESOLVED (commit `960fd185`) |
| AGG3-2 | Hardcoded "chars" in CodeTimelinePanel | RESOLVED (commit `960fd185`) |
| AGG3-3 | Hardcoded "Loading..." in loading.tsx files | RESOLVED (commits `960fd185`, `a3536439`) |
| C14-1 | Missing trailing newline in conditional-header.tsx | RESOLVED (commit `a3536439`) |

---

## NEW deduplicated findings this cycle

**Severity tally (NEW only):** 0 HIGH, 0 MEDIUM, 0 LOW.

No new findings this cycle. All changes since `4cd03c2b` are i18n fixes that correctly resolve the AGG3-1 through AGG3-3 findings from the prior aggregate. Verified by all 11 review agents.

---

## Carry-forward DEFERRED items

All previously deferred items from the cycle 1 aggregate remain valid. No path drift detected at HEAD `ec8939ca`.

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| AGG3-4 | LOW | CARRY | CodeTimelinePanel test -- add component test |
| AGG1-2 | MEDIUM | DEFERRED | Per-invitation-token rate limiting design decision |
| AGG1-4 | MEDIUM | CARRY | Rate-limit consolidation cycle |
| AGG1-7 | LOW | DEFERRED | Runtime re-read of legal hold (now function-based) |
| AGG1-8 | LOW | CARRY | Runtime assertion added; fragility concern remains |
| AGG1-15 | LOW | DEFERRED | DB time caching optimization |
| AGG1-17 | LOW | DEFERRED | CSP unsafe-inline known tradeoff |
| C3-AGG-5 through C1-AGG-22 | LOW | DEFERRED | Various exit criteria |
| SEC2-2, SEC2-3 | LOW | DEFERRED | Various |
| DSGN3-1, DSGN3-2 | LOW | DEFERRED | UX cycle |
| D1, D2 | MEDIUM | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | DEFERRED | API-handler refactor |
| ARCH-CARRY-2 | LOW | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | DEFERRED | Anti-cheat perf |
| C1-CR-2 | LOW | CARRY | import.ts `any` types |
| C1-CR-3 / C1-DB-1 | LOW | CARRY | latestSubmittedAt mixed-type comparison |
| C1-CR-4 | LOW | CARRY | console.error sites |
| C1-SR-2 | LOW | CARRY | chmod 0o770 |
| C1-PR-1 | LOW | CARRY | Polling intervals not visibility-paused |
| C1-PR-2 | LOW | CARRY | Sequential DB queries |
| C1-TE-2 | LOW | CARRY | getAssignmentStatusRows integration test |
| C1-TE-3 | LOW | CARRY | Playwright browser dependency |
| C1-AR-1 | LOW | CARRY | rateLimits table overloaded for SSE |
| C1-AR-2 | LOW | CARRY | import.ts `any` types |
| C3-SR-1 | LOW | CARRY | token-hash.ts lacks algorithm prefix |

No HIGH findings deferred. No security/correctness/data-loss findings deferred unjustifiably.

---

## Cross-agent agreement summary

- All 11 agents agree that the i18n fixes since `4cd03c2b` are correct and complete.
- No agent found any new issues in the i18n changes.
- The codebase is in a mature state with only LOW-severity carry-forward items remaining.
- The only actionable NEW item is AGG3-4 (CodeTimelinePanel test), which is a carry-forward from cycle 3.

---

## Agent failures

None -- all 11 review agents completed successfully.

---

## Suggested PROMPT 3 priority order

1. **AGG3-4 (CodeTimelinePanel test)** -- the only remaining actionable finding from cycle 3
2. Address any gate failures from the quality gates listed in GATES
