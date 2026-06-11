# Cycle 10 — Aggregate Review (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `1d5fe1e2` (test(auth): update change-password test)
**Reviewers:** Comprehensive single-lane deep review (security, correctness, performance, architecture, UI/UX, documentation, testing).
**Cycle change surface:** 20 commits since prior cycle close; ~28 files touched; security hardening, recruiting fixes, auth improvements, performance optimizations.

**Prior aggregate snapshot:** Preserved at `_aggregate-cycle-9.md`.

---

## Total deduplicated NEW findings (still applicable at HEAD `1d5fe1e2`)

**0 HIGH, 2 MEDIUM, 3 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C10-1 | MEDIUM | High | `src/app/(public)/privacy/page.tsx` | Hardcoded retention periods may diverge from configured values |
| C10-2 | LOW | High | `src/app/(public)/privacy/page.tsx` | Missing `loginEvents` data class on privacy page |
| C10-3 | MEDIUM | Medium | `src/lib/assignments/recruiting-results.ts` | No NaN/finite guard before score computation |
| C10-4 | LOW | Medium | `src/lib/assignments/recruiting-invitations.ts` | Metadata update overwrites `_sys.*` keys |
| C10-5 | LOW | Low | `src/lib/seo.ts` | Social image URL may exceed length limits |

---

## Resolved at current HEAD (verified by inspection)

All prior-cycle resolved items remain resolved. Cycle-1 through cycle-9 fixes verified at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `1d5fe1e2`)

All deferred items from cycle-9 aggregate remain applicable:

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
| C7-AGG-9 | LOW | 3-module rate-limit duplication | DEFERRED-with-doc-mitigation | Rate-limit consolidation cycle |
| F3 | MEDIUM | Candidate PII encryption at rest | DEFERRED | Schema migration needed |
| F5 | MEDIUM | JWT callback DB query optimization | DEFERRED | Auth caching design required |
| F6 | LOW | Production deployment lag | DEFERRED | Operator action |
| F8 | LOW | API route rate limiting | DEFERRED | Gradual hardening |
| F10 | LOW | File validation test coverage | DEFERRED | Ongoing |

No HIGH findings deferred. No security/correctness/data-loss findings deferred without exit criteria.
