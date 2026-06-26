# Feature-Dev Code Reviewer — Cycle 4

Repo: `/Users/hletrd/flash-shared/judgekit` (Next.js 16 + Drizzle/PostgreSQL + Rust judge worker).
Scope: regression-check cycle-3 fixes (NEW-1, AGG-15), then deep review of the worker + judge path and net-new high-impact issues.
Confidence scale: confirmed / likely / needs-manual-validation.

---

## (a) Regression check — both cycle-3 fixes VERIFIED LANDED

### NEW-1 — runner.rs workspace + source-file hardening — CONFIRMED CORRECT
`judge-worker-rs/src/runner.rs:837-854` (workspace) and `:872-881` (source file):

- Workspace: `chown(workspace_dir, 65534, 65534)` → on success `0o700`, on chown failure logs a warning and falls back to `0o777`. Matches the executor pattern.
- Source file: `chown(&source_path, 65534, 65534).is_ok()` → `0o600`, else `0o666` fallback.
- The fallback semantics (`0o777` / `0o666` only when chown fails, i.e. rootless dev) are correct: in production (worker has CAP_CHOWN) the dirs/files are `0o700`/`0o600` owned by 65534, so a non-root host process as a different uid cannot read in-flight artifacts.
- Consistent with the reference pattern at `executor.rs:331-360` (workspace chown → `0o700`/`0o777`). The runner sidecar is no longer the world-readable sibling.

Verdict: fix landed correctly and is internally consistent with the executor.

### AGG-15 — main.rs catch_unwind → runtime_error + dead-letter + active_tasks decrement — CONFIRMED CORRECT
`judge-worker-rs/src/main.rs:559-590`:

- `submission_id` and `claim_token` are captured **before** `submission` is moved into `executor::execute(...)` (lines 566-568), so they are available in the panic branch. Correct ordering.
- `std::panic::AssertUnwindSafe(exec_fut).catch_unwind().await` — on panic, calls `executor::report_panic(...)` which routes through `report_with_retry` (`executor.rs:918-937` → `:971`) → 3 attempts with exponential backoff → on exhaustion, dead-letter JSON file (`executor.rs:1009-1061`) + `prune_dead_letter_dir(..., 1000)`. Verdict is `"runtime_error"`. Correct.
- `active_tasks.fetch_sub(1, Relaxed)` runs at line 589 on **every** exit path of the task (normal completion and panic recovery), so the gauge cannot leak on panic. Correct.
- `panic_payload_message` (`main.rs:22-29`) handles `String`, `&'static str`, and falls back to `"<non-string panic>"`. Correct.

Verdict: fix landed correctly; the panic path now produces a real verdict instead of silently dropping the submission and skewing `active_tasks`.

---

## (b) Worker + judge path — deep review

### F1 — Function-judging int64 precision is broken end-to-end — HIGH (confirmed)

**Root cause (server layer):** `src/lib/judge/function-judging/serialization.ts:6`
```ts
case "int": case "long": return String(Math.trunc(Number(v)));
```
`Number(v)` coerces to IEEE-754 float64, which cannot represent every int64. Every integer with magnitude `> 2^53` (9007199254740992) is **silently rounded at encode time**, on the app server, before the worker or any adapter ever sees the value. This `encodeScalar` is reached by both the stdin args path (`encodeArgs` → `encodeJson` → `encodeScalar`) and the return-value path (`encodeValue` → `encodeJson` → `encodeScalar`).

Concrete: author enters `9007199254740993` for an `int`/`long` param → serialized stdin arg becomes `9007199254740992`. Enter `9223372036854775807` (LLONG_MAX) → `Number()` rounds to `9223372036854775808`, which is **outside the int64 range** — the harness then receives a value that cannot be parsed by a strict int64 reader.

**Secondary (adapter layer):** Even if `serialization.ts` were fixed to emit full-precision integers, three adapters would still corrupt them because they parse ints through `double`:
- C++ — `adapters/cpp.ts:47` `readInt()` → `(long long)llround(stod(...))`
- Java — `adapters/java.ts:75` `readLong()` → `Math.round(Double.parseDouble(number()))`
- C#  — `adapters/csharp.ts:78-80` `ReadLong()` → `(long)Math.Round(double.Parse(Number(), ...))`

For comparison, the other adapters are exact for the in-text token: Python uses `json.loads` (arbitrary precision), Go uses `json.Unmarshal` into `int64` (full int64 range). JS/TS use `JSON.parse` → `Number` (inherently float64; not fixable without `BigInt`, acceptable to document).

**Impact (why this is the highest-impact net-new finding):**
1. *Test-case fidelity loss:* for any function problem whose `int`/`long` parameters or return exceed 2^53, the value actually judged is not the value the author wrote. A boundary test at LLONG_MAX becomes an out-of-range token.
2. *False verdicts:* when `expectedOutput` is hand-authored for the intended full-precision value (or for a return that prints full-precision from e.g. C++ `std::to_string(long long)`), but the stdin arg is rounded, a correct submission computes on the wrong input and gets a wrong-answer verdict. The reverse (accepting a solution that is wrong on the real input) is also possible.
3. *Harness fragility:* once a rounded token exceeds int64 range, the C++/Java/C# readers can throw/out-of-range and the submission dies with a misleading runtime error.

**Fix (both layers must change together, or fixing one alone creates cross-language divergence):**
- `serialization.ts:6`: serialize `int`/`long` without `Number()`. If the source value arrives as a JS `Number` it is already lossy at the boundary, so the input must be carried as a `string`/`bigint` through the authoring → DB → encode path and emitted verbatim, or validated/rejected at authoring time with a clear message when `!Number.isSafeInteger(v)`.
- `adapters/cpp.ts:47`: replace `llround(stod(...))` with `strtoll`/`std::stoll` over an integer-only token.
- `adapters/java.ts:75`: replace `Math.round(Double.parseDouble(number()))` with `Long.parseLong(...)` (integer token).
- `adapters/csharp.ts:78-80`: replace `Math.Round(double.Parse(...))` with `long.Parse(..., InvariantCulture)`.
- Document that JS/TS remain bounded to `Number.MAX_SAFE_INTEGER` for function judging.

Confidence: confirmed (the `Number()` truncation is a mathematical certainty; code paths traced through `encodeArgs`/`encodeValue` and all four adapters).

### F2 — Orphan sweep never reaps running `oj-*` containers; no startup sweep — MEDIUM (confirmed)

`judge-worker-rs/src/docker.rs:642-681` `cleanup_orphaned_containers()` filters `status=exited` only. It is invoked exclusively from the main loop every 300 s (`main.rs:505-508`) — never at startup. The normal-path cleanup in `run_docker_once` (`docker.rs:499-541`) does `kill_container` + `remove_container(-f)` and the graceful-shutdown path awaits in-flight tasks to completion (`main.rs:625-638`), so the happy paths self-clean. The gap is the ungraceful path:

- A forced restart (deploy SIGTERM → SIGKILL after a short grace, OOM-kill of the worker, host reboot, or a worker panic outside `catch_unwind`) leaves every in-flight `oj-<uuid>` container in `running` state with no live parent to kill it. Because the orphan sweep matches `status=exited` only, and there is no startup sweep, those running containers are **never reaped** — they accumulate indefinitely, each pinning its `--memory`/`--pids-limit`/CPU share until manual `docker rm -f`. On a worker that runs N concurrent jobs and is redeployed, that is N leaked containers per deploy.

This matches and sharpens the prior R2 note: severity is MEDIUM, not low, because the trigger (a redeploy or worker crash with in-flight jobs) is a normal operational event, not a double-failure.

**Fix:** add a one-shot startup sweep, before the main loop begins polling, that force-removes **all** `oj-*` containers regardless of status (e.g. `docker ps -a --filter name=oj- -q | xargs docker rm -f`). At startup there are no in-flight judgements, so nuking every `oj-*` container is safe. The existing every-5-min exited-only sweep can stay as-is (reaping `running` mid-loop would race in-flight judgements). Optionally add `kill_on_drop(true)` on the `docker run` child so a dropped handle also tears down the container.

Confidence: confirmed (sweep filter and sole call site verified; graceful-shutdown path verified to self-clean only when allowed to drain).

### F3 — `pids_limit` is a dead if/else; both branches `"128"` — LOW-MEDIUM (likely)

`judge-worker-rs/src/docker.rs:319-323`:
```rust
let pids_limit = if options.phase == Phase::Compile {
    "128"
} else {
    "128"
};
```
The preceding comment (lines 317-318) explicitly says “VM-based languages (JVM, BEAM, .NET, pwsh) spawn many threads even at runtime, so the run-phase limit must accommodate them,” yet the run branch is also `128`. Either the run-phase value was meant to be higher (e.g. 256/512) and was left at 128, or the branch is purely vestigial. In the first reading, JVM/.NET/Erlang submissions with GC+JIT+application threads can plausibly exceed 128 processes/threads (Linux `pids` cgroup counts threads) and fail with `Resource temporarily unavailable` → spurious runtime error for VM-language submissions. In the second reading it is harmless dead code. Either way the code does not match its own comment.

**Fix:** pick one — raise the run-phase `pids_limit` for VM-based languages (keyed off `needs_exec_tmp` or a per-language flag), or delete the degenerate if/else and leave a single `let pids_limit = "128";` with a corrected comment.

Confidence: likely (dead branch is certain; the *intent* to raise the run-phase limit is inferred from the comment — needs manual validation on whether 128 actually binds for the JVM/.NET images in practice).

### AGG-43/45 — C++ family breadth in function judging — re-confirmed LOW / closed by design

The registry (`src/lib/judge/function-judging/registry.ts:10-18`) registers only `cpp23`. `languages.ts` also defines `cpp20` (line 220) and `clang_cpp23` (line 646), neither of which has an adapter, so `supportsFunctionJudging("cpp20" | "clang_cpp23")` is false. Unlike a latent bug, this is gated cleanly end-to-end: the function-problem language picker filters to `FUNCTION_JUDGING_LANGUAGES` (`problem-submission-form.tsx:84`), the submission API rejects unsupported languages with a 400 (`api/v1/submissions/route.ts:265-270`), and authoring validation requires at least one function-judging-capable enabled language (`validators/problem-management.ts:106`). Users never reach a confusing compile error. Closing as low/informational: if parity for `cpp20`/`clang_cpp23` is desired, point their registry key at the existing `cppAdapter` (the generated harness is standard C++ that all three front-ends compile).

### Executor run loop — no defects found
Spot-checked the full judge flow (app queues → worker claims → executes → reports):
- Fail-fast vs IOI partial scoring is correct: `executor.rs:648-654` breaks on first non-Accepted **unless** `submission.run_all_test_cases`, and `:658-662` derives the final status from the first non-Accepted result — so the partial-score denominator is not truncated.
- TLE classification is delegated to the unit-tested `classify_test_case_verdict` using Docker-reported `duration_ms`, with the wall-clock kill timeout padded by `DOCKER_RUN_OVERHEAD_BUDGET_MS` so the buffer does not flip pass/fail semantics (`executor.rs:546-624`).
- Empty-test-cases guard (`executor.rs:515-527`) and over-ceiling time-limit clamp with observability warn (`:529-540`) are correct.
- Per-test cleanup via `temp_dir` drop on function exit is correct.

---

## (c) Net-new — nothing else at high impact

After the sweep above, no additional high-impact correctness/maintainability issue in the worker + judge path. Minor note (not a finding): the executor leaves the source file at `0o666` unconditionally (`executor.rs:392-410`) rather than mirroring the runner’s `chown → 0o600 / 0o666` source hardening. This is acceptable in production because the parent workspace dir is `0o700` owned by 65534 (the `0o666` file is unreachable to other host uids through the locked parent), so it is a consistency nit, not a security gap.

---

## Priority order for the next plan

1. **F1** (HIGH) — function-judging int64 precision: fix `serialization.ts:6` plus the C++/Java/C# adapter int readers as one coordinated change; add a regression test with an `int` value `> 2^53` run cross-language.
2. **F2** (MEDIUM) — startup `oj-*` container sweep (all statuses) + optional `kill_on_drop`.
3. **F3** (LOW-MEDIUM) — resolve the `pids_limit` dead branch (raise run-phase for VM languages, or delete the branch and fix the comment).

NEW-1 and AGG-15 are verified landed and need no further action.
