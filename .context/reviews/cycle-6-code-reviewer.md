# Code Review — Cycle 6

**Date:** 2026-05-14
**Scope:** JudgeKit codebase — verification of cycle-5 fixes and fresh cycle-6 sweep
**Base commit:** db6378c8 (cycle-5 fixes applied)
**Agent:** code-reviewer (manual single-pass, no subagents available)

---

## Executive Summary

Cycle 6 review found **0 new actionable issues**. All six cycle-5 fixes were verified correct in source. A comprehensive sweep of 599 TypeScript source files across API routes, lib modules, components, hooks, and database logic revealed no new logic bugs, edge-case violations, or maintainability regressions.

---

## Cycle-5 Fix Verification

### C5-M1: `rateLimits` heartbeat cleanup — VERIFIED
- **File:** `src/lib/realtime/realtime-coordination.ts:205-214`
- **Status:** Correct. Cleanup deletes heartbeat entries where `blockedUntil < nowMs - minIntervalMs`, which safely preserves the just-updated entry (its `blockedUntil = nowMs + minIntervalMs`).
- **Prefix consistency:** `getHeartbeatPrefixPattern()` returns `realtime:heartbeat:%`, matching the `HEARTBEAT_KEY_PREFIX` constant. No SQL wildcards in the prefix itself.

### C5-M2: Positional parameter expansion blocked — VERIFIED
- **File:** `src/lib/compiler/execute.ts:173`
- **Status:** Correct. Regex changed from `$[A-Za-z_]` to `$[A-Za-z0-9_]`, blocking `$0-$9`.
- **Tests:** `tests/unit/compiler/execute.test.ts:111-139` covers `$0` and `$1` rejection.

### C5-L1: Source code size validation unified to byte length — VERIFIED
- **Files:** `src/app/api/v1/compiler/run/route.ts:23-25`, `src/app/api/v1/playground/run/route.ts:17-19`
- **Status:** Correct. Both Zod schemas now use `Buffer.byteLength(v, "utf8")` instead of `v.length`.
- **Alignment:** Execution layer (`src/lib/compiler/execute.ts:660`) also uses `Buffer.byteLength`, so API and execution are consistent.

### C5-L2: Deterministic tie-breaker added — VERIFIED
- **File:** `src/lib/platform-mode-context.ts:92,163`
- **Status:** Correct. Both raw SQL queries now end with `, a.id ASC`.

### C5-L3: `submittedAt` hardened against Infinity — VERIFIED
- **File:** `src/app/api/v1/judge/claim/route.ts:54-61`
- **Status:** Correct. Both the number refine path and string transform path include `Number.isFinite(n)`.

---

## Fresh Sweep Findings

None. No new logic bugs, missed edge cases, type safety gaps, or code-smell patterns were identified.

---

## Commonly Missed Issues Check

- [x] Raw SQL injection vectors — all parameterized
- [x] Unclosed resources — all timers have exported stop functions
- [x] Unused variables/imports — eslint clean
- [x] Type assertions without guards — no new unsafe casts found
- [x] TODO/FIXME drift — only 2 upstream Next.js workaround comments, both tracked
