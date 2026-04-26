# Aggregate Review — RPF Cycle 2/100

**Date:** 2026-04-26
**Cycle:** 2/100 of review-plan-fix loop
**Reviewers:** architect, code-reviewer, critic, debugger, designer, document-specialist, perf-reviewer, security-reviewer, test-engineer, tracer, verifier (11 lanes — designer covered as web frontend exists)
**Total findings:** 3 HIGH (uncommitted source changes + Date.now() staleness uncommitted), 6 MEDIUM, 12 LOW, plus verification notes
**Cross-agent agreement:** Uncommitted-source-code finding flagged by code-reviewer, architect, critic, debugger, verifier, tracer (6 lanes converged) → highest signal

---

## Cross-Agent Convergence Map

| Topic | Agents flagging | Severity peak |
|-------|-----------------|---------------|
| Cycle-1 source changes uncommitted (env.ts, proxy.ts, analytics route) | CR2-1, ARCH2-1, CRIT2-1, DBG2-1, VER2-1, TRC2-1 | **HIGH** |
| Analytics route Date.now() staleness optimization uncommitted | CR2-2, ARCH2-4, VER2-2, TRC2-2 | **HIGH** |
| Analytics IIFE 4-deep error nesting | CR2-3, DBG2-2 | MEDIUM |
| Analytics cooldown DB-call amplifier in failure path | PERF2-1, DBG2-2 | MEDIUM |
| Analytics tests gap (cycle-1 AGG-5 carryover) | TE2-1 | MEDIUM |
| Plan/code drift on Task B | DOC2-1, CRIT2-2 | LOW |
| Misleading 30s clamp comment in retry | CR2-5 | LOW |
| `__Secure-` cookie clear over HTTP no-op | SEC2-1 | LOW |
| Anti-cheat online/timer race | DBG2-3 | LOW |

---

## Deduplicated Findings (sorted by severity)

### AGG-1: [HIGH] Three production source changes from cycle 1 are uncommitted in working tree

**Sources:** CR2-1, ARCH2-1, CRIT2-1, DBG2-1, VER2-1, TRC2-1 | **Confidence:** HIGH

`src/proxy.ts`, `src/lib/security/env.ts`, and `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` have working-tree-only modifications that cycle 1's tests depend on. Without committing these:

- `tests/unit/security/env.test.ts` would fail at HEAD (function doesn't exist).
- `tests/unit/proxy.test.ts` mock would mock a non-existent function (mock noop, but production import would fail at build).
- Cycle-1 plan AGG-1 fix is incomplete.

**Concrete failure scenario:** Clean checkout of HEAD → run `npm run test:unit` → 51 env tests fail because `getAuthSessionCookieNames` is undefined. Production build would also fail because `proxy.ts` imports a non-existent function.

**Fix:**
1. Commit `src/lib/security/env.ts` `getAuthSessionCookieNames` factory.
2. Commit `src/proxy.ts` updated `clearAuthSessionCookies` using the factory.
3. Commit `src/app/api/v1/contests/[assignmentId]/analytics/route.ts` Date.now() staleness + cooldown fallback (or revert if reverting Task B).

---

### AGG-2: [HIGH] Analytics route Date.now() staleness optimization is uncommitted

**Sources:** CR2-2, ARCH2-4, VER2-2, TRC2-2 | **Confidence:** HIGH

Cycle-1 plan task B was deferred. Working tree contains a hybrid implementation:
- `Date.now()` for staleness check (line 62) — ✅ matches Option 1 read side.
- `getDbNowMs()` for cache writes (line 79, 106) — ✗ does not match Option 1.
- Inner `try/catch` around cooldown set with `Date.now()` fallback (line 87-91) — partial mitigation for DB unreachable.

This is a different decision than what cycle-1 plan task B specified. Either commit and update plan, or fully apply Option 1.

**Recommendation:** Commit the hybrid approach as a deliberate decision (DB time for persistence-relevant timestamps) and update the plan. Then add tests covering the staleness behavior (carries cycle-1 AGG-5 forward).

---

### AGG-3: [MEDIUM] Analytics IIFE has 4-deep nested error handling

**Sources:** CR2-3, DBG2-2 | **Confidence:** HIGH

`src/app/api/v1/contests/[assignmentId]/analytics/route.ts:76-99` — async IIFE with 4 catch blocks (inner catch with nested try/catch, outer .catch). Hard to read; outer .catch swallows all errors silently (no logging).

**Fix:**
1. Extract refresh body into a named function `refreshAnalyticsCacheInBackground`.
2. Replace outer `.catch(() => {})` with `.catch((err) => logger.warn({ err, assignmentId }, "..."))`.
3. Drop inner cooldown-set try/catch — use `Date.now()` directly per PERF2-1.

---

### AGG-4: [MEDIUM] Analytics cooldown failure path makes 2 DB calls

**Sources:** PERF2-1 | **Confidence:** MEDIUM

When `getDbNowMs()` fails on line 79, the inner catch retries `getDbNowMs()` on line 88, then falls back to `Date.now()`. Under DB pressure, this duplicates the failing call.

**Fix:** Use `Date.now()` directly in the cooldown-fallback path. Bundles with AGG-3.

---

### AGG-5: [MEDIUM] Analytics route lacks tests for staleness/cooldown behavior

**Sources:** TE2-1 (carries cycle-1 AGG-5) | **Confidence:** HIGH

Same finding as cycle-1 AGG-5; still open.

**Fix:** Create `tests/unit/api/contests/analytics.test.ts` with mocked `computeContestAnalytics` and `getDbNowMs`. Use `vi.useFakeTimers()` to advance clock through staleness window. Cover: cache hit (fresh), cache hit (stale → background refresh), refresh failure (cooldown set), in-cooldown (no refresh), post-cooldown (refresh resumed), getDbNowMs failure (Date.now fallback used).

---

### AGG-6: [MEDIUM] Plan/code drift on Task B

**Sources:** DOC2-1, CRIT2-2 | **Confidence:** HIGH

Plan says Task B is `[d]` (deferred), but working tree contains partial implementation. Document or revert.

**Fix:** Bundles with AGG-1/AGG-2 commits — once committed, update Task B status.

---

### AGG-7: [LOW] Outer `.catch(() => {})` swallows all errors silently

**Sources:** CR2-3 (also part of AGG-3) | **Confidence:** MEDIUM

Bundled into AGG-3 fix.

---

### AGG-8: [LOW] Anti-cheat retry MAX_RETRIES=3 makes 30s clamp unreachable

**Sources:** CR2-5 | **Confidence:** HIGH

Comment claims clamp matters; with MAX_RETRIES=3 max delay is 8s. Tighten comment.

**Fix:** Update doc comment.

---

### AGG-9: [LOW] `__Secure-` cookie clear over HTTP is no-op

**Sources:** SEC2-1 | **Confidence:** MEDIUM

Browser ignores Set-Cookie with `Secure` over HTTP. Dev-only nuisance.

**Fix:** Defer; document if becomes a problem.

---

### AGG-10: [LOW] Anti-cheat online event handler can race with retry timer

**Sources:** DBG2-3 | **Confidence:** LOW

`flushPendingEventsRef.current()` and `retryTimerRef.current` can both fire concurrently after `online` event. Causes duplicate POSTs.

**Fix:** Cancel `retryTimerRef.current` at start of `flushPendingEventsRef.current()`.

---

### AGG-11: [LOW] AGENTS.md vs `password.ts` mismatch (carried from cycle 1 AGG-11)

Pre-existing policy ambiguity. Carried as deferred.

---

### AGG-12: [LOW] Privacy notice has no decline path

**Sources:** DES2-3 | **Confidence:** LOW

User must close tab to decline. UX judgment call.

**Fix:** Defer.

---

### AGG-13: [LOW] Anti-cheat retry/backoff has only indirect test coverage

**Sources:** TE2-3 | **Confidence:** LOW

No direct tests for backoff timing.

**Fix:** Defer; track for future cycle.

---

### AGG-14: [LOW] Anti-cheat monitor at 332 lines borders single-component complexity

**Sources:** ARCH2-2 | **Confidence:** MEDIUM

Refactor into hooks would help. No behavior change.

**Fix:** Defer; track.

---

## Verification Notes (no action — informational)

- `npm run lint`: 0 errors, 14 warnings (untracked .mjs scripts).
- `npm run build`: passes.
- `npm run test:unit`: 2210/2210 pass against working tree.
- aria-hidden, anti-cheat dep array, env tests all verified per cycle 1 plan.
- No security regressions; SEC2-1 only marginal.
- No UI/UX regressions; designer findings are minor and deferred.
- Workspace-to-public migration: no review opportunity surfaced this cycle.

---

## Carried Deferred Items (cycle 1 → cycle 2, unchanged)

| Cycle 1 ID | Description | Reason for deferral |
|------------|-------------|---------------------|
| AGG-4 (cycle 1) | Anti-cheat retry timer holds stale `performFlush` closure | Theoretical only |
| AGG-7 (cycle 1) | `getAuthSessionCookieNames()` is function-wrapped constant | Now justified — cycle 2 introduces second callsite (proxy.ts), keep as function |
| AGG-8 (cycle 1) | Analytics IIFE 3-level nesting | Now 4-level — promoted to AGG-3 above |
| AGG-10 (cycle 1) | Anti-cheat lacks user-visible offline indicator | Design tradeoff |
| AGG-11 (cycle 1) | AGENTS.md / password.ts mismatch | Policy decision needed |
| DEFER-22..57 | Carried from cycles 38-48 | See `_aggregate-cycle-48.md` |

---

## No Agent Failures

All 11 lanes (architect, code-reviewer, critic, debugger, designer, document-specialist, perf-reviewer, security-reviewer, test-engineer, tracer, verifier) completed successfully. Aggregate written without retries.
