# Cycle 16 — Architecture Review

**Date:** 2026-05-11
**HEAD reviewed:** `5a400792`
**Prior aggregate:** `_aggregate-cycle-15.md`

---

## New Findings

**None.** The codebase has not changed since cycle 15 (`af634e63`).

---

## Architectural Verification

### Layering and Coupling

| Concern | Status | Evidence |
|---|---|---|
| Auth abstraction | Clean | `sign-out.ts` extracts shared logic; `auth.ts` exports only async role checks |
| Rate-limit consolidation | Partial | Core primitives shared (`rate-limit-core.ts`); two consumer modules still exist (tracked under C7-AGG-9) |
| DB time authority | Clean | Single source of truth via `getDbNowMs()`; used consistently across rate limits, submissions, deadlines |
| Raw API handlers | Tracked | 109 API route files; raw handlers tracked under ARCH-CARRY-1 for future refactor |

### Design Patterns (Healthy)

1. **AbortSignal composition:** `src/lib/abort.ts` provides reusable timeout + combined signal utilities with proper cleanup. Avoids duplicating AbortController boilerplate across fetch calls.

2. **Visibility-aware polling:** `use-visibility-polling.ts` encapsulates the start/pause/resume pattern. Used by multiple components without code duplication.

3. **Prefix-based storage cleanup:** `sign-out.ts` centralizes the list of storage prefixes. Adding a new prefix requires updating one list and one comment reference.

4. **Rate-limit two-tier strategy:** Sidecar fast-path + DB authoritative path. Sidecar can be disabled without changing semantics (falls back to DB).

### Module-Level Caches

| Cache | Type | TTL | Status |
|---|---|---|---|
| `getDbNow` | React.cache | Per-render | Clean — no stale data |
| `consumedRequestKeys` | WeakMap | Per-request | Clean — no global accumulation |
| `timeoutCleanups` | WeakMap | Per-signal | Clean — no global accumulation |
| Contest ranking SWR | In-memory | Configurable TTL | Clean — bounded by key count |

---

## Deferred Architectural Items (Unchanged)

- ARCH-CARRY-1: 20 raw API handlers (MEDIUM) — deferred, API-handler refactor cycle
- C7-AGG-9: 3-module rate-limit duplication (LOW) — deferred, rate-limit consolidation cycle
- C7-AGG-7: `encryption.ts` decrypt plaintext fallback (LOW) — deferred with doc mitigation
