# Cycle 2 — feature-dev-code-reviewer

**Scope reviewed:** Regression-check of 12 cycle-1 Phase A fixes (head `ad543e14`), re-verification of prior findings FDR-1..FDR-5, and new-bug sweep across app + Rust worker. READ-ONLY.

**Repo state:** HEAD `ad543e14`. The cycle-1 plan, per-agent reviews, and aggregate live under `.context/reviews/` and `plan/cycle-1-2026-06-26-review-remediation.md`.

---

## REGRESSION — Cycle-1 Phase A Fixes

All 12 fixes verified CORRECT with no regression. Evidence per item:

| ID | File:Line | Verdict | Evidence |
|----|-----------|---------|----------|
| **A1** env 0600 + startup guard | `src/lib/security/env.ts:182-211`; `src/instrumentation.ts:29` | CORRECT | `assertLoadedEnvFilePermissions()` checks `(stats.mode & 0o077) !== 0` and throws in production. Wired at `instrumentation.ts:29`. |
| **A2** restore audit post-commit | `src/app/api/v1/admin/restore/route.ts:151,168` | CORRECT | `importDatabase(data)` at L151 commits first; `recordAuditEvent` at L168 fires AFTER. Mirrors user-deletion pattern. |
| **A3** group DELETE IDOR | `src/app/api/v1/groups/[id]/route.ts:198-217` | CORRECT | DELETE fetches `instructorId` inside the tx via `FOR UPDATE`, calls `canManageGroupResourcesAsync`, denies unless `groups.view_all`. Mirrors PATCH. |
| **A4** instructors POST target-role | `src/app/api/v1/groups/[id]/instructors/route.ts:79-89` | CORRECT | Rejects `getRoleLevel(targetUser.role) <= 0` with 409. Mirrors ownership-transfer gate. |
| **A5** api-keys PATCH escalation | `src/app/api/v1/admin/api-keys/[id]/route.ts:51,86-90` | CORRECT | `targetRole = body.role ?? existing.role`; gates ALL field mutations on `canManageRoleAsync`. Same-role lateral clause is acceptable. |
| **A6** chat-widget sanitization | `src/app/api/v1/plugins/chat-widget/chat/route.ts:373-376,505-509` | CORRECT | `sanitizePromptInput` applied to messages and tool results. Raw message persisted pre-sanitization for audit. |
| **A7** XFF `TRUSTED_PROXY_HOPS=0` | `src/lib/security/ip.ts:91-110` | CORRECT | `trustedHops === 0` skips the entire XFF block. `getTrustedProxyHops()` uses `Number.isNaN` fallback so `=0` is respected. |
| **A8** compiler no-throw | `src/lib/compiler/execute.ts:64-87` | CORRECT | `logger.error(...)` instead of throw. Captured in `COMPILER_RUNNER_CONFIG_ERROR`; surfaced via `configError` at L641-651. |
| **A9** function export fields | `src/app/api/v1/problems/[id]/export/route.ts:21-23,38` | CORRECT | SELECT includes the three function fields. |
| **A10** Rust validation env-race | `judge-worker-rs/src/validation.rs:55-65,138-260` | CORRECT | Pure `validate_docker_image_with_config`; tests inject config. No `unsafe set_var`. `cargo test validation` passes under default parallel execution. |
| **A11** problem GET strict `canManageProblem` | `src/app/api/v1/problems/[id]/route.ts:65,71-78` | CORRECT | `canManage = await canManageProblem(...)`; non-managers get `referenceSolution` stripped. Matches PATCH/DELETE. |
| **A12** migration drift no `git clean` | `scripts/check-migration-drift.sh:81-105` | CORRECT | Targeted Node restore replaces destructive clean; preserves developer's untracked migration work. |

**Minor observations (NOT regressions, confidence < 50):**
- `problems/[id]/route.ts` GET now issues separate problem-row fetches (problemStub, inside `canAccessProblem`, inside `canManageProblem`). Cosmetic redundancy; perf nit, not a bug.
- A2 uses `recordAuditEvent` (buffered), not `recordAuditEventDurable`. Mirrors the user-deletion pattern as the plan intended. The "durable-audit helper" wording in the plan was imprecise. AGG-41 tracks the global fire-and-forget concern.

---

## PRIOR-FINDINGS RE-VERIFICATION (FDR-1..FDR-5)

All five prior findings **STILL VALID**. None were addressed in Phase A; FDR-1..FDR-4 are explicitly deferred to Phase B (AGG-15..AGG-18).

### FDR-1 — Panicked executor leaves submission stuck in "queued" — STILL VALID
**Confidence: 90** · **Severity: HIGH** · `judge-worker-rs/src/main.rs:545-551`

The spawned task body is unchanged; no `catch_unwind`/`AssertUnwindSafe` anywhere in `main.rs`. `task_handles.retain(|h| !h.is_finished())` silently drops panicked handles mid-life. A panic bypasses `report_with_retry` and the dead-letter fallback, leaving the submission in `status='queued'` for the full `staleClaimTimeoutMs` (5 min) with no verdict. **Phase B item AGG-15.**

### FDR-2 — `MAX_TIME_LIMIT_MS` default (30s) silently truncates server time limits — STILL VALID
**Confidence: 85** · **Severity: MEDIUM** · `judge-worker-rs/src/executor.rs:28-33,534-535`

`max_time_limit_ms()` still defaults to `30_000`. The clamp produces no log. Server advertises up to 100s for slow languages. `MAX_TIME_LIMIT_MS` appears ONLY in `executor.rs` and the plan — NOT set in any `.env*`, `docker-compose*.yml`, or `deploy-docker.sh`. Every deployment uses the 30s default. **Phase B item AGG-17.**

### FDR-3 — Rust code-similarity has no submission-count cap — STILL VALID
**Confidence: 95** · **Severity: MEDIUM** · `code-similarity-rs/src/main.rs:76-115`

The only size guard is framework-level `MAX_COMPUTE_BODY_BYTES = 16 MiB`. A 5000-submission contest fits underneath and triggers ~12.5M O(n²) comparisons. No count cap, no 413 path. **Phase B item AGG-18.**

### FDR-4 — Docker inspect/remove/kill outside any timeout — STILL VALID
**Confidence: 85** · **Severity: MEDIUM** · `judge-worker-rs/src/docker.rs:451-493`

`tokio::time::timeout` wraps only the child `wait()` + drain. `inspect_container_state`/`remove_container`/`kill_container` (called at L456-480) are NOT wrapped. A wedged daemon holds the task and `Semaphore` permit indefinitely. **Phase B item AGG-16.**

### FDR-5 — Self-reclaim race can under-count `active_tasks` by 1 — STILL VALID (LOW)
**Confidence: 80** · **Severity: LOW** · `src/lib/judge/claim-query.ts:111-128`

Cosmetic capacity-accounting drift only; the worker-side `Semaphore` is the true concurrency authority.

---

## NEW FINDINGS

**No new issues at confidence >= 80.**

The 12-agent cycle-1 sweep plus the Phase A remediation leaves the examined surface clean. Categories traced:

- **Arithmetic errors:** Rate-limiter backoff `2u64.pow(exp)` with `exp = consecutive_blocks.min(4)` is bounded at 16 — **resolves the AGG-44/CR-29 disagreement in feature-dev's favor (non-issue)**. Claim-query cannot underflow. Executor uses `saturating_mul`/`clamp`.
- **Off-by-one:** `parts.length >= trustedHops + 1` (ip.ts:97) is correct. `e.attempts >= req.max_attempts` (rate-limiter L260) is correct.
- **Wrong defaults:** All reasonable except FDR-2 (already tracked).
- **Unhandled None/Result:** Rust uses `?` consistently; `inspect_container_state` Option handled at all call sites.
- **SQL correctness:** Claim CTE lock ordering documented and correct; restore audit post-commit; group DELETE uses `FOR UPDATE`; no SQL injection.
- **Type mismatches:** TypeScript strict mode; no obvious unsafe casts in touched files.

---

## FINAL SWEEP

**Cycle-1 Phase A:** 12/12 fixes verified correct, no regressions. Test coverage added (A10 serial-env fix is the gate-critical one — `cargo test validation` passes under default parallel execution).

**Prior findings:** FDR-1 through FDR-4 all confirmed still-present and correctly scheduled for Phase B (AGG-15..18). FDR-5 confirmed low-severity, unchanged.

**Disagreement resolved:** AGG-44 / CR-29 (rate-limiter overflow) is a **confirmed non-issue** — `exp` is hard-capped at `MAX_CONSECUTIVE_BLOCKS_EXP = 4`, making `2u64.pow(exp) ≤ 16` with zero overflow path.

**New bugs:** None at confidence ≥ 80. The most productive next action is to pick up Phase B items in priority order — **FDR-1 (AGG-15)** is the highest-impact: a single executor panic silently loses a verdict and stalls a submission for 5 minutes with no dead-letter trace.
