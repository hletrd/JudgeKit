# Cycle 5 — test-engineer

Date: 2026-06-27
Repository: `/Users/hletrd/flash-shared/judgekit`
Cycle: 5 of 100. Prior cycle-4 review preserved in git history (`7ebea50e^`).
Head: `7ebea50e` (cycle-4 shipped head). Suite green: **378 files / 2988 passed / 0 failed** (`npx vitest run`, 33s).

Method: every cycle-4 test addition was read in full and traced to the
production hunk it claims to lock; assertion strength was graded by asking
"does reverting the fix flip this test red?" (revert-RED). The deferred A8
batch (C4-A6, A11a/b, C4-N1-test) — the cycle-4 deferred high-ROI set — was
re-verified against current source. Net-new: scanned every cycle-4 source
hunk for an unguarded sibling (action-side reconfirm, snapshot behavioral).

Severity: **Critical** (silent miss of security/data-loss bug) > **High**
(shipped fix unenforced / unguarded invariant) > **Medium** (defense-in-depth)
> **Low** (hygiene). Findings capped to the high-confidence set; no inflation.

Headline: cycle-4's security cluster is **well-locked** — C4-2 (claim workerId
+ strict IP), F1 (int64 verbatim), C4-9 (CSV durable audit), and the route-side
settings reconfirm are all revert-RED with behavioral assertions. One deferred
item closed this cycle (A11b docker.rs cleanup source-grep landed inline at
`docker.rs:647`). The residual risk concentrates in three places: (1) the
**ARCH-1 action-side reconfirm gate is unguarded** — the mock is wired and the
test comment promises an assertion that was never delivered (highest ROI); (2)
the **deferred A8 batch** (C4-A6 active_tasks, A11a migrate/import, C4-N1 auth
tokens) is still open; (3) two cycle-4 tests are **wiring-shape, not behavior**
(C4-N3 accepted-solutions SQL filter; C4-1 snapshot output bytes).

---

## (a) REGRESSION-CHECK — cycle-4 test additions

"Revert-RED?" = does the test fail if the production hunk is reverted?
"Vector?" = does the test exercise the exact vector the fix targets?

| # | Test | Fix | Verdict | Evidence |
|---|------|-----|---------|----------|
| a1 | `tests/unit/api/judge-poll.route.test.ts:500-525` | `/claim` requires `workerId` (C4-2 Part 1) | **STRONG — revert-RED, vector exact.** | `isJudgeAuthorizedMock.mockReturnValue(true)` (models a valid shared token) + body `{}` → asserts 400 `workerIdRequired` **and** `isJudgeAuthorizedMock` NOT called **and** `rawQueryOneMock` NOT called. The shared-token path is provably unreachable. Confidence High. |
| a2 | `tests/unit/judge/ip-allowlist.test.ts:50-57` | `JUDGE_STRICT_IP_ALLOWLIST=1` fail-closed (C4-2 Part 2) | **STRONG — revert-RED.** | Stubs `JUDGE_STRICT_IP_ALLOWLIST=1` + no allowlist → asserts both 127.0.0.1 and 203.0.113.9 denied. Reverting the flag check flips this green→red. Properly isolated (`beforeEach`/`afterEach` + `unstubAllEnvs` + `resetIpAllowlistCache`). Confidence High. |
| a3 | `tests/unit/db/pre-restore-snapshot.test.ts:85` | snapshot call-site passes `snapshot:true` (C4-1) | **STRONG at the call boundary — revert-RED.** | `expect(streamDatabaseExport).toHaveBeenCalledWith({ sanitize: false, snapshot: true })`. Removing `snapshot:true` from `pre-restore-snapshot.ts` flips this red. But `streamDatabaseExport` is mocked here — the *output bytes* are never checked (see **C5-A3** below). Confidence High (call-site), Medium (behavioral gap). |
| a4 | `tests/unit/db/export-sanitization.test.ts:138-148` | snapshot branch bypasses ALWAYS_REDACT (C4-1) | **MEDIUM — source-grep, revert-RED for full-branch removal only.** | Regex `/options\.snapshot\s*\?[^?]*\{\}/` + `not.toContain("contains password hashes…")`. Catches a full revert of the `? {}` ternary, but a regression that swaps `{}` for a populated redaction map still matches `[^?]*`. The real lock is a3 (call-site); this is defense-in-depth. Confidence High (gap), Medium (severity). |
| a5 | `tests/unit/api/admin-settings-reconfirm.test.ts:151-176` | route partial-wipe guard + `allowAiAssistantInRestrictedModes` reconfirm (ARCH-1 route side, C4-N1, C4-3) | **STRONG on the ROUTE side — revert-RED.** | Wipe test asserts `onConflictDoUpdate.set` contains `siteTitle` and NOT `hcaptchaSecret`/`publicSignupEnabled`/`platformMode` (proxy for the `hasOwnInput` guard). Reconfirm test asserts 401 `passwordReconfirmRequired` for the exam toggle. **But the ACTION side is unguarded** — see **C5-A1**. Confidence High. |
| a6 | `tests/unit/judge/function-judging/serialization.test.ts:11-26` | JS-side int64 verbatim serialization (F1) | **STRONG — revert-RED, behavioral.** | `encodeValue(9007199254740993n, "int")` → byte-identical string; `encodeValue(9007199254740993, "int")` (unsafe Number) → throws `/safe-integer/`. Reverting to `String(Math.trunc(Number(v)))` flips both red. Confidence High. |
| a7 | `tests/unit/judge/function-judging/adapters/cpp.test.ts:56-64` (+ java/csharp twins) | adapter `readInt`/`readLong` use strtoll/parseLong/long.Parse (F1) | **STRONG — revert-RED via golden behavioral round-trip.** | `expect(cppAdapter.assemble(spec, CORRECT_TWO_SUM)).toBe(golden)`. The golden fixture (updated in the same commit) now contains `std::strtoll`. Reverting `cpp.ts:50` to `llround(stod(...))` makes `assemble()` output diverge from the golden → red. This is *better* than the source-grep the plan asked for — it's behavioral on the emitted scaffold. Same shape for java/csharp. Confidence High. |
| a8 | `judge-worker-rs/src/docker.rs:647-671` (inline `#[test]`) | cleanup timeout + startup reap-all + kill_on_drop (A6 / N1+R2+R4) | **STRONG — revert-RED structural contract.** | Asserts the periodic-sweep `tokio::time::timeout(...)` snippet is present byte-for-byte, the `cleanup_all_oj_containers_at_startup` fn exists, `rm -f` is emitted, and `.kill_on_drop(true)` appears ≥5 times. Reverting any of the three hunks fails at least one assertion. **Closes A11b/NEW-4** (deferred since cycle 2). Confidence High. |
| a9 | `tests/unit/api/contest-export.route.test.ts:113-124` | CSV export uses durable audit (C4-9) | **STRONG — revert-RED, vector exact.** | Asserts `recordAuditEventDurableMock` called with `contest.export_downloaded_anonymized` **and** `recordAuditEventMock` NOT called. Reverting to the buffered path flips both. Confidence High. |
| a10 | `tests/unit/api/problem-accepted-solutions.route.test.ts:142-160` | list SELECT applies `eq(users.shareAcceptedSolutions, true)` in SQL (C4-N3) | **WEAK — NOT revert-RED for the SQL filter.** See **C5-A2** below. | The test *changed the mock* to omit submission-2 (opted-out author). It asserts the route returns 1 solution — but if someone reverts the SQL `eq(users.shareAcceptedSolutions, true)` filter, the route still passes because the mock never returns opted-out authors. The `.filter`-removal is also unasserted. Wiring-shape, not behavior. Confidence High (gap). |

---

## (b) DEFERRED A8 BATCH — priority re-validation (the cycle-5 brief target)

These are the four high-ROI gaps cycle-4 deferred at `plan/cycle-4-…:146`.
Re-validated against current head `7ebea50e`.

| ID | Status | Evidence (current source) |
|----|--------|---------------------------|
| **A11b / NEW-4** | **CLOSED ✓** | `judge-worker-rs/src/docker.rs:647` `cleanup_sweep_and_startup_reap_are_timeout_guarded_with_kill_on_drop` landed in commit `c858ce22`. See a8 above. |
| **C4-A6** | **STILL OPEN — High.** | `judge-worker-rs/src/main.rs:570-605` spawn body: `fetch_add(1)` at :573, `catch_unwind` → `report_panic`, `fetch_sub(1)` at :605. The `#[cfg(test)]` module has ONE test (`panic_payload_message` rendering at :32). `grep active_tasks|fetch_sub|run_executor_slot` inside the test module → **0 hits.** No test asserts 0→1→0 on the panic path, no test asserts `fetch_sub` fires exactly once, no extraction of the spawn-body tail into a testable `run_executor_slot`. A future change that moves `fetch_sub` above `report_panic`, wraps it in a conditional, or adds a second decrement on an error path stays green. |
| **A11a / NEW-1** | **STILL OPEN — High.** | `tests/unit/api/admin-backup-security.route.test.ts` — the 4 restore semantic-safety cases (snapshot abort :347, durable-audit-after-commit :416-432, not-recorded-on-fail :474-500, skippedTables) ALL target `/api/v1/admin/restore`. The migrate/import twin (`src/app/api/v1/admin/migrate/import/route.ts:98-251` has the same 4 hunks: snapshot abort, post-commit durable audit ×2, skippedTables) has ONLY the 2 password-confirmation tests (:263-292). Reverting any of the 3 migrate/import hunks passes the suite. Mock scaffolding (`takePreRestoreSnapshotMock`, `recordAuditEventDurableMock`, `importDatabaseMock`) already exists — this is a copy-adapt job. **Cheapest high-ROI win remaining.** |
| **C4-N1-test** | **STILL OPEN — High.** | `tests/unit/email/` contains only `providers-index.test.ts` + `templates.test.ts`. `grep generatePasswordResetToken|validatePasswordResetToken|consumeVerificationToken|generateEmailVerificationToken|resetPassword tests/` → **0 hits.** `tests/unit/api/auth/` does not exist; the 4 auth routes (`reset-password`, `forgot-password`, `verify-email`, `resend-verification`) have zero route-level tests. Single-use enforcement, expiry, and the token-prefix rate-limit (`reset_password:token:${token.slice(0,8)}`) are untested. Account-takeover-adjacent surface, no regression net. |

---

## (c) NET-NEW gaps (this cycle)

### C5-A1 — ARCH-1 action-side reconfirm gate is unguarded (High, S effort) ★ highest ROI
- **Files:** `tests/unit/actions/system-settings.test.ts:19-22,63` (mock wired, default pass); prod `src/lib/actions/system-settings.ts:100` (`const reconfirm = await requireSettingsReconfirm(input, session.user)`).
- **Gap:** the test file wires `requireSettingsReconfirm: vi.fn().mockResolvedValue({ ok: true })` and the *comment at :19-21 literally says* "the dedicated reconfirm test below overrides this to assert the gate fires" — **but no such test exists below.** Every `it()` under `describe("updateSystemSettings")` (:148-342) covers auth/rate-limit/validation/success; NONE overrides the mock to return `{ status: 401, error: "passwordReconfirmRequired" }` and asserts the action rejects. The action calls the gate at :100, so a stolen session POSTing `allowedHosts` via the action without `currentPassword` is enforced in prod — but if a refactor inverts the gate's early-return or drops the call, every test stays green.
- **Why it matters:** the ROUTE twin has a real revert-RED test (a5); the ACTION twin has only a passing mock. ARCH-1's whole point was "both writers gate the same key set" — one writer's gate is unguarded. This is the asymmetry the cycle-4 plan A4 explicitly called out and the deferred A8 batch carried.
- **Proposed test:** in `system-settings.test.ts`, override `requireSettingsReconfirm` to `mockResolvedValue({ status: 401, error: "passwordReconfirmRequired" })`, call `updateSystemSettings({ allowedHosts: [...] }, ...)`, assert `{ success: false, error: "passwordReconfirmRequired" }` and that `dbInsert` is NOT called. ~15 lines. Scaffolding is 90% done.
- **Confidence: High. Confirmed.**

### C5-A2 — C4-N3 accepted-solutions SQL filter is not revert-RED (Medium)
- **Files:** `tests/unit/api/problem-accepted-solutions.route.test.ts:142-160`; prod `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:88` (`.where(and(whereClause, eq(users.shareAcceptedSolutions, true)))`).
- **Gap:** the test asserts the route returns the mock's 1 opted-in solution. The mock was edited to drop submission-2 (the opted-out author) — so the test now *assumes* the SQL filter exists rather than *proving* it. Reverting the `eq(users.shareAcceptedSolutions, true)` clause from the route leaves the test green (the mock never yields opted-out authors). The dropped `.filter` is also unasserted.
- **Why it matters:** a future refactor that moves pagination back into JS (re-introducing the `pageSize`/offset slot consumption bug C4-N3 fixed) ships silently.
- **Proposed test:** mock the list SELECT to return BOTH submission-1 (sharing) and submission-2 (`shareAcceptedSolutions: false`); assert the response contains ONLY submission-1 (proving the route filters), OR assert the mock's `where` was composed with the share clause. The former is behavioral and revert-RED. ~12 lines.
- **Confidence: High. Confirmed.**

### C5-A3 — C4-1 snapshot has no behavioral output-byte test (Medium)
- **Files:** `tests/unit/db/pre-restore-snapshot.test.ts` (mocks `streamDatabaseExport` at :13,21); prod `src/lib/db/export.ts:111` (`activeRedactionMap = options.snapshot ? {} : (options.sanitize ? mergeRedactionMaps(...) : EXPORT_ALWAYS_REDACT_COLUMNS)`).
- **Gap:** `streamDatabaseExport` is mocked in every test that touches it (`grep -rln streamDatabaseExport tests/` → 5 files, all mock it). No test runs the real pipeline with `snapshot:true` and asserts the output stream *contains* `passwordHash`/`sessionToken` bytes (and with `snapshot` unset, *omits* them). The source-grep (a4) catches a full-branch revert but not a subtle regression (e.g., snapshot retained for `users` but not `sessions`, or a future column added to `EXPORT_ALWAYS_REDACT_COLUMNS` that leaks past the snapshot bypass).
- **Why it matters:** the entire point of C4-1 is that the snapshot is *faithfully restoreable*. Without a behavioral test, "faithful" is asserted by reading source text, not by observing output.
- **Proposed test:** add a focused unit that constructs a tiny in-memory row set (users with `passwordHash`/`sessionToken`, sessions, api_keys), runs `streamDatabaseExport({ snapshot: true })` to completion, and asserts the JSON contains those columns; then runs with `snapshot` unset and asserts they are redacted. ~40 lines. (If the pipeline is hard to drive without DB, a thinner alternative: assert `activeRedactionMap` resolution by exporting the helper or testing the column-resolution branch directly.)
- **Confidence: High (gap), Medium (severity — the call-site test a3 + source-grep a4 already lock the primary vector).**

---

## (d) FLAKY-TEST watch

- **No new flake introduced this cycle.** The two new cycle-4 test files with env mutation are well-isolated:
  - `tests/unit/judge/ip-allowlist.test.ts` — `beforeEach`/`afterEach` call `vi.unstubAllEnvs()` + `resetIpAllowlistCache()` at :24-32; the new strict-allowlist case (:50-57) repeats `resetIpAllowlistCache()` after stubbing. No cross-file leakage.
  - `tests/unit/db/export-sanitization.test.ts` — no env mutation; pure source-grep.
- **Rust workspace:** still no `set_var`/`remove_var`/`unsafe` in `judge-worker-rs`, `code-similarity-rs`, `rate-limiter-rs`. Parallel-test flake remains gone. The new `docker.rs:647` test is a pure `include_str!` source-grep — no runtime, no env, no flake surface.
- **Known-flaky (pre-existing, isolated-pass):** `tests/unit/infra/migration-drift-cleanup.test.ts`, `tests/unit/public-route-metadata.test.ts`, `tests/unit/public-seo-metadata.test.ts`. Not flagging as regressions — they are unrelated to cycle-4 and pass in isolation.
- **Latent intra-file `process.env` set** (unchanged from cycle-4): `metrics.route.test.ts`, `admin-docker-images-build.route.test.ts`, `storage-path-traversal.test.ts`, `execute.test.ts`, `data-retention.test.ts`. No active cross-file flake. Model-citizen pattern remains `tests/unit/compiler/execute-implementation.test.ts:79-99`.

---

## (e) Source-grep contract robustness (cycle-4 brief item 4)

| Contract | Location | Robustness | Verdict |
|----------|----------|------------|---------|
| F1 adapters: strtoll/parseLong/long.Parse present, stod/parseDouble absent in int-reader | `adapters/{cpp,java,csharp}.test.ts` golden round-trip (a7) | **Strong** — behavioral `assemble()==golden`, not text grep. Golden contains the correct readers; a source revert diverges the emitted scaffold. The "absent" half is implicitly enforced (golden has no `stod` in `readInt`). | Robust. |
| docker.rs cleanup: timeout + kill_on_drop + startup reap | `docker.rs:647` (a8) | **Strong** — exact multi-line snippet match + `matches(.kill_on_drop(true)).count() >= 5`. Catches both removal and under-counting. Slightly brittle on whitespace (exact `\n` indentation in the snippet), but a `cargo fmt`-stable file won't drift. | Robust. |
| C4-1 snapshot branch | `export-sanitization.test.ts:138-148` (a4) | **Medium** — `/options\.snapshot\s*\?[^?]*\{\}/` matches any `options.snapshot ? <not-?>{}`. Revert-RED for full removal, blind to a populated-map regression. Acceptable as secondary; C5-A3 is the real fix. | Acceptable. |

---

## (f) Carry-forward (unchanged from cycle-4, re-confirmed)

| ID | Status | Evidence |
|----|--------|----------|
| **PB-2** restore/import FK integration | **STILL OPEN — High.** | `tests/integration/db/` has `catalog-numbers`, `judge-claim-reclaim`, `submission-lifecycle`, `user-crud` — none exercise `importDatabase`. `createTestDb` still unused by any restore/import test. |
| **PB-3** poll-route stale-token `rowCount:0 ⇒ 403` | **STILL OPEN — Medium.** | `judge-status-report.route.test.ts` still stubs every `where` with `{rowCount:1}`. The 403 assertions in `judge-poll.route.test.ts:392,462` are the CLAIM route's `invalidWorkerSecret`/schema-mismatch, NOT the POLL route's stale-claimToken arms (`poll/route.ts:96-98`, `:167-169`). |
| **A12e** X-Real-IP source-grep guard | **STILL OPEN — Medium.** | `grep X-Real-IP|proxy_set_header tests/unit/` → no nginx guard. Invariant holds in source (16/16 `proxy_pass` blocks) but unguarded. |
| **GS-1** `lint:bash` covers 2 scripts | **STILL OPEN — Medium.** | `package.json:10` unchanged: `bash -n deploy-docker.sh && bash -n deploy.sh`. 17+ other `scripts/*.sh` unchecked. |
| **GS-2** Playwright `retries` pinned absent | **STILL OPEN — Low.** | `playwright-profiles.test.ts` has no `retries` assertion. |
| **C4-A4** SSE re-auth behavioral | **STILL OPEN — Medium.** | Source-grep only; no revoked-viewer-mid-stream test. |
| **C4-A5** recruiting metadata serialization | **STILL OPEN — Medium.** | Lock-request asserted, no two-transaction serialization proof. |

---

## Priority-ordered action list

| # | ID | Finding | Severity | Effort | Confidence |
|---|----|---------|----------|--------|------------|
| 1 | **C5-A1** | ARCH-1 action-side reconfirm: override `requireSettingsReconfirm` mock → assert action returns `passwordReconfirmRequired` and skips `dbInsert`. Mock + comment already in place; ~15 lines. | High | S | Confirmed |
| 2 | **A11a / NEW-1** | Mirror the 4 restore semantic cases against `admin/migrate/import/route` (snapshot abort, durable-audit-after-commit, not-recorded-on-fail, skippedTables). Mock scaffolding already exists in `admin-backup-security.route.test.ts`. | High | S | Confirmed |
| 3 | **C4-A6** | main.rs `active_tasks` accounting: extract spawn-body tail into testable `run_executor_slot(active_tasks, exec_fut, report_fn)`; assert 0→1→0 on happy + panic paths, `report_fn` once, no double-decrement. | High | S | Confirmed |
| 4 | **C4-N1** | Auth token lifecycle: lib tests for `@/lib/email` (generate/validate/consume/reuse/expiry) + route tests for the 4 auth routes (token-prefix rate-limit, branch mapping). | High | M | Confirmed |
| 5 | **C5-A2** | C4-N3 accepted-solutions: mock list SELECT to return opted-in AND opted-out authors; assert route filters to opted-in only (behavioral, revert-RED for the SQL clause). | Medium | S | Confirmed |
| 6 | **C5-A3** | C4-1 snapshot: behavioral test running real `streamDatabaseExport({snapshot:true})` over in-memory rows; assert passwordHash/sessionToken present in output, absent when unset. | Medium | M | Confirmed |
| 7 | PB-2 | Restore/import FK-ordering integration test via `createTestDb` (parent+child export, missing-parent rejection). | High | M | Confirmed |
| 8 | PB-3 | Poll-route stale-token unit test: `rowCount:0` ⇒ 403 `invalidJudgeClaim` for BOTH arms (in-progress :96-98 + terminal :167-169). | Medium | S | Confirmed |
| 9 | A12e | X-Real-IP source-grep guard: every `proxy_pass` block in `scripts/*.nginx.conf`, `static-site/*.nginx.conf`, `deploy*.sh` carries `proxy_set_header X-Real-IP`. | Medium | S | Confirmed |
| 10 | C4-A4 | SSE re-auth behavioral test (injectable re-auth interval; revoked viewer ⇒ stream closes). | Medium | M | Confirmed |
| 11 | C4-A5 | Recruiting metadata-merge serialization: concurrent `jsonb_set` + merge integration test (reuses PB-2 harness). | Medium | M | Confirmed |
| 12 | GS-1 / GS-2 | Expand `lint:bash` to all `scripts/*.sh`; pin Playwright `retries` absent in `playwright-profiles.test.ts`. | Low | S | Confirmed |

**Verdict:** cycle-4's security fixes (a1, a2, a5-route, a6, a7, a9) are locked
with real behavioral assertions; the worker cleanup source-grep (a8) closes
A11b. The single highest-ROI action is **C5-A1** — the action-side reconfirm
mock is wired and its comment promises a test that was never written; ~15 lines
delivers a revert-RED guard for the ARCH-1 invariant the cycle was built to
enforce. The deferred A8 batch (A11a, C4-A6, C4-N1) remains the converging
risk. Two cycle-4 tests (C5-A2, C5-A3) should be tightened from wiring-shape to
behavioral while the context is fresh.
