# Cycle 4 (2026-07-01) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-06-30 cycle) and the per-agent review files under `.context/reviews/`.

Supersedes the carry-forward backlog from archived `plan/archive/cycle-4-2026-06-27-review-remediation.md.archived` and picks up unaddressed CRITICAL/HIGH security, correctness, and data-loss findings from `plan/cycle-3-2026-06-30-nginx-env-hardening.md` that were not already scheduled or rejected with explicit risk acceptance.

Repo rules honored: `CLAUDE.md` (preserve `src/lib/auth/config.ts`; `algo.xylolabs.com` is app-only; never build worker/language images there), `AGENTS.md` (testing rules, deployment safety), `.context/development/conventions.md` (semantic commits + gitmoji, GPG-signed, one fix per commit, every commit includes tests), `git pull --rebase` before push. Security/correctness/data-loss findings are NOT silently dropped or deferred without explicit risk acceptance.

Cycle constraints:
- Deploy mode is per-cycle. Targets: `algo.xylolabs.com`, `test.worv.ai`, `oj.auraedu.me`.
- Deploy command: `for target in algo worv auraedu; do DEPLOY_TARGET=$target SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh || exit 1; done`.
- Never run `docker system prune --volumes` or automated `docker volume prune`.
- Preserve `src/lib/auth/config.ts` as-is during deploy.

This cycle implements the scoped 12-story subset below. The plan-writer agent generated a broader A1-A34 draft during the session; this file reflects the actually-implemented critical/correctness subset. Broader roadmap gaps remain in `plan/cycle-4-2026-07-01-deferred.md`.

---

## Phase A — Implement this cycle

### A1. Bulk rejudge decrements worker `activeTasks`
- **Finding:** debugger/verifier: bulk rejudge leaves `judgeWorkers.activeTasks` inflated.
- **Severity:** HIGH.
- **Files:** `src/app/api/v1/admin/submissions/rejudge/route.ts`, `tests/unit/api/admin-submissions-rejudge-active-tasks.test.ts`.
- **Plan:** Inside the existing transaction, count rejudged submissions per worker and update `activeTasks` with `greatest(0, activeTasks - count)`.
- **Acceptance:** Test proves activeTasks returns to 0; existing auth tests pass.

### A2. Remove raw SQL additive repair block from `deploy-docker.sh`
- **Finding:** architect/security-reviewer: raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` bypasses Drizzle journal.
- **Severity:** HIGH.
- **Files:** `deploy-docker.sh`, `tests/unit/infra/deploy-security.test.ts`.
- **Plan:** Delete the raw `psql` repair block; rely on Drizzle migrations only.
- **Acceptance:** No `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in deploy script; infra test fails if reintroduced; `lint:bash` passes.

### A3. Optional off-host backup copy via rclone
- **Finding:** security-reviewer: backups rest on a single host.
- **Severity:** MEDIUM.
- **Files:** `scripts/backup-db.sh`, `.env.production.example`, `tests/unit/scripts/runtime-truth-implementation.test.ts`.
- **Plan:** After encryption, if `BACKUP_REMOTE` is set and `rclone` is installed, copy the backup file to the remote destination.
- **Acceptance:** `BACKUP_REMOTE` documented; runtime-truth test asserts rclone copy path.

### A4. Unit-test sandbox gate
- **Finding:** test-engineer F-01: `sandbox-gate.ts` has zero unit tests.
- **Severity:** CRITICAL.
- **Files:** `src/lib/security/sandbox-gate.ts`, `tests/unit/security/sandbox-gate.test.ts`.
- **Plan:** Add tests for unverified email 403, verified allow, quota 429, env bypass, DB override, settings failure fallback, and admin `system.settings` quota bypass.
- **Acceptance:** All gate branches asserted; tests pass.

### A5. Generated nginx preserves X-Forwarded-For chain
- **Finding:** security-reviewer: `proxy_set_header X-Forwarded-For $remote_addr` discards prior hops.
- **Severity:** HIGH.
- **Files:** `deploy-docker.sh`, `tests/unit/infra/judge-report-nginx.test.ts`.
- **Plan:** Use `$proxy_add_x_forwarded_for` in the generated nginx template.
- **Acceptance:** No generated location uses `$remote_addr` for XFF; infra test passes.

### A6. OOM-killed container not classified as TimeLimit
- **Finding:** debugger: executor checks `exceeded_problem_limit` before `oom_killed`.
- **Severity:** HIGH.
- **Files:** `judge-worker-rs/src/executor.rs`, Rust tests.
- **Plan:** Reorder so `oom_killed` is evaluated first; add Rust test.
- **Acceptance:** `cargo test` covers OOM + duration > limit -> MemoryLimit, not TimeLimit.

### A7. Enforce `MAX_SUBMISSIONS_FOR_SIMILARITY` before Rust sidecar
- **Finding:** code-reviewer: similarity cap applied only after Rust sidecar attempt.
- **Severity:** MEDIUM.
- **Files:** `src/lib/assignments/code-similarity.ts`, `tests/unit/api/similarity-check.route.test.ts`.
- **Plan:** Move count check before `computeSimilarityRust` so TS fallback and Rust path share the same limit.
- **Acceptance:** 501 submissions with reachable sidecar returns `too_many_submissions` without invoking sidecar.

### A8. Java double serialization uses round-trip-safe precision
- **Finding:** debugger: `String.format("%.15g")` can lose precision.
- **Severity:** MEDIUM.
- **Files:** `src/lib/judge/function-judging/adapters/java.ts`, tests.
- **Plan:** Use `%.17g` or `Double.toString`; add round-trip test.
- **Acceptance:** A 17-digit double survives serialize + parse within tolerance.

### A9. compute-expected clears expectedOutput on non-zero exit
- **Finding:** debugger: non-zero reference solution still returned stale stdout as expected output.
- **Severity:** MEDIUM.
- **Files:** `src/app/api/v1/problems/[id]/compute-expected/route.ts`, `tests/unit/api/compute-expected.route.test.ts`.
- **Plan:** Return `expectedOutput: ""` and surface `run.stdout` in the per-case error.
- **Acceptance:** Route test asserts empty expectedOutput on reference crash.

### A10. Reject IPv4 addresses with leading-zero octets
- **Finding:** security-reviewer: `isValidIpv4` accepts `192.168.01.001`.
- **Severity:** MEDIUM.
- **Files:** `src/lib/security/ip.ts`, `tests/unit/security/ip.test.ts`.
- **Plan:** Reject octets with leading zeros except the single digit `0`.
- **Acceptance:** `192.168.01.001` invalid; `0.0.0.0` and `192.168.1.1` valid.

### A11. Uploaded files written with `0o600`
- **Finding:** security-reviewer: uploads stored world-readable (`0o644`).
- **Severity:** MEDIUM.
- **Files:** `src/lib/files/storage.ts`, `tests/unit/files/storage-write-mode.test.ts`.
- **Plan:** Change `writeFile` mode from `0o644` to `0o600`.
- **Acceptance:** New test asserts file mode is `0o600`.

### A12. Static-site nginx baseline security headers
- **Finding:** security-reviewer: static-site nginx leaks version and lacks baseline headers.
- **Severity:** LOW/MEDIUM.
- **Files:** `static-site/nginx.conf`, `tests/unit/infra/deploy-security.test.ts`.
- **Plan:** Add `server_tokens off;` and `add_header` for `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.
- **Acceptance:** Deploy-security test asserts the headers are present.

---

## Phase B — Deferred

Remaining CRITICAL/HIGH security, correctness, and data-loss items identified by the review agents (e.g., `hcaptcha.ts` tests, `derive-key.ts` tests, global `client_max_body_size` restoration, judge route input validation hardening, admin settings re-confirmation tests, etc.) are recorded in `plan/cycle-4-2026-07-01-deferred.md` and will be scheduled in subsequent cycles.
