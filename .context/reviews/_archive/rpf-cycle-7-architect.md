# RPF Cycle 7 — architect (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. Architectural posture unchanged. Stale prior cycle-7 architect findings (C7-AR-1 dual time-source, C7-AR-2 dual rate-limiting) re-validated:
- C7-AR-1: time endpoint side RESOLVED at HEAD (uses `getDbNowMs()`); `participant-status.ts` `Date.now()` default still present but caller-injectable.
- C7-AR-2: 3 rate-limiting modules still coexist; advisory only.

## Stale prior cycle-7 architect findings — re-validated at HEAD

| Stale ID | File | HEAD status |
|---|---|---|
| C7-AR-1 (dual time-source) | `src/app/api/v1/time/route.ts` (RESOLVED) + `src/lib/assignments/participant-status.ts` (still has `Date.now()` default) | Time endpoint side RESOLVED. Server-side participant-status function still has `Date.now()` as default param; caller-injectable for tests. **Severity downgrade not warranted** — defer with exit criterion: server component caller forgets to pass DB now. |
| C7-AR-2 (dual rate-limiting modules) | `src/lib/security/in-memory-rate-limit.ts`, `api-rate-limit.ts`, `rate-limit.ts` | Unchanged. 3 modules coexist. Maps to AGG-9 (advisory). |
| C7-AR-3 (`createApiHandler` pattern) | `src/lib/api/handler.ts` | Positive observation: well-designed factory. ARCH-CARRY-1 (raw handlers not using it) shrinking organically (20 raw of 104 total at HEAD). |

## Architectural posture at HEAD `45502305`

### Layering — no new violations
- `createApiHandler` factory in `src/lib/api/handler.ts` is the canonical API entrypoint. 84/104 routes use it (81%).
- Time-source discipline: 1/1 client-facing time endpoints uses DB time (post-AGG-1 fix). Server-side temporal comparisons consistently use `getDbNowMs()`.
- Auth: NextAuth + custom callbacks. `src/lib/auth/config.ts` is no-touch per CLAUDE.md.

### Coupling — stable
- No cycle-6 src/ changes; no new coupling introduced.

### Layering — stable
- Dashboard route group (`(dashboard)/`) and public route group (`(public)/`) properly separated. The user-injected TODO #1 (workspace→public migration) was closed cycle-1 RPF.

### Cycle-6 deploy-script changes (`72868cea`, `2791d9a3`)
- Both pure-additive; no architectural impact. New env vars purely additive to deploy-script side. Backward-compat preserved.

## NEW architect findings this cycle

**0 NEW.**

## Architectural recommendations for cycle-7 PROMPT 2

1. **Path-drift correction for ARCH-CARRY-2:** Record both `realtime-coordination.ts` AND `events/route.ts:48-63` as the same SSE-eviction-O(n) item. Severity unchanged (LOW). Exit criterion unchanged.
2. **Pre-emptive `useVisibilityAwarePolling` hook extraction:** Concur with code-reviewer + perf-reviewer. Architecturally, this is a clean reusable primitive that retires the C2-AGG-5 7th-instance open-ended trigger.
3. **Defer ARCH-CARRY-1** (raw handler refactor) for now. 20 raw of 104 (81% conversion) — population shrinking organically; refactor cycle has clearer trigger (handler-refactor-dedicated cycle).
4. **Consider** for a future cycle: `useVisibilityAwarePolling` migration to all 5 sites once primitive proves stable.

## Confidence

H.
