# RPF New Cycle 1 -- Tracer Review (2026-05-04)

**Reviewer:** tracer
**HEAD reviewed:** `d617f2d7` (main)
**Scope:** Causal tracing of suspicious flows, competing hypotheses. Full codebase scan.
**Prior aggregate:** `_aggregate.md` (cycle 5 RPF, 0 new findings at HEAD `f65d0559`).

---

## Changes since prior reviewed HEAD

Zero source or test changes. Documentation-only commits.

---

## Findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## Flow tracing results

### Auth Flow
- Login -> rate limit check -> credential verify -> session creation -> JWT callback -> session callback. All paths traced. DB time used for timestamps. Proper error handling at each step.
- Token invalidation: `isTokenInvalidated()` compares `authenticatedAt` against `tokenInvalidatedAt`. Consistent DB time usage.
- Recruiting token path: Separate rate limiting (IP-only, no clearing on success). Proper audit logging.

### Submission Flow
- Client -> API route -> rate limit -> DB insert -> judge claim -> Docker execution -> result SSE. All paths traced.
- SSE: Connection management with cleanup interval. Shared polling manager. Proper auth re-check on long-lived connections.
- Anti-cheat: Event recording, filtering, similarity checks. All properly guarded by role checks.

### Docker Execution Flow
- Compile phase -> run phase -> result collection -> cleanup. All paths traced.
- Timeout handling: SIGKILL -> container stop -> inspect (retry for OOM) -> cleanup. Properly handles race between timeout and OOM.
- Rust runner fallback: Try runner first, fall back to local execution. Config validation prevents unauthenticated runner access.

### Rate Limit Flow
- Sidecar fast-path -> DB atomic consume -> response. All paths traced.
- Exponential backoff for login limits. Fixed window for API limits.
- Eviction: Periodic cleanup of stale entries. Proper unref() for server-side timers.

## Cross-agent agreement

Consistent with all prior RPF cycle reviews: zero new findings.
