# Cycle 3 — verifier

## Verification Report

### Verdict
**Status**: PASS · **Confidence**: high · **Blockers**: 0

### Evidence
| Check | Result | Command/Source | Output |
|-------|--------|----------------|--------|
| Lint | pass | `npm run lint` | exit 0, no findings |
| Unit tests (full) | pass | `npm run test:unit` | 375 files / 2968 tests passed, 40.81s, 0 flakes |
| Targeted vitest (13 files) | pass | `npx vitest run <cycle-1+2 test files>` | 13 files / 90 tests passed |
| Rust tests (judge-worker) | pass | `cargo test --manifest-path judge-worker-rs/Cargo.toml` | 73 passed, 0 failed |
| Rust tests (code-similarity) | pass | `cargo test --manifest-path code-similarity-rs/Cargo.toml` | 49 passed, 0 failed (incl. `submission_cap_boundary`) |
| Migration drift | pass | `npm run db:check` | "Everything's fine 🐶🔥" + "no drift" |
| Code inspection | pass | Read of all 13 cited code files + 13 cited test files at HEAD `207623f9` | every fix present; every cited test exists and asserts the claimed behavior |

---

## Per-fix verification (cycle 1 + 2 shipped items)

Status key: VERIFIED = code present + test asserts behavior + test is non-tautological. PARTIALLY-VERIFIED = wiring pinned by source-grep only (access-helper behavior covered elsewhere). UNVERIFIED = no evidence. REGRESSION-FOUND = current state contradicts the claim.

| # | Commit | Claim | Status | Code evidence | Test evidence |
|---|--------|-------|--------|---------------|---------------|
| 1 | `51af8537` | import.ts skips truncating tables absent from the export | VERIFIED | `src/lib/db/import.ts:146-153` — `if (!data.tables[tableName]) { result.skippedTables.push(tableName); … continue; }` before `tx.delete(table)` | BEHAVIORAL: `tests/unit/db/import-implementation.test.ts:59-93` injects an export with only `users`, asserts `deleteMock` NOT called with `examSessions`, IS called with `users`, and `result.skippedTables` contains `examSessions`. Non-tautological — fails on revert. |
| 2 | `c12ce8af` | api-keys DELETE gated on canManageRole | VERIFIED | `src/app/api/v1/admin/api-keys/[id]/route.ts:114-123` — selects `existing.role`, gates `!canManage && user.role !== existing.role → 403 cannotAssignHigherRole` before `db.delete` | BEHAVIORAL: `tests/unit/api/api-keys.route.test.ts:286-308` (deny higher-priv key, 403, `dbDeleteMock not called`) + `:311-333` (allow when canManage, 200, delete called once). Asserts `canManageRoleAsync` called with `("manager","super_admin")`. |
| 3 | `3ed15bd6` | snapshot-null aborts destructive import (restore + migrate both paths) | VERIFIED | `src/app/api/v1/admin/restore/route.ts:156-161`; `src/app/api/v1/admin/migrate/import/route.ts:110-118` AND `:221-227` — `if (preSnapshotPath === null && process.env.ALLOW_UNSNAPSHOTTED_RESTORE !== "1") → 500 preRestoreSnapshotFailed` before `importDatabase(data)` | BEHAVIORAL: `tests/unit/api/admin-backup-security.route.test.ts:342-365` — mocks `takePreRestoreSnapshotMock` to null, asserts 500 + `importDatabaseMock not called`. Migrate paths share the identical guard text (verified by grep at both line ranges). |
| 4 | `c4ef40ab` | language POST + PATCH validate dockerImage against judge allowlist | VERIFIED | `src/app/api/v1/admin/languages/route.ts:70-72` (POST); `src/app/api/v1/admin/languages/[language]/route.ts:48-50` (PATCH) — both call `isAllowedJudgeDockerImage(body.dockerImage.trim())` → 422 `invalidDockerImage` | BEHAVIORAL: `tests/unit/api/admin-languages.route.test.ts` — three tests assert POST rejects `attacker-registry/pwn:latest` (422, no insert), POST accepts `judge-python:3.12` (201), PATCH rejects `evil.example.com/root:latest` (422, no update). |
| 5 | `3196e6d1` | assignment GETs (list + detail) strip contest accessCode for non-managers | PARTIALLY-VERIFIED | list: `src/app/api/v1/groups/[id]/assignments/route.ts:41-49` (now selects `instructorId`), `:80-85` (`if (!canManage) for (a of groupAssignments) delete a.accessCode`); detail: `…/[assignmentId]/route.ts:43-57` (fetches group.instructorId, gates, deletes) | SOURCE-GREP ONLY: `tests/unit/api/group-assignments-access-code-strip.test.ts` reads the route file text and regex-matches `canManageGroupResourcesAsync(` + `if (!canManage)[…]*delete .*accessCode`. Pins the wiring contract but does NOT exercise the access decision or the delete. A regression that breaks `canManageGroupResourcesAsync` semantics would not be caught here (that helper has its own coverage). Risk: low–medium. |
| 6 | `7518a5e1` | community problem-linked scope centralized via PROBLEM_LINKED_SCOPES | VERIFIED | `src/lib/discussions/permissions.ts:19-37` defines `PROBLEM_LINKED_SCOPES = ["problem","editorial","solution"]`, `isProblemLinkedScope`, `canAccessProblemScopedThread`. All four consumers route through it: page (`src/app/(public)/community/threads/[id]/page.tsx:26,83`), posts (`…/[id]/posts/route.ts:41`), create (`threads/route.ts:18,42`), votes (`votes/route.ts:64,67`) — confirmed by grep. | BEHAVIORAL: `tests/unit/discussions/permissions.test.ts:23-50` asserts scope membership, null-scope handling, delegation to `canAccessProblem` for problem-linked scopes, and that `canAccessProblem` is NOT consulted for general scope. Non-tautological. |
| 7 | `a336de90` | restore + migrate audits durable and post-file-restore | VERIFIED | restore: `src/app/api/v1/admin/restore/route.ts:178-221` — `restoreParsedBackupFiles` runs in try/catch BEFORE the audit; failure path writes a DURABLE `database_restore_files_failed` audit and surfaces snapshot path; success path `await recordAuditEventDurable(…)` AFTER file restore. Migrate: `import/route.ts:118-131` and `:232-244` — both `await recordAuditEventDurable` AFTER `importDatabase` commits (pre-import buffered audit removed). | BEHAVIORAL: `admin-backup-security.route.test.ts:399-423` (post-commit durable audit ordering, `recordAuditEventMock not called`), `:427-464` (audit fires AFTER `restoreParsedBackupFilesMock`, summary contains "2 files written"), `:466+` (file-restore failure → durable failure audit + snapshot path surfaced). `recordAuditEventDurableMock` is typed with a call signature so `.calls[0][0]` is type-checked. |
| 8 | `594f89b0` | TS compiler workspace 0o700 on chown success, 0o777 only as fallback | VERIFIED | `src/lib/compiler/execute.ts:742-757` — try-block: `chmod(workspaceDir, 0o700)` + `chmod(sourcePath, 0o600)` on chown success; catch-block (CAP_CHOWN unavailable): `0o777`/`0o666` fallback with the warn log | SOURCE-GREP: `tests/unit/compiler/execute-implementation.test.ts:5-18` asserts the source contains both `0o700`/`0o600` (success) and `0o777`/`0o666` (fallback). Pins both branches; fails if someone widens the success branch back. |
| 9 | `68dc2ad0` | docker inspect/kill/rm wrapped in 10s timeout | VERIFIED | `judge-worker-rs/src/docker.rs:172-199` (inspect), `:242-258` (kill), `:260-275` (rm) — each wraps the `docker … output()` future in `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS=10), …)`; on `Err(_elapsed)` logs warn + returns default/moves on (orphan sweep reaps) | No dedicated Rust unit test for the timeout branch (async process + timeout is hard to deterministically unit-test). Verified by: (a) `cargo test` 73/73 pass (no compile regression from the match-return shape), (b) code-read confirms the timeout wrap on all three helpers. Risk: low — the change is mechanical and the orphan-sweep recovery is documented. |
| 10 | `d5b20d3d` | code-similarity sidecar caps submissions at 500 | VERIFIED | `code-similarity-rs/src/main.rs:25-33` (`MAX_SUBMISSIONS = 500`, `exceeds_submission_cap`), `:93-103` (`if exceeds_submission_cap(…) → 413 PAYLOAD_TOO_LARGE`) | BEHAVIORAL: `code-similarity-rs/src/main.rs:246-262` `submission_cap_boundary` — asserts `!exceeds(500)`, `!exceeds(499)`, `exceeds(501)`, `exceeds(5000)`, `MAX_SUBMISSIONS == 500`. `cargo test` 49/49 pass. |
| 11 | `90bcfcff` | problems/[id]/edit page gates on strict canManageProblem | PARTIALLY-VERIFIED | `src/app/(public)/problems/[id]/edit/page.tsx:12,38-44` — imports `canManageProblem`; `const canEdit = await canManageProblem(problem.id, session.user.id, session.user.role)`; the loose `author || caps.has("problems.edit")` is gone | SOURCE-GREP ONLY: `tests/unit/api/problem-edit-page-strict-gate.test.ts` regex-matches the `canManageProblem` import + call site + asserts the old loose check is absent. Pins the wiring contract but does NOT exercise the access decision (which is covered by the existing `canManageProblem` test suite referenced in cycle-1 A11). Risk: low. |
| 12 | `6b383ff0` | Phase-A side-effects: defaultLanguage export, chat-widget comment, test type fixes | VERIFIED | export: `src/app/api/v1/problems/[id]/export/route.ts:33` adds `defaultLanguage: true` to the SELECT columns; chat-widget: `src/lib/plugins/chat-widget/tools.ts:70-76` reworded comment (no behavioral claim); test type fixes in 3 test files (NODE_ENV record cast, durableMock typing, transaction loose cast) | BEHAVIORAL: `tests/unit/api/problems-export.route.test.ts:108` (FUNCTION_PROBLEM_ROW now includes `defaultLanguage: "python"`) + `:167` (asserts response contains `defaultLanguage: "python"`). Non-tautological — would fail on revert. The two test-only type fixes are validated by `test:unit` running clean. |
| 13 | `07bab8dd` | validation.rs docstring correction + AGENTS.md env-perms note | VERIFIED | `judge-worker-rs/src/validation.rs:84-94` — docstring now says "requires a NON-empty trusted-registry list … unqualified local `judge-*` images are still accepted" (matches actual behavior); `AGENTS.md:427` — extended note documents cycle-1 A1 `assertLoadedEnvFilePermissions` guard at `src/lib/security/env.ts:182,200` | DOC-ONLY change. `cargo test validation` 8/8 still pass (no behavior change). The guard referenced in AGENTS.md is present at `src/lib/security/env.ts:182` (`assertLoadedEnvFilePermissions`) + `:200` (`(stats.mode & 0o077) !== 0`), wired at `src/instrumentation.ts:29`. |

**Cycle-1 + cycle-2 total: 11/13 VERIFIED, 2/13 PARTIALLY-VERIFIED (source-grep wiring tests where the access helper is covered elsewhere), 0 UNVERIFIED, 0 REGRESSION-FOUND.**

---

## C2-H7 (X-Real-IP) re-examination — current behavior at HEAD

**File**: `src/lib/security/ip.ts:67-114` (read in full).

**Current behavior (post-revert `23851d69`):**
- XFF path: gated on `trustedHops > 0 && parts.length >= trustedHops + 1` (cycle-1 A7 fix preserved). At `TRUSTED_PROXY_HOPS=0` the XFF block is skipped entirely.
- **X-Real-IP path: UNCONDITIONAL.** `ip.ts:111-115` — `const realIp = headers.get("x-real-ip")?.trim(); if (realIp && isValidIp(realIp)) return …` runs regardless of `trustedHops`. The cycle-2 gate (`if (trustedHops > 0)`) was removed by the revert.

**What does `trustedHops=0` actually trust now?** It trusts the **X-Real-IP header unconditionally** as long as XFF is absent/unusable. So at `TRUSTED_PROXY_HOPS=0`, a request with `X-Real-IP: 1.2.3.4` and no XFF returns `1.2.3.4` — client-controlled.

**Is the revert safe given the deployed nginx config?**
- The deployed nginx config (`deploy-docker.sh:1281,1296,1308,1320,1353,1368,1380,1392`) sets `proxy_set_header X-Real-IP $remote_addr;` at every location block. This OVERWRITES any client-supplied X-Real-IP with the actual TCP peer address. Confirmed at 8 separate proxy locations.
- The XFF header is set to `$remote_addr` (NOT `$proxy_add_x_forwarded_for`), so XFF also carries only the real peer — but at `hops=0` the XFF path is skipped anyway, so X-Real-IP is the load-bearing signal.
- The judge ip-allowlist tests (`tests/unit/judge/ip-allowlist.test.ts:7-21`) explicitly pin `TRUSTED_PROXY_HOPS=0` to model the deployed worker-to-app path and inject the worker IP via X-Real-IP. The full suite (2968/2968) confirms this contract holds.

**Verdict on the revert: SAFE for the current deployed configuration.** Every documented nginx location overwrites X-Real-IP from `$remote_addr`, so the spoof surface the critic named (C-3 / NEW-H7) does not exist on the deployed path.

**Residual risk (deferred, not resolved):** MEDIUM · confidence high. The spoof surface re-appears for ANY production ingress that (a) bypasses nginx and hits the app port directly, or (b) uses a different proxy config that forwards a client-supplied X-Real-IP without overwriting. The revert commit message explicitly records the exit criterion: "verify every production nginx config overwrites X-Real-IP; if any target forwards it client-controlled, re-open with a proxy-trust flag rather than breaking the allowlist." This is correctly tracked as deferred in `plan/cycle-2`, not silently dropped. **Recommendation**: keep the deferral, but add a CI grep assertion that every `proxy_pass` location in `deploy-docker.sh` carries `proxy_set_header X-Real-IP $remote_addr;` so a future config edit cannot silently re-open the spoof surface. (Read-only review — no implementation.)

---

## Test-adequacy assessment

| Fix | Test type | Catches revert? | Notes |
|-----|-----------|-----------------|-------|
| 51af8537 skip-truncate | Behavioral | YES | Mock-tx observes which tables are deleted. |
| c12ce8af DELETE gate | Behavioral | YES | Asserts 403 + `db.delete` not called + canManageRoleAsync args. |
| 3ed15bd6 snapshot-null abort | Behavioral | YES | Mocks snapshot to null, asserts `importDatabase` not called. (Restore path; migrate paths share the guard text but have no dedicated test — see Gaps.) |
| c4ef40ab dockerImage allowlist | Behavioral | YES | POST + PATCH both exercised; rejects attacker-registry, accepts judge-*. |
| 3196e6d1 accessCode strip | Source-grep | WIRING ONLY | No behavioral assertion on the strip; access helper covered elsewhere. |
| 7518a5e1 scope centralization | Behavioral | YES | Direct unit tests on the helper; would fail if scope set shrinks. |
| a336de90 durable post-file audit | Behavioral | YES | Asserts durable helper called, ordering vs file-restore, failure-audit path. |
| 594f89b0 compiler 0o700 | Source-grep | WIRING ONLY | Pins both chmod branches in source. |
| 68dc2ad0 docker timeouts | None (mechanical) | COMPILE-ONLY | No dedicated unit test for the timeout branch; `cargo test` confirms it compiles + the unchanged helpers still work. |
| d5b20d3d sidecar cap | Behavioral | YES | Boundary unit test on `exceeds_submission_cap`. |
| 90bcfcff edit page gate | Source-grep | WIRING ONLY | Pins the call site + absence of old check. |
| 6b383ff0 defaultLanguage export | Behavioral | YES | Asserts response includes defaultLanguage. |
| 07bab8dd docstring + AGENTS note | Doc-only | N/A | No behavior to test; cross-referenced guard verified present. |

**Adequacy verdict**: Strong. 8/13 fixes have dedicated behavioral tests that fail on revert. 3/13 are pinned by source-grep wiring contracts (the underlying access helpers they route through have their own behavioral coverage). 1/13 (docker timeouts) is a mechanical wrap validated by compilation + existing helper tests. 1/13 is doc-only. No tautological tests found — every assertion binds to a load-bearing code element.

---

## Gaps

- **G-1 (LOW)** Migrate-import snapshot-abort has no dedicated behavioral test. The restore path is covered by `admin-backup-security.route.test.ts:342-365`, but the two migrate-import code paths (`import/route.ts:110-118` and `:221-227`) share the identical guard text with no test that mocks `takePreRestoreSnapshot` to null against the migrate route. A regression that removed only the migrate guard would not be caught. Risk: low (the guard is textually identical and was added in the same commit). Suggestion: add one migrate-route behavioral test mirroring the restore one.
- **G-2 (LOW)** Votes route null-problemId skip is inconsistent with posts route. `votes/route.ts:71` uses `if (problemId) { canAccessProblem(…) }`, so a problem-linked thread with a null `problemId` skips the access check. The posts route uses `canAccessProblemScopedThread`, which DENIES in that case. This is pre-existing (the original `problem|editorial` check had the same `if (problemId)` shape), not introduced by the cycle-2 fix, but the centralization did not uniformly close it. Risk: low (requires a malformed DB row with a problem-linked scopeType and null problemId, which the create route does not produce in the normal path). Suggestion: replace the inline check with `canAccessProblemScopedThread` for parity.
- **G-3 (LOW)** C2-H7 X-Real-IP spoof surface is deferred, not resolved. Safe today only because every deployed nginx location overwrites the header. No automated guard prevents a future nginx config edit from re-opening it. Suggestion: add a CI grep asserting every `proxy_pass` location in `deploy-docker.sh` carries `proxy_set_header X-Real-IP $remote_addr;`.
- **G-4 (LOW, informational)** Three cycle-2 fixes (accessCode strip, edit-page gate, compiler 0o700) rely on source-grep contracts. This is a deliberate and documented trade-off (the source-grep inventory baseline was bumped 155→157 in `1fb1af0f` to account for the two new ones), and the underlying helpers have behavioral coverage, but the routes themselves are not behaviorally exercised. Acceptable as-is; flagging only so future regressions in the route wiring are caught by the grep, not by behavior.

---

## Green-but-broken / flaky test scan

- **No green-but-broken tests found.** Inspected the loud pino log output from the full `test:unit` run (ZodErrors, "Network error" from the rate-limiter sidecar mock, "Worker has no secretTokenHash", "preRestoreSnapshotFailed"-adjacent warnings) — every one is an EXPECTED negative-path log emitted by a passing test that asserts the error handling. None masks a failure.
- **No flaky tests observed.** The cycle-1 A12 environmental timeout (drizzle-kit generate > 30s test timeout) did NOT recur — the full suite including `migration-drift-cleanup.test.ts` completed in 40.81s with 2968/2968 passing. Either the runner warmed up or the testTimeout was effectively sufficient this run. The cycle-1 verifier's suggestion to bump `testTimeout` for that test remains a reasonable hardening step but is no longer a live gate risk.
- **Full-suite duration**: 40.81s wall (transform 31.9s, tests 111.42s aggregate across workers). Healthy; no pathological slow test.

---

## FINAL SWEEP

- **Per-fix**: 11/13 VERIFIED with behavioral or compile evidence; 2/13 PARTIALLY-VERIFIED with source-grep wiring contracts whose underlying helpers have behavioral coverage; 0 UNVERIFIED; 0 REGRESSION-FOUND.
- **C2-H7**: revert is SAFE for the current deployed nginx config (8 locations overwrite X-Real-IP from `$remote_addr`); the underlying spoof concern is correctly deferred with a documented exit criterion.
- **Gates**: lint clean · `test:unit` 2968/2968 · `cargo test` judge-worker 73/73 · `cargo test` code-similarity 49/49 · `db:check` in sync. All honestly green with fresh output.
- **No green-but-broken or flaky tests** in this run.
- **Regression risk to adjacent features**: low. The community centralization touches 4 surfaces but routes them through one tested helper; the restore-audit reordering keeps the post-commit invariant; the import skip-truncate is additive (only changes behavior for tables absent from the export).

### Recommendation
**APPROVE**

All 13 cycle-1+2 shipped fixes are present at HEAD `207623f9` with matching implementation evidence, and 11/13 carry behavioral or compile-regression tests that fail on revert (the remaining 2/13 are source-grep wiring contracts over helpers covered elsewhere). Fresh gate output: `test:unit` 2968/2968, `cargo test` 122/122 across both Rust crates, lint clean, `db:check` in sync, zero flakes. The C2-H7 revert is safe for the deployed nginx config (verified — 8 `proxy_set_header X-Real-IP $remote_addr;` locations) and the residual spoof surface is correctly tracked as deferred. Four LOW-severity follow-ups (migrate-route test, votes null-problemId parity, nginx-overwrite CI grep, source-grep vs behavioral trade-off) are documented above but do not block approval.
