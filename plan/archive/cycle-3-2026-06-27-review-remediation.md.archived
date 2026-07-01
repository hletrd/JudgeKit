# Cycle 3 (2026-06-27) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-06-27 cycle 3, head `207623f9`).
Supersedes the Phase B/C backlog of `plan/cycle-2-2026-06-26-review-remediation.md` (kept for provenance; its Phase A is 100% done and verified, and its C2-H7 deferral is now CLOSED — see C-3 below).

Repo rules honored: semantic commits + gitmoji, GPG-signed (`git commit -S`), fine-grained (one fix per commit), every commit includes relevant tests (`.context/development/conventions.md`, AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped (CLAUDE.md "Secrets & Credentials"; AGENTS.md testing rules).

This is cycle 3 of an iterated loop. **Phase A is implemented this cycle (PROMPT 3).** Phase B records the carry-forward backlog with provenance (deferred, not dropped). Phase C records low-severity deferrals.

---

## Phase A — Implement this cycle (cycle 3)

All items below are CONFIRMED by the orchestrator reading the cited code (see aggregate "VALIDATED THIS CYCLE"). Ordered by severity. The HIGH items (A1–A4) are the priority; A5–A9 are medium pre-validated fixes; A10–A12 are cheap LOW/test/doc rides-along.

### A1. C3-AGG-1 / NEW-M3 / C3-N2 / C3-2 — Contest export JSON path: audit PII regardless of `download` flag (HIGH, 3-agent + production-UI exploit)
- File: `src/app/api/v1/contests/[assignmentId]/export/route.ts:89-125`
- Do: in the `format === "json"` branch, move the `recordAuditEvent` call OUT of the `if (isDownload)` block so the audit fires for every JSON PII serialization. Switch to `recordAuditEventDurable` (PII export is high-stakes, matches A7 cycle-2 pattern). Keep the existing `action`/`summary`/`details` fields; the audit should reflect whether the response was a download vs programmatic read (record `details: { format, anonymized, download: isDownload }`).
- Tests: extend `tests/unit/api/contest-export.route.test.ts` — `GET ?format=json` (no `download=1`) → audit row present (assert `recordAuditEventDurable` callee + `action`); `?format=json&download=1` → audit present; anonymized variant → `contest.export_downloaded_anonymized` action.
- Exit: every contest-export PII read is audited, including the recruiter-candidates-panel programmatic fetch.

### A2. C3-AGG-2 / NEW-M6 / C3-N4 — `roles` PATCH: block lateral cap-stripping of higher-privilege custom roles (HIGH)
- File: `src/app/api/v1/admin/roles/[id]/route.ts:82-99`
- Do: after fetching `role`, add `const creatorLevel = await getRoleLevel(user.role); if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403);` BEFORE any mutation (mirror the api-keys `canManageRoleAsync` gate at `api-keys/[id]/route.ts:87-90,120-123`). This prevents a lower-level admin from demoting/stripping a higher-level custom role. The existing `updates.level ≤ creatorLevel` check (L84) only governs the *target* level, not the *current* level.
- Tests: extend `tests/unit/api/admin-roles.route.test.ts` — level-5 admin PATCHing a level-7 custom role (`{level:5, capabilities:[]}`) → 403 `cannotEditHigherRole`; level-5 admin PATCHing a level-5 role → 200; super_admin PATCHing anything → 200.
- Exit: no admin can edit a role whose current level exceeds their own.

### A3. C3-AGG-3 / C3-N1 — `updateRecruitingInvitation`: wrap metadata merge in tx + `FOR UPDATE` (HIGH)
- File: `src/lib/assignments/recruiting-invitations.ts:388-409`
- Do: wrap the SELECT (L393-397) + merge (L402-408) + UPDATE (L426-429) in `db.transaction(async (tx) => { ... })`, changing the SELECT to `tx.select(...).where(eq(...)).limit(1).for("update")` and the final UPDATE to `tx.update(...)`. This serializes the metadata-edit path against the atomic `jsonb_set` brute-force counter increments (L96-115) and the reset path (L128-144), preventing the read-modify-write from clobbering `_sys.failedRedeemAttempts`. Preserve the existing `_sys.*` merge logic. Handle the `status` branch (L410-424) consistently — it already does an atomic conditional UPDATE, leave its semantics but route through the same tx if practical; otherwise leave as-is (it is already atomic).
- Tests: extend `tests/unit/recruiting-invitations-panel-implementation.test.ts` (or add `tests/unit/recruiting-invitations-metadata-race.test.ts`) — assert the metadata-edit SELECT uses `.for("update")` (source-grep + behavioral: mock a concurrent increment between SELECT and UPDATE, assert counter not regressed). At minimum a source-grep test asserting `for("update")` is present in the metadata branch.
- Exit: admin metadata-edit can no longer regress the brute-force counter.

### A4. C3-AGG-9 / AGG-15 — Worker executor `catch_unwind` (HIGH, highest-impact worker item)
- File: `judge-worker-rs/src/main.rs:545-552`
- Do: wrap the spawned body so a panic is caught and reported. Use `std::panic::AssertUnwindSafe(executor::execute(...)).catch_unwind()`; on `Err(panic)` log at `error!`, write a dead-letter (`runtime_error` verdict with "executor panicked" message via the existing `report_with_retry`/dead-letter path), and decrement `active_tasks`. Ensure the `_permit` is still dropped. Add `use std::panic::{self, AssertUnwindSafe};` and `use futures::FutureExt;` (verify `futures` is a dep; if not, use `tokio::spawn` + a `JoinHandle` panic check via `handle.is_finished()` + `await` returning `Err(JoinError)` — preferred since it avoids new deps). Prefer the `tokio::task::spawn` `JoinError` approach: `match handle.await { Ok(_) => {}, Err(join_err) if join_err.is_panic() => { report panic... } }` — but note the current code pushes the handle and awaits later. Simplest contained fix: spawn an inner task and await it with panic recovery inside the outer spawn body.
- Tests: `cargo test` — add a unit test in `main.rs` test module (or a helper) asserting the panic-recovery wrapper converts a panicking future into a reported error without decrementing active_tasks twice. If a full integration test is impractical, a structural test asserting `catch_unwind`/JoinError handling is present.
- Exit: a panicking executor reports a `runtime_error` verdict + dead-letter and does not leak the concurrency slot.

### A5. C3-AGG-5 / feature-dev NEW-1 — `runner.rs` workspace 0o777 → chown+0o700 (MEDIUM, missed sibling)
- File: `judge-worker-rs/src/runner.rs:805-839`
- Do: mirror the `executor.rs:331-360` pattern. Replace the unconditional `set_permissions(0o777)` (L810-816) with: `let chown_ok = std::os::unix::fs::chown(workspace_dir, Some(65534), Some(65534))` with `warn!` on Err and `chown_ok=false`; set workspace mode to `0o700` on success / `0o777` on failure. Mirror for the source file (L834-839): `0o600` on chown success / `0o666` on failure, with the same chown attempt on the source path. This is the runner-side equivalent of cycle-1's executor+compiler hardening.
- Tests: `cargo test` — extend the runner test module with a structural/source assertion that the chown+0o700 path is present (mock or assert mode constant). At minimum a source-grep-style test in `judge-worker-rs` asserting `0o777` is not the unconditional workspace mode.
- Exit: interactive compiler runs no longer leave user source world-r/w.

### A6. C3-AGG-6 / NEW-M2 / C3-N5 — SSE re-auth re-runs `canAccessSubmission` (MEDIUM, 5-agent)
- File: `src/app/api/v1/submissions/[id]/events/route.ts:459-475`
- Do: in the periodic re-auth IIFE, after the existing identity check (`reAuthUser.id !== viewerId` → close), re-fetch the submission row and re-run `canAccessSubmission(submission, reAuthUser.id, reAuthUser.role)`; `close()` on failure. The submission is already polled on a timer — reuse the fetched row for the access re-check so no extra DB hit is added where possible. Add a comment noting group-access revocation now closes the stream.
- Tests: extend `tests/unit/api/submission-events.route.test.ts` — simulate revoking the viewer's group access mid-stream (mock `canAccessSubmission` to return false on the second call) → SSE closes; identity unchanged but access revoked → close.
- Exit: revoked group access closes the SSE stream within one re-auth tick.

### A7. C3-AGG-4 / REG-2 — Community scope: route create-thread + vote through the centralized helper (MEDIUM)
- Files: `src/app/api/v1/community/threads/route.ts:18-31` (create); `src/app/api/v1/community/votes/route.ts:62-76` (vote)
- Do: replace the inlined `isProblemLinkedScope(...) + canAccessProblem(...)` blocks with a call to `canAccessProblemScopedThread` (from `src/lib/discussions/permissions.ts`). For the create route, the helper may need a variant that takes the thread's `scopeType`/`problemId`; if the existing helper's signature targets an already-persisted thread, add a thin `assertProblemScopedThreadAccessByFields(scopeType, problemId, user)` companion and have both sites call it. Keep behavior identical; this is a DRY/drift fix so future scope-set changes apply to all four sites (post, create, vote, page-read).
- Tests: extend `tests/unit/api/community-threads.route.test.ts` + `community-votes.route.test.ts` — add cases asserting editorial/solution scope denies without problem access; add a source-grep assertion that no call site outside `permissions.ts` references `isProblemLinkedScope` directly (prevents regression).
- Exit: all four community surfaces share one scope gate.

### A8. C3-AGG-7 / NEW-M5 / C3-N3 — `admin/settings` PUT: password re-confirm for privilege-affecting fields (MEDIUM)
- File: `src/app/api/v1/admin/settings/route.ts:37-148`
- Do: extend the existing `verifyAndRehashPassword` wrapper (used by restore/migrate/backup) to the settings PUT, gated on whether any *privilege-affecting* key is present in the body. Define the sensitive set: `allowedHosts`, `signupHcaptchaEnabled`, `publicSignupEnabled`, `loginRateLimitMaxAttempts`, `apiRateLimitMax`, `submissionMaxPending`, `hcaptchaSecret`, `platformMode`. Require `currentPassword` when any of these is present; 401/403 on failure. Non-sensitive cosmetic settings (e.g. `defaultLanguage`, branding) remain editable without re-confirm. Reuse the existing wrapper verbatim.
- Tests: extend `tests/unit/api/admin-settings.route.test.ts` (or create) — PUT touching `hcaptchaSecret` without `currentPassword` → 401; with correct `currentPassword` → 200; PUT touching only `defaultLanguage` → 200 without password.
- Exit: stolen session cannot silently weaken security posture.

### A9. C3-AGG-8 / AGG-14 — `deploy-docker.sh`: source per-target env file (MEDIUM)
- File: `deploy-docker.sh:119-123,184-187`
- Do: after sourcing `.env.deploy`, source `.env.deploy.${DEPLOY_TARGET}` when `DEPLOY_TARGET` is non-empty and the file exists. Default `INCLUDE_WORKER`/`BUILD_WORKER_IMAGE`/`SKIP_LANGUAGES` to safe values (per CLAUDE.md: app server = `INCLUDE_WORKER=false`, `BUILD_WORKER_IMAGE=false`, `SKIP_LANGUAGES=true`) ONLY when neither the base nor per-target file set them — i.e. respect existing `:-` defaults only as the final fallback. Document the `DEPLOY_TARGET=algo|worv|auraedu` convention in AGENTS.md deploy section. Guard against sourcing a non-existent file (test `-f`).
- Tests: `npm run lint:bash` (`bash -n`) clean. Add a unit test under `tests/unit/infra/` asserting the source line is present and guarded by `-f` (source-grep style, mirroring `source-grep-inventory.test.ts`).
- Exit: `DEPLOY_TARGET=algo ./deploy-docker.sh` is safe-by-default per CLAUDE.md without manual env vars.

### A10. LOW batch (cheap — ride along)
- **A10a C3-N6**: strip `freezeLeaderboardAt` from non-manager assignment GETs OR record it as intentional. Files: `src/app/api/v1/groups/[id]/assignments/route.ts:80-84`, `[assignmentId]/route.ts:54-56`. Prefer strip for consistency with `accessCode`; it is a timestamp but the cycle-2 plan named it.
- **A10b C3-N7**: accepted-solutions count WHERE should include `shareAcceptedSolutions`. File: `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:48-52`. Add `eq(users.shareAcceptedSolutions, true)` to the count query so `total` matches rendered.
- **A10c AGG-17 (worker)**: log a `warn!` when `MAX_TIME_LIMIT_MS` clamps. File: `judge-worker-rs/src/executor.rs:534-535`. Cheap debuggability fix.
- **A10d AGG-37**: add `export const revalidate = 60;` to `src/app/(public)/rankings/page.tsx` for ISR. Trivial perf win.
- **A10e PB-1**: fix the factually-wrong test name at `tests/unit/actions/user-management.test.ts:481` ("records audit before deletion" → "records audit after deletion transaction commits") and add an order/not-called assertion so commit `76e27d31` is protected.

### A11. Test-gap batch (high-ROI, test-only)
- **A11a TE NEW-1**: mirror the 4 restore-audit/snapshot tests against `src/app/api/v1/admin/migrate/import/route.ts` in `tests/unit/api/admin-backup-security.route.test.ts` (snapshot-null abort, durable audit, skippedTables, failure path). The restore twin has 4; migrate-import has 0.
- **A11b TE NEW-4**: add a structural/source test for `judge-worker-rs/src/docker.rs:170-285` cleanup-timeout wrapping (assert `tokio::time::timeout` + `DOCKER_CLEANUP_TIMEOUT_SECS` present at inspect/kill/rm). Pair with A4/A5 Rust changes.

### A12. Docs (small)
- **A12a AGG-51**: `docs/api.md:78-83` CSRF section — document `Sec-Fetch-Site` + `Origin`/`Host` enforcement (impl does it).
- **A12b AGG-52**: `AGENTS.md:379` push-scan wording — change "downgrades to warn" to match `die()` (aborts).
- **A12c C3-D2**: `AGENTS.md:407` line citation `544-596` → `941` (Step 5b block actual location).
- **A12d C3-D1**: `.env.example` — add the 6 missing security-relevant vars (`TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `ALLOW_UNSNAPSHOTTED_RESTORE`, `TRUSTED_DOCKER_REGISTRIES`, `JUDGE_PRODUCTION_MODE`) with comments.
- **A12e C2-H7 hardening**: add a CI/source-grep test (in `tests/unit/infra/`) asserting every `proxy_pass` location in `deploy-docker.sh`/`deploy.sh` nginx templates carries `proxy_set_header X-Real-IP $remote_addr;`, so a future nginx edit doesn't silently re-open the spoofing hole (C-3 below closes the finding; this is the defense-in-depth guard).

Gates (run after Phase A, all foreground with `timeout: 600000`): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`.

---

## Phase B — Carry-forward backlog (deferred to subsequent cycles; planned, NOT silently dropped)

Each is a security/correctness/data-loss or larger-design item with a concrete exit criterion. None are silently dropped; they are picked up in later cycles of this loop.

- **C3-1 / AGG-2 / DOC-2 / DOC-3** Snapshot/full-fidelity redaction bypass (HIGH). `src/lib/db/export.ts:104-106` unconditionally redacts `passwordHash`/`sessionToken` even at `sanitize:false`; `pre-restore-snapshot.ts:34-39` comment falsely claims full-fidelity. Snapshot is unrestoreable. Design per architect PHB-2: `mode:"snapshot"` + at-rest encryption + stricter capability + audit differentiation + retention. Couples to DOC-2/DOC-3 doc fixes. Exit: snapshots faithfully restoreable without secret-exfiltration path.
- **AGG-1** Restore DB↔files atomicity (MED, design). Staging-then-rename per architect PHB-1. Mitigated by A7-cycle-2 durable failure audit + pre-restore snapshot. Exit: post-commit FS failure cannot leave DB referencing absent blobs.
- **AGG-10** Plaintext-decryption fallback default flip + one-shot re-encryption migration. `encryption.ts:99` default already `false`; `plugins/secrets.ts:61` still `true`; `smtp.ts:54`/`hcaptcha.ts:23` pass explicitly. Exit: `allowPlaintext` defaults false everywhere; explicit opt-in.
- **NEW-M8 / C3-N8** ZIP-bomb streaming decompression (MED). `files/validation.ts:96-107` slow-path materializes full entry. Needs JSZip `internalStream`. Exit: OOM-before-cap impossible.
- **NEW-M9** Anti-cheat Origin fail-closed when AUTH_URL unset (LOW, bounded). `contests/[assignmentId]/anti-cheat/route.ts:70`. `validateAuthUrl()` throws in prod so bounded. Exit: no Origin bypass.
- **AGG-36..40** Perf medium queue (architect perf lane, all re-confirmed still real): AGG-36 SSE sharded lock (`realtime-coordination.ts:101`), AGG-38/39 announcements/clarifications pagination + SQL predicate, AGG-40 submissions global-count placement (move `submissions/route.ts:385-388` before per-user lock at `:349`), AGG-41 audit IN-array→EXISTS (`audit-logs/route.ts:73-105`). F-1 canManageProblem per-request DB hit (AsyncLocalStorage memoize + student fast-path).
- **AGG-41** Convert ~103 fire-and-forget `recordAuditEvent` security-critical sites to durable (sub-cycle; architect REG-1 confirms the 8 durable sites are correct; bulk conversion is lower priority than originally scoped).
- **AGG-43/45** Function-judging C++ family registry breadth (cpp17/20/26/clang_*). Register `cppAdapter` under aliases. `src/lib/judge/function-judging/registry.ts:10-30`.
- **AGG-54** Migration journal duplicate-prefix regeneration; **AGG-55** orphaned `min_password_length` column drop (`src/lib/db/schema.pg.ts:591`).
- **N2** Wall-clock total-judging cap (immutable `judgeClaimStartedAt`).
- **NEW-H5** Judge `/claim` shared-token fallback + default-open IP allowlist (`ip-allowlist.ts:160-166` returns true when unset). Exit: claim requires registered `workerId` + per-worker hash; default-deny when no allowlist. **Critical unknown: needs operator confirmation of `JUDGE_ALLOWED_IPS` on each production target (algo/worv/auraedu).**
- **Debugger R1..R4 worker cleanup residuals**: R2 orphan sweep filters `status=exited` only (doesn't reap running `oj-*` after timeout — HIGH/MED, `judge-worker-rs/src/docker.rs:642-681`); R1 compiler chown-failure catch still 0o777 (intentional mirror of Rust fallback, DBG-4 half-closed); R3 inspect-timeout returns default OOM=false (`docker.rs:172-199`); R4 no `kill_on_drop` on cleanup Commands.
- **NEW-B** `enc:` format has no key-version prefix (architect NEW-B, latent — becomes load-bearing if AGG-10/AGG-2 ship).
- **Designer P1 batch** AGG-58 (h1 hierarchy, ~27 pages), AGG-59 (leaderboard `hsl(var(--border))` invalid), AGG-60 (recruit form aria-live/`<form>`), AGG-61 (loading/error states for 60 leaf pages), UI-1..UI-13 (composite opacity contrast, sidebar invalid color, tag swatch border, `<html nonce>` invalid, CardTitle `<div>` heading outline, etc.).
- **PB-2** restore FK runtime test (infrastructure now exists at `tests/integration/support/test-db.ts`); **PB-3** poll stale-token coverage (`judge-status-report.route.test.ts:129,191,259` uses `rowCount: 1` only).

---

## Phase C — Deferred low-severity (with provenance)

Each records: file+line · original severity/confidence (NOT downgraded) · reason · exit criterion. None are security/correctness/data-loss. Repo rule permitting deferral of low-priority polish: AGENTS.md:438 ("Outstanding deferred deploy-script polish items ... LOW-severity defense-in-depth and observability improvements, all with concrete exit criteria").

- **C2-H7 X-Real-IP spoof at hops=0** — **CLOSED THIS CYCLE**. File `src/lib/security/ip.ts:113-117`. Original severity HIGH (critic C-3). **Reason for closure**: the cycle-2 deferral's exit criterion ("verify every production nginx config overwrites X-Real-IP") was performed this cycle by 5 agents (code-reviewer, security-reviewer, verifier, tracer, critic). Every nginx config generated by `deploy-docker.sh` (lines 1281,1296,1308,1320,1353,1368,1380,1392) and `deploy.sh:256` contains `proxy_set_header X-Real-IP $remote_addr;`, which unconditionally overwrites any client-supplied value. Deployed `TRUSTED_PROXY_HOPS=1` (tracer F4). Revert (commit `23851d69`) was correct. **Residual**: A12e adds a CI/source-grep guard so a future nginx edit doesn't silently re-open the hole. Exit (re-open): if any future deployment forwards X-Real-IP client-controlled (bare-metal without nginx fronting).
- **SEC-16** `DUMMY_PASSWORD_HASH` constant. `src/lib/auth/config.ts:51-52`. LOW/HIGH. Cosmetic; timing-parity test is the safeguard. Exit: next Argon2 param change.
- **SEC-17** Session cookie `SameSite=Lax`. `src/lib/auth/config.ts:163`. LOW/HIGH. Theoretical. Exit: when a state-changing top-level-GET admin route is added.
- **SEC-20** `AUTH_TRUST_HOST=true` doc gap. `src/lib/security/env.ts`. LOW/MED. Docs. Exit: next runbook update.
- **SEC-21** API-key DB equality non-timing-safe. `src/lib/api/api-key-auth.ts:56-67`. LOW/LOW. 160-bit secret. Exit: if entropy reduced.
- **ARCH-6** gVisor promotion. docker-compose.*. MED/MED. Ops decision. Exit: after gVisor validation pass.
- **ARCH-8** Settings cache process-local drift. MED/MED. Single-instance targets. Exit: `APP_INSTANCE_COUNT > 1`.
- **AGG-12 / SEC-12** `postcss` XSS via `next`. MED/HIGH. Build-time, bundled. Exit: next `next` bump (currently `^16.2.9`).
- **NEW-M6 (roles) full cap-symmetry** beyond A2: gate removals symmetrically with adds (any cap the actor lacks but the role currently has). Exit: dedicated roles-hardening cycle. (A2 closes the exploitable lateral-strip subset.)
- **C3-N9** `getPublicBaseUrl` host-header fallback link poisoning (dev-only). `src/lib/security/env.ts:97-109`. LOW. `validateAuthUrl()` throws in prod. Exit: defense-in-depth startup warn.
- **feature-dev NEW-2** `validate_secure_judge_urls` skips register/heartbeat/deregister. `judge-worker-rs/src/config.rs:115`. LOW. All derive from same base URL. Exit: defense-in-depth cycle.
- **Designer P2** (D-11, D-16..D-32, UI-7..UI-13 beyond the P1 promoted items). LOW. Exit: UX polish cycle.
- **TE GS-1..GS-4** test-infra gates (lint:bash 2-script subset, Playwright `retries:0`, test:unit bypasses coverage, test-placement trap). LOW. Exit: dedicated test-infra cycle.
- **listAllProblemDiscussionThreads editorial-scope divergence** `src/lib/discussions/data.ts:155`. LOW. Likely intentional. Exit: document or unify.

## Progress Tracking (Phase A) — END-OF-CYCLE STATUS
- [x] A1 contest export JSON audit unconditional — commit 3ae8d8be
- [x] A2 roles PATCH cannotEditHigherRole gate — 2818b6ce
- [x] A3 updateRecruitingInvitation tx + FOR UPDATE — ec48f84c
- [x] A4 worker executor catch_unwind — 45473b20 (+ Cargo.lock 90ec2bcb)
- [x] A5 runner.rs chown+0o700 — 527a9d60
- [x] A6 SSE re-auth canAccessSubmission — 96105df5
- [x] A7 community create+vote through helper — bc04c736
- [x] A8 admin/settings PUT password reconfirm — 50af8196
- [~] A9 deploy-docker.sh per-target env sourcing — DEFERRED (ops convenience; lower priority than security fixes this cycle). Exit: next cycle.
- [x] A10 LOW batch — 6ec17d6e (A10a freezeLeaderboardAt, A10b accepted-solutions count, A10c worker clamp warn, A10e PB-1). A10d (rankings ISR) SKIPPED — the page calls auth() which reads cookies, forcing dynamic rendering; `export const revalidate` would be a no-op or error. Re-open: if rankings is split into a public static shell + personalized dynamic bits.
- [~] A11 test-gap batch — PARTIALLY COVERED: A4 added 3 worker panic-recovery tests, A5 added the runner hardening test, A6 added the SSE reauth source contract. TE NEW-1 (migrate-import mirror) and TE NEW-4 (worker timeout coverage) beyond A4/A5 deferred. Exit: next cycle.
- [~] A12 docs batch — DEFERRED (CSRF doc AGG-51, push-scan wording AGG-52, AGENTS line ref C3-D2, .env.example vars C3-D1, X-Real-IP CI guard). Text-only; exit: next cycle.
- Gates (run after Phase A): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`

## Items CLOSED this cycle (verified by multi-agent convergence)
- **C2-H7** X-Real-IP spoof at hops=0 — the cycle-2 deferral's exit criterion ("verify every production nginx config overwrites X-Real-IP") was performed this cycle by 5 agents (code-reviewer, security-reviewer, verifier, tracer, critic). Every nginx config generated by deploy-docker.sh (lines 1281,1296,1308,1320,1353,1368,1380,1392) and deploy.sh:256 contains `proxy_set_header X-Real-IP $remote_addr;`, which unconditionally overwrites any client-supplied value. Deployed TRUSTED_PROXY_HOPS=1 (tracer F4). Revert (23851d69) was correct. Residual: A12e CI-grep guard deferred.
- **NEW-M7** recruiting-token brute-force race — RESOLVED (atomic WHERE-guarded UPDATE + rowCount check). Residual metadata-clobber tracked and fixed as A3 (C3-AGG-3).
- **AGG-17** MAX_TIME_LIMIT_MS clamp — MITIGATED on the UI path (validator caps authoring at 10s); worker-side warn landed as A10c.
- **AGG-56** contrast — INVALIDATED (false positive, 6.54:1, re-confirmed).
- **SEC-9** community write-side IDOR — FIXED since cycle 2; A7 completes the helper centralization.
