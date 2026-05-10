# Cycle 17 — Critic (Manual)

**Date:** 2026-05-09
**HEAD reviewed:** `32464e55`
**Agent status:** Agent tool unavailable; performed manually by orchestrator

---

## Multi-Perspective Critique

### What cycle 16 got right

The cycle-16 review correctly identified that the cycle-15 fix was incomplete: caller-provided signals bypassed the default timeout. The fix (commits `83b4d09c` and `eb4a2dd4`) correctly addresses this by wrapping all signals with `withTimeout`. The browser fallback (`createTimeoutSignal`) is also correctly implemented. The tests were updated to match.

### What cycle 16 missed

The cycle-16 review did not examine the edge cases of `withTimeout` itself:
1. Already-aborted signals are not handled
2. Listener leaks when timeout fires first
3. Code duplication across modules

These are not severe bugs but are correctness and quality issues that should be fixed.

### Is the fix worth the complexity?

Yes. The timeout protection is critical for production reliability. The `withTimeout` helper is ~12 lines and well-documented. The edge cases are fixable with small additions.

### Risk assessment

- **Risk of leaving C17-1 unfixed:** LOW-MEDIUM. Already-aborted signals are an edge case. Most React callers abort controllers during cleanup, not after.
- **Risk of leaving C17-2 unfixed:** LOW. Bounded leak, only manifests with long-lived AbortControllers.
- **Risk of leaving C17-3 unfixed:** LOW. Maintenance burden, not a runtime bug.

### Recommended priority

1. Fix C17-1 (already-aborted signal) + extract shared utilities (C17-3) in the same commit
2. Fix C17-2 (listener leak) as a follow-up or in the same commit
3. Add test for C17-1

---

## Areas Examined

- `src/lib/api/client.ts` — full review from correctness, maintainability, and risk angles
- `src/lib/docker/client.ts` — same analysis
- Cycle-16 aggregate for gaps and missed edge cases
- Test coverage for completeness
