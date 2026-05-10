# Critic Review — Cycle 34

**Reviewer:** critic
**Date:** 2026-05-10
**Scope:** Multi-perspective critique of codebase patterns and conventions

---

## Findings

### C34-CT-1: [MEDIUM] `apiFetchJson` silence on parse failures is a developer experience regression

**File:** `src/lib/api/client.ts:138-144`
**Confidence:** HIGH

The codebase invests heavily in developer experience: excellent inline documentation, typed APIs, and clear error conventions. Yet `apiFetchJson` — the most commonly used API utility — gives zero feedback when JSON parsing fails. A developer debugging why their component shows fallback data instead of server data must manually add logging or use browser devtools network panel.

This contradicts the module's own stated principle: "Never silently swallow errors."

**Fix:** One-line development-only console.warn.

---

### C34-CT-2: [MEDIUM] Rate limit eviction timer is an uncontrolled side effect at module level

**File:** `src/lib/security/rate-limit.ts:68-80`
**Confidence:** HIGH

Module-level side effects (timers, global listeners) are generally discouraged because they violate testability and composability. The rate limit eviction timer is started by whoever calls `startRateLimitEviction()` but cannot be stopped. This is a one-way door.

**Fix:** Export symmetric stop function.

---

### C34-CT-3: [LOW] Heartbeat scheduling in anti-cheat monitor is wasteful when tab is hidden

**File:** `src/components/exam/anti-cheat-monitor.tsx:185-191`
**Confidence:** LOW

A hidden tab does not need heartbeat scheduling. The current implementation schedules 960+ no-op callbacks over an 8-hour hidden period. While not a bug, it is unnecessary work that accumulates.

**Fix:** Gate reschedule on visibility.

---

## Cross-Agent Agreement

- Rate limit timer leak: confirmed by code-reviewer, perf-reviewer, test-engineer, architect, debugger, verifier
- apiFetchJson parse silence: confirmed by code-reviewer, security-reviewer, architect, debugger, verifier

## Previously Addressed (cycle 33)

- C33-CT-1 (throw-then-match anti-pattern): Partially addressed — many components still use it
- C33-CT-2 (error boundary console.error): **FIXED** — all 4 files gated
- C33-CT-3 (apiFetchJson type narrowing): Unchanged
