# Cycle 2 — test-engineer

Date: 2026-06-26
Repository: `/Users/hletrd/flash-shared/judgekit`
Scope head: `ad543e14` (cycle-1 Phase A fixes), current `main`.
Method: every Phase A commit was diff'd (source + test), and each test was
read in full to determine whether reverting the production change would flip a
test red (green-but-broken check). GATES were traced from `package.json` to
`.github/workflows/ci.yml`.

Severity scale: **Critical** (silent miss of security/data-loss bug) >
**High** (shipped fix unenforced or gate silently passing) > **Medium**
(defense-in-depth / flake risk) > **Low** (hygiene). LOW findings capped at 8.

---

## REGRESSION — cycle-1 Phase A fixes (12 commits, head `ad543e14`)

Green-but-broken verdict per fix. "Revert-RED" = the existing test fails if the
production hunk of that commit is reverted.

| # | Commit | Fix | Revert-RED? | Evidence |
|---|--------|-----|-------------|----------|
| A1 | `40250e63` | env files 0600 + startup guard | **YES** | `tests/unit/security/env.test.ts` asserts `0644 → throws /group|other bits set/` and `0600 → not.toThrow()` in production; no-op outside production. Reverting the guard flips both. |
| A2 | `7548c7a6` | restore audit recorded post-commit | **YES** | `tests/unit/api/admin-backup-security.route.test.ts:368-471` asserts `toHaveBeenCalledBefore(importDatabaseMock, recordAuditEventMock)`, `recordAuditEventMock` not called when import fails, AND `auditPayload.summary` contains `"2 files pending"` with a 2-upload ZIP. Reverting the reorder flips all three. **This closes AGG-66 / TE-2.** |
| A3 | `f9d72920` | group DELETE IDOR (strict `canManageGroupResourcesAsync`) | **YES** | `tests/unit/api/groups.route.test.ts` "resource-scope IDOR guard" asserts 403 + `dbDeleteMock)not.toHaveBeenCalled()` + `recordAuditEventMock)not.toHaveBeenCalled()` when `canManageGroupResourcesAsync` is false. |
| A4 | `b10e5216` | student→co_instructor escalation | **YES** | `tests/unit/api/group-instructors.route.test.ts` (new file) asserts 409 `instructorRoleInvalid` + `dbInsertMock)not.toHaveBeenCalled()` + `getRoleLevelMock` consulted when target level is 0. |
| A5 | `08ac027a` | api-key PATCH escalation on ALL fields | **YES** | `tests/unit/api/api-keys.route.test.ts` asserts 403 + `canManageRoleAsyncMock` called with `("manager","super_admin")` (existing-role fetch) on an `isActive`-only mutation. The exact-bypass assertion is present. |
| A6 | `35d08f2a` | chat-widget `sanitizePromptInput` + tool-result sanitization | **YES** | `tests/unit/api/plugins.route.test.ts:486-592` asserts user `content` does NOT contain `"Ignore previous instructions"` and DOES contain `"[REDACTED]"` on BOTH the no-context stream path and the tool-calling path; plus tool-result sanitization via `formatToolResult` arg. Payload-neutralization-pre-provider is directly asserted. |
| A7 | `ac5289f3` | XFF ignored when `TRUSTED_PROXY_HOPS=0` | **YES** | `tests/unit/security/ip.test.ts` asserts `extractClientIp(... "x-forwarded-for":"1.2.3.4")` `)not.toBe("1.2.3.4")` at hops=0, and X-Real-IP fallback. Sibling `ip-allowlist.test.ts` was correctly migrated to X-Real-IP injection. |
| A8 | `dcaf9109` | compiler import-time throw → logged configError | **YES** | `tests/unit/compiler/execute-implementation.test.ts` asserts `import("@/lib/compiler/execute")` resolves (does not throw) and `executeCompilerRun` returns `stderr === "COMPILER_RUNNER_URL is set but RUNNER_AUTH_TOKEN is missing"`. |
| A9 | `4b93c5ff` | function-judging fields in per-problem export | **YES** | `tests/unit/api/problems-export.route.test.ts` (new file) asserts payload `problemType/functionSpec/referenceSolution` AND a 403 negative-authz case (`canManageProblemMock → false` ⇒ `dbSelectMock)not.toHaveBeenCalled()`). **This closes AGG-64 / TE-3.** |
| A10 | `d4efb27b` | problem GET routed through strict `canManageProblem` | **YES (non-obvious)** | NO test was added in this commit's diff, but `tests/unit/api/problems-function-spec.route.test.ts:395-420` ("strips referenceSolution + hidden testCases from a `problems.edit` holder outside the teaching group") mocks `canManageProblemMock → false` with `resolveCapabilitiesMock → {has: () => true}` in `beforeEach`; the loose local boolean would return true and leak `referenceSolution`, flipping `expect(body.data.referenceSolution).toBeUndefined()`. Coverage exists but lives in a file named for function-spec, not for the GET gate — see GS-4. |
| A11 | `b860f53a` | destructive `git clean -fd` removed from drift check | **YES** | `tests/unit/infra/migration-drift-cleanup.test.ts` writes an untracked file under `drizzle/`, runs the script, asserts `existsSync(untracked))toBe(true)`; plus source-grep `)not.toMatch(/^\s*git clean\s+-fd/m)` and `DRIFT_BEFORE/DRIFT_AFTER` markers. **This closes AGG-69 / TE-16.** |
| A12 | `1f6d15d4` | Rust validation env mutation race | **YES (refactored)** | `validation.rs` now exposes pure `validate_docker_image_with_config(image, is_production, trusted_prefixes)`; `grep "set_var|remove_var|unsafe"` returns nothing. Tests inject config structs — **no `#[serial]` needed. Closes AGG-65 / TE-10.** |

**Phase A verdict: 12/12 revert-RED.** Every fix has at least one behavioral
test that fails on revert. This is a materially stronger position than cycle 1
(where AGG-66/67/68/69 and TE-1/2/3/10/16 were open).

### Regression caveats (not blockers)

- **R-CAV-1 (A2 ordering proxy).** `toHaveBeenCalledBefore(importDatabaseMock, recordAuditEventMock)`
  validates call order, not actual truncate survival — `importDatabase` is fully
  mocked, so the test cannot prove the audit row would survive a real
  `TRUNCATE auditEvents`. The order assertion is the correct proxy given the
  unit-test layer; AGG-67 (runtime) is the place to prove it end-to-end.
  *Confidence: High.*
- **R-CAV-2 (A10 source-grep false confidence).** `problem-detail-capabilities-implementation.test.ts`
  still asserts `source)toContain('caps.has("problems.edit")')` and
  `problem.authorId === user.id` — those strings survive only in PATCH/DELETE,
  not GET, so the source-grep passes regardless of the GET gate. The behavioral
  guard at `problems-function-spec.route.test.ts:395` is what actually protects
  A10. The source-grep should be tightened or removed. *Severity: Low.*

---

## GATE SOUNDNESS

Traced each `npm run <gate>` and the Rust/Playwright gates to their CI step.

| ID | Gate | Finding | Severity |
|----|------|---------|----------|
| **GS-1** | `npm run lint:bash` | **Misleading and unenforced.** The script is `bash -n deploy-docker.sh && bash -n deploy.sh` (2 scripts). CI's `Script validation` job runs `bash -n` on **7** scripts directly (`backup-db.sh`, `verify-db-backup.sh`, `pg-volume-safety-check.sh`, `check-migration-drift.sh`, + 3 deploy scripts) and **never invokes `npm run lint:bash`**. A developer running the package.json gate gets false confidence; worse, ~17 other shell scripts (`install-gvisor.sh`, `install-crun-runtime.sh`, `scripts/deploy.sh`, `monitor-health.sh`, `rebuild-worker-language-images.sh`, `docker-disk-cleanup.sh`, …) are syntax-checked by **neither** path. A syntax error in those ships undetected. **Fix:** rewrite `lint:bash` to loop over every `*.sh` in the repo (`find . -name '*.sh' -not -path './node_modules/*' -not -path './.next/*' -not -path './judge-worker-rs/target/*' -print0 | xargs -0 bash -n`) and add the step to CI's `Script validation` job. | **Medium** |
| **GS-2** | `npm run test:e2e` / Playwright | **Zero retries + dead SQLite setup in the CI e2e job.** `playwright.config.ts` does not set `retries` (default 0) — a single transient selector/timing flake fails CI directly. The CI `e2e` job (`.github/workflows/ci.yml:264+`) runs `rm -f data/judge.db*` + `npm run db:push` + `seed` + `languages:sync` + `build` **before** `npx playwright test`, but the e2e DB is actually a Postgres container started by `scripts/playwright-local-webserver.sh` (port 55432) inside the `webServer` config. The pre-`playwright test` steps target a SQLite file (`data/judge.db`) that the standalone server never reads; they are dead work, and `npm run build` then runs twice. **Fix:** set `retries: 1` (or `2` on CI via `PLAYWRIGHT_RETRIES`) for flake tolerance; delete the redundant SQLite/`db:push`/`seed`/`build` steps from the `e2e` job and let `webServer` own setup. *Confidence: High.* | **Medium** |
| **GS-3** | `npm run test:unit` vs `test:unit:coverage` | **Coverage thresholds bypassed on the plain unit gate.** `vitest.config.ts` defines per-module thresholds (`src/lib/security/**` 90/85/90/90, `src/lib/auth/**` ditto) but they only apply under `--coverage`. CI correctly runs `test:unit:coverage`, yet the documented local gate `npm run test:unit` passes regardless of coverage. A contributor can see green locally and get red on CI, or — if CI is ever switched to the plain gate — security-module coverage silently erodes with no signal. **Fix:** make `test:unit` an alias of `test:unit:coverage`, or add a `pretest` hook, or document that `test:unit:coverage` is the only authoritative gate. | **Medium** |
| **GS-4** | `test:unit` (naming/placement) | The A10 GET-gate coverage lives in `problems-function-spec.route.test.ts` while a *separate* source-grep (`problem-detail-capabilities-implementation.test.ts`) asserts strings that only match PATCH/DELETE. Reviewers searching for "problem GET authz test" will not find the behavioral test. Not a false-green, but a navigational trap that already misled this review's first pass. **Fix:** move the `describe("GET ... referenceSolution hiding")` block into a `problems.route.test.ts` (which currently does not exist for GET), or rename the file. | **Low** |

**Gates that ARE sound:** `npm run lint` (eslint, in CI), `npx tsc --noEmit` (in
CI), `npm run db:check` (in CI; now non-destructive per A11), `cargo test`
(×3 manifests, in CI), `cargo audit` (in CI), `npm audit --audit-level=high`
(in CI), `npm run build` (in CI), `docker compose config --quiet` +
`docker build --check` per language (in CI). The integration gate runs against
a real `postgres:18-alpine` service (good — no SQLite/PG drift at that layer).

---

## PHASE-B GAPS (carry-over from cycle 1)

| ID | Cycle-1 ref | Status | Detail |
|----|-------------|--------|--------|
| **PB-1** | AGG-63 / TE-1 | **STILL OPEN — High.** | `tests/unit/actions/user-management.test.ts:481` test name still reads `"deletes a user successfully and records audit before deletion"`. No `toHaveBeenCalledBefore`, no `invocationCallOrder` assertion, and the `"returns deleteUserFailed when db throws"` test (lines ~548-560) does **not** assert `recordAuditEvent)not.toHaveBeenCalled()`. The fix `76e27d31` (post-deletion audit) is fully unprotected: reverting the order passes every test. Same gap in `tests/unit/api/users.route.test.ts` `DELETE ?permanent=true`. **This is the highest-ROI Phase B test task** — three assertions across two files (rename, order, not-called). *Confidence: High.* |
| **PB-2** | AGG-67 / TE-4 | **STILL OPEN — High.** | Restore FK ordering is source-grep only. `tests/unit/db/import-implementation.test.ts:24` asserts the source text contains the `throw new Error("Failed to import ${tableName} batch ${i}")` string; `admin-backup-security.route.test.ts` fully mocks `importDatabase`. No runtime test feeds a poisoned payload (child row → missing parent FK) and asserts rollback. `tests/integration/db/` has `catalog-numbers`, `judge-claim-reclaim`, `submission-lifecycle`, `user-crud` — none exercise `importDatabase`. A refactor that preserves the throw string but swaps truncate/insert order, or catches the error upstream, ships green. **Fix:** integration test using `tests/integration/db/helper.ts` `createTestDb`, build an export whose `submissions` row references a missing `userId`, assert rejection + sentinel-row survival + parent-before-child insert order via a `tx.insert` spy. |
| **PB-3** | AGG-68 / TE-5 | **STILL OPEN — Medium.** | `tests/unit/api/judge-status-report.route.test.ts` still stubs every `where` with `{ rowCount: 1 }` (lines 129, 191, 259). The stale-token / zombie-worker rejection (`rowCount === 0 ⇒ 403 invalidJudgeClaim`) at `src/app/api/v1/judge/poll/route.ts:78-114,149-192` is uncovered at the route layer. The SQL-level guard IS exercised by `judge-claim-reclaim.test.ts:178-193` but only with a real PG (not in `test:unit`). **Fix:** add two cases (`where → rowCount: 0` for in-progress and terminal arms) asserting `status === 403` + body `invalidJudgeClaim`, plus an assertion that the `where` was called with an `and(...)` clause including `judgeClaimToken`. |

**Closed this cycle (verified):** AGG-64 / TE-3 (A9), AGG-65 / TE-10 (A12),
AGG-66 / TE-2 (A2), AGG-69 / TE-16 (A11).

---

## NEW GAPS

### NG-1 — Post-commit audit for destructive ops uses fire-and-forget, not `recordAuditEventDurable`
- **Severity: Medium. Confidence: High.**
- **Files:** `src/app/api/v1/admin/restore/route.ts:168` and
  `src/app/api/v1/users/[id]/route.ts:395,506,514` call plain `recordAuditEvent`
  (buffered, flushed by timer). `src/lib/audit/events.ts:275` defines
  `recordAuditEventDurable` which `await`s `db.insert(auditEvents)` directly.
- **Gap:** A2's comment claims "Same pattern as the post-deletion audit in
  users/[id]/route.ts" — but BOTH use the fire-and-forget variant. After the DB
  commit, the audit row sits in `_auditBuffer`; a SIGKILL/OOM between commit and
  flush loses the integrity-trail row for a full-DB restore or a permanent user
  deletion (the most audit-critical operations in the system). This is the
  AGG-43 class (5s buffer lost on hard crash) specifically for the destructive
  paths A2/76e27d31 touched. The A2 unit test pins `recordAuditEvent` (not the
  durable variant), so it cannot detect this and arguably entrenches the weaker
  call.
- **Suggested test (TDD):** in `admin-backup-security.route.test.ts`, add a case
  where the audit-insert mock rejects on the first call; assert the route still
  returns 500/200 correctly AND that the durable path was attempted (awaited),
  not queued. Then migrate both call sites to `recordAuditEventDurable` and
  update the mock.

### NG-2 — `recordAuditEvent` is awaited at ZERO of 53 route call sites (AGG-41 residual)
- **Severity: Medium. Confidence: High.**
- **Evidence:** `grep -rn "recordAuditEvent(" src/app/api/ | grep -c "await " → 0`
  across 53 files. Every audit write in the API layer is fire-and-forget.
- **Gap:** cycle-1 AGG-41 (TR-7) flagged this; Phase A did not address it. For
  non-destructive routes the buffer is acceptable; for security-critical sites
  (login, role change, capability grant, password reset) a crash window exists.
  No test asserts any specific site uses the durable variant.
- **Suggested test:** a source-grep inventory test (extend
  `tests/unit/infra/source-grep-inventory.test.ts`) that enumerates the
  integrity-critical routes (login, role/capability mutation, user
  delete/restore, api-key create/patch/delete) and asserts each calls
  `recordAuditEventDurable`, not `recordAuditEvent`.

### NG-3 — `toHaveBeenCalledBefore` reliability on fire-and-forget mocks (A2, A4)
- **Severity: Low. Confidence: Medium.**
- **Files:** `tests/unit/api/admin-backup-security.route.test.ts:412`,
  `tests/unit/api/group-instructors.route.test.ts`.
- **Gap:** the A2 ordering assertion relies on the mock being invoked
  synchronously in call order. `recordAuditEvent` is currently synchronous
  (pushes to buffer), so `invocationCallOrder` is stable today. If NG-1 is
  fixed by switching to `recordAuditEventDurable` (an `async` fn the route does
  NOT await), the mock's invocation order can become non-deterministic under
  microtask interleaving, silently weakening the A2 test. Document this coupling
  or assert on the awaited durable mock.

### NG-4 — env.test.ts filesystem-dependent assertions (7 chmod/mkdtemp calls)
- **Severity: Low. Confidence: Medium.**
- **File:** `tests/unit/security/env.test.ts` (A1 tests).
- **Gap:** `chmodSync(path, 0o644)` + `expect(() => ...).toThrow(/group|other bits set/)`
  assumes POSIX permission bits are honored by the underlying FS. On Linux CI
  (ext4/tmpfs) this is fine; if the suite is ever run on a perm-less FS
  (Docker volume on certain network mounts, or macOS APFS clone edge cases) the
  `0o644` write could be stored as `0o600` and the throw-assertion flips. Low
  risk today; worth a comment pinning the required FS semantics.

### NG-5 — `validation.rs` has no `[dev-dependencies]`; pure-function refactor untested for env wrapper
- **Severity: Low. Confidence: Medium.**
- **File:** `judge-worker-rs/src/validation.rs`.
- **Gap:** A12 correctly refactored tests to call
  `validate_docker_image_with_config` (pure), but the production entry point
  `validate_docker_image(image)` (line 91) still reads `is_production_mode()` /
  trusted registries from the env. There is no test that the env-reading wrapper
  agrees with the pure function for the same config — a future change to
  `is_production_mode()` or the registry parser would not be caught. A single
  test that sets the env once in a `#[serial]`-equivalent (or reads the parsed
  values via a getter) and compares would close it.

---

## FINAL SWEEP

- **Phase A is genuinely green-protected (12/12).** The earlier
  green-but-broken cluster around `76e27d31 / 6cc068f0 / 34d27adf / 26cff8e4`
  identified in cycle 1 (TE-1/2/3/16) is largely resolved: TE-2, TE-3, TE-10,
  TE-16 are closed by A2/A9/A12/A11. The remaining open items are TE-1, TE-4,
  TE-5 (PB-1/PB-2/PB-3) — none of which Phase A targeted.
- **The biggest miss is PB-1 (AGG-63 / TE-1).** It is the original Critical
  from cycle 1, it is one commit away (`76e27d31`) from the restore-audit fix
  that DID get the A2 treatment, and the fix is still fully unprotected. The
  asymmetry is striking: the restore path got order + not-called + summary
  assertions; the user-deletion path kept a test name that literally says
  "before deletion". This is the single highest-ROI Phase B test task.
- **Gates are mostly sound, with two real exceptions:** GS-1 (`lint:bash` is a
  2-script subset, unenforced, ~17 scripts unchecked) and GS-2 (Playwright
  `retries: 0` + a CI e2e job doing dead SQLite-focused setup that does not
  match the real Postgres-via-webServer runtime). GS-3 is a foot-gun rather
  than a hole.
- **Audit durability (NG-1/NG-2) is the thematic Phase B gap.** Phase A
  correctly moved audits to *after* the commit but kept them *fire-and-forget*,
  so a hard crash between commit and flush still loses the row. The durable
  primitive exists (`recordAuditEventDurable`); the migration is mechanical and
  would benefit from TDD on the integrity-critical sites first.
- **No flaky tests were introduced by Phase A.** The filesystem-permission
  tests (NG-4) and the `toHaveBeenCalledBefore` coupling (NG-3) are latent
  risks, not active flakes. The Rust parallel-test flake (TE-10) is eliminated
  by the pure-function refactor.
- **Overall suite health: HEALTHY, with three targeted Phase B actions**
  (PB-1 rename+order+not-called, GS-1 expand lint:bash, NG-1 durable audit at
  destructive sites) that would close the remaining correctness/integrity
  exposure. None require re-architecture.

### Priority-ordered action list

| # | ID | Finding | Severity | Effort |
|---|----|---------|----------|--------|
| 1 | PB-1 | User-deletion audit ordering test (rename + `toHaveBeenCalledBefore` + `not.toHaveBeenCalled`) | High | S |
| 2 | PB-2 | Restore FK-ordering runtime integration test (poisoned payload + rollback) | High | M |
| 3 | PB-3 | Poll-route stale-token unit test (`rowCount: 0` ⇒ 403) | Medium | S |
| 4 | NG-1 | Migrate restore + user-deletion audit to `recordAuditEventDurable`; test the durable path | Medium | S |
| 5 | GS-1 | Expand `lint:bash` to all shell scripts; wire into CI `Script validation` | Medium | S |
| 6 | GS-2 | Set Playwright `retries: 1`+; remove dead SQLite setup from CI e2e job | Medium | S |
| 7 | NG-2 | Source-grep inventory: integrity-critical routes use `recordAuditEventDurable` | Medium | S |
| 8 | GS-3 | Make `test:unit` enforce coverage (or document `test:unit:coverage` as authoritative) | Medium | S |
| 9 | GS-4 | Move A10 GET-gate test into a discoverable `problems.route.test.ts` | Low | S |
| 10 | NG-3 | Document/couple the A2 ordering assertion to the awaited durable mock | Low | S |
| 11 | NG-5 | Add env-wrapper-vs-pure-function parity test for `validate_docker_image` | Low | S |
| 12 | NG-4 | Pin env.test.ts FS-semantics assumption with a comment | Low | S |
| 13 | R-CAV-2 | Tighten/remove the misleading `problem-detail-capabilities` source-grep | Low | S |
