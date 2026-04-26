# RPF Cycle 5 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 5/100 of review-plan-fix loop
**Source aggregate:** `.context/reviews/_aggregate.md`

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[d]` — Deferred (with reason)

## Cycle 5 Summary

The cycle-5 review surfaced **2 HIGH-severity findings** (one with 5-agent convergence — the highest signal of the loop so far) and 1 MEDIUM, with ~16 LOW items. The HIGH cluster is a single root cause: drizzle-kit migration journal/snapshot drift causes the deploy to silently mask a destructive schema change while logging "Database migrated" — and that destructive change, when it finally runs, can permanently lock out judge workers whose plaintext token was never hashed.

Per the deferred-fix rules, the HIGH cluster (security + correctness + data-loss) is NOT deferrable. The MEDIUM workspace-to-public migration directive freshness pass is also planned this cycle.

**Implementation status (2026-04-26):**
- Task A `[x]` — 4 phases: A.1+A.2 commit `abb2965d` (snapshot regen + safety backfill), A.3+A.4 commit `c8207c5d` (deploy log honesty + push-vs-migrate doc).
- Task B `[x]` — commit `af838cf9` (workspace-to-public migration directive freshness pass).
- Task C `[x]` — commit `c78acf23` (TestInternals | undefined + drop cacheClear).
- Task D `[x]` — commit `dc37412e` (co-locate _refreshingKeys lifecycle).
- Task E `[x]` — commit `a24340e6` (clearAuthSessionCookies dual-clear test).
- Task F `[x]` — commit `ac052ba5` (production-mode __test_internals === undefined test).
- Task G `[x]` — commit `30f13795` (cycle-4 plan moved to plans/done/).

Gates: lint 0 errors (14 unchanged warnings in untracked dev .mjs scripts); test:unit 2232/2232 pass; build EXIT=0; deploy pending.

---

## Tasks

### Task A — [HIGH, 5-agent convergence] Resolve drizzle-kit journal/snapshot drift + deploy strategy + judge-worker auth safety (AGG5-1)

**Status:** `[x]` — done
**Severity:** HIGH (security + correctness + data-loss)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG5-1; per-agent: `architect.md` ARCH5-1, `security-reviewer.md` SEC5-1, `critic.md` CRIT5-1, `tracer.md` TRC5-1, `verifier.md` VER5-1

**Problem (cluster of four tightly-coupled symptoms):**

1. **Schema drift.** `drizzle/pg/0020_drop_judge_workers_secret_token.sql` exists in the journal but `drizzle/pg/meta/0020_snapshot.json` is MISSING. The latest snapshot `0019_snapshot.json` still contains `secret_token`. The migration was hand-authored without `drizzle-kit generate`.
2. **Deploy strategy mismatch.** `deploy-docker.sh:564` runs `drizzle-kit push` (schema-vs-DB diff), not `drizzle-kit migrate` (journal-driven SQL apply). Push refuses to drop the column non-interactively → exits 0 with the prompt unanswered.
3. **Deploy log lies.** Bash sees exit 0 → `success "Database migrated"` runs even though the column was NOT dropped. Operators see a green deploy.
4. **Data-loss risk.** When the destructive drop finally executes (e.g. with `--force`), any `judge_workers` rows with `secret_token_hash IS NULL AND secret_token IS NOT NULL` lose authentication permanently — the worker is locked out and must be re-registered.

**Plan (4 phases, ALL committed individually with semantic + gpg-signed messages):**

#### Phase A.1 — Regenerate the missing 0020 snapshot

1. Try `npx drizzle-kit generate` to refresh `meta/0020_snapshot.json` from `schema.pg.ts`. If it works, commit.
2. If it produces a different SQL file (e.g. tries to author a NEW drop migration), then hand-author `meta/0020_snapshot.json` by copying `meta/0019_snapshot.json` and removing the `secret_token` column entry from the `judge_workers` table block.
3. Verify: `grep -n "secret_token\b" drizzle/pg/meta/0020_snapshot.json` returns NO hits (only `secret_token_hash` if anything).

**Commit:** `fix(drizzle): 🐛 regenerate missing 0020_drop_judge_workers_secret_token snapshot`

#### Phase A.2 — Author a pre-drop backfill safety migration

The drop is dangerous if any worker has `secret_token IS NOT NULL AND secret_token_hash IS NULL`. We need a safety net.

1. Create `drizzle/pg/0021_backfill_secret_token_hash.sql`:
   ```sql
   -- Pre-drop safety: hash any plaintext secret_token into secret_token_hash
   -- where the hash is missing. Uses sha256 hex which matches the hashToken()
   -- function in src/lib/security/tokens.ts (verify before applying).
   --
   -- This migration is a no-op if the secret_token column has already been
   -- dropped (the WHERE clause matches zero rows).
   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'judge_workers' AND column_name = 'secret_token') THEN
       EXECUTE $sql$
         UPDATE judge_workers
         SET secret_token_hash = encode(sha256(secret_token::bytea), 'hex')
         WHERE secret_token_hash IS NULL AND secret_token IS NOT NULL
       $sql$;
     END IF;
   END$$;
   ```
2. Verify the hashing scheme against `src/lib/security/tokens.ts` `hashToken()` (or wherever) — IF the actual scheme is different (e.g. salted, base64, different alg), update the SQL to match.
3. Update `meta/_journal.json` to add the new `0021_backfill_secret_token_hash` entry. Generate the snapshot via `npx drizzle-kit generate` if possible (no schema change → no migration emitted, but snapshot lifecycle stays consistent).

**Commit:** `feat(drizzle): ✨ pre-drop safety backfill for judge_workers.secret_token_hash`

#### Phase A.3 — Make deploy log honest about destructive changes

Modify `deploy-docker.sh` to capture drizzle-kit push output and downgrade `success` to `warn` when a data-loss prompt is detected.

```sh
# Capture stdout+stderr so we can scan for the data-loss prompt.
PUSH_OUT=$(remote "PG_PASS=... && export ... && \
  docker run --rm --network ${NETWORK_NAME} \
    ... node:24-alpine \
    sh -c '... npx drizzle-kit push'" 2>&1) || die "drizzle-kit push failed — aborting deploy"

# Re-emit the captured output so operators see it.
printf '%s\n' "$PUSH_OUT"

if grep -qiE "data loss|are you sure|warn(ing)?:.*destructive" <<<"$PUSH_OUT"; then
  warn "drizzle-kit push detected a destructive schema change but did NOT apply it (interactive prompt unanswered). Manual intervention required: review the diff, then run with the change applied (e.g. db:push --force or drizzle-kit migrate)."
else
  success "Database migrated"
fi
```

**Commit:** `fix(deploy): 🐛 stop logging Database migrated when drizzle-kit push hits data-loss prompt`

#### Phase A.4 — Add an in-place comment explaining push-vs-migrate choice (DOC5-3)

Add to `deploy-docker.sh:546` a short comment block:
```sh
# We use `drizzle-kit push` (schema-vs-DB diff, no journal) instead of
# `drizzle-kit migrate` (journal-driven apply) because [historical reason].
# Destructive changes require manual intervention: drizzle-kit push prompts
# interactively on data-loss, and we detect-and-warn (not silently succeed)
# below. To apply destructive changes, set DRIZZLE_PUSH_FORCE=1 or use the
# migrate strategy.
```

**Commit:** `docs(deploy): 📝 explain drizzle-kit push vs migrate choice in deploy-docker.sh`

**Exit criteria (Task A):**
- `meta/0020_snapshot.json` exists and contains no `secret_token` column.
- A pre-drop backfill SQL migration exists at `drizzle/pg/0021_*.sql`.
- `deploy-docker.sh` no longer prints `[OK] Database migrated` when the push hits a data-loss prompt.
- A maintainer comment in `deploy-docker.sh` explains the push-vs-migrate choice.
- All gates green (lint, build, test:unit).

---

### Task B — [MEDIUM, 3-agent convergence] Update workspace-to-public migration directive to reflect actual code state (AGG5-2)

**Status:** `[x]` — done
**Severity:** MEDIUM (process/prioritization)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG5-2; per-agent: `critic.md` CRIT5-2, `document-specialist.md` DOC5-1, `verifier.md` VER5-2

**Problem:** The directive's "Current State" lists Sidebar items as if non-admin pages still lived there, but `src/components/layout/app-sidebar.tsx:55-59` says "Non-admin nav items have been removed from the sidebar." The migration is largely DONE.

**Plan:**
1. Edit `user-injected/workspace-to-public-migration.md`:
   - Add a "## Status (as of 2026-04-26)" section at the top.
   - Mark the "non-admin nav items removed from sidebar" milestone as DONE with citation `src/components/layout/app-sidebar.tsx:55-59` (with diff: sidebar returns null when no admin caps).
   - Update "Current State → Public top navbar" to also list the dropdown items (Dashboard/Problems/Problem-Sets/Groups/My-Submissions/Contests/Profile/Admin) per `src/lib/navigation/public-nav.ts:61-70`.
   - Identify SPECIFIC remaining migration candidates (or write "Migration is substantially complete; remaining items are gated admin pages — review case-by-case in subsequent cycles").
2. Re-verify in PROMPT 3 that the directive is consistent with the code at the time of commit.

**Exit criteria:**
- Directive reflects reality (sidebar admin-only; dropdown carries non-admin nav).
- Future per-cycle reviews can identify real residual work or close the directive.
- Commit: `docs(user-injected): 📝 mark workspace-to-public migration as substantially complete`

---

### Task C — [LOW, 4-agent convergence] Fix `__test_internals` type contract: `TestInternals | undefined` (AGG5-3) + drop unused `cacheClear` (AGG5-4)

**Status:** `[x]` — done
**Severity:** LOW (4-agent convergence on the type-system gap)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG5-3, AGG5-4; per-agent: `architect.md` ARCH5-2, `code-reviewer.md` CR5-1, `critic.md` CRIT5-3, `security-reviewer.md` SEC5-5, `tracer.md` TRC5-2

**Problem:** `route.ts:101-118` casts `undefined as unknown as <method-bag-type>` so the type system thinks the value is always present. A future refactor that calls `__test_internals.cacheClear()` from production code gets full IDE autocomplete and a runtime crash. Also: `cacheClear` is exported but never consumed by any test.

**Plan:**
1. Edit `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:101-118`:
   ```ts
   type TestInternals = {
     hasCooldown: (key: string) => boolean;
     setCooldown: (key: string, valueMs: number) => void;
     cacheDelete: (key: string) => boolean;
   };

   /**
    * Test-only accessor that exposes module-private state for unit tests.
    *
    * `undefined` outside `NODE_ENV === "test"`. Tests must non-null-assert.
    * Production code MUST NOT depend on this export.
    */
   export const __test_internals: TestInternals | undefined =
     process.env.NODE_ENV === "test"
       ? {
           hasCooldown: (key) => _lastRefreshFailureAt.has(key),
           setCooldown: (key, valueMs) => { _lastRefreshFailureAt.set(key, valueMs); },
           cacheDelete: (key) => analyticsCache.delete(key),
         }
       : undefined;
   ```
2. Update `tests/unit/api/contests-analytics-route.test.ts:234-247` to use non-null assertion `__test_internals!.setCooldown(...)`.
3. Verify `grep -rn "cacheClear" src/ tests/` returns no hits.
4. Run gates.

**Exit criteria:**
- TypeScript type of `__test_internals` is `TestInternals | undefined`.
- No double-cast `as unknown as`.
- `cacheClear` removed from the methods bag.
- Existing dispose-hook test still passes.
- All gates green.
- Commit: `refactor(analytics): ♻️ honest type for __test_internals + drop unused cacheClear`

---

### Task D — [LOW, 2-agent convergence] Co-locate `_refreshingKeys` add+delete inside `refreshAnalyticsCacheInBackground` (AGG5-5)

**Status:** `[x]` — done
**Severity:** LOW
**Confidence:** MEDIUM
**Reference:** `.context/reviews/_aggregate.md` AGG5-5; per-agent: `code-reviewer.md` CR5-2, `debugger.md` DBG5-1

**Problem:** `_refreshingKeys.add(cacheKey)` is at line 160 (in the GET handler), `delete` is in `finally` of `refreshAnalyticsCacheInBackground`. Lifecycle depends on the function's `finally` always running. A refactor that moves the `add` differently could leak the key.

**Plan:**
1. Edit `src/app/api/v1/contests/[assignmentId]/analytics/route.ts`:
   - Move `_refreshingKeys.add(cacheKey)` to be the FIRST statement inside `refreshAnalyticsCacheInBackground` (line 67, before the try).
   - Add an early-return guard at the top of the function: `if (_refreshingKeys.has(cacheKey)) return;` (idempotent).
   - Remove the `_refreshingKeys.add(cacheKey)` at line 160 (the caller). Keep the `_refreshingKeys.has(cacheKey)` check there as defense-in-depth (avoids enqueuing a no-op promise).
2. The existing dedup test (`tests/unit/api/contests-analytics-route.test.ts:142-176`) must still pass — the in-function guard preserves the invariant.
3. Run gates.

**Exit criteria:**
- `refreshAnalyticsCacheInBackground` is the single owner of `_refreshingKeys` add and delete.
- Existing dedup test passes.
- All gates green.
- Commit: `refactor(analytics): ♻️ co-locate _refreshingKeys lifecycle inside refreshAnalyticsCacheInBackground`

---

### Task E — [LOW, 2-agent convergence] Add unit test for `clearAuthSessionCookies` dual-clear (AGG5-6)

**Status:** `[x]` — done
**Severity:** LOW
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG5-6; per-agent: `security-reviewer.md` SEC5-2, `test-engineer.md` TE5-2

**Plan:**
1. Add `tests/unit/proxy/clear-auth-session-cookies.test.ts` (or extend an existing proxy test file):
   ```ts
   it("clearAuthSessionCookies sets maxAge=0 on both authjs.session-token and __Secure-authjs.session-token", () => {
     const res = clearAuthSessionCookies(NextResponse.next());
     const cookies = res.cookies.getAll();
     const plain = cookies.find(c => c.name === "authjs.session-token");
     const secure = cookies.find(c => c.name === "__Secure-authjs.session-token");
     expect(plain?.maxAge).toBe(0);
     expect(secure?.maxAge).toBe(0);
     expect(secure?.secure).toBe(true);
   });
   ```
2. May need to expose `clearAuthSessionCookies` if it's not currently exported, OR test indirectly via a route that calls it.
3. Run gates.

**Exit criteria:**
- New unit test passes.
- All gates green.
- Commit: `test(proxy): ✅ assert clearAuthSessionCookies clears both cookie name variants`

---

### Task F — [LOW] Add unit test asserting `__test_internals === undefined` in production NODE_ENV (AGG5-7)

**Status:** `[x]` — done
**Severity:** LOW
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG5-7; per-agent: `test-engineer.md` TE5-1

**Plan:**
1. Add to `tests/unit/api/contests-analytics-route.test.ts` (or a new file):
   ```ts
   it("__test_internals is undefined when NODE_ENV is not 'test'", async () => {
     vi.resetModules();
     vi.stubEnv("NODE_ENV", "production");
     const mod = await import("@/app/api/v1/contests/[assignmentId]/analytics/route");
     expect(mod.__test_internals).toBeUndefined();
     vi.unstubAllEnvs();
   });
   ```
2. Verify that subsequent tests (which DO need `__test_internals`) still work — the `vi.unstubAllEnvs()` in afterEach should restore.
3. Run gates.

**Exit criteria:**
- New test passes.
- Subsequent tests in the same file still pass.
- All gates green.
- Commit: `test(analytics): ✅ pin __test_internals === undefined in production NODE_ENV`

---

### Task G — [LOW, housekeeping] Move cycle-4 plan to `plans/done/` if all tasks `[x]` (CRIT5-4)

**Status:** `[x]` — done
**Severity:** LOW (process)
**Confidence:** HIGH

**Plan:**
1. Verify all tasks in `plans/open/2026-04-27-rpf-cycle-4-review-remediation.md` are `[x]` (verified at cycle start: yes).
2. `git mv plans/open/2026-04-27-rpf-cycle-4-review-remediation.md plans/done/`.
3. Commit.

**Exit criteria:**
- Cycle-4 plan in `plans/done/`.
- `plans/open/` has only standing/master plans + this cycle-5 plan.
- Commit: `docs(plans): 🗂️ archive completed cycle 4 plan to plans/done/`

---

## Deferred (DO NOT IMPLEMENT this cycle)

The following findings are recorded as deferred per the deferred-fix rules. Each cites file+line, original severity, deferral reason, repo-rule allowance (default = no rule forbids deferring this category), and exit criterion to re-open.

| Finding | File:Line | Severity | Reason for deferral | Exit criterion to re-open |
|---------|-----------|----------|---------------------|----------------------------|
| AGG5-8 — `MIN_INTERVAL_MS` constant placement (CR5-3) | `src/components/exam/anti-cheat-monitor.tsx:41` | LOW | Cosmetic, no behavior impact. Not a security/correctness/data-loss item. | Pick up opportunistically when this file is otherwise edited. |
| AGG5-9 — `lastEventRef` Record bound (CR5-4) | `src/components/exam/anti-cheat-monitor.tsx:40,127-129` | LOW | Closed-set in practice via `CLIENT_EVENT_TYPES`. Not a security/correctness/data-loss item. | Either (a) anti-cheat events become user-defined, or (b) a future review wants type-level enforcement. |
| AGG5-10 — `formatEventTime` ms-vs-seconds (DBG5-2) | `src/components/contest/anti-cheat-dashboard.tsx:296-300` | LOW | Number branch unreachable from current call sites; type confusion is hypothetical. Not a security/correctness/data-loss item. | A real call site emerges that passes a number, OR a code review wants the type narrowed. |
| AGG5-11 — Distinct-event-type burst (DBG5-3) | `src/components/exam/anti-cheat-monitor.tsx:127-130` | LOW | Server-side rate-limit handles. Not a security/correctness/data-loss item. | Server rate-limit becomes a load problem. |
| AGG5-12 — `formatDetailsJson` re-parsing per render (PERF5-2) | `src/components/contest/anti-cheat-dashboard.tsx:91-105,558-559` | LOW | Cosmetic perf; no user-visible regression. | Profile shows it as a top hot-spot during instructor review. |
| AGG5-13 — Drizzle-kit `npm install` per-deploy (PERF5-1) | `deploy-docker.sh:564` | LOW | Deploy slow but reliable. Not a security/correctness/data-loss item. | Deploy time becomes a process bottleneck. |
| AGG5-14 — `vi.resetModules()` slow tests (PERF5-3) | `tests/unit/api/contests-analytics-route.test.ts` | LOW | Tests work correctly. Not a security/correctness/data-loss item. | Test suite duration becomes a CI bottleneck. |
| AGG5-15 — Filter chips not keyboard-accessible (DES5-1) | `src/components/contest/anti-cheat-dashboard.tsx:436-454` | LOW | a11y bug but on instructor-only review surface. Not a security/correctness/data-loss item. | A dedicated a11y audit cycle picks it up, or an instructor reports a keyboard-nav issue. |
| AGG5-16 — Dark-mode contrast not verified (DES5-3) | `src/components/contest/anti-cheat-dashboard.tsx:75-89` | LOW | Sandbox has no live runtime; cannot verify contrast empirically. | A sandbox with Postgres + Docker + dark-mode toggle becomes available. |
| AGG5-19 — Storage-quota-exceeded test gap (TE5-5) | `tests/unit/components/anti-cheat-storage.test.ts` | LOW | Existing source code has the catch (anti-cheat-storage.ts:60-68). Not a security/correctness/data-loss item. | Pick up when this test file is otherwise edited. |
| AGG5-20 — Anti-cheat retry timer cross-assignment trace (TRC5-3) | `src/components/exam/anti-cheat-monitor.tsx:42,162-270` | LOW | Likely re-keyed by parent (`<AntiCheatMonitor key={assignmentId} ... />`); not verified but conventional pattern. | Verify the parent component's render to confirm or refute the re-key assumption. |
| AGG-3-5 / SEC3-3 — AGENTS.md vs `password.ts` mismatch (carried) | `AGENTS.md`, `src/lib/auth/password.ts` | MEDIUM | Requires user/PM decision (which is canonical). Repo rules don't forbid deferring docs/policy items pending a stakeholder decision. | User/PM declares which is canonical. |
| AGG3-6 / SEC3-1 — `__Secure-` cookie clear over HTTP (carried) | `src/proxy.ts:87-97` | LOW | Production is HTTPS-only; this is a dev-only nuisance. Repo rule (CLAUDE.md): production HTTPS guaranteed. | Dev-environment scenario where HTTP cookies need clearing. |
| AGG3-7 / TE3-2 — Anti-cheat retry timing tests (carried) | `tests/unit/components/anti-cheat-*` | LOW | Test setup non-trivial (timers + visibility events + network mocks). Not a security/correctness/data-loss item. | A regression in retry behavior, OR a dedicated test infrastructure cycle. |
| AGG3-8 / DES3-1 — Privacy notice has no decline path (carried) | `src/components/exam/anti-cheat-monitor.tsx:274-298` | LOW | UX/legal judgment call. Repo rules don't forbid deferring product decisions. | Product/legal decides whether to add a "Decline → exit assignment" path. |
| AGG3-9 / ARCH3-2 — Anti-cheat at 335 lines (carried) | `src/components/exam/anti-cheat-monitor.tsx` | LOW | Behavior-neutral refactor below the 400-line repo threshold. Repo rule (file size threshold) not breached. | File grows beyond 400 lines, OR a refactor opportunity emerges that includes behavior change. |
| Other carried-deferred from cycles 1-4, 38-48 | various | LOW-MEDIUM | See `_aggregate-cycle-48.md` and prior cycle aggregates for full provenance. | As stated per item. |

---

## Verification Plan

After each task commit, run the gates locally:
- `npm run lint` (must be EXIT=0; existing 14 untracked-script warnings unchanged)
- `npm run build` (must be EXIT=0)
- `npm run test:unit` (must be EXIT=0)

After all tasks complete, run the deploy per `DEPLOY_MODE: per-cycle`:
- `bash -c 'set -a; source .env.deploy.algo; set +a; ./deploy-docker.sh --skip-languages --no-worker --skip-worker-build'`

---

## Rule Compliance

- All commits will be GPG-signed (`-S` flag) per CLAUDE.md / global rules.
- Conventional commit format with gitmoji.
- No `Co-Authored-By` lines.
- No `--no-verify`, no force-push.
- Fine-grained: one commit per task (or per phase for Task A).
- `git pull --rebase` before each `git push`.
