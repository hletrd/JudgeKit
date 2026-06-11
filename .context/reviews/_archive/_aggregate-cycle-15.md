# Cycle 15 — Aggregate Review (2026-05-11)

**Date:** 2026-05-11
**HEAD reviewed:** `af634e63`
**Reviewer:** cycle-lead (single-agent comprehensive review covering all standard angles)
**Prior aggregate:** `_aggregate-cycle-14.md` (HEAD `bcef0c13`)

---

## Total deduplicated NEW findings (still applicable at HEAD `af634e63`)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## NEW findings this cycle

None. The codebase is in a mature, well-hardened state after 15 prior cycles of remediation.

---

## Carry-forward findings (status verified at HEAD `af634e63`)

All deferred items from prior aggregates remain tracked in their respective cycle documents.
No HIGH or security/correctness/data-loss findings are deferred without exit criteria.

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` (1088+ lines) | DEFERRED | Modular extraction scheduled; OR >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (24) | DEFERRED | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | JWT clock-skew (outside config.ts) | DEFERRED | Auth-perf cycle |
| D2 | MEDIUM | JWT DB query per request (outside config.ts) | DEFERRED | Auth-perf cycle |
| AGG-2 | MEDIUM | Rate-limit Date.now + overflow sort | DEFERRED | Rate-limit-time perf cycle |
| ARCH-CARRY-1 | MEDIUM | 20 raw API handlers | DEFERRED | API-handler refactor cycle |
| ARCH-CARRY-2 | LOW | SSE coordination | DEFERRED | SSE perf cycle OR > 500 concurrent |
| PERF-3 | MEDIUM | Anti-cheat dashboard query | DEFERRED | p99 > 800ms OR > 50 concurrent contests |
| C7-AGG-6 | LOW | `participant-status.ts` time-boundary tests | DEFERRED | Bug report on deadline boundary OR refactor |
| C7-AGG-7 | LOW | `encryption.ts` decrypt plaintext fallback | DEFERRED-with-doc-mitigation | Production tampering incident OR audit cycle |
| C7-AGG-9 | LOW | 3-module rate-limit duplication | DEFERRED | Rate-limit consolidation cycle |
| F3 | MEDIUM | Candidate PII encryption at rest | DEFERRED | Schema migration needed |
| F5 | MEDIUM | JWT callback DB query optimization | DEFERRED | Auth caching design required |
| F6 | LOW | Production deployment lag | DEFERRED | Operator action |
| F8 | LOW | API route rate limiting | DEFERRED | Gradual hardening |
| F10 | LOW | File validation test coverage | DEFERRED | Ongoing |

---

## Resolved at current HEAD (verified by inspection)

- **C14-1 (cycle-14):** `src/lib/db/export-with-files.ts:155` unnecessary cast — FIXED.
  Commit `e8c318f2` removes the `as JudgeKitExport` cast.
- **C14-2 (cycle-14):** `src/lib/db/queries.ts:43-73` runtime validation warnings — ADDRESSED.
  Commit `34762477` adds comprehensive WARNING comments to `rawQueryOne`/`rawQueryAll`.
- **C14-3 (cycle-14):** `src/components/lecture/lecture-toolbar.tsx:66-68` fullscreen promise chains — ADDRESSED.
  Commit `1365fefe` removes redundant fullscreen state callbacks.

All prior cycle fixes (C1-1 through C13-3) verified intact at HEAD.

---

## Cross-Agent Agreement

Single-agent review; no multi-agent agreement to report.

---

## Agent Failures

Subagent fan-out unavailable this cycle — the `Agent` tool required for spawning review
subagents is not registered in this environment. Performed as single-agent comprehensive
review covering all standard reviewer angles (code quality, security, performance,
architecture, correctness, testing, tracing).

---

## Review methodology notes

This cycle performed a comprehensive sweep of the entire `src/` tree (~575 TS/TSX files)
focusing on changes since cycle 14 and re-verification of all prior findings. Key techniques:

- Full grep sweeps for: `Date.now()`, `Math.random()`, `console.log/warn/debug`,
  `dangerouslySetInnerHTML`, `parseInt/parseFloat`, `any` type, CSRF coverage gaps,
  empty catches, `@ts-ignore`, `eslint-disable`, `eval()`, raw SQL, `.then()` patterns,
  `cookies()/headers()` usage, `setTimeout/setInterval`, `Promise.all/race`,
  event listener cleanup.
- Full reads of: recently changed files (lecture-toolbar.tsx, export-with-files.ts,
  queries.ts, system-settings.ts, system-settings.test.ts).
- CSRF coverage audit: re-verified all 9 mutating POST endpoints.
- Event listener cleanup: verified all useEffect + addEventListener patterns return cleanup.
- Module-level cache audit: verified all caches are either static or TTL-bounded.
- Promise.all usage: verified all properly handle errors.
- Type safety: no `@ts-ignore`, no `@ts-expect-error` in source.

The codebase continues to be in a mature, well-hardened state after 15 prior cycles of
remediation. This cycle found zero new issues.
