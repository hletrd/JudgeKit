# Cycle 16 — Aggregate Review (2026-05-11)

**Date:** 2026-05-11
**HEAD reviewed:** `5a400792`
**Reviewer:** cycle-lead (single-agent comprehensive review covering all standard angles)
**Prior aggregate:** `_aggregate-cycle-15.md` (HEAD `af634e63`)

---

## Total deduplicated NEW findings (still applicable at HEAD `5a400792`)

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## NEW findings this cycle

None. The codebase has not changed since cycle 15 (`af634e63`). Commit `5a400792` adds only documentation files (cycle 15 review artifacts). No code changes were introduced.

---

## Carry-forward findings (status verified at HEAD `5a400792`)

All deferred items from prior aggregates remain tracked in their respective cycle documents. No HIGH or security/correctness/data-loss findings are deferred without exit criteria.

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
| AGG-4(c15) | MEDIUM | API rate-limiting integration tests | DEFERRED | Dedicated test setup |

---

## Resolved at current HEAD (verified by inspection)

Historical cycle-16 findings (from April 19, commit `e3ee69e6`, fixed in subsequent commits):

- **PublicHeader signOut error handling:** FIXED. `src/lib/auth/sign-out.ts:80-94` wraps `signOut()` in try/catch and resets loading state.
- **Korean tracking-wide compliance:** FIXED. All `tracking-wide`/`tracking-wider` usages are conditional on `locale !== "ko"`.
- **localStorage.clear() destructiveness:** FIXED. `sign-out.ts:31-70` uses prefix-based targeted removal.
- **cleanupOrphanedContainers redundant inspect:** FIXED. `execute.ts:831-865` parses `CreatedAt` from docker ps JSON output.
- **Deprecated `ri_token_idx` unique index:** FIXED. `token` column removed from schema; only `tokenHash` with `ri_token_hash_idx` remains.
- **redeemRecruitingToken new Date() check:** FIXED. JS-side deadline checks removed; relies on SQL atomic `NOW()` check.
- **SSE duplicate terminal-state paths:** FIXED. Extracted into shared helper in `events/route.ts`.

All prior cycle fixes (C1-1 through C15-3) verified intact at HEAD.

---

## Cross-Agent Agreement

Single-agent review; no multi-agent agreement to report.

---

## Agent Failures

Subagent fan-out unavailable this cycle — the `Agent` tool required for spawning review subagents is not registered in this environment. Performed as single-agent comprehensive review covering all standard reviewer angles (code quality, security, performance, architecture, correctness, testing).

---

## Review methodology notes

This cycle performed a comprehensive sweep of the entire `src/` tree (~575 TS/TSX files) focusing on:

- Verification that the codebase state is identical to cycle 15's review point
- Fresh reads of recently-added files (13 files added since April 20)
- Targeted grep sweeps for common issue patterns
- Cross-reference with all prior deferred findings

Key techniques:
- Full grep sweeps for: `eval()`, `dangerouslySetInnerHTML`, `@ts-ignore`, empty catches, `Date.now()`, `Math.random()`, `console.*`, raw SQL, `Promise.all`, `tracking-wider`, `localStorage.clear()`
- Full reads of: `abort.ts`, `anti-cheat-storage.ts`, `use-visibility-polling.ts`, `rate-limit.ts`, `api-rate-limit.ts`, `rate-limit-core.ts`, `db-time.ts`, `sign-out.ts`, forgot-password/reset-password routes and forms
- Verified all cycle-16 historical fixes are intact at current HEAD

The codebase continues to be in a mature, well-hardened state after 15 prior cycles of remediation. This cycle found zero new issues.
