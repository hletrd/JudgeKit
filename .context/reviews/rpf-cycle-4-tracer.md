# RPF Cycle 4 — Tracer

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Causal Traces

### TRACE-1: `response.json()` without `.catch()` — incomplete remediation from cycle 3

**Root cause:** The cycle 3 remediation for the "response.json() before response.ok" pattern was applied to the most impactful files but was not exhaustive. A grep for `response.json()` / `res.json()` across the codebase reveals ~70+ call sites. The remediation only covered ~10 files.

**Causal chain:**
1. Cycle 2 identified the pattern in high-traffic files (submission form, discussions)
2. Cycle 3 added `apiJson` helper and fixed ~10 more files
3. The grep was not exhaustive — `invite-participants.tsx` and `access-code-manager.tsx` were missed
4. These files still have `res.json()` calls without `.catch()` on error paths

**Remaining affected call sites (highest risk):**
- `src/components/contest/invite-participants.tsx:78` — `res.json()` on error path
- `src/components/contest/access-code-manager.tsx:42,88` — `res.json()` on success path

**Lower-risk sites** (inside `res.ok` blocks, unlikely to produce non-JSON):
- `src/components/contest/leaderboard-table.tsx:231`
- `src/components/contest/contest-quick-stats.tsx:52`
- `src/components/contest/contest-announcements.tsx:56`
- Various admin and dashboard components

**Recommendation:** Do a comprehensive sweep of all `res.json()` / `response.json()` calls and ensure they either use `apiJson` or the `.catch(() => ({}))` pattern.

---

### TRACE-2: Countdown timer drift — missing visibility recalculation

**Causal chain:**
1. `countdown-timer.tsx` uses `setInterval(tick, 1000)` on line 100
2. `tick` recalculates `remaining = deadline - (Date.now() + offsetRef.current)`
3. When the page is hidden, browsers throttle `setInterval`
4. When the page becomes visible again, `remaining` state is stale
5. The next interval tick corrects it, but there's a visible "jump"

**Why this wasn't caught:** The `useVisibilityPolling` hook was created to handle visibility-aware polling, but it's designed for fetch-based polling, not for local timer calculations. The timer component doesn't need to fetch anything — it just needs to recalculate locally.

**Root cause:** The timer was not updated when `useVisibilityPolling` was introduced, and the new hook's pattern (visibility-aware callback) doesn't fit the timer's use case (local calculation).

**Fix:** Add a `visibilitychange` listener that immediately recalculates `remaining` when the tab becomes visible. This is a simple, targeted fix that doesn't require refactoring to use `useVisibilityPolling`.

---

### TRACE-3: Dynamic clipboard import — partial fix from cycle 3

**Causal chain:**
1. `recruiting-invitations-panel.tsx` used `await import("@/lib/clipboard")` — flagged in cycle 3 as SEC-2
2. Fixed in cycle 3 by converting to static import
3. `access-code-manager.tsx` has the same pattern but was not flagged because it wasn't reviewed as thoroughly

**Fix:** Apply the same static import conversion to `access-code-manager.tsx`.

---

## Verified Safe

- SSE events route properly handles connection cleanup on abort and timeout
- `useVisibilityPolling` correctly uses ref-based callback to avoid stale closures
- Anti-cheat monitor uses recursive `setTimeout` instead of `setInterval` for heartbeat
