# RPF Cycle 6 — Review Remediation Plan

**Date:** 2026-04-26
**Cycle:** 6/100 of review-plan-fix loop
**Source aggregate:** `.context/reviews/_aggregate.md`

## Status Legend
- `[ ]` — Not started
- `[~]` — In progress
- `[x]` — Done
- `[d]` — Deferred (with reason)

## Cycle 6 Summary

The cycle-6 review surfaced **0 HIGH-severity findings** (all cycle-5 HIGH items verified RESOLVED). The MEDIUM cluster reopens cycle-5's SEC5-1 root cluster from a different angle: the safety backfill exists in `0020_drop_judge_workers_secret_token.sql`, but the deploy script runs `drizzle-kit push` (which ignores the journal). When an operator passes `DRIZZLE_PUSH_FORCE=1`, the backfill is skipped and orphan workers are silently locked out.

A second MEDIUM cluster: the `DRIZZLE_PUSH_FORCE` knob is undocumented for operators in `AGENTS.md` / `.env.example`.

Per the deferred-fix rules, the AGG6-1 cluster (security + correctness + data-loss) is NOT deferrable. AGG6-2 (operator documentation gap) is also planned this cycle because it directly enables the AGG6-1 failure mode.

**Implementation status (2026-04-26):**
- Task A `[x]` — commit `18d93273` (pre-step secret_token backfill in deploy-docker.sh).
- Task B `[x]` — commit `8a776241` (DRIZZLE_PUSH_FORCE documented in AGENTS.md + .env.example + .env.production.example + warn message references AGENTS.md).
- Task C `[x]` — commit `e5d1dc64` (cycle-5 plan moved to plans/done/).

Gates: lint 0 errors (14 unchanged warnings in untracked dev .mjs scripts); test:unit 2234/2234 pass; build EXIT=0.

---

## Tasks

### Task A — [MEDIUM, 4-agent convergence] Pre-execute the secret_token backfill DO-block in deploy-docker.sh, regardless of `drizzle-kit push --force` (AGG6-1 / SEC6-1 / ARCH6-2 / TRC6-1 / VER6-1)

**Status:** `[x]` — done in commit `18d93273`
**Severity:** MEDIUM (security + correctness + data-loss)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG6-1; per-agent: `architect.md` ARCH6-2, `security-reviewer.md` SEC6-1, `tracer.md` TRC6-1, `verifier.md` VER6-1

**Problem:** The cycle-5 fix put the safety backfill inside `drizzle/pg/0020_drop_judge_workers_secret_token.sql`. But `deploy-docker.sh:567,590` runs `drizzle-kit push`, which synthesizes its own DDL from `schema.pg.ts` and DOES NOT execute SQL files in the journal. So:
- Without `DRIZZLE_PUSH_FORCE`: push hits the data-loss prompt → cycle-5 detection downgrades to warn → operator sees "manual intervention required". OK.
- With `DRIZZLE_PUSH_FORCE=1`: push synthesizes `ALTER TABLE judge_workers DROP COLUMN secret_token` and applies it. The DO-block backfill in 0020 is NEVER executed. Workers with `secret_token IS NOT NULL AND secret_token_hash IS NULL` are silently locked out. `src/lib/judge/auth.ts:75-82` rejects them.

**Plan:**

1. Modify `deploy-docker.sh` to inline-execute the backfill DO-block via psql BEFORE the `drizzle-kit push` block. The DO-block is idempotent (information_schema guard).
2. Place it directly after the "Database is ready" success message (after `success "Database is ready"`) and before the drizzle-kit push step (before `info "Running database migrations (drizzle-kit push)..."`).
3. Use the same psql pattern used by the existing "additive PostgreSQL schema repairs" block at lines 603-617 (proven to work in this script).
4. Add a clear info log: `info "Running pre-drop secret_token backfill (idempotent)..."` and `success "secret_token backfill complete"`.
5. Update the comment block at lines 544-566 to mention the new pre-step and why it must run BEFORE push (not after) — the backfill must execute against the DB while the column still exists.

**Commit:** `fix(deploy): 🐛 pre-execute secret_token backfill before drizzle-kit push to prevent worker lockout (AGG6-1)`

**Exit criteria:**
- `deploy-docker.sh` runs the backfill DO-block before `drizzle-kit push`.
- Comment block explains why the pre-step is required.
- Gates green.

---

### Task B — [MEDIUM, 4-agent convergence] Document `DRIZZLE_PUSH_FORCE` knob in `AGENTS.md` and `.env.example` (AGG6-2 / ARCH6-1 / CRIT6-1 / DOC6-1 / VER6-3)

**Status:** `[x]` — done in commit `8a776241`
**Severity:** MEDIUM (operational documentation gap)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG6-2; per-agent: `architect.md` ARCH6-1, `critic.md` CRIT6-1, `document-specialist.md` DOC6-1, `verifier.md` VER6-3

**Problem:** `DRIZZLE_PUSH_FORCE=1` is referenced only in `deploy-docker.sh`. Operators have no entry in `AGENTS.md` / `.env.example` (verified via grep).

**Plan:**

1. Add a paragraph to `AGENTS.md` under an appropriate section (Deploy / Database migrations) describing:
   - When the warn appears (drizzle-kit push hit data-loss prompt non-interactively).
   - What `DRIZZLE_PUSH_FORCE=1` does (passes --force, applies destructive change).
   - When NOT to use it as a sole remediation (push --force ignores SQL files in the journal — rely on Task A's pre-step backfill, which is now part of every deploy regardless of force).
   - Recovery: review the diff above, then re-run with DRIZZLE_PUSH_FORCE=1 (the backfill will already have run from the pre-step).
2. Add a commented entry to both `.env.example` and `.env.production.example`:
   ```
   # DRIZZLE_PUSH_FORCE=0
   # When set to 1, deploy-docker.sh passes --force to drizzle-kit push,
   # auto-applying destructive schema changes (e.g., DROP COLUMN). Only use
   # after reviewing the diff. The pre-step secret_token backfill in
   # deploy-docker.sh runs regardless of this flag — see AGENTS.md.
   ```
3. Update `deploy-docker.sh:597` warn message to reference the AGENTS.md section: `... see AGENTS.md "DRIZZLE_PUSH_FORCE" section.`

**Commit:** `docs(deploy): 📝 document DRIZZLE_PUSH_FORCE in AGENTS.md and .env.example (AGG6-2)`

**Exit criteria:**
- `grep -rn "DRIZZLE_PUSH_FORCE" AGENTS.md` returns at least one operator-facing description.
- `.env.example` and `.env.production.example` both reference the knob.
- Gates green.

---

### Task C — [LOW, housekeeping] Move cycle-5 plan to `plans/done/` (CRIT6-5 / AGG6-15)

**Status:** `[x]` — done in commit `e5d1dc64`
**Severity:** LOW (process)
**Confidence:** HIGH
**Reference:** `.context/reviews/_aggregate.md` AGG6-15; per-agent: `critic.md` CRIT6-5

**Plan:**
1. Verify all tasks in `plans/open/2026-04-26-rpf-cycle-5-review-remediation.md` are `[x]` (verified at cycle start: yes).
2. `git mv plans/open/2026-04-26-rpf-cycle-5-review-remediation.md plans/done/`.
3. Commit.

**Commit:** `docs(plans): 🗂️ archive completed cycle 5 plan to plans/done/ (AGG6-15)`

**Exit criteria:**
- Cycle-5 plan in `plans/done/`.
- `plans/open/` has only standing/master plans + this cycle-6 plan.

---

## Deferred (DO NOT IMPLEMENT this cycle)

The following findings are recorded as deferred per the deferred-fix rules. Each cites file+line, original severity, deferral reason, repo-rule allowance (default = no rule forbids deferring this category), and exit criterion to re-open.

| Finding | File:Line | Severity | Reason for deferral | Exit criterion to re-open |
|---------|-----------|----------|---------------------|----------------------------|
| AGG6-3 — `tags.updated_at` nullable inconsistency (CRIT6-4 / SEC6-2 / VER6-2) | `src/lib/db/schema.pg.ts:1056-1057`, `drizzle/pg/0021_lethal_black_tom.sql` | LOW (3-agent convergence) | The new column is currently NULL on all rows; needs a follow-up migration + schema change OR a documented exception. Not security/correctness/data-loss in the strict sense — no current consumer crashes on NULL (verified via grep for `tag.updatedAt`). Picking up alongside future schema cleanup. | A consumer of `tags.updated_at` is added that requires non-null, OR a dedicated schema-consistency cleanup cycle. |
| AGG6-4 — `0021_lethal_black_tom.sql` filename rename (CR6-3 / DOC6-3) | `drizzle/pg/0021_lethal_black_tom.sql`, `drizzle/pg/meta/_journal.json` | LOW | Renames in the journal carry risk of breaking drizzle-kit replay; deferring until the team confirms the rename procedure. Not security/correctness/data-loss. | Tag rename procedure documented OR drizzle-kit version that supports rename detection. |
| AGG6-5 — Cycle-5 dispose-hook test name (CRIT6-2 / TE6-2) | `tests/unit/api/contests-analytics-route.test.ts:248` | LOW | Cosmetic test-naming; current test correctly pins the invariant. | Pick up opportunistically when this test file is otherwise edited. |
| AGG6-6 — `setCooldown(key, valueMs)` rename (CR6-1 / TE6-3) | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:117,125-127`, test caller | LOW | Cosmetic naming. The test-only API has 2 callers (test + internal `_lastRefreshFailureAt.set`). Renaming both is straightforward. | Pick up opportunistically when this file is otherwise edited. |
| AGG6-7 — `deploy-docker.sh` AGG5-1 reference rot (CRIT6-3 / DOC6-2) | `deploy-docker.sh:563-565` | LOW | The reference points to ephemeral content; can pick up alongside future deploy-docker.sh edits. | Pick up alongside Task A's deploy-docker.sh edit, OR opportunistically. |
| AGG6-8 — `deploy-docker.sh:596` regex broadness (CR6-4 / DBG6-2) | `deploy-docker.sh:596` | LOW | Pattern works against drizzle-kit's actual prompt today; refining is a defensive improvement. | A false positive is observed in production deploys. |
| AGG6-9 — `_lastRefreshFailureAt` Map independent bound (PERF6-1 / TRC6-2) | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:32` | LOW | Current code is correct (verified by tracer); the LRU recommendation is defense-in-depth. | A new code path adds cooldown-set without cache-set, OR a memory leak is observed. |
| AGG6-10 — `__test_internals` style consistency (CR6-2) | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:121-130` | LOW | Cosmetic. | Pick up opportunistically. |
| AGG6-11 — `0020` UTF-8 encoding cross-references (DBG6-1) | `drizzle/pg/0020_drop_judge_workers_secret_token.sql`, `src/lib/judge/auth.ts:21-23` | LOW | Code is correct; a future contributor might break the implicit invariant. | Pick up alongside Task A. |
| AGG6-12 — `analyticsCache.dispose` synchronous-only doc (DBG6-3) | `src/app/api/v1/contests/[assignmentId]/analytics/route.ts:37-46` | LOW | Future-proofing for refactors. | A refactor introduces async or alternative cleanup. |
| AGG6-13 — Privacy notice ARIA hierarchy (DES6-2 / DES6-3) | `src/components/exam/anti-cheat-monitor.tsx:274-298` | LOW | a11y on exam-only surface; relies on Radix auto-wiring. | Dedicated a11y audit cycle, OR Radix wiring breaks. |
| AGG6-14 — Privacy notice no decline path (DES6-1, carried) | `src/components/exam/anti-cheat-monitor.tsx:274-298` | LOW | UX/legal decision. | Product/legal decision. |
| AGG6-16 — Deploy "Schema repairs" log granularity (TRC6-3) | `deploy-docker.sh:603-617` | LOW | Cosmetic log noise. | Operator complaint OR opportunistic. |
| AGG6-17 — Deploy PUSH_OUT memory (PERF6-3) | `deploy-docker.sh:581-591` | LOW | Memory acceptable for current deploy host. | Deploy host memory becomes constrained. |
| AGG6-18 — DRIZZLE_PUSH_FORCE audit trail (SEC6-3) | `deploy-docker.sh:578-579` | LOW | No audit infrastructure invocation in deploy script today. | Post-incident review needs the trail OR audit infra is added to deploy. |
| AGG6-19 — `0020` backfill idempotency integration test (TE6-1) | new test file | LOW | Integration tests against Postgres aren't part of `npm run test:unit`. | Integration test infrastructure cycle. |
| AGG6-20 — `0021` schema-parity test coverage uncertain (TE6-4) | `tests/unit/db/schema-parity.test.ts` | LOW | Existing test passes; coverage of the specific new column is uncertain without reading the file. | Pick up opportunistically. |

### Carried-deferred from cycle 5 (unchanged)

| Cycle 5 ID | Description | Reason for deferral | Repo-rule citation |
|------------|-------------|---------------------|--------------------|
| AGG5-8 | `MIN_INTERVAL_MS` constant placement | Cosmetic | Default. |
| AGG5-9 | `lastEventRef` Record bound | Closed-set in practice | Default. |
| AGG5-10 | `formatEventTime` ms-vs-seconds | Number branch unreachable | Default. |
| AGG5-11 | First-render burst of distinct event types | Server-side rate-limit handles | Default. |
| AGG5-12 | `formatDetailsJson` re-parsing | Cosmetic perf | Default. |
| AGG5-13 | Drizzle-kit `npm install` per-deploy | Deploy slow but reliable | Default. |
| AGG5-14 | `vi.resetModules()` slow tests | Tests work correctly | Default. |
| AGG5-15 | Filter chips not keyboard-accessible | a11y on instructor-only surface | Default. |
| AGG5-16 | Dark-mode contrast not verified | No live runtime | Default. |
| AGG5-19 | Storage-quota-exceeded test gap | Source code has the catch | Default. |
| AGG5-20 | Anti-cheat retry timer cross-assignment trace | Likely re-keyed by parent | Default. |
| AGG3-5 / SEC3-3 | AGENTS.md vs `password.ts` mismatch | Needs PM/user decision | Default — docs/policy needs canonical declaration. |
| AGG3-6 / SEC3-1 | `__Secure-` cookie clear over HTTP no-op | Dev-only nuisance; production HTTPS guaranteed | Default. |
| AGG3-7 / TE3-2 | Anti-cheat retry/backoff lacks direct timing tests | Test setup non-trivial | Default. |
| AGG3-8 / DES3-1 | Privacy notice has no decline path | UX/legal judgment call | Default. |
| AGG3-9 / ARCH3-2 | Anti-cheat at 335 lines | Threshold 400 not breached | Default. |
| DEFER-various | Other carried items from cycles 1-4, 38-48 | See `_aggregate-cycle-48.md` / `_aggregate-cycle-5.md` | Default. |

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
- Fine-grained: one commit per task.
- `git pull --rebase` before each `git push`.
