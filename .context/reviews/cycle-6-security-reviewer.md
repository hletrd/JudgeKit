# Security Review — Cycle 6

**Date:** 2026-05-14
**Scope:** JudgeKit codebase — auth, authz, secrets, input validation, SSE, rate limiting, judge sandbox
**Base commit:** db6378c8
**Agent:** security-reviewer (manual single-pass)

---

## Executive Summary

**0 new security findings** this cycle. All cycle-5 security-relevant fixes verified. Deferred security findings from prior cycles remain stable.

---

## Cycle-5 Security Fix Verification

### M1: `rateLimits` heartbeat cleanup (bloat → DoS via degraded queries)
- **Status:** VERIFIED. Stale heartbeat entries are now deleted inside `shouldRecordSharedHeartbeat`, preventing unbounded table growth that could degrade rate-limit query performance.

### M2: Shell command validator `$0-$9` gap
- **Status:** VERIFIED. Positional parameter expansion is now blocked, closing a defense-in-depth gap.

### L3: `submittedAt` Infinity acceptance
- **Status:** VERIFIED. `Number.isFinite(n)` guards both paths.

---

## Auth / AuthZ Review

- `getApiUser` correctly prioritizes API key auth (Bearer jk_) before JWT session lookup.
- CSRF check properly skipped for API-key-authenticated requests.
- Role and capability checks use `requireAllCapabilities` logic correctly.
- No new auth bypass vectors identified.

## Input Validation

- All API routes using `createApiHandler` pass through Zod schema validation.
- File upload route has ZIP bomb protection and image dimension limits.
- Shell command validator defense-in-depth verified.

## Deferred Security Items (Stable)

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| SSE-M2 | LOW | `events/route.ts:224-232` | Unbounded `inArray` query in `sharedPollTick` | Unchanged |
| SSE-RACE | LOW | `events/route.ts:161-166` | `stopSharedPollTimer` race with in-progress tick | Unchanged |
| COR-1 | LOW | Judge claim | Problem lookup outside transaction scope | Unchanged |
| C-1 | CRITICAL | Nginx | Test/Seed localhost spoofable via XFF | Infrastructure — unchanged |

---

## New Findings

None.
