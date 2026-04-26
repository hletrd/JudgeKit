# RPF Cycle 2 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 2/100 of review-plan-fix loop
**Source aggregate:** `.context/reviews/_aggregate.md`

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[d]` — Deferred (with reason)

## Cycle 2 Summary

All 6 tasks completed:
- Task A `[x]` commit `1c25cbed` — env.ts factory.
- Task B `[x]` commit `214b8591` — proxy.ts uses factory.
- Task C `[x]` commit `e897b0a5` — analytics Date.now() optimization + cooldown fallback.
- Task D `[x]` commit `362200f3` — analytics IIFE refactored to named function with logged outer catch.
- Task E `[x]` commit `df72d773` — analytics route tests (7 new, suite up from 2210 to 2217).
- Task F `[x]` commit `a68b31c0` — anti-cheat retry-clamp comment clarified.

Gates: lint 0 errors, test 2217/2217, build pass.

---

## Tasks

### Task A — [HIGH] Commit `getAuthSessionCookieNames` factory in `src/lib/security/env.ts` (AGG-1)

**Status:** `[x]`
**Severity:** HIGH (production code that tests/proxy depend on is uncommitted at HEAD)
**Reference:** AGG-1

**Plan:**
1. Stage `src/lib/security/env.ts` only.
2. Commit with `feat(security): ✨ add getAuthSessionCookieNames factory for both cookie variants`.
3. Verify via `git show HEAD -- src/lib/security/env.ts` shows the new function.

**Exit criteria:**
- HEAD's `src/lib/security/env.ts` exports `getAuthSessionCookieNames`.
- `tests/unit/security/env.test.ts` passes against HEAD.

---

### Task B — [HIGH] Commit `src/proxy.ts` to use the new factory in `clearAuthSessionCookies` (AGG-1)

**Status:** `[x]`
**Severity:** HIGH
**Reference:** AGG-1

**Plan:**
1. Stage `src/proxy.ts` only.
2. Commit with `refactor(proxy): ♻️ derive cookie names from getAuthSessionCookieNames factory`.
3. Verify via `git show HEAD -- src/proxy.ts` shows the import + call sites.

**Exit criteria:**
- HEAD's `src/proxy.ts` imports `getAuthSessionCookieNames`.
- `tests/unit/proxy.test.ts` passes against HEAD.

---

### Task C — [HIGH] Commit analytics route Date.now() staleness optimization + cooldown fallback (AGG-2)

**Status:** `[x]`
**Severity:** HIGH (working-tree-only behavioral change)
**Reference:** AGG-2

**Plan:**
1. Stage `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`.
2. Commit with `perf(analytics): ⚡ use Date.now() for staleness check, fallback for cooldown`.
3. Update cycle-1 plan to mark Task B as `[x]` with the actual decision recorded (hybrid: Date.now() for in-process state, getDbNowMs() for cache writes).

**Exit criteria:**
- HEAD's analytics route uses `Date.now()` for staleness check.
- HEAD's analytics route has cooldown fallback try/catch with `Date.now()` fallback.
- Cycle-1 plan reflects completion of Task B.
- `npm run test:unit` and `npm run build` pass.

---

### Task D — [MEDIUM] Refactor analytics IIFE to named function with logged outer catch (AGG-3, AGG-4, AGG-7)

**Status:** `[x]`
**Severity:** MEDIUM
**Reference:** AGG-3, AGG-4, AGG-7

**Plan:**
1. Extract the async IIFE body in `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:76-99` into a top-level `async function refreshAnalyticsCacheInBackground(assignmentId, cacheKey)`.
2. Drop the inner `try/catch` around cooldown set — use `Date.now()` directly (avoids the redundant DB call from PERF2-1).
3. Replace outer `.catch(() => {})` with `.catch((err) => logger.warn({ err, assignmentId }, "[analytics] background refresh swallowed unhandled rejection"))`.
4. Run `npm run lint`, `npm run build`, `npm run test:unit`.
5. Commit with `refactor(analytics): ♻️ extract background refresh to named function with logged outer catch`.

**Exit criteria:**
- Analytics route nesting reduced from 4 levels to 2.
- Outer rejection is logged (not silently swallowed).
- Cooldown failure path uses `Date.now()` directly (no redundant DB call).
- All gates green.

---

### Task E — [MEDIUM] Add unit tests for analytics route staleness/cooldown behavior (AGG-5)

**Status:** `[x]`
**Severity:** MEDIUM (carries cycle-1 AGG-5)
**Reference:** AGG-5

**Plan:**
1. Create `tests/unit/api/contests/analytics.test.ts`.
2. Mock `@/lib/db/queries` for `rawQueryOne` (returns assignment row).
3. Mock `@/lib/assignments/contest-analytics` for `computeContestAnalytics`.
4. Mock `@/lib/db-time` for `getDbNowMs`.
5. Mock `@/lib/assignments/submissions` for `canViewAssignmentSubmissions`.
6. Use `vi.useFakeTimers()` and `vi.setSystemTime(...)` to advance clock.
7. Test cases:
   - Cache hit + within TTL (age < 30s) → returns cached, no DB time call.
   - Cache hit + stale (age > 30s, < 60s TTL) → returns stale + triggers ONE background refresh.
   - Background refresh failure → cooldown timestamp set.
   - Subsequent stale request within cooldown (< 5s after failure) → no second refresh.
   - Subsequent stale request after cooldown (> 5s) → refresh resumed.
   - getDbNowMs failure during cooldown set → Date.now() fallback used.
8. Commit with `test(analytics): ✅ cover staleness/cooldown behavior in contest analytics route`.

**Exit criteria:**
- New test file passes.
- Total unit-test count increases by 6+.

---

### Task F — [LOW] Tighten misleading 30s clamp comment in anti-cheat monitor (AGG-8)

**Status:** `[x]`
**Severity:** LOW
**Reference:** AGG-8

**Plan:**
1. In `src/components/exam/anti-cheat-monitor.tsx`, update the doc comment near `scheduleRetryRef` (lines 122-124) to clarify: "with current `MAX_RETRIES=3`, worst-case backoff is 8000ms; the 30000ms clamp is defensive in case `MAX_RETRIES` increases in the future."
2. Commit with `docs(anti-cheat): 📝 clarify retry-backoff clamp is defensive for MAX_RETRIES growth`.

**Exit criteria:**
- Comment text updated.
- All gates green.

---

## Deferred Items

| ID | Description | File:line | Severity | Confidence | Reason | Exit criterion |
|----|-------------|-----------|----------|------------|--------|----------------|
| AGG-9 (cycle 2) | `__Secure-` cookie clear over HTTP is no-op | `src/proxy.ts:94` | LOW | MEDIUM | Dev-only nuisance; production HTTPS is guaranteed via TLS. Conditional `secure` would add code without prod value. | Reopen if a developer reports stuck `__Secure-` cookie in dev/non-HTTPS deployment. |
| AGG-10 (cycle 2) | Anti-cheat online event can race with retry timer | `src/components/exam/anti-cheat-monitor.tsx:276-278` | LOW | LOW | Server is idempotent; duplicate POST wastes a request but produces no incorrect state. Fix would add complexity. | Reopen if duplicate anti-cheat events appear in audit logs. |
| AGG-11 (cycle 2) | AGENTS.md vs `password.ts` mismatch (pre-existing) | `AGENTS.md:517-521`, `src/lib/security/password.ts:45,50,59` | LOW | MEDIUM | Policy ambiguity — needs user/PM decision before code or doc edit. **Quoted policy:** AGENTS.md says "Password validation MUST only check minimum length"; code does dictionary + similarity. Removing checks would weaken security; updating doc would change rule. | User decision on which side to reconcile. |
| AGG-12 (cycle 2) | Privacy notice has no decline path | `src/components/exam/anti-cheat-monitor.tsx:304-329` | LOW | LOW | UX judgment call; current flow assumes exam staff already authorized monitoring. | Reopen with explicit UX direction (e.g., "show decline button that exits to dashboard"). |
| AGG-13 (cycle 2) | Anti-cheat retry/backoff has only indirect test coverage | `src/components/exam/anti-cheat-monitor.tsx` | LOW | LOW | Component-level testing of timing-based hooks requires `vi.useFakeTimers` + `apiFetch` mock; non-trivial setup. | Pick up in a dedicated testing-focused cycle. |
| AGG-14 (cycle 2) | Anti-cheat at 332 lines borders single-component complexity | `src/components/exam/anti-cheat-monitor.tsx` | LOW | MEDIUM | Refactor would touch many lines for no behavioral change; risk-vs-reward unfavorable in tight cycle. | Reopen when adding a new feature that would push the file past 400+ lines. |
| AGG-4 (cycle 1) | Anti-cheat retry timer holds stale closure across `assignmentId` change | `src/components/exam/anti-cheat-monitor.tsx:138-141` | MEDIUM | MEDIUM | `assignmentId` doesn't change in component lifetime today; component is keyed on it. | Reopen if a future caller passes `assignmentId` as a changing prop. |
| DEFER-22..57 | Carried from cycles 38-48 | various | LOW–MEDIUM | various | See `.context/reviews/_aggregate-cycle-48.md` for full table. | Each item has its own deferral rationale tracked. |

**Repo policy compliance:** All deferred items respect:
- CLAUDE.md: no destructive deferrals; security-relevant items (AGG-11) explicitly call out the policy ambiguity per repo rule.
- AGENTS.md: deferral notes do not contradict GPG signing, conventional commits, or required language versions.
- No security or correctness items deferred without explicit repo-policy quote (AGG-11 quotes AGENTS.md:517-521).

---

## Workspace-to-Public Migration Note (long-term directive)

The user-injected directive at `user-injected/workspace-to-public-migration.md` requests incremental migration of dashboard-only pages to the public top navbar where appropriate. **Cycle 2 review surfaced no findings related to that migration**, so no migration task is added to this cycle. The standing plan at `plans/open/2026-04-19-workspace-to-public-migration.md` continues to track that work. Reopen if a future cycle's review highlights a candidate page.

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
