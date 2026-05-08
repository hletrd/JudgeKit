# Aggregate Review — Cycle 1/100 (Current)

**Date:** 2026-05-08
**HEAD:** main / 5cec65e8
**Reviewers:** security-reviewer, code-reviewer, perf-reviewer, architect, debugger, test-engineer, designer
**Scope:** Full repository (~575 TS/TSX files, ~427 test files)
**Approach:** Consolidated single-pass with multi-perspective analysis. No Agent tool available; performed manually across all dimensions.

---

## NEW FINDINGS THIS CYCLE

| ID | Severity | Confidence | Title | Source |
|---|---|---|---|---|
| S1 | MEDIUM | HIGH | Production CSP allows `unsafe-inline` for script-src | security S1, designer D1 |
| S2 | MEDIUM | HIGH | `sql.raw()` pattern in recruiting invitations is fragile | security S2 |
| S3 | MEDIUM | MEDIUM | Audit-logs JSON LIKE pattern is fragile | security S3 |
| S4 | LOW | LOW | File upload path validation gaps | security S4 |
| S5 | LOW | MEDIUM | `RUNNER_AUTH_TOKEN` empty string disables auth | security S5 |
| S6 | LOW | MEDIUM | Server action origin bypass in dev too broad | security S6 |
| S7 | LOW | LOW | Docker build context includes entire repo | security S7 |
| C1 | MEDIUM | HIGH | `execTransaction` build-phase lacks transaction | code C1 |
| C2 | MEDIUM | MEDIUM | `auto-review.ts` queue size check racy | code C2 |
| C3 | MEDIUM | MEDIUM | `stopContainer` fire-and-forget may leak | code C3 |
| C4 | LOW | LOW | `parseTimestampEpochMs` accepts non-RFC-3339 | code C4 |
| C5 | MEDIUM | MEDIUM | `docker ps` parsing fragility | code C5 |
| C6 | LOW | HIGH | `WeakMap` deduplication unlikely to trigger | code C6 |
| C7 | LOW | LOW | Auth cache FIFO vs LRU | code C7 |
| C9 | MEDIUM | MEDIUM | Env validation throws in middleware | code C9 |
| P1 | MEDIUM | HIGH | Status board in-memory Cartesian product | perf P1 |
| P2 | MEDIUM | MEDIUM | Auth cache poor eviction under load | perf P2 |
| P3 | MEDIUM | HIGH | Dual rate-limit DB calls per request | perf P3 |
| P4 | LOW | LOW | Serial container cleanup | perf P4 |
| A1 | MEDIUM | HIGH | Triple rate-limit implementation divergence | architect A1 |
| A2 | MEDIUM | MEDIUM | Recruiting dual cache complexity | architect A2 |
| A3 | LOW | MEDIUM | Compiler execution paths complex | architect A3 |
| A5 | LOW | LOW | `proxy.ts` responsibility overload | architect A5 |
| B1 | MEDIUM | MEDIUM | Docker build spawn error handling | debugger B1 |
| B2 | LOW | LOW | Stream destroy race | debugger B2 |
| B3 | MEDIUM | MEDIUM | Rate limit window behavior on block | debugger B3 |
| B5 | LOW | LOW | Rust runner image validation gap | debugger B5 |
| T1 | MEDIUM | HIGH | No tests for proxy auth cache | test T1 |
| T2 | MEDIUM | HIGH | No tests for container cleanup | test T2 |
| T3 | MEDIUM | HIGH | No tests for rate-limit eviction timer | test T3 |
| T4 | LOW | MEDIUM | Docker build paths not unit tested | test T4 |
| T5 | LOW | MEDIUM | Magic-byte negative tests missing | test T5 |
| T6 | LOW | HIGH | Anti-cheat heartbeat tests missing | test T6 |
| D2 | LOW | LOW | Missing `themeColor` in viewport | designer D2 |
| D3 | LOW | MEDIUM | Admin page lacks loading skeleton | designer D3 |
| D5 | LOW | MEDIUM | Focus trap verification needed | designer D5 |

---

## CROSS-AGENT AGREEMENT

- **S1 (Production CSP):** Confirmed by security-reviewer and designer — 2 independent paths.
- **A1 (Rate-limit divergence):** Confirmed by architect; related to P3 (perf) and B3 (debugger) — 3 paths.
- **P1 (Cartesian product):** Confirmed by perf-reviewer; likely affects large contests — HIGH confidence.
- **C1 (Build-phase transaction):** Confirmed by code-reviewer only but is a correctness issue.

---

## CARRIED-FORWARD DEFERRED ITEMS (from prior aggregates, still valid)

| ID | Severity | Status | Exit criterion |
|---|---|---|---|
| AGG1-2 | MEDIUM | DEFERRED | Per-invitation-token rate limiting design |
| AGG1-4 | MEDIUM | CARRY | Rate-limit consolidation cycle |
| AGG1-7 | LOW | DEFERRED | Runtime re-read of legal hold |
| AGG1-8 | LOW | CARRY | Token-hash algorithm prefix |
| AGG1-15 | LOW | DEFERRED | DB time caching optimization |
| AGG1-17 | LOW | DEFERRED | CSP unsafe-inline known tradeoff |
| C3-AGG-5 .. C1-AGG-22 | LOW | DEFERRED | Various |
| SEC2-2, SEC2-3 | LOW | DEFERRED | Various |
| DSGN3-1, DSGN3-2 | LOW | DEFERRED | UX cycle |
| D1, D2 | MEDIUM | DEFERRED | Auth-perf cycle |
| ARCH-CARRY-1 | MEDIUM | DEFERRED | API-handler refactor |
| ARCH-CARRY-2 | LOW | DEFERRED | SSE perf cycle |
| PERF-3 | MEDIUM | DEFERRED | Anti-cheat perf |
| B1-B4 (cycle 3) | LOW-MEDIUM | DEFERRED | Admin-section nav, README, ESLint rule, rate-limit flakiness |
| AGG3-4 | LOW | CARRY | CodeTimelinePanel test |
| F3 | MEDIUM | DEFERRED | Candidate PII encryption at rest |
| F5 | MEDIUM | DEFERRED | JWT callback DB query optimization |
| F6 | LOW | DEFERRED | Production deployment lag |
| F8 | LOW | DEFERRED | API route rate limiting |
| F10 | LOW | DEFERRED | File validation test coverage |

---

## QUALITY GATES (HEAD baseline)

- `tsc --noEmit`: PASS (exit 0)
- `eslint .`: PASS (exit 0)
- `next build`: Deferred to PROMPT 3
- `vitest run`: 2322/2322 tests PASS (per cycle 3 aggregate)

---

## AGENT FAILURES

None — all reviews completed successfully.

---

## NEW_FINDINGS COUNT: 33
