# Cycle 3 — feature-dev-code-reviewer

**Scope reviewed:** Regression-check of cycle-1+2 changes across the Rust crates (`judge-worker-rs`, `code-similarity-rs`, `rate-limiter-rs`) and the restore/import TS pipeline; re-validation of Phase B carry-forward items (AGG-15, AGG-17, AGG-43/45, AGG-54, AGG-55, N2); net-new sweep across the same surface. READ-ONLY.

**Repo state:** HEAD `207623f9`. Carry-forward backlog from cycle 2 lives in `.context/reviews/feature-dev-code-reviewer.md` and `plan/cycle-{1,2}-2026-06-26-review-remediation.md`.

---

## REGRESSION — Cycle-1+2 Fixes (all still correct)

| Item | File:Line | Verdict | Evidence |
|------|-----------|---------|----------|
| **A10 env-race** | `judge-worker-rs/src/validation.rs:55-65, 142-265` | CORRECT | `validate_docker_image_with_config` is pure (no `unsafe set_var`). Tests inject `(image, is_production, trusted_prefixes)` explicitly. Env-reading wrappers (`parse_trusted_registries`, `is_production_mode`) remain only at the production caller boundary — tests never touch `std::env`. |
| **A10 cleanup timeouts** | `judge-worker-rs/src/docker.rs:12, 172-276` | CORRECT | `DOCKER_CLEANUP_TIMEOUT_SECS = 10` wraps `inspect_container_state` (L173), `kill_container` (L243), `remove_container` (L261). Timeout arm logs at `warn!` and returns a default state; the orphan-container sweep on the next loop reaps anything left behind. |
| **A11 500 cap** | `code-similarity-rs/src/main.rs:29, 33-35, 96-104, 247-262` | CORRECT | `exceeds_submission_cap(count) = count > MAX_SUBMISSIONS` with `MAX_SUBMISSIONS = 500`. Boundary test asserts `500` accepted, `501` rejected, `5000` rejected. No off-by-one. |
| **AGG-44 rate-limiter** | `rate-limiter-rs/src/main.rs:40, 261-263` | NON-ISSUE | `exp = consecutive_blocks.min(MAX_CONSECUTIVE_BLOCKS_EXP=4)`; `2u64.pow(exp) ≤ 16`. No overflow path. Re-confirmed. |
| **A8/A9 compiler no-throw + 0o700** | `src/lib/compiler/execute.ts:64-87, 728, 740-757` | CORRECT | Import-time throw replaced with `logger.error` at L69; captured in `COMPILER_RUNNER_CONFIG_ERROR` and surfaced as `configError` at L641-651. Workspace chmod 0o700 (L728) before chown attempt; on chown success stays 0o700/0o600, on failure falls back to 0o777/0o666. Matches `executor.rs` pattern. |

**Minor stale comment** (cosmetic, confidence 30, not reported as a finding): `execute.ts:731` "Write source file (world-readable for sibling container access)" — the file is then chmod'd 0o600 (L737), so it is not world-readable. Comment predates the cycle-1 hardening.

---

## PHASE B CARRY-FORWARD — All Confirmed Still Real

### AGG-15 — Panicked executor leaves submission stuck in "queued" — STILL REAL
**Confidence: 95** · **Severity: HIGH** · `judge-worker-rs/src/main.rs:489, 545-552`

No `catch_unwind`/`AssertUnwindSafe` anywhere in `main.rs` (verified by grep across `judge-worker-rs/src`). The spawned body is:
```rust
let handle = tokio::task::spawn(async move {
    let _permit = permit;
    executor::execute(&client, &config, submission, worker_secret.as_deref()).await;
    active_tasks.fetch_sub(1, Ordering::Relaxed);
});
```
A panic inside `executor::execute` bypasses BOTH `active_tasks.fetch_sub` (capacity drift upward) AND `report_with_retry` → no verdict, no dead-letter file. The submission stays in `status='judging'` until `staleClaimTimeoutMs` (5 min default). `task_handles.retain(|h| !h.is_finished())` (L489) silently drops the panicked handle.

**Fix:** Wrap the body in `AssertUnwindSafe(executor::execute(...)).catch_unwind()` and on `Err` (panic) call a dead-letter write + decrement `active_tasks`.

### AGG-17 — `MAX_TIME_LIMIT_MS` default (30s) silently truncates server time limits — STILL REAL (worker-side)
**Confidence: 90** · **Severity: MEDIUM** · `judge-worker-rs/src/executor.rs:28-33, 534-535`

`max_time_limit_ms()` still defaults to `30_000`. Grep for `MAX_TIME_LIMIT_MS` across `*.yml`, `*.yaml`, `*.sh`, `*.env*`, `*.toml` returns **no matches** — no deployment sets it. The clamp `MIN_TIMEOUT_MS.max(time_limit_ms.min(max_time_limit_ms()))` therefore truncates any server-configured limit > 30s with no log.

**NOTE — code-reviewer lane observed `validators/problem-management.ts:119` caps authoring at `max(10000)` (10s), so through the authoring UI the worker's 30s default never triggers. The worker-side concern remains valid for directly-imported problems / API-authored problems that bypass the UI validator, and the silent-clamp-without-log is still a debuggability gap. Recommend log a `warn!` whenever `submission.time_limit_ms > max_time_limit_ms()` so operators can spot truncation.** The safer synthesis is: the UI validator mitigates the common path, the worker-side warn is the cheap defense-in-depth fix.

**Fix:** Either raise the default to match the server-side ceiling, or log a `warn!` whenever `submission.time_limit_ms > max_time_limit_ms()`.

### AGG-43 / AGG-45 — Function-judging C++ family registry breadth — STILL REAL
**Confidence: 90** · **Severity: MEDIUM** · `src/lib/judge/function-judging/registry.ts:10-30` · `src/lib/judge/function-judging/adapters/cpp.ts:180-186`

`cppAdapter.language = "cpp23"` is the **only** C++ adapter registered. `FUNCTION_JUDGING_LANGUAGES` therefore contains `cpp23` but not `cpp20`, `cpp26`, `clang_cpp23`, `clang_cpp26`. Effects:
- `src/lib/validators/problem-management.ts:106` rejects any `enabledLanguages` entry failing `supportsFunctionJudging`, so authors cannot enable function problems for those C++ variants.
- `src/app/api/v1/submissions/route.ts:267` rejects submissions with `languageNotEnabledForProblem`.
- `src/app/api/v1/judge/claim/route.ts:390` skips harness assembly for those languages.

Additionally, `DEFAULT_TEMPLATES` (`src/lib/judge/code-templates.ts:25`) and `src/lib/code/language-map.ts:9` reference `cpp17`, but `cpp17` is not in `Language` — orphaned references only.

**Fix:** Register `cppAdapter` under an array of C++ aliases (or change `supportsFunctionJudging`/`getAdapter` to fall back to `cpp23` for any `cpp*`/`clang_cpp*` language).

### N2 — No wall-clock total-judging cap — STILL REAL
**Confidence: 75** · **Severity: LOW-MEDIUM** · `judge-worker-rs/src/executor.rs:202-663`

A submission with `N` test cases and `run_all_test_cases=true` can hold a `Semaphore` permit for `N × (effective_time_limit_ms + DOCKER_RUN_OVERHEAD_BUDGET_MS)` wall-clock seconds. For a 100-case IOI problem at 5s/case that is ~10 minutes per submission. No outer envelope wraps the entire `execute_inner`. Combined with AGG-15 (panic path), a single wedged submission blocks a concurrency slot until the worker is restarted.

### AGG-54 — Migration journal duplicate-prefix — STILL REAL
**Confidence: 85** · **Severity: LOW** · `drizzle/pg/meta/_journal.json:84-95, 215-235`

Four numeric prefixes are duplicated in the journal:
- `0012_public_signup_settings` (idx 11) vs `0012_flimsy_korg` (idx 12)
- `0016_wandering_snowbird` (idx 16) vs `0016_fat_loki` (idx 30)
- `0027_exam_mode_check_and_drift_catchup` (idx 27) vs `0027_upload_max_zip_setting` (idx 31)
- `0028_striped_nicolaos` (idx 28) vs `0028_platform_mode_restriction_overrides` (idx 32)

The journal also jumps idx 32 → idx 33 with no `0029`–`0032` files on disk. Drizzle keys state by `tag` so applications don't break, but the redundant `IF NOT EXISTS` columns and the prefix collisions may cause `drizzle-kit generate` conflicts.

### AGG-55 — Orphaned `min_password_length` column — STILL REAL
**Confidence: 85** · **Severity: LOW** · `src/lib/db/schema.pg.ts:591`

`minPasswordLength: integer("min_password_length")` is defined in the schema and present in every PG migration snapshot from `0000` to `0036`, but grep for `minPasswordLength` across `src/` returns **only** the schema definition — no reader, writer, validator, or UI consumer. Dead surface area carried through every backup/restore cycle.

---

## NET-NEW FINDINGS

### NEW-1 — `runner.rs` workspace hardcoded to 0o777, bypassing the cycle-1 hardening
**Confidence: 82** · **Severity: MEDIUM** · `judge-worker-rs/src/runner.rs:805-816, 829-839`

The Rust runner sidecar (the `/run` endpoint used by the in-browser compiler/test feature) still uses the pre-cycle-1 permissions model:
```rust
// Set permissions to 0o777 — allow nobody (65534) in sandbox container to access workspace
tokio::fs::set_permissions(
    workspace_dir,
    std::os::unix::fs::PermissionsExt::from_mode(0o777),
)
```
Source file is then written and chmod'd 0o666 with no `chown` to `65534:65534`. This is inconsistent with both siblings, which were hardened in cycle 1:
- `executor.rs:331-360` does `chown(..., Some(65534), Some(65534))` then `0o700` (fallback `0o777` only on chown failure).
- `execute.ts:728, 740-757` mirrors that chown+0o700/0o600 pattern.

Impact: on any worker host where the runner sidecar is enabled (`RUNNER_ENABLED=true`, the default), every interactive compiler run leaves the user's source world-read/writeable at `0o666` inside a world-traversable `0o777` workspace for the duration of the docker run. A co-tenant process or unprivileged host user can read other users' in-flight code or mutate it before the container reads it (TOCTOU). Lower severity than the executor path (which is submission judging) because the runner serves interactive testing only, but it is the same class of issue cycle 1 explicitly fixed elsewhere.

**Fix:** Replicate the `executor.rs` pattern — `chown` to `65534:65534` first, then `0o700` on success / `0o777` on `Err`. Mirror for the source file (`0o600` on success / `0o666` on `Err`).

### NEW-2 — `validate_secure_judge_urls` skips `register`/`heartbeat`/`deregister` URLs
**Confidence: 50** · **Severity: LOW** · `judge-worker-rs/src/config.rs:115`

`Config::from_env` validates HTTPS only for `claim_url` and `report_url`. The other three (`register_url`, `heartbeat_url`, `deregister_url`) carry the same `JUDGE_AUTH_TOKEN` / per-worker secret in their `Authorization` header but are not checked. In practice all five derive from the same `JUDGE_BASE_URL` (so rejecting one rejects the config). Defense-in-depth, not exploitable. Below the 80 reporting threshold; included for completeness.

---

## FINAL SWEEP

**Cycle-1+2 regression:** All five re-checked fixes verified correct. A10/A11/AGG-44 unchanged in behavior. A8/A9 hardening preserved. No regressions introduced by cycles 1–2.

**Phase B carry-forward:** All six items re-confirmed with file:line evidence. **AGG-15 (panic-stuck submission) is still the highest-impact item** — every other Phase B item is medium-or-lower severity; AGG-15 alone can silently lose a verdict for 5 minutes with no audit trail.

**Net-new bugs:**
- **NEW-1 (confidence 82)** is the only Medium+ net-new finding: `runner.rs` workspace perms `0o777` is the missed sibling of the cycle-1 executor/compiler hardening. The fix is mechanical (port the `chown`+`0o700` pattern).
- NEW-2 is below the reporting threshold (confidence 50) but noted for the next pass.

**Recommended priority for cycle 3 remediation:**
1. AGG-15 — `catch_unwind` in `main.rs` executor spawn (HIGH, ~5 lines + dead-letter fallback).
2. NEW-1 — port the chown+0o700 pattern from `executor.rs` into `runner.rs` (MEDIUM, ~15 lines).
3. AGG-17 — log a warning when `MAX_TIME_LIMIT_MS` clamps (MEDIUM, ~3 lines).
4. AGG-43/45 — register `cppAdapter` under C++ family aliases (MEDIUM, registry change + tests).
5. AGG-54 / AGG-55 — cleanup (LOW, no functional impact).

---

**Relevant absolute paths inspected during this review:**
- `/Users/hletrd/flash-shared/judgekit/judge-worker-rs/src/{validation,docker,executor,main,runner,config,api,comparator,types,languages}.rs`
- `/Users/hletrd/flash-shared/judgekit/code-similarity-rs/src/main.rs`
- `/Users/hletrd/flash-shared/judgekit/rate-limiter-rs/src/main.rs`
- `/Users/hletrd/flash-shared/judgekit/src/lib/compiler/execute.ts`
- `/Users/hletrd/flash-shared/judgekit/src/lib/judge/function-judging/{registry,adapters/cpp,assemble}.ts`
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/admin/{restore,migrate/import}/route.ts`
- `/Users/hletrd/flash-shared/judgekit/src/lib/db/{import,import-transfer,export-with-files,pre-restore-snapshot}.ts`
- `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/judge/claim/route.ts`
- `/Users/hletrd/flash-shared/judgekit/drizzle/pg/meta/_journal.json`
