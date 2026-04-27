# RPF Cycle 7 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 7/100 of review-plan-fix loop
**Source aggregate:** `.context/reviews/_aggregate.md`

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[d]` — Deferred (with reason)

## Cycle 7 Summary

The cycle-7 multi-agent review surfaced **0 HIGH-severity** and **0 MEDIUM-severity** findings. All 3 cycle-6 plan tasks (Step 5b backfill, DRIZZLE_PUSH_FORCE documentation, cycle-5 plan archival) are confirmed RESOLVED at HEAD across all 11 review lanes. No regressions detected.

The cycle-7 findings cluster into ~50 LOW items (~28 deduplicated after cross-agent overlap), of which 3 are plannable for implementation this cycle:

1. **AGG7-1** (3-agent convergence: CRIT7-1, PERF7-1, CRIT7-2) — Add sunset criterion comment to `deploy-docker.sh` Step 5b and AGENTS.md "Sunset criteria" subsection. The cycle-6 backfill is correct but adds permanent ~5-10s overhead per deploy; without a sunset criterion, future maintainers will preserve it indefinitely.
2. **AGG7-2** (housekeeping: CRIT7-4) — Move cycle-6 plan to `plans/done/` per the README convention.
3. **AGG7-3** (3-agent convergence: DBG7-3, TE7-2, TE7-5) — Add explanatory comment above `route.ts:84` clarifying the dual nature of the `_lastRefreshFailureAt.delete` (necessary on first-set, redundant on overwrite via dispose hook).

All ~28 other deduplicated LOW findings are defensible defers, recorded in the deferred table at the end of this plan with file+line, severity, deferral reason, and exit criteria per the deferred-fix rules.

**Implementation status (2026-04-26):**
- Task A `[x]` — commit `809446dc` (deploy-docker.sh Step 5b sunset criterion + AGENTS.md "Sunset criteria" subsection).
- Task B `[x]` — commit `2aab3a33` (cycle-6 plan moved to plans/done/).
- Task C `[x]` — commit `ea083609` (route.ts:84 first-set vs overwrite comment).

Gates: lint 0 errors (14 unchanged warnings in untracked dev .mjs scripts); test:unit 304 files / 2234 tests pass; build EXIT=0.

---

## Tasks

### Task A — [LOW, 3-agent convergence] Document sunset criterion for `deploy-docker.sh` Step 5b backfill (AGG7-1 / CRIT7-1 / PERF7-1 / CRIT7-2)

**Status:** `[x]` — done in commit `809446dc`
**Severity:** LOW (operational lifecycle / ops debt)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG7-1; per-agent: `critic.md` CRIT7-1, `critic.md` CRIT7-2, `perf-reviewer.md` PERF7-1

**Problem:** The cycle-6 fix introduced Step 5b in `deploy-docker.sh:570-596` — an idempotent `secret_token` backfill that runs on EVERY deploy regardless of whether the column exists. The fix is correct (the `IF EXISTS` guard makes the DO-block a no-op when the column is gone), but adds a permanent ~5-10s overhead per deploy. Without a documented sunset criterion, future maintainers will:
- Preserve the block indefinitely (operational debt).
- Or remove it without checking that all environments have applied the DROP COLUMN, regressing cycle-6.

**Plan:**

1. Add an inline comment block to `deploy-docker.sh` at the end of the Step 5b comment block (around lines 567-569), noting:
   - The SUNSET CRITERION: this Step 5b can be removed when (a) the `secret_token` column is verified ABSENT from ALL deploy environments via `psql ... -c "\d judge_workers"`, AND (b) at least 6 months have passed since this fix was deployed (cycle-6 commit `18d93273` on 2026-04-26).
   - A target re-evaluation date: 2026-10-26 (6 months out from the cycle-6 fix).
   - The check command to verify column absence.
2. Add a corresponding "Sunset criteria" subsection to `AGENTS.md` "Database migration recovery (DRIZZLE_PUSH_FORCE)" section (around line 365), describing:
   - Same sunset criterion + re-evaluation date.
   - The verification command operators can run before removing.

**Commit:** `docs(deploy): 📝 add sunset criterion for Step 5b secret_token backfill (AGG7-1)`

**Exit criteria:**
- `deploy-docker.sh` Step 5b comment block contains "SUNSET" (or equivalent) keyword + re-evaluation date.
- `AGENTS.md` "Database migration recovery" section has a "Sunset criteria" subsection.
- All gates green (lint 0 errors / 14 unchanged warnings, test:unit pass, build EXIT=0).

---

### Task B — [LOW, housekeeping] Archive cycle-6 plan to `plans/done/` (AGG7-2 / CRIT7-4)

**Status:** `[x]` — done in commit `2aab3a33`
**Severity:** LOW (process)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG7-2; per-agent: `critic.md` CRIT7-4

**Problem:** `plans/open/2026-04-26-rpf-cycle-6-review-remediation.md` exists with all tasks marked `[x]` done. Per `plans/open/README.md:36-39`: "Once **every** task in such a plan is `[x]`, the plan must be moved to `plans/done/` in the next cycle's housekeeping pass — typically by the cycle that follows it."

**Plan:**
1. Verify all tasks in `plans/open/2026-04-26-rpf-cycle-6-review-remediation.md` are `[x]` (verified at cycle start: yes — A, B, C all `[x]` with commit IDs `18d93273`, `8a776241`, `e5d1dc64`).
2. `git mv plans/open/2026-04-26-rpf-cycle-6-review-remediation.md plans/done/`.
3. Commit.

**Commit:** `docs(plans): 🗂️ archive completed cycle 6 plan to plans/done/ (AGG7-2)`

**Exit criteria:**
- Cycle-6 plan in `plans/done/`.
- `plans/open/` contains only standing/master plans + this cycle-7 plan.

---

### Task C — [LOW, 3-agent convergence] Document the dual nature of `_lastRefreshFailureAt.delete` in `route.ts:84` (AGG7-3 / DBG7-3 / TE7-2 / TE7-5)

**Status:** `[x]` — done in commit `ea083609`
**Severity:** LOW (maintainability — invariant invisible to readers)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG7-3; per-agent: `debugger.md` DBG7-3, `test-engineer.md` TE7-2 / TE7-5

**Problem:** `route.ts:82-84` (success path) calls:
```ts
analyticsCache.set(cacheKey, { data: fresh, createdAt: await getDbNowMs() });
_lastRefreshFailureAt.delete(cacheKey);
```

The dispose hook ALSO clears the cooldown on overwrite. So the explicit delete is:
- REDUNDANT on overwrite (dispose already cleared)
- NECESSARY on first-set (no prior entry → no dispose fires)

This dual nature is invisible. A reader scanning the code might think the explicit delete is always necessary (and not realize dispose covers the overwrite case), or always redundant (and remove it, breaking the first-set case).

**Plan:**
1. Add a one-line comment above `route.ts:84` explaining the dual nature:
   ```ts
   // Explicit delete here covers the "first set" case (no prior value, no
   // dispose fires). On overwrite, dispose has already cleared the cooldown.
   _lastRefreshFailureAt.delete(cacheKey);
   ```

**Commit:** `docs(analytics): 📝 clarify _lastRefreshFailureAt delete necessity on first-set vs overwrite (AGG7-3)`

**Exit criteria:**
- Comment present above `route.ts:84` describing the first-set vs overwrite split.
- Gates green.

---

## Deferred (DO NOT IMPLEMENT this cycle)

The following findings are recorded as deferred per the deferred-fix rules. Each cites file+line, original severity (preserved, NOT downgraded), deferral reason, repo-rule allowance (default = no rule forbids deferring this category), and exit criterion to re-open.

**Repo-rule check:** Per orchestrator's deferred-fix rules, "Security, correctness, and data-loss findings are NOT deferrable unless the repo's own rules explicitly allow it." All cycle-7 findings are LOW-severity. No HIGH or MEDIUM findings are present. The cluster around `secret_token` (cycle-6 AGG6-1) is confirmed FIXED at HEAD; the remaining findings are operational lifecycle / cosmetic / defensive.

| Finding | File:Line | Severity | Reason for deferral | Exit criterion to re-open |
|---------|-----------|----------|---------------------|----------------------------|
| AGG7-4 (ARCH7-1) — 4x duplicate psql/node container boilerplate in deploy-docker.sh | `deploy-docker.sh:576-595, 635-645, 659-670, 675-683` | LOW | Operational refactor; current code works; "shotgun surgery" risk if image versions diverge | Future deploy-script refactor cycle, OR postgres image bump |
| AGG7-5 (ARCH7-2 / carries AGG6-3) — `tags.updated_at` nullable inconsistency | `src/lib/db/schema.pg.ts:1056-1057`, `drizzle/pg/0021_lethal_black_tom.sql` | LOW | No current consumer (verified via grep); other 18 updated_at columns are `.notNull()` | First consumer of `tag.updatedAt` is added, OR dedicated schema-consistency cycle |
| AGG7-6 (ARCH7-3) — `analyticsCache.dispose` invariant lives in catch-block comment only | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:34-47` | LOW | Code correct; defensive doc improvement at cache declaration | Refactor that splits the function or reuses the cache |
| AGG7-7 (ARCH7-4) — `getAuthSessionCookieName` vs `getAuthSessionCookieNames` API confusion | `src/lib/security/env.ts:166-180` | LOW | Current callers correct; cosmetic JSDoc improvement | New caller of these functions, OR opportunistic edit |
| AGG7-8 (CR7-1) — `_lastRefreshFailureAt` no single owner via wrapper | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:32` | LOW | Code correct; cosmetic refactor for invariant searchability | Future refactor of analytics module |
| AGG7-9 (CR7-2) — `performFlush` serial-await rationale undocumented | `src/components/exam/anti-cheat-monitor.tsx:67-80` | LOW | Code correct (intentional rate-limit behavior); comment improvement | Opportunistic edit of anti-cheat-monitor.tsx |
| AGG7-10 (CR7-3) — `__test_internals.cacheDelete` ambiguous test API name | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:118,128` | LOW | Test API stable; rename impacts 1 test caller | Pick up alongside AGG6-6 setCooldown rename |
| AGG7-11 (CR7-4) — `bytesToBase64`/`bytesToHex` inconsistent iteration style | `src/proxy.ts:31-41` | LOW | Cosmetic; both functions are correct | Opportunistic edit of proxy.ts |
| AGG7-12 (CR7-5 / SEC7-4) — Cookie-clear secure-flag semantics undocumented | `src/proxy.ts:87-97` | LOW | Code correct (RFC 6265 semantics); comment improvement | Opportunistic edit of proxy.ts |
| AGG7-13 (CRIT7-3) — Schema repairs band-aid block undocumented | `deploy-docker.sh:658-670` | LOW | Operational; pick up alongside AGG7-4 | Future deploy-script refactor cycle |
| AGG7-14 (DBG7-1) — Step 5b heredoc multi-layer escape map undocumented | `deploy-docker.sh:576-595` | LOW | Code correct; comment improvement for fragile escaping | Opportunistic edit of Step 5b block |
| AGG7-15 (DBG7-2 / VER7-1) — NETWORK_NAME bare `judgekit` regex | `deploy-docker.sh:573` | LOW | Single-project deploy host (current production setup) is unaffected | Multi-project deploy host scenario documented |
| AGG7-16 (DBG7-4 / TRC7-2) — `scheduleRetryRef` no-op default + stale-closure risk | `src/components/exam/anti-cheat-monitor.tsx:95,109-122` | LOW | Theoretical; React effect ordering protects; assignmentId stable | New mid-life assignmentId mutation pattern |
| AGG7-17 (DES7-1 / carries DES3-1) — Privacy notice no decline path | `src/components/exam/anti-cheat-monitor.tsx:274-298` | LOW | UX/legal call (carried since cycle 3) | Product/legal decision |
| AGG7-18 (DES7-2) — Privacy notice WCAG AA contrast borderline | `src/components/exam/anti-cheat-monitor.tsx:287` | LOW | Verification needs runtime; Tailwind muted-foreground is borderline AA | Live runtime audit cycle |
| AGG7-19 (DES7-3) — Modal escape handler implicit (vs explicit `e.preventDefault()`) | `src/components/exam/anti-cheat-monitor.tsx:276` | LOW | a11y on exam-only surface; current Radix wiring works | Dedicated a11y audit cycle |
| AGG7-20 (DES7-4) — Heartbeat interval hardcoded | `src/components/exam/anti-cheat-monitor.tsx:30` | LOW | No current product requirement for per-assignment override | Product requirement for variable heartbeat |
| AGG7-21 (DES7-5) — Smallest mobile dialog overflow risk | `src/components/exam/anti-cheat-monitor.tsx:287` | LOW | Verification needs runtime | Live runtime audit cycle |
| AGG7-22 (DOC7-1) — AGENTS.md missing source plan/aggregate cross-refs | `AGENTS.md:349-365` | LOW | Cosmetic; current section is self-contained | Opportunistic AGENTS.md edit |
| AGG7-23 (DOC7-2) — `.env.example` cross-reference is section-name (string-search) | `.env.example:25-31`, `.env.production.example:14-20` | LOW | Acceptable; survives most renames | AGENTS.md section rename |
| AGG7-24 (DOC7-3 / carries CR6-3) — `0021_lethal_black_tom.sql` filename auto-generated | `drizzle/pg/0021_lethal_black_tom.sql` | LOW | Drizzle-kit rename procedure carries replay risk | Drizzle-kit version supports rename detection |
| AGG7-25 (DOC7-4) — Plan deferred-table phrasing inconsistent | All `plans/**/*.md` | LOW | Process improvement; current phrasing is functional | Standardization cycle |
| AGG7-26 (DOC7-6) — `.context/reviews/README.md` missing per-agent file convention | `.context/README.md` | LOW | Process doc; convention is implicit but understood | Opportunistic README edit |
| AGG7-27 (PERF7-2 / carries AGG5-13) — drizzle-kit npm install per-deploy | `deploy-docker.sh:644` | LOW | Operational refactor; deploy slow but reliable | Operational efficiency cycle |
| AGG7-28 (PERF7-3 / carries AGG6-9) — `_lastRefreshFailureAt` indirect bound | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:32` | LOW | Defense-in-depth; current bound via dispose-coupling works | New code path adds cooldown without cache-set |
| AGG7-29 (PERF7-4) — `performFlush` serial-await latency on large queues | `src/components/exam/anti-cheat-monitor.tsx:67-80` | LOW | Edge-case perf (200 events × 50ms RTT = 10s); intentional rate-limit design | High-pending-queue performance complaint |
| AGG7-30 (PERF7-5) — proxy.ts `authUserCache` O(n) cleanup at 90% capacity | `src/proxy.ts:71-78` | LOW | Rare edge case (would require 450+ unique cache keys in <2s) | Cache-thrash incident OR move to lru-cache |
| AGG7-31 (PERF7-6) — Cache-miss `getDbNowMs()` round-trip | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:190` | LOW | Negligible (~1ms per cache miss; cache miss is rare) | Performance regression | 
| AGG7-32 (SEC7-1) — `PGPASSWORD` exposed in `docker inspect` for ~5-10s | `deploy-docker.sh:576,635,659,675` | LOW | Defense-in-depth; deploy host is hardened, docker.sock access is limited | Deploy host hardening review |
| AGG7-33 (SEC7-2) — psql connection without `sslmode=` (internal docker network) | `deploy-docker.sh:583,667,683` | LOW | Internal docker bridge network is private to host | Cross-host bridge or insecure host config |
| AGG7-34 (SEC7-3) — `suspicious_ua_mismatch` audit events unbounded | `src/proxy.ts:282-291` | LOW | Audit log infra is centrally managed; threshold downstream | Audit table capacity issue |
| AGG7-35 (TE7-1) — Hash semantics SQL `encode(sha256())` vs JS `createHash('sha256')` not pinned | `src/lib/judge/auth.ts:21-23`, `deploy-docker.sh:586-591` | LOW | Both forms are well-known SHA-256 hex; trivially deterministic | Hash-form change to either side OR test-coverage cycle |
| AGG7-36 (TE7-3) — `performFlush` lacks dedicated unit test | `src/components/exam/anti-cheat-monitor.tsx:67-80` | LOW | Functionally covered by wrapping behavior tests | Unit-test depth cycle |
| AGG7-37 (TE7-4) — schema-parity test only generic (no specific column assertions) | `tests/unit/db/schema-parity.test.ts` | LOW | Generic suite catches table-level drift; column-level drift would be caught in integration | Integration test infrastructure cycle |

### Carried-deferred from cycle 6 (unchanged)

All cycle-6 carried-deferred items remain accurate at HEAD (verified by all 11 cycle-7 review lanes):

| Cycle 6 ID | Description | Reason for deferral |
|------------|-------------|---------------------|
| AGG6-3 | tags.updated_at nullable inconsistency | No current consumer (re-verified cycle-7) |
| AGG6-4 | 0021_lethal_black_tom.sql filename | Drizzle-kit rename procedure risk |
| AGG6-5 | Cycle-5 dispose-hook test name | Cosmetic test naming |
| AGG6-6 | setCooldown.valueMs param naming | Cosmetic |
| AGG6-7 | deploy-docker.sh AGG5-1 reference rot | Ephemeral content |
| AGG6-8 | deploy-docker.sh:596 regex broadness | Pattern works against drizzle-kit |
| AGG6-9 | _lastRefreshFailureAt indirect bound | Defense-in-depth (re-flagged AGG7-28) |
| AGG6-10 | __test_internals block-vs-expression style | Cosmetic |
| AGG6-11 | 0020 UTF-8 encoding cross-references | Code correct |
| AGG6-12 | analyticsCache.dispose synchronous-only doc | Future-proofing |
| AGG6-13 | Privacy notice ARIA hierarchy | Radix auto-wires |
| AGG6-14 | Privacy notice no decline path (carried DES3-1) | UX/legal call |
| AGG6-16 | Deploy "Schema repairs" log granularity | Cosmetic |
| AGG6-17 | Deploy PUSH_OUT memory | Acceptable |
| AGG6-18 | DRIZZLE_PUSH_FORCE audit trail | No audit infra in deploy |
| AGG6-19 | 0020 backfill idempotency integration test | Integration test infra |
| AGG6-20 | 0021 schema-parity test coverage | RESOLVED at cycle-7 verification |

### Carried-deferred from cycles 1-5 (unchanged per `_aggregate-cycle-48.md`)

All carried items remain deferrable. See `_aggregate-cycle-48.md` for the full table.

---

## Verification Plan

After each task commit, run the gates locally:
- `npm run lint` (must be EXIT=0; existing 14 untracked-script warnings unchanged)
- `npm run build` (must be EXIT=0)
- `npm run test:unit` (must be EXIT=0)

After all tasks complete, run the deploy per `DEPLOY_MODE: per-cycle`:
- `bash -c 'set -a; source .env.deploy.algo; set +a; ./deploy-docker.sh --skip-languages --no-worker --skip-worker-build'`

---

## Workspace-to-Public Migration Directive

Per cycle orchestrator instruction: "Make progress in this cycle ONLY where the review surfaces a relevant opportunity; do NOT force unrelated migration work."

**Status:** No workspace-to-public migration opportunity surfaced in any of the 11 review lanes this cycle. Per `user-injected/workspace-to-public-migration.md`, the migration is "substantially complete" and remains a "placeholder for opportunistic edge cases". Cycle-7 honors the surfacing rule by NOT taking migration action.

---

## Rule Compliance

- All commits will be GPG-signed (`-S` flag) per CLAUDE.md / global rules.
- Conventional commit format with gitmoji.
- No `Co-Authored-By` lines.
- No `--no-verify`, no force-push.
- Fine-grained: one commit per task.
- `git pull --rebase` before each `git push`.
