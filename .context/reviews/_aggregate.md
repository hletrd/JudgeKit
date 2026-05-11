# Cycle 11 — Aggregate Review (2026-05-11)

**Date:** 2026-05-11
**HEAD reviewed:** `b5008708`
**Reviewers:** Code reviewer, security reviewer, debugger, test engineer, architect, perf reviewer, designer, document specialist, critic, verifier, tracer.
**Prior aggregate:** `_aggregate-cycle-10.md` (HEAD `1d5fe1e2`)

---

## Total deduplicated NEW findings (still applicable at HEAD `b5008708`)

**0 HIGH, 0 MEDIUM, 4 LOW NEW.**

---

## NEW findings this cycle

| ID | Severity | Confidence | File | Summary |
|---|---|---|---|---|
| C11-1 | LOW | High | `src/components/exam/countdown-timer.tsx:50,214-215` | Dead code: `staggeredTimerIdsRef` never populated |
| C11-2 | LOW | High | `src/hooks/use-submission-polling.ts:139` | Redundant `as string` cast in SSE handler |
| C11-3 | LOW | Medium | `src/hooks/use-submission-polling.ts:48-49,70-71` | Unsafe `as Record<string, unknown>` casts in normalizeSubmission |
| C11-4 | LOW | High | `src/lib/audit/events.ts:206` | `lastAuditEventWriteFailureAt` uses app time instead of DB time |

---

## Resolved at current HEAD (verified by inspection)

- **AGG-1 (cycle-11 old):** Recruiting token `new Date()` in transaction — fixed. Now uses `getDbNowUncached()` consistently.
- **AGG-2 (cycle-11 old):** Export/backup `new Date()` — fixed. Backup route passes DB time through.
- **C10-1 (cycle-10):** Privacy page hardcoded retention — fixed. Derives from `DATA_RETENTION_DAYS`.
- **C10-2 (cycle-10):** Missing `loginEvents` data class — fixed. Present in privacy page.
- **C10-3 (cycle-10):** Recruiting results NaN guard — fixed. `Number.isFinite(best.score)` at line 85.
- **C10-4 (cycle-10):** Metadata `_sys.*` overwrite — fixed. Merge preserves internal keys.
- **C10-5 (cycle-10):** Social image URL length — fixed. `MAX_SOCIAL_URL_LENGTH = 2000` with trimming.
- **C10-AGG-1 (cycle-10):** CountdownTimer sync cleanup — fixed. `syncCleanupRef.current?.()` in both cleanup paths.

All prior cycle fixes verified intact at HEAD.

---

## Carry-forward DEFERRED items (status verified at HEAD `b5008708`)

All deferred items from cycle-10 aggregate remain applicable:

| ID | Severity | File+line | Status | Exit criterion |
|---|---|---|---|---|
| C3-AGG-5 | LOW | `deploy-docker.sh` (1098+ lines) | DEFERRED | Modular extraction scheduled; OR >1500 lines |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (25) | DEFERRED | Telemetry/observability cycle opens |
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

---

## Agent Failures

None. All 11 review perspectives completed.
