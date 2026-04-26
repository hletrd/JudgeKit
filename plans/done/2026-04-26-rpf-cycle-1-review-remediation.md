# RPF Cycle 1 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 1/100 of review-plan-fix loop
**Source aggregate:** `.context/reviews/_aggregate.md`

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[d]` — Deferred (with reason)

---

## Tasks

### Task A — [HIGH] Fix proxy.test.ts mock to export `getAuthSessionCookieNames` (AGG-1)

**Status:** `[x]` — done in commit `c915da0b` (2026-04-26). All 53 proxy tests pass; full suite passes 2210/2210.
**Severity:** HIGH (blocks `npm run test:unit` — 15 failing tests)
**Reference:** AGG-1 in aggregate

**Plan:**
1. Edit `tests/unit/proxy.test.ts:51-53` and add `getAuthSessionCookieNames` to the `vi.mock("@/lib/security/env", ...)` factory.
2. Use `vi.fn().mockReturnValue({ name: "authjs.session-token", secureName: "__Secure-authjs.session-token" })` so future test variants can override per-test if needed.
3. Verify by running `npm run test:unit` — all 2192+ tests should pass.
4. Commit with `test(proxy): 🐛 add getAuthSessionCookieNames to env mock`.

**Exit criteria:**
- `npm run test:unit` exits 0 with no failures.
- Each previously failing test now passes.

---

### Task B — [MEDIUM] Reconcile analytics time sources (AGG-2)

**Status:** `[x]` — completed in RPF cycle 2. Hybrid decision: `Date.now()` for in-process state (staleness check, cooldown read, cooldown fallback when DB unreachable); `getDbNowMs()` for cache writes where DB-time consistency matters across instances. See cycle 2 commit `e897b0a5` (perf change) and `362200f3` (refactor to named function with logged outer catch). Cycle 2 also added test coverage for these paths (AGG-5 closed) in commit covering `tests/unit/api/contests-analytics-route.test.ts`.
**Severity:** MEDIUM
**Reference:** AGG-2 in aggregate

**Plan:**
1. Open `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`.
2. Change cache writes (`createdAt`) to `Date.now()` so the staleness math is internally consistent (Option 1 from aggregate).
3. Update inline comments to document the unified time domain and the rationale (we trade one DB call per write for clock-domain consistency).
4. Confirm no other reader of `cached.createdAt` depends on DB-time semantics.
5. Commit with `fix(analytics): 🐛 unify cache time domain to Date.now() for staleness math`.

**Exit criteria:**
- `cached.createdAt` is set with `Date.now()` everywhere.
- Staleness check still uses `Date.now()`.
- Cooldown fallback unchanged.
- `npm run test:unit` and `npm run build` pass.

---

### Task C — [MEDIUM] Tighten anti-cheat retry semantics (AGG-3, AGG-6)

**Status:** `[x]` — done in commit `5cde234e` (2026-04-26). Documented `scheduleRetryRef` contract, dropped unused `flushPendingEvents` dep from `reportEvent`. Anti-cheat unit + component tests still pass.
**Severity:** MEDIUM (correctness/clarity)
**Reference:** AGG-3, AGG-6 in aggregate

**Plan:**
1. In `src/components/exam/anti-cheat-monitor.tsx`, drop `flushPendingEvents` from the `reportEvent` `useCallback` dependency array.
2. Add a JSDoc-style comment near the `scheduleRetryRef` definition documenting the contract: "input list is informational for backoff calculation; the timer reloads pending events from localStorage via `performFlush`."
3. Run unit + component tests.
4. Commit with `refactor(anti-cheat): ♻️ document scheduleRetryRef contract and drop unused dep`.

**Exit criteria:**
- `flushPendingEvents` no longer appears in `reportEvent`'s dep array.
- Doc comment explains semantics.
- All tests pass.

---

### Task D — [LOW] Add ARIA hidden to ShieldAlert icon (AGG-9)

**Status:** `[x]` — done in same commit `5cde234e` (2026-04-26). `aria-hidden="true"` added to the decorative ShieldAlert in the privacy notice dialog.
**Severity:** LOW (a11y)
**Reference:** AGG-9 in aggregate

**Plan:**
1. In `src/components/exam/anti-cheat-monitor.tsx`, add `aria-hidden="true"` to the `<ShieldAlert />` decorative icon in the privacy notice dialog.
2. Commit with `fix(a11y): 🔧 hide decorative ShieldAlert from assistive tech`.

**Exit criteria:**
- `aria-hidden="true"` present on the icon.
- Existing UI snapshot tests (if any) still pass.

---

### Task E — [LOW] Add unit test for `getAuthSessionCookieNames()` (AGG-12)

**Status:** `[x]` — done in commit `000bdfe5` (2026-04-26). Three new tests added in `tests/unit/security/env.test.ts`. Total env-test count up from 48 to 51.
**Severity:** LOW (coverage gap)
**Reference:** AGG-12 in aggregate

**Plan:**
1. Locate or create `tests/unit/security/env.test.ts`.
2. Add a `describe("getAuthSessionCookieNames", ...)` block asserting both names match the constants.
3. Commit with `test(env): ✅ cover getAuthSessionCookieNames return shape`.

**Exit criteria:**
- New test passes.
- Total unit-test count increases by at least 1.

---

## Deferred Items (existing, carried from prior cycles)

| ID | Description | Reason for deferral | Original cycle | Severity |
|----|-------------|---------------------|----------------|----------|
| AGG-4 (cycle 1) | Anti-cheat retry timer holds stale `performFlush` closure across `assignmentId` change | Theoretical only — `assignmentId` doesn't change in component lifetime today; reopen if dynamic prop is introduced. | 1 | MEDIUM |
| AGG-5 (cycle 1) | No tests for analytics `Date.now()` staleness behaviour | Will write after Task B settles new behaviour; tracked separately for next cycle. Reopen criterion: cycle 2 should add API-level tests. | 1 | MEDIUM |
| AGG-7 (cycle 1) | `getAuthSessionCookieNames()` is a function-wrapped constant | Single callsite — no measurable harm. Reopen if more callers materialise. | 1 | LOW |
| AGG-8 (cycle 1) | Analytics IIFE 3-level nested error handling | Cosmetic readability — tracking but no behavioural risk. Reopen with refactor opportunity. | 1 | LOW |
| AGG-10 (cycle 1) | Anti-cheat monitor lacks user-visible offline indicator | Design tradeoff (avoid distracting test-takers). Reopen with explicit UX direction. | 1 | LOW |
| AGG-11 (cycle 1) | AGENTS.md vs `password.ts` mismatch (extra dictionary/similarity checks) | Pre-existing policy ambiguity — needs user/PM decision before code or doc edit. CLAUDE.md says "only minimum length"; code does more. Removing checks would weaken security; updating doc would change rule. **Quoted policy:** AGENTS.md line 517 says "Password validation MUST only check minimum length". DEFER pending owner ruling. | 1 | LOW |
| DEFER-22 .. DEFER-57 | Carried from cycles 38–48 (see `.context/reviews/_aggregate-cycle-48.md` for full table). All re-validated as still relevant in cycle 1. | Each item has its own deferral rationale tracked in the cycle that created it. | various | LOW–MEDIUM |

---

## Workspace-to-Public Migration Note (long-term directive)

The user-injected directive at `user-injected/workspace-to-public-migration.md` requests incremental migration of dashboard-only pages to the public top navbar where appropriate. **Cycle 1 review surfaced no findings related to that migration**, so no migration task is added to this cycle. The standing plan at `plans/open/2026-04-19-workspace-to-public-migration.md` continues to track that work. Reopen if a future cycle's review highlights a candidate page.

---

## Cycle Gate Plan

After each task above commits, run:
1. `npm run lint` — must be clean (errors blocking).
2. `npm run build` — must succeed.
3. `npm run test:unit` — all unit tests must pass.

If any gate fails, fix root cause before moving on. No suppressions.

After all tasks land, run the deploy command per orchestrator `DEPLOY_MODE: per-cycle`:
```bash
bash -c 'set -a; source .env.deploy.algo; set +a; ./deploy-docker.sh'
```
