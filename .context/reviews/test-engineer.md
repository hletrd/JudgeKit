# Cycle 4 — test-engineer

Date: 2026-06-27
Repository: `/Users/hletrd/flash-shared/judgekit`
Cycle: 4 of 100. Prior cycle-3 review preserved in git history.
Method: every cycle-3 test addition was read in full and traced to the
production hunk it claims to lock; assertion strength was graded by asking
"does reverting the fix flip this test red?" Deferred items (A11a/b, A12e,
PB-2/3, GS-1..4) were re-verified against current source. Net-new sweep:
fixed-string cross-reference of all 113 API route files vs. the test tree.

Severity: **Critical** (silent miss of security/data-loss bug) > **High**
(shipped fix unenforced / unguarded invariant) > **Medium** (defense-in-depth)
> **Low** (hygiene). Findings capped to the high-confidence set; no inflation.

Headline: the cycle-3 **data-leak / authz cluster is well-locked**
(admin-roles lateral strip, settings reconfirm, contest-export JSON audit).
The residual risk concentrates in three places: (1) two cycle-3 fixes whose
tests pin **wiring shape, not behavior** (SSE re-auth, recruiting race); (2)
the **main.rs panic-recovery accounting** which is not asserted at all; (3)
the **migrate-import + worker-timeout twins** carried open since cycle 2.

---

## (a) REGRESSION-CHECK — cycle-3 test additions

"Revert-RED?" = does the test fail if the production hunk is reverted?
"Vector?" = does the test exercise the exact attack vector the fix targets?

| # | Test | Fix | Verdict | Evidence |
|---|------|-----|---------|----------|
| a1 | `tests/unit/api/admin-roles.route.test.ts:294-331` | `cannotEditHigherRole` lateral cap-strip (C3-AGG-2) | **STRONG — revert-RED, vector exact.** | Actor `admin` (level 3) edits a level-4 custom role via `{capabilities: []}` — a *removal*, the vector that bypassed the `added`-caps filter. Asserts 403 + `cannotEditHigherRole`. The strip (not add) path is precisely the regression. Confidence High. |
| a2 | `tests/unit/api/admin-settings-reconfirm.test.ts:123-149` | privileged-vs-cosmetic password reconfirm (C3-AGG-7) | **STRONG — distinction proven both ways.** | `publicSignupEnabled`/`allowedHosts` ⇒ 401 `passwordReconfirmRequired` / 403 `invalidPassword`; `siteTitle` ⇒ 200 **and** `verifyAndRehashPassword NOT called`. The negative assertion on the cosmetic path is what makes it a real distinction test. Confidence High. |
| a3 | `tests/unit/api/contest-export.route.test.ts:121-144` | audit on `?format=json` without `download=1` (C3-AGG-1) | **STRONG — exact gap closed.** | Asserts `recordAuditEventDurableMock` called with `{format:"json", download:false}` **and** `recordAuditEventMock` NOT called (legacy buffered path retired for the JSON branch). This is the programmatic-panel-read leak the fix targeted. Confidence High. |
| a4 | `tests/unit/api/submission-events-reauth-authorization-implementation.test.ts:20-42` | SSE mid-stream re-auth re-runs `canAccessSubmission` (C3-AGG-6) | **WEAK — source-grep only, no mid-stream revocation.** See **C4-A4** below. | Reads `src/app/api/v1/submissions/[id]/events/route.ts` as text and asserts the IIFE string + ordering. The test's own header concedes a behavioral test is "disproportionately heavy." No test drives the poll loop past `AUTH_RECHECK_INTERVAL_MS` with a revoked viewer and asserts the stream closes. Confidence High (gap), Medium (severity — wiring is correct today). |
| a5 | `tests/unit/assignments/recruiting-invitation-metadata-race.test.ts:100-160` | metadata-merge `FOR UPDATE` serialization (C3-AGG-3) | **PARTIAL — lock asserted, no behavioral race.** See **C4-A5** below. | `forMock` called with `"update"` (line 114) proves the lock is *requested*; `_sys.*` preservation + no-tx-for-expiresAt are good. But no test runs two concurrent `updateRecruitingInvitation` calls and proves the counter isn't clobbered. Lock-acquisition is a proxy for serialization, not a serialization proof. Confidence High (gap), Medium (severity). |
| a6 | `judge-worker-rs/src/main.rs:668-695` (panic-recovery tests) | executor panic → `catch_unwind` + `report_panic` + `active_tasks` decrement (C3-AGG-9) | **GAP — `active_tasks` accounting untested.** See **C4-A6** below. | The 3 tests assert only `panic_payload_message` rendering + that `catch_unwind` traps a standalone panicking async. None spawn the real task body or assert `active_tasks.fetch_sub` fires after a panic, fires exactly once, and is not skipped/duplicated. |

### C4-A4 — SSE re-auth is source-grep, not behavioral  (Medium)
- **Files:** `tests/unit/api/submission-events-reauth-authorization-implementation.test.ts:26-33`; prod `src/app/api/v1/submissions/[id]/events/route.ts`.
- **What's missing:** a test that opens the event stream, lets the re-auth interval elapse with `canAccessSubmission → false` (group revoked / role downgraded), and asserts the connection closes (or stops emitting). The source-grep passes even if the IIFE's interval is accidentally cleared, the condition inverted, or `refreshedReader` is fetched outside the re-auth path.
- **Suggested test:** inject a fake clock / make `AUTH_RECHECK_INTERVAL_MS` overridable; drive the route handler's poll loop two iterations with a mock that returns authorized on iteration 1 and unauthorized on iteration 2; assert the second iteration yields a close. ~40 lines if the interval is made injectable, else a focused route-unit that calls the re-auth IIFE directly.
- **Confidence: High** (gap), **confirmed**.

### C4-A5 — recruiting race: lock-request asserted, serialization not  (Medium)
- **Files:** `tests/unit/assignments/recruiting-invitation-metadata-race.test.ts:100-115`; prod `src/lib/assignments/recruiting-invitations.ts` (`updateRecruitingInvitation`).
- **What's missing:** `expect(harness.forMock).toHaveBeenCalledWith("update")` proves the `SELECT ... FOR UPDATE` is issued, but a refactor that acquires the lock and then reads `metadata` *outside* the locked statement, or commits the `UPDATE` on a stale read, still passes. No interleaved two-transaction test demonstrates that a concurrent `jsonb_set` brute-force increment survives the merge.
- **Suggested test:** integration test via `tests/integration/support/test-db.ts` — two `updateRecruitingInvitation` calls + a concurrent raw `UPDATE ... jsonb_set` on `_sys.failedRedeemAttempts`, assert the final metadata reflects both the merge edit and the incremented counter (no lost update). Reuses the PB-2 harness.
- **Confidence: High** (gap), **confirmed**.

### C4-A6 — main.rs panic-recovery: `active_tasks` not asserted  (High)
- **Files:** `judge-worker-rs/src/main.rs:557-590` (spawn body: `fetch_add` then `catch_unwind` → `report_panic` → `fetch_sub`); tests at `:668-695`.
- **What's missing:** the spawn body does `active_tasks.fetch_add(1)` (line 557), and after `catch_unwind` always does `active_tasks.fetch_sub(1)` (line 589). The invariant — *a panic still decrements exactly once* (no leak, no underflow) — is not asserted anywhere. If `report_panic` is awaited and a future change moves `fetch_sub` above it, or wraps it in a conditional, or a second `fetch_sub` is introduced on an error path, every test stays green. The existing tests only prove message rendering for three payload shapes.
- **Suggested test:** extract the spawn-body tail into a testable `async fn run_executor_slot(active_tasks, exec_fut, report_fn)` that mirrors lines 559-590; assert `active_tasks` goes 0→1→0 on the happy path, 0→1→0 on the panic path (with `report_fn` recorded once), and that `fetch_sub` is unreachable-twice. ~30 lines; same refactor-for-testability shape as cycle-1 A12.
- **Confidence: High** (gap), **confirmed**.

---

## (b) DEFERRED ITEMS — close / re-confirm

| ID | Item | Status | Evidence (current source) |
|----|------|--------|---------------------------|
| **A11a / NEW-1** | migrate/import snapshot-gate + durable-audit + skippedTables | **STILL OPEN — High.** | `src/app/api/v1/admin/migrate/import/route.ts:98-107` (snapshot abort), `:123-133` & `:233-243` (durable audit post-commit), `:131,140,251` (skippedTables). The only migrate/import tests are password-confirmation: `admin-backup-security.route.test.ts:263-292`. The restore twin at `:347-543` has all four cases; the migrate/import twin has none. Reverting any of the three migrate/import hunks passes the suite. **Cheapest high-ROI win.** |
| **A11b / NEW-4** | docker.rs cleanup-timeout coverage | **STILL OPEN — High.** | `judge-worker-rs/src/docker.rs:172-240` (inspect), `:242-258` (kill), `:260-276` (rm) — three `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS), …)` wrappers. `grep DOCKER_CLEANUP_TIMEOUT_SECS|inspect_container_state|kill_container|remove_container` across `tests/` + `judge-worker-rs/` (excl. target) → **0 hits**. No source-grep contract, no runtime test. |
| **A12e** | X-Real-IP on every `proxy_pass` (CI/source-grep guard) | **OPEN (invariant holds, unguarded) — Medium.** NEW framing this cycle. | Verified all 16 `proxy_pass` across 5 files carry `X-Real-IP`: `scripts/online-judge.nginx.conf` (4/4), `scripts/online-judge.nginx-http.conf` (2/2), `static-site/static.nginx.conf` (1/1), `deploy-docker.sh` (8/8), `deploy.sh` (1/1). But **no test enforces it**: `grep "X-Real-IP|proxy_pass" tests/` returns only app-level IP tests (`ip.test.ts`, `ip-allowlist.test.ts`); `judge-report-nginx.test.ts` checks only the poll-endpoint body-size limit. A new `proxy_pass` block omitting `X-Real-IP` (→ `extractClientIp` falls back, anti-cheat IP logging degrades) ships silently. |
| **PB-2** | restore/import FK runtime test | **STILL OPEN — High.** | `tests/integration/db/` has `catalog-numbers`, `judge-claim-reclaim`, `submission-lifecycle`, `user-crud` — none exercise `importDatabase`. `tests/integration/support/test-db.ts` `createTestDb()` (isolated DB + real migrations) is unused by any restore/import test. A truncate/insert reorder or upstream FK-catch in `import.ts` ships green. |
| **PB-3** | poll-route stale-token (`rowCount:0 ⇒ 403`) | **STILL OPEN — Medium.** | Route `src/app/api/v1/judge/poll/route.ts:96-98` (in-progress arm) & `:167-169` (terminal arm) throw `invalidJudgeClaim` → caught → `apiError("invalidJudgeClaim", 403)` at `:111` / `:187+`. `judge-status-report.route.test.ts:129,191,259` stub every `where` with `{rowCount:1}`. No `rowCount:0` case, no 403 assertion. (The SQL guard itself IS hit by `judge-claim-reclaim.test.ts:178-193` real-PG, but not under `test:unit`.) |
| **GS-1** | `lint:bash` covers only 2 scripts | **STILL OPEN — Medium.** | `package.json` still `"lint:bash": "bash -n deploy-docker.sh && bash -n deploy.sh"`. The 17+ other shell scripts in `scripts/` remain unchecked. |
| **GS-2** | Playwright `retries` | **OPEN — Low/Medium.** Reframed. | `playwright.config.ts` has **no `retries` field** (defaults to 0) — which is the *correct* strict posture (flakes should surface, not be masked). `playwright-profiles.test.ts` pins profile/testMatch/timeout but **does not pin `retries` absent**. Suggested gate: a one-line assertion that the config does not set `retries:` to a positive number, so no one silently adds `retries: 2` to hide a flake. (Cycle-3's "set retries:1+" recommendation is rejected here — retries mask the flakes this role exists to catch.) |
| **GS-3** | `test:unit` bypasses coverage | **PARTIALLY CLOSED — Low residual.** | `ci-suite-completeness.test.ts:12-14` now asserts CI runs `test:unit:coverage` **and** that bare `npm run test:unit(?!:)` is absent from `ci.yml`. CI is guarded. Residual: the script dichotomy remains (local `test:unit` still skips coverage); acceptable. Downgraded from cycle-3 Medium. |
| **GS-4** | test-placement trap (A10 GET-gate) | **STILL OPEN — Low.** Unchanged since cycle-3. | GET-gate coverage still lives in `problems-function-spec.route.test.ts`; stale source-grep in `problem-detail-capabilities-implementation.test.ts` still matches PATCH/DELETE only. Navigational trap persists. |

---

## (c) NET-NEW gaps

### C4-N1 — Auth token lifecycle is untested at lib AND route layer  (High)
- **Files (prod):** `src/lib/email/` — `generatePasswordResetToken`, `validatePasswordResetToken`, `resetPassword`, `generateEmailVerificationToken`, `consumeVerificationToken`. Routes: `src/app/api/v1/auth/reset-password/route.ts`, `…/forgot-password/route.ts`, `…/verify-email/route.ts`, `…/resend-verification/route.ts`.
- **Gap:** `grep validatePasswordResetToken|resetPassword|generatePasswordResetToken|consumeVerificationToken|generateEmailVerificationToken tests/` → **0 hits.** `tests/unit/email/` contains only `providers-index.test.ts` + `templates.test.ts`. The four auth routes (49–59 lines each, all thin wrappers over `@/lib/email`) have **zero route-level tests** — they appear in the untested-route set (13/113 routes untested, fixed-string match). Single-use token enforcement, expiry, token rotation, and the route-layer rate-limit-by-token-prefix (`reset_password:token:${token.slice(0,8)}` at `reset-password/route.ts:24`) are all untested. This is an account-takeover-adjacent surface with no regression net.
- **Suggested test:** (1) lib-level tests for `@/lib/email` token functions — generate→validate→consume→reject-reuse→reject-expired; (2) route-level test for `reset-password` covering the four branches (`invalidOrExpiredToken`, `passwordTooShort`, `rateLimited` via token-prefix, success) with mocked `@/lib/email`.
- **Confidence: High. Confirmed.**

### C4-N2 — Thirteen routes with zero test references  (Medium aggregate; subset High)
- **Method:** fixed-string cross-reference of all 113 `src/app/api/**/route.ts` vs. `tests/`. 100/113 referenced; 13 are not. Triage:
  - **High-value (account/security):** `auth/reset-password`, `auth/forgot-password`, `auth/verify-email`, `auth/resend-verification` — see C4-N1.
  - **Destructive/admin:** `admin/docker/images/prune/route.ts` (96-line destructive admin op), `internal/cleanup/route.ts` (destructive batched DELETE — but defended: 410-by-default + `CRON_SECRET` + `safeTokenCompare` + rate-limit; route-layer auth gate still untested).
  - **Low/trivial:** `auth/[...nextauth]` (NextAuth thin handler, config tested via `config.ts`), `health/route.ts`, `test/seed/route.ts` (dev-only).
- **Confidence: High** (untested), **confirmed**. The auth + prune subset is the action.

### C4-N3 — `internal/cleanup` route auth gate untested despite being well-defended  (Low)
- **File:** `src/app/api/internal/cleanup/route.ts:1-58`.
- **Gap:** the route has three layered gates (410 unless `ENABLE_CRON_CLEANUP=true`; 503 without `CRON_SECRET`; 401 unless `safeTokenCompare(Bearer $CRRON_SECRET)`; rate-limit). None are exercised. The defense is strong; the only ask is a source-grep or 3-case route test so a future refactor that drops `safeTokenCompare` for `===` (timing attack) is caught.
- **Confidence: Medium. Likely.**

---

## FLAKY-TEST watch (no change from cycle-3)

- Rust workspace: still no `set_var`/`remove_var`/`unsafe` in `judge-worker-rs`, `code-similarity-rs`, `rate-limiter-rs`. Parallel-test flake remains gone.
- Vitest `process.env` mutation: same latent intra-file set as cycle-3 (`metrics.route.test.ts`, `admin-docker-images-build.route.test.ts`, `storage-path-traversal.test.ts`, `execute.test.ts`, `data-retention.test.ts`). No active cross-file flake. Model-citizen pattern remains `tests/unit/compiler/execute-implementation.test.ts:79-99`.

---

## Priority-ordered action list

| # | ID | Finding | Severity | Effort | Confidence |
|---|----|---------|----------|--------|------------|
| 1 | A11a / NEW-1 | Mirror the 4 restore cases against `admin/migrate/import/route` (snapshot abort, durable-audit-after-commit, not-recorded-on-fail, skippedTables). Mock scaffolding already exists in `admin-backup-security.route.test.ts`. | High | S | Confirmed |
| 2 | A11b / NEW-4 | Source-grep contract: `docker.rs` has 3× `tokio::time::timeout(` wrapping `Command::new("docker")` with `"inspect"`/`"kill"`/`"rm"` and `Err(_)` arms that log+return (don't panic). Runtime trait-injection version = Phase B. | High | S | Confirmed |
| 3 | C4-A6 | main.rs `active_tasks` accounting test (extract spawn-body tail; assert 0→1→0 on happy + panic paths, `report_panic` once, no double-decrement). | High | S | Confirmed |
| 4 | C4-N1 | Auth token lifecycle: lib tests for `@/lib/email` (generate/validate/consume/reuse/expiry) + route tests for the 4 auth routes (token-prefix rate-limit, branch mapping). | High | M | Confirmed |
| 5 | PB-2 | Restore/import FK-ordering integration test via `createTestDb` (parent+child export, missing-parent rejection, insert-order spy). | High | M | Confirmed |
| 6 | PB-3 | Poll-route stale-token unit test: `rowCount:0` ⇒ 403 `invalidJudgeClaim` for both arms. | Medium | S | Confirmed |
| 7 | A12e | X-Real-IP source-grep guard: every `proxy_pass` block in `scripts/*.nginx.conf`, `static-site/*.nginx.conf`, `deploy*.sh` is preceded/followed by `proxy_set_header X-Real-IP`. | Medium | S | Confirmed |
| 8 | C4-A4 | SSE re-auth behavioral test (injectable re-auth interval; revoked viewer ⇒ stream closes). | Medium | M | Confirmed |
| 9 | C4-A5 | Recruiting metadata-merge serialization: concurrent `jsonb_set` + merge integration test (reuses PB-2 harness). | Medium | M | Confirmed |
| 10 | GS-1 | Expand `lint:bash` to all `scripts/*.sh`; wire into CI. | Medium | S | Confirmed |
| 11 | GS-2 | Pin Playwright `retries` absent/0 in `playwright-profiles.test.ts` (prevent silent flake-masking). | Low | S | Confirmed |
| 12 | GS-4 | Move A10 GET-gate test into a discoverable `problems.route.test.ts`; delete stale source-grep in `problem-detail-capabilities-implementation.test.ts`. | Low | S | Confirmed |

**Verdict:** cycle-3's data-leak/authz fixes (a1–a3) are locked with real
behavioral assertions. The converging risk is the worker + the migrate-import
twin (A11a/b, C4-A6) — three S-effort tasks close the highest-severity
residuals. The auth-token-lifecycle cluster (C4-N1) is the largest *new*
untested security surface found this cycle and should not wait for cycle 5.
