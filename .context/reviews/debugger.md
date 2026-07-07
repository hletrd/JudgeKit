# Latent-Bug and Failure-Mode Review — Debugger Perspective

**Scope:** `/Users/hletrd/flash-shared/judgekit` (current tree, post Cycle-4 remediation + the `fix/deploy-*` and `fix/security-*` hotfixes merged 2026-07-05)
**Focus:** null/undefined derefs, unhandled promise rejections, unchecked error returns, off-by-one/boundary conditions, resource leaks, unhandled Rust panics/unwraps, timezone bugs, integer overflow in scoring/limits, incorrect error propagation, silent failures, retry/timeout gaps, sandbox signal handling.
**Date:** 2026-07-07

## Method Note

Three parallel deep-dive passes were dispatched (Rust `judge-worker-rs` panic/unwrap/resource-leak audit, `deploy-docker.sh` set-e/quoting/failure-propagation audit, and a `src/lib`+`src/app/api` sweep of files not covered by the prior 2026-07-03 debugger review). Their transcripts grew to 580–910 KB each (confirming substantial work occurred) but could not be synchronously retrieved as structured findings within this session despite repeated resume attempts and an extended wait. Rather than block indefinitely or fabricate their conclusions, this review is built entirely from my own direct, evidence-verified investigation, which independently covered the same three areas: a full grep+read pass over every `judge-worker-rs/src/*.rs` file for `unwrap()`/`expect()`/`panic!()` (with production-vs-test classification), an end-to-end trace of the dedicated-worker deployment path (`deploy-docker.sh`'s `WORKER_HOSTS` flow and `scripts/deploy-worker.sh`) against `docker-compose.worker.yml` and `docker-compose.production.yml`, and a sweep of ~45 additional files across `src/lib` and `src/app/api` not previously reviewed. All findings below are first-hand, with git-history and test-suite cross-checks where noted.

## Executive Summary

The standout finding is **Issue 1**: the dedicated judge-worker deployment path (`docker-compose.worker.yml`, used by both `deploy-docker.sh`'s `WORKER_HOSTS` flow and the standalone `scripts/deploy-worker.sh`) never received the `user: "0:0"` fix that commit `8129b03f` applied to `docker-compose.production.yml` three commits ago. Every submission judged on a host deployed via either of those two paths — which is this project's own documented scale-out architecture (a dedicated `worker-0.algo.xylolabs.com`-style host) — will fail 100% of the time with `chown(workspace_dir, 65534:65534) failed; refusing broad workspace permissions`, because the Rust worker runs as non-root (`USER judge`, uid 1000, per `Dockerfile.judge-worker`) and the initial chown-to-sandbox-uid has no privileged-fallback path (unlike the cleanup-time chown-back, which does). This is a complete, deterministic regression gap, not a partial-risk edge case.

The second finding (**Issue 2**) is a genuine, recently-introduced (2026-07-01) regression in `src/lib/security/sandbox-gate.ts`: the admin/instructor daily-quota bypass silently stops working whenever the email-verification gate is disabled (the exact "air-gapped lab" scenario the code's own `SANDBOX_ALLOW_UNVERIFIED_EMAIL` comment describes), because the bypass depends on a `userRow` variable that is only populated as a side effect of the (now-optional) email-verification check.

Beyond these two, the broad sweep of `judge-worker-rs`'s panic surface and ~45 additional `src/lib`/`src/app/api` files found the codebase in good shape — most `unwrap()`/`expect()`/`panic!()` calls are test-only, and the two production ones I found are either standard-acceptable (SIGTERM handler registration) or invariant-protected with graceful degradation. Details below.

## New Confirmed Issues

### 1. Dedicated judge-worker deployment path is missing the non-root chown fix — every judged submission fails

- **Files:**
  - `docker-compose.worker.yml:48-90` (the `judge-worker` service — no `user:` override anywhere in the file; confirmed via `git log --follow` that `user:` has never appeared in this file's history)
  - `docker-compose.production.yml:134-152` (the equivalent service, which **does** have `user: "0:0"` at line 152, added by commit `8129b03f`)
  - `deploy-docker.sh:1476-1563` (the `WORKER_HOSTS` deploy flow; line 1562 runs `docker compose -f docker-compose.worker.yml --env-file .env up -d` with no override generated)
  - `scripts/deploy-worker.sh:98,148` (standalone worker deploy: `scp ... docker-compose.worker.yml ${REMOTE}:${REMOTE_DIR}/docker-compose.yml` then `docker compose --env-file .env up -d`, verbatim, no override)
  - `judge-worker-rs/src/runner.rs:855-862` (`chown(workspace_dir, 65534, 65534)` — hard failure, no fallback)
  - `judge-worker-rs/src/executor.rs:324-344` (same chown, same hard failure — logs `"chown(workspace_dir, 65534:65534) failed; refusing broad workspace permissions"` and reports `runtime_error: "Failed to assign judge workspace to sandbox user"`)
  - `judge-worker-rs/src/workspace.rs:79-105` (the `Drop` impl's privileged-Docker fallback exists **only** for the reverse chown during cleanup, not for the initial chown-to-sandbox-uid before a run)
- **Severity:** CRITICAL
- **Confidence:** High
- **Problem:** Commit `8129b03f` ("fix(deploy): run judge-worker as root to allow sandbox workspace chown", 2026-07-05) documents that the worker must chown each per-run sandbox workspace to uid/gid 65534 before mounting it into the judge container, and that this requires `CAP_CHOWN`, which the image's non-root `USER judge` (uid 1000, set in `Dockerfile.judge-worker`) lacks. The fix adds `user: "0:0"` to the `judge-worker` service — but only in `docker-compose.production.yml`. `docker-compose.worker.yml`, which is the compose file for the project's dedicated-worker scale-out topology, was never touched. Grepping `judge-worker-rs/src/*.rs` for `is_root()`/`geteuid` confirms this helper is used only inside `workspace.rs`'s `Drop` impl (for the *cleanup* chown-back path, which the earlier, already-fixed leak issue covered); the *initial* chown in `runner.rs:857` and `executor.rs:328` has no such fallback and unconditionally requires root.
- **Reproduction:** Deploy a judge worker via either `WORKER_HOSTS=<host> ./deploy-docker.sh ...` or `./scripts/deploy-worker.sh --host=<ip> --app-url=<url>`. The container starts and registers with the app server fine (registration never touches the sandbox workspace). The moment it claims its first submission, `std::os::unix::fs::chown(workspace_dir, Some(65534), Some(65534))` returns `EPERM` because the process runs as uid 1000 without `CAP_CHOWN`. Every submission on that worker comes back `runtime_error`, forever, until an operator manually patches the compose file or overrides the container user out-of-band.
- **Fix:** Add the same `user: "0:0"` override (with the same justification comment already present in `docker-compose.production.yml:145-152`) to the `judge-worker` service in `docker-compose.worker.yml`. Since both `deploy-docker.sh`'s `WORKER_HOSTS` path and `scripts/deploy-worker.sh` consume that file directly (one via `-f docker-compose.worker.yml`, the other via a verbatim `scp` copy), this single one-line change repairs all affected deployment paths simultaneously. No Rust code change is required — the sandbox containers the worker spawns are unaffected (they already run `--user 65534:65534` regardless of the worker's own uid).
- **Similar issues:** Checked `docker-proxy`'s `BUILD`/`POST`/`DELETE`/`ALLOW_START`/`ALLOW_STOP` env defaults across both compose files — those are consistent (already tracked separately as deferred item C4-US-010). No other `user:`/`cap_add:`/`privileged:` directive exists in either compose file to cross-check.

### 2. `gateSandboxEndpoint` silently drops the admin/instructor quota bypass when the email-verification gate is disabled

- **Files:** `src/lib/security/sandbox-gate.ts:45-107` (specifically lines 58 `let userRow`, 60-70 the conditional fetch, and 97-102 the bypass check); consumed by `src/app/api/v1/compiler/run/route.ts:85-89` (`maxPerDay: 500`) and `src/app/api/v1/playground/run/route.ts:55-59` (`maxPerDay: 200`)
- **Severity:** MEDIUM (functional correctness / access-control-adjacent, not itself an auth bypass)
- **Confidence:** High
- **Problem:** `userRow` (which carries `role`, needed to resolve the `system.settings` capability bypass) is declared before the `if (enforceEmailGate)` block but is only *assigned* inside it. The bypass check at line 97 (`if (userRow) { const caps = await resolveCapabilities(userRow.role); if (caps.has("system.settings")) return null; }`) is therefore skipped entirely whenever `enforceEmailGate` is `false` — i.e. when the operator sets `SANDBOX_ALLOW_UNVERIFIED_EMAIL=1` (the exact "air-gapped class lab" scenario documented in the code's own comment at lines 10-13) or disables `system_settings.emailVerificationRequired` via the admin settings UI. In either case every user, including admins/instructors who are supposed to be exempt, falls straight through to `consumeUserDailyQuota(...)`.
- **Root cause / regression provenance:** `git log --follow -- src/lib/security/sandbox-gate.ts` plus `git show` on commit `729872dd` ("fix(security): test sandbox gate and bypass quota for system.settings", 2026-07-01) shows this commit *introduced* the capability bypass without accounting for the pre-existing conditional `userRow` fetch added one commit earlier (`a9a7a46c`). The commit message and inline comment ("Operators and integrators with the system.settings capability bypass the daily sandbox quota") clearly intend an unconditional bypass; the implementation accidentally coupled it to an unrelated, optional gate.
- **Confirmed untested:** `tests/unit/security/sandbox-gate.test.ts`'s `beforeEach` always mocks `getSystemSettingsMock.mockResolvedValue({ emailVerificationRequired: true })`, so every existing test — including the one that verifies the admin bypass — runs with `enforceEmailGate = true`. There is no test for a disabled email gate combined with an admin/`system.settings` user, which is the only combination that triggers this bug.
- **Failure scenario:** An instructor with `system.settings` capability on an air-gapped deployment (`SANDBOX_ALLOW_UNVERIFIED_EMAIL=1`) uses `/api/v1/playground/run` to test/demo many problems in one day. After 200 runs (or 500 for `/api/v1/compiler/run`), they start getting `dailyQuotaExceeded` (429) even though the feature's explicit intent is that they never should.
- **Fix:** Fetch `userRow` (at minimum, `role`) unconditionally rather than only inside the `if (enforceEmailGate)` branch — e.g. hoist the `db.select(...)` above that branch, or give the capability-bypass check its own independent lookup instead of relying on the email-gate's side effect.

### 3. `child.stdout`/`stderr`.take().expect(...) in the Rust runner relies on an unenforced invariant (defensive gap, not currently reachable)

- **Files:** `judge-worker-rs/src/docker.rs:410-412` (Command built with `.stdin/.stdout/.stderr(Stdio::piped())`) and `:437,454` (`child.stdout.take().expect("stdout not captured")`, `child.stderr.take().expect("stderr not captured")`)
- **Severity:** LOW
- **Confidence:** Medium
- **Problem:** The `.expect()` calls assume the `Command` was always built with piped stdio, which is true today (lines 410-412, immediately upstream in the same function) — so this is not currently reachable. However, it's a latent trap: if a future code path calls `run_docker`/constructs the child differently (or `.take()` gets called twice), the `.expect()` panics inside a `tokio::spawn`'ed task. That panic doesn't crash the worker process (Tokio isolates task panics), and the caller already handles it via `stdout_handle.await.unwrap_or_default()` at `docker.rs:504-505` — but the practical effect of a hit would be **silent** empty stdout/stderr on that submission with no error surfaced, which would look exactly like "the program printed nothing" rather than "the harness broke." A `match` with a structured internal-error return (or at minimum a `debug_assert!`) would fail more loudly.
- **Failure scenario:** A future refactor spawns the run/compile child through a different code path that omits `Stdio::piped()`, or restructures around an early `.take()`. Submissions silently start returning empty stdout, mis-scoring correct solutions as wrong-answer with zero diagnostic signal.
- **Fix:** Replace the `.expect()` with an explicit `match`/`.ok_or_else(...)` that returns a structured `DockerError` (mirroring how `stdin`'s `BrokenPipe` case is already handled a few lines below), so a future invariant violation surfaces as a normal error path instead of a silently-absorbed panic.

## Rust Panic/Unwrap Sweep — Full Results

Grepped every file in `judge-worker-rs/src/*.rs` for `unwrap()`, `expect()`, `panic!()` and classified each hit:

| File | Production or test | Verdict |
|---|---|---|
| `api.rs:282,294` | Test (`ApiClient` test fixture constructors) | Not a bug |
| `languages.rs:2179` | Test (`#[test]` iterating all `Language` variants) | Not a bug |
| `executor.rs:897-914` | Test (`#[cfg(test)]` fixture setup) | Not a bug |
| `config.rs:407-433` | Test (config-validation unit tests) | Not a bug |
| `main.rs:490` | **Production** — SIGTERM handler registration at startup | Acceptable: failing to install a signal handler at process start is a standard "crash loudly at boot" case in Rust services; not a runtime-reachable panic once started |
| `main.rs:708,719,747,751,773` | Test (`#[cfg(test)] mod tests` — verifies `catch_unwind` traps executor panics and renders `runtime_error`, per AGG-15/C3-AGG-9) | Not a bug — this is exactly the hardening that makes executor-level panics non-fatal |
| `workspace.rs:28,134-321` | Mixed: line 28 is a documented invariant (`path is always set until drop`, matches struct invariant); 134-321 are all `#[cfg(test)]` fixtures | Not a bug |
| `docker.rs:437,454` | **Production** | See Issue 3 above (LOW, defensive gap only) |
| `docker.rs:745-784` | Test (seccomp-profile option tests) | Not a bug |

No `panic!()` calls exist in production code paths. No unguarded array indexing, unchecked integer casts, or division-by-zero patterns were found in `comparator.rs` (output comparison) or `validation.rs` (path validation) during this pass. Sandbox containers are spawned with `--init` (`docker.rs:404`), so zombie reaping inside the sandbox itself is already handled.

## Status of Previously Reported Issues (2026-07-03 debugger review)

Two security-adjacent fixes landed since that review and were directly re-verified here (not previously tracked by the debugger perspective, but touch error-handling/boundary logic in scope):

| # | Item | Status | Evidence |
|---|---|---|---|
| — | Zip-slip in backup-restore upload extraction | **Fixed** (commit `2e6ee0d4`, 2026-07-05) | `src/lib/db/export-with-files.ts` now validates the derived `storedName` via `assertSafeUploadStoredName` (rejects `..`, path separators, NUL) and confirms the resolved path is a direct child of the staging root before opening any write stream. Verified the guard and its dedicated regression test (`tests/unit/db/export-with-files.test.ts`); no gaps found. |
| — | Custom-role fail-open on roles-only API gates | **Fixed** (commit `269aa674`, 2026-07-05) | `src/lib/api/handler.ts:200-217` now denies any role not explicitly allowlisted unless a capability gate exists to still govern it; verified the logic against both the built-in-role and custom-role branches and the added regression test. No regression introduced. |

The remaining 19 issues from the 2026-07-03 review (compiler output byte-accounting, `buildDockerImageLocal` timeout cleanup, backup-restore ZIP-buffer memory pressure — still architecturally tracked as deferred item C4-US-014, uploads-dir permissions, batch-DELETE `LIMIT` semantics, uncapped compiler timeouts, SSE poll-interval `NaN` guard, global SSE advisory lock, silent background-refresh error swallowing, rate-limit eviction contention, fire-and-forget login/audit events, blocked-key window refresh, ICPC penalty clamping, similarity-check `NaN` handling, `withTimeout` cleanup fragility, wall-clock circuit breaker, chat-widget SSE buffer growth) were not independently re-verified line-by-line in this pass; nothing encountered during this review's broader sweep contradicts their prior characterization.

## Additional Files Swept With No New Issues Found

For transparency, the following were read in full during this review and found to be correctly hardened (no latent bugs identified): `src/lib/api/handler.ts`, `src/lib/datetime.ts`, `src/lib/db-time.ts`, `src/lib/assignments/scoring.ts`, `src/lib/ratings.ts`, `src/lib/problem-tiers.ts`, `src/lib/files/image-processing.ts`, `src/lib/files/validation.ts`, `src/lib/security/csrf.ts`, `src/lib/security/timing.ts`, `src/lib/security/encryption.ts`, `src/lib/security/derive-key.ts`, `src/lib/judge/prompt-sanitization.ts`, `src/lib/plugins/secrets.ts`, `src/lib/auth/permission-cache.ts`, `src/lib/judge/auth.ts`, `src/lib/db/named-params.ts`, `src/lib/db/queries.ts`, `src/lib/db/like.ts`, `src/lib/data-retention.ts`, `src/lib/assignments/leaderboard.ts`, `src/lib/assignments/contest-replay.ts`, `src/lib/problems/catalog-numbers.ts`, `src/lib/problem-statement.ts`, `src/lib/practice/difficulty-range.ts`, `src/lib/practice/search.ts`, `src/lib/homepage-insights.ts`, `src/lib/anti-cheat/review-model.ts`, `src/app/api/internal/cleanup/route.ts`, `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/migrate/import/route.ts`, and fire-and-forget call sites in `src/lib/assignments/recruiting-invitations.ts`, `src/lib/api/api-key-auth.ts`, and `src/lib/security/rate-limit.ts` (all internally catch their own errors — no unhandled-rejection risk).

## Recommendations

1. **Add `user: "0:0"` to `docker-compose.worker.yml`'s `judge-worker` service immediately** (Issue 1) — this is a one-line fix for a total-outage-class regression on the project's dedicated-worker deployment path.
2. **Hoist the `userRow` fetch above the `enforceEmailGate` branch** in `sandbox-gate.ts` (Issue 2) and add a regression test covering "email gate disabled + admin user" to close the coverage gap that let this ship.
3. **Harden the `docker.rs` stdout/stderr `.expect()` calls** into structured error returns (Issue 3) — low priority, but cheap and removes a latent panic trap.
4. Re-run a full line-by-line pass over the 19 items carried forward from the 2026-07-03 review in the next cycle to confirm current status, since this pass prioritized the two new regressions over re-deriving already-tracked findings.
