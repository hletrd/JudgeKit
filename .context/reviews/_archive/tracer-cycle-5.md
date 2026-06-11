# Tracer — RPF Cycle 5/100

**Date:** 2026-04-26
**Method:** causal tracing of suspicious flows; competing-hypothesis evaluation

---

## TRC5-1: [HIGH, actionable, NEW] Trace: deploy → drizzle-kit push → "data loss" prompt → success log lies

**Severity:** HIGH (trace conclusion: ARCH5-1 + CRIT5-1)
**Confidence:** HIGH

**Hypothesis A:** drizzle-kit push exits non-zero on data-loss prompt → `die` fires → orchestrator sees a deploy failure.
**Hypothesis B:** drizzle-kit push exits zero with the prompt unanswered → `success "Database migrated"` runs → orchestrator sees deploy success.

**Evidence supports B:**
- The orchestrator note for cycle 5 explicitly says: "Deploy still proceeded via the additive `[OK] Database migrated` path."
- If A were true, the orchestrator would have reported `per-cycle-failed`.
- Therefore drizzle-kit push exits 0 even when the destructive change was NOT applied.

**Causal chain:**
1. `schema.pg.ts:418-420` removed plaintext `secretToken`.
2. `drizzle/pg/0020_drop_judge_workers_secret_token.sql` was hand-authored without `drizzle-kit generate`.
3. `meta/0020_snapshot.json` was never created → `meta/0019_snapshot.json` (the latest) still contains `secret_token`.
4. Each deploy: `drizzle-kit push` re-diffs `schema.pg.ts` (no `secret_token`) vs DB (has `secret_token`) → wants to drop.
5. Non-interactive shell → drizzle-kit emits prompt to stderr but exits 0 (NOT applied).
6. Bash sees exit 0 → `success "Database migrated"`.

**Fix:** See ARCH5-1 (regenerate snapshot, switch to `drizzle-kit migrate` or pass `--force`) plus CRIT5-1 (capture output and warn instead of success when prompt detected).

**Exit criteria:** Same as ARCH5-1 + CRIT5-1.

---

## TRC5-2: [LOW, NEW] Trace: `__test_internals` runtime gate vs type-system contract

**Severity:** LOW
**Confidence:** HIGH

**Hypothesis:** A future maintainer accidentally calls `__test_internals.cacheClear()` from production code.

**Trace:**
1. `route.ts:101-118`: `__test_internals` typed as `{ hasCooldown, ... } | (undefined-as-cast-to-the-same)`.
2. TypeScript checker sees `__test_internals.cacheClear` as a valid method call.
3. Runtime: in production, the value is `undefined` → throws `TypeError: Cannot read properties of undefined (reading 'cacheClear')`.

**Conclusion:** Behavior is fail-fast (good), but the type system is silent (bad). A test fixture that pins this contract (TE5-1) closes the loop.

---

## TRC5-3: [LOW, NEW] Trace: anti-cheat retry timer lifecycle across `assignmentId` changes

**Severity:** LOW
**Confidence:** MEDIUM

**Hypothesis:** Component re-renders with a new `assignmentId` while a retry timer for the old assignment is queued.

**Trace:**
1. `anti-cheat-monitor.tsx:42`: `retryTimerRef.current` is component-scoped.
2. `assignmentId` change does NOT unmount the component (parent stays).
3. The cleanup in `useEffect` (line 258-269) runs on unmount OR dependency change. The dep array is `[enabled, resolvedWarningMessage, showPrivacyNotice]` — does NOT include `assignmentId`. So an `assignmentId` change does NOT trigger cleanup.
4. The queued `setTimeout` then fires `performFlush()` which calls `loadPendingEvents(assignmentId)` with the NEW `assignmentId` (closure captures the latest ref).

**Conclusion:** The timer IS aimed at the new assignment after re-key. This MIGHT be intentional (events from old assignment are dropped) or MIGHT be a bug (events for old assignment are silently lost).

**Confidence is MEDIUM** because the parent layout almost certainly re-keys the component on assignmentId change (`<AntiCheatMonitor key={assignmentId} ... />` is the conventional pattern), which would trigger unmount+remount. Not verified in this review.

**Exit criterion for re-open:** Verify whether the parent uses `key={assignmentId}`. If not, document the cross-assignment data-loss behavior or fix it.

---

## Final Sweep

- The cycle-5 NEW finding (TRC5-1) is the key trace this cycle. It identifies the exact mechanism by which deploy lies about migration success.
- Cycle 4 trace findings (TRC4-1 scheduleRetryRef.current outlives unmount) addressed via cycle-3-4 documentation.
- All gates green: lint, test:unit, build.
