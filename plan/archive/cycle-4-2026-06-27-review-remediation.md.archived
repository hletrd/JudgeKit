# Cycle 4 (2026-06-27) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (2026-06-27 cycle 4, head `edd45cca`).
Supersedes the Phase B/C backlog of `plan/cycle-3-2026-06-27-review-remediation.md` (kept for provenance; its Phase A is 100% done and verified; cycle-3 A9/A11/A12 deferrals are picked up below).

Repo rules honored: semantic commits + gitmoji, GPG-signed (`git commit -S`), fine-grained (one fix per commit), every commit includes relevant tests (`.context/development/conventions.md`, AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped (CLAUDE.md; AGENTS.md testing rules).

This is cycle 4 of an iterated loop. **Phase A is implemented this cycle (PROMPT 3).** Phase B records the carry-forward backlog with provenance (deferred, not dropped). Phase C records low-severity deferrals.

---

## Phase A — Implement this cycle (cycle 4)

All items below are CONFIRMED by the orchestrator reading the cited code (see aggregate "VALIDATED THIS CYCLE"). Ordered by severity. The HIGH items (A1–A5) are the priority (all non-deferrable security/data-loss/correctness per the brief); A6 is the worker MED bundle; A7 cheap docs ride-along; A8 high-ROI test gaps if reachable.

### A1. C4-2 Part 1 — Judge `/claim` (and `/poll` `/deregister` `/heartbeat`): require `workerId`+`workerSecret`; shared token becomes `/register`-only (HIGH, security)
- Files: `src/app/api/v1/judge/claim/route.ts` (`claimRequestSchema` L104-115; auth fallback L176-180); `src/app/api/v1/judge/poll/route.ts`; `src/app/api/v1/judge/deregister/route.ts`; `src/app/api/v1/judge/heartbeat/route.ts`; `src/lib/judge/auth.ts` (the `isJudgeAuthorized` shared-token path)
- Do: change `workerId` from `.optional()` to **required** in `claimRequestSchema` (and the sibling request schemas); require `workerSecret` whenever `workerId` is present (the `superRefine` already enforces this — keep it). Remove the `else { if (!isJudgeAuthorized(request)) … }` shared-token fallback from `/claim`, `/poll`, `/deregister`, `/heartbeat`. Keep `isJudgeAuthorized` only on `/register`. The existing per-worker path (`isJudgeAuthorizedForWorker` + online check + `safeTokenCompare(hashToken(workerSecret), secretTokenHash)`) already covers authentication; the change is purely deleting the no-`workerId` branch. Keep rate-limit scope derivation working (the `clientIp`/auth-hash fallback is only reached when `workerId` is absent — since `workerId` is now required, simplify or leave the IP fallback for the unauthorized-but-schema-valid path).
- Tests: extend `tests/unit/api/judge-*.test.ts` (or create `judge-claim-shared-token.test.ts`) — `POST /claim` with only `Authorization: Bearer <JUDGE_AUTH_TOKEN>` and no body → 400 (`workerId` required) OR 401, NOT 200 with sourceCode/testCases. Confirm `/register` still accepts the shared token. Assert the response of a valid claim no longer changes (regression).
- Exit: a leaked shared token can no longer claim work or read `sourceCode`/`testCases`.

### A2. C4-2 Part 2 — `JUDGE_STRICT_IP_ALLOWLIST` opt-in + startup WARN (NOT a default flip) (HIGH, defence-in-depth)
- File: `src/lib/judge/ip-allowlist.ts:14,163-166`
- Do: read process.env at module init. If `JUDGE_ALLOWED_IPS` is unset AND `JUDGE_STRICT_IP_ALLOWLIST !== "1"`, **keep** `unset == allow-all` (back-compat — do NOT flip the default; the cycle-2 revert `23851d69` is the cautionary precedent) but emit a loud startup `logger.warn` naming the env var and the security implication. If `JUDGE_ALLOWED_IPS` is set, enforce it (already does). If `JUDGE_STRICT_IP_ALLOWLIST === "1"` AND `JUDGE_ALLOWED_IPS` is unset, fail-closed (deny all) — this is the explicit opt-in. Do NOT change behaviour for any deployment that hasn't set the new flag.
- Tests: extend `tests/unit/security/ip-allowlist.test.ts` (or `judge-ip-allowlist.test.ts`) — unset + flag unset → allow-all + warn invoked; unset + flag=1 → deny; set → enforce (existing). Reset cache between cases (`resetIpAllowlistCache`).
- Exit: operators can opt into strict enforcement deliberately; no forced migration; no repeat of `23851d69`.

### A3. C4-1 — Snapshot is unrestoreable: `snapshot:true` opt-out in export + DOC-2/DOC-3 prose fix (HIGH, data-loss)
- Files: `src/lib/db/export.ts:72,104-106`; `src/lib/db/pre-restore-snapshot.ts:34-39,84-86`; `docs/data-retention-policy.md:48`; `docs/admin-security-operations.md:65`
- Do: extend `streamDatabaseExport` options with `snapshot?: boolean`. When `snapshot === true`, set `activeRedactionMap = {}` (bypass `EXPORT_ALWAYS_REDACT_COLUMNS`) so the snapshot retains `passwordHash`, `sessionToken`, account tokens, API-key ciphertext, hCaptcha/SMTP secrets. Update `takePreRestoreSnapshot` to pass `{ sanitize: false, snapshot: true }`. Keep `createWriteStream(fullPath, { mode: 0o600 })` + dir `chmod 0o700` (at-rest protection is unchanged). Fix the `pre-restore-snapshot.ts:34-39` docstring to match the new reality (snapshot now IS full-fidelity for the auth columns because of `snapshot:true`); fix `docs/data-retention-policy.md:48` and `docs/admin-security-operations.md:65` prose to drop the false "full-fidelity = all fields included" claim — replace with accurate wording (snapshot retains the always-redacted secret set; regular exports still redact it). Note `sanitize:false` without `snapshot:true` (backup/migrate/export routes) keeps the always-redact behaviour — only the snapshot call site passes `snapshot:true`.
- Tests: extend `tests/unit/db/export.test.ts` (or add `db-export-snapshot.test.ts`) — snapshot=true → `passwordHash`/`sessionToken` retained in output; snapshot unset/`sanitize:false` → still redacted (regression for the existing call sites). Add a source-grep/behavioural assertion that `takePreRestoreSnapshot` passes `snapshot:true`.
- Exit: snapshots faithfully restoreable; docstring + docs match code.

### A4. ARCH-1 + C4-N1 + C4-3 — Settings reconfirm shared helper on BOTH writers + `hasOwnInput` port + sensitive-key expansion + accepted-solutions list filter (HIGH, 5-agent convergence)
- Files: shared `SENSITIVE_SETTINGS_KEYS` → new `src/lib/security/sensitive-settings.ts` (or extend `secrets.ts`); `src/app/api/v1/admin/settings/route.ts`; `src/lib/actions/system-settings.ts`; `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:69-88,92`
- Do:
  1. **Shared reconfirm helper.** Extract `requireSettingsReconfirm(input, user): Promise<NextResponse | null>` (route shape) and a sibling for server actions returning `{ ok: true } | { status, error }`. Move `SENSITIVE_SETTINGS_KEYS` into the shared module; import from both the route and the action. The action's `updateSystemSettings` currently has NO reconfirm — call the helper at the top (after the capability check, before mutations), reading `currentPassword` from `input`. The route keeps its existing call but sourced from the helper. **Both writers gate the same key set.**
  2. **C4-N1 partial-wipe fix.** Port the `hasOwnInput` guard from `system-settings.ts:127,144-222` to the route's `baseValues` construction (route.ts:136-150). Only write a field when it was actually supplied. Preserve the existing `touchesSensitiveKey` gate. After this, `PUT {siteTitle:"x"}` no longer wipes `hcaptchaSecret`/`publicSignupEnabled`/etc.
  3. **C4-3 sensitive-key expansion.** Add to the shared `SENSITIVE_SETTINGS_KEYS`: `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`, `aiAssistantEnabled`, `uploadMaxImageSizeBytes`, `uploadMaxFileSizeBytes`, `uploadMaxImageDimension`, `uploadMaxZipDecompressedSizeBytes`. (The four `uploadMax*` keys already appear in the route's `allowedConfigKeys` and the action's `CONFIG_KEYS` — both writers persist them.)
  4. **C4-N3 accepted-solutions list filter.** Add `eq(users.shareAcceptedSolutions, true)` to the list SELECT's `whereClause` (route.ts:85) — or wrap it the same way the count query does. Drop the now-redundant `.filter` at route.ts:92. `total` already filters (cycle-3); now the list matches.
- Tests:
  - **C4-N1 negative test:** `PUT {siteTitle:"x"}` (no sensitive key, no currentPassword) → 200 AND stored `hcaptchaSecret`/`publicSignupEnabled` unchanged (mock the SELECT-before and SELECT-after). Add to `tests/unit/api/admin-settings-reconfirm.test.ts` or a new `admin-settings-partial-update.test.ts`.
  - **ARCH-1 action-reconfirm test:** stolen session POSTing `allowedHosts` via the action without `currentPassword` → `{ success:false, error:"passwordReconfirmRequired" }`; with correct password → `{ success:true }`. Add to `tests/unit/actions/system-settings.test.ts` (create if absent).
  - **C4-3 reconfirm expansion test:** PUT/action touching `allowAiAssistantInRestrictedModes` without password → 401/passwordReconfirmRequired.
  - **C4-N3 list-filter test:** mock the list SELECT to include a non-sharing author; assert it is excluded without a JS filter and that `pageSize` rows are returned when enough sharing solutions exist.
- Exit: stolen session POSTing `allowedHosts` via the action without `currentPassword` → 401; `PUT {siteTitle:"x"}` leaves `hcaptchaSecret`/`publicSignupEnabled` intact; exam-mode + uploadMax keys gated; accepted-solutions list matches count.

### A5. F1 — Function-judging int64 precision: serialize verbatim + strtoll/parseLong/long.Parse (HIGH, judge-correctness)
- Files: `src/lib/judge/function-judging/serialization.ts:6`; `src/lib/judge/function-judging/adapters/cpp.ts:42-48`; `adapters/java.ts` (readLong, ~L75); `adapters/csharp.ts` (ReadLong, ~L78-80)
- Do:
  1. `serialization.ts:6` — replace `String(Math.trunc(Number(v)))` with verbatim emission. If `v` is a `bigint`, emit `v.toString()`; if `v` is a `string` matching `/^-?\d+$/`, emit it as-is; if `v` is a `Number` and `Number.isSafeInteger(v)`, emit `String(v)`; otherwise throw (the value exceeds safe-integer range and arrived as a lossy Number — caller must pass string/bigint). Keep the JSON structure intact so adapters still parse `[...]`.
  2. `adapters/cpp.ts:47` — replace `(long long)llround(stod(...))` with `strtoll`/`std::stoll` over an integer-only token (consume optional sign + digits; do NOT consume `.`/`e`/`E`). Keep `readDouble` separate.
  3. `adapters/java.ts:75` — replace `Math.round(Double.parseDouble(...))` with `Long.parseLong(...)` (integer token).
  4. `adapters/csharp.ts:78-80` — replace `Math.Round(double.Parse(...))` with `long.Parse(..., CultureInfo.InvariantCulture)`.
- Tests: extend `tests/unit/judge/function-judging/serialization.test.ts` — encode `9007199254740993n` (bigint), `9223372036854775807n` (LLONG_MAX) → output string is byte-identical to input (NOT rounded). Adapter source-grep tests in the `adapters/` test files asserting `strtoll`/`Long.parseLong`/`long.Parse` present and `stod`/`Double.parseDouble`/`double.Parse` absent in the int reader. Add a cross-language round-trip test where feasible.
- Exit: an `int`/`long` value `> 2^53` round-trips byte-identical through stdin→adapter→return for C++/Java/C#/Python/Go; JS/TS documented to `Number.MAX_SAFE_INTEGER`.

### A6. Worker cleanup-hardening bundle — debugger N1+R2+R4 + feature-dev F2 (MED, high-ROI)
- Files: `judge-worker-rs/src/docker.rs:642-681,175,245,263,319-323`; `judge-worker-rs/src/main.rs:505-508` (and startup hook before main loop)
- Do:
  1. **N1 timeout + off-hot-loop.** Wrap both `docker ps` and `docker rm` Commands inside `cleanup_orphaned_containers` in `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS), …)`. Chain `.kill_on_drop(true)` on each (closes R4 for these two sites). Move the periodic sweep off the hot loop — `tokio::spawn` it (or wrap in `tokio::select!` with `&mut shutdown`) so a hung sweep cannot block the poll/shutdown `select!`s below main.rs:506.
  2. **R2 startup reap-all.** Add a one-shot `cleanup_all_oj_containers()` (or extend the sweep with a `mode: Startup`/`mode: Periodic` param) invoked once before the main loop begins polling. It runs `docker ps -a --filter name=oj- -q` (NO `status=exited` filter) and `docker rm -f` every match. At startup there are no in-flight judgements, so force-removing every `oj-*` container is safe. The existing periodic sweep keeps `status=exited` (reaping `running` mid-loop would race in-flight judgements).
  3. **R4 kill_on_drop on cleanup Commands** (inspect/kill/rm at docker.rs:175,245,263) — chain `.kill_on_drop(true)`.
- Tests: extend `judge-worker-rs/src/docker.rs` test module — source-grep contract asserting `tokio::time::timeout` + `DOCKER_CLEANUP_TIMEOUT_SECS` wrap the sweep; a startup-sweep source-grep asserting no `status=exited` filter on the startup path and `.kill_on_drop(true)` on cleanup Commands. (Runtime trait-injection = Phase B.)
- Exit: a wedged dockerd cannot freeze the main loop or block shutdown; no `oj-*` container accumulates across a forced restart.

### A7. Cheap doc + LOW batch (text-only / one-line, bundle into a docs commit)
- **DOC-2/DOC-3 prose** — fixed as part of A3 (snapshot docstring + `data-retention-policy.md:48` + `admin-security-operations.md:65`).
- **AGG-51** `docs/api.md:78-83` + `csrf.ts:19-29` docstring — document all three CSRF checks (`X-Requested-With`, `Sec-Fetch-Site`, `Origin`/`Host`).
- **AGG-52** `AGENTS.md:379` — change "downgrades to warn" → "aborts the deploy (`die`)" and fix the `[WARN]` example to the actual `die` message.
- **C3-D2** `AGENTS.md:407` — replace line range `544-596` with the marker description (the `# Step 5b: Pre-drop secret_token backfill` block) or `:941`.
- **C3-D1** `.env.example` + `.env.production.example` — add the 6 missing security-relevant env vars with `0`/unset semantics.
- **C4-D5/D6** `docs/api.md:1372-1388` settings PUT + `:1424-1426` roles PATCH — document `currentPassword`/`cannotEditHigherRole`.
- **NEW-1** AGENTS.md language-preset sizes — reconcile; AGENTS.md `all` ~14GB → ~30GB.
- **NEW-2/3** `docs/api.md` — document `GET /problems/:id/export` + `POST /groups/:id/instructors`.
- **AGG-55** `src/lib/db/schema.pg.ts:591` — drop orphaned `min_password_length` column (additive migration first; verify no row-level writer — grep confirms none).
- **C4-9** `src/app/api/v1/contests/[assignmentId]/export/route.ts:182` — swap CSV audit to `recordAuditEventDurable` for parity with the JSON branch.
- **A9 (cycle-3 carryover)** `deploy-docker.sh:119-123` — source `.env.deploy.${DEPLOY_TARGET}` when set (3-line guarded source). CLAUDE.md mandates this; `.env.deploy.algo/.worv/.auraedu` exist with correct values. `npm run lint:bash` clean; source-grep test under `tests/unit/infra/`.
- Tests: `npm run lint:bash` for shell changes; source-grep for docs/migrations where applicable.
- Exit: docs match code; cheap consistency wins landed.

### A8. Test-gap batch (high-ROI, test-only — do if reachable)
- **C4-A6 (High)** `judge-worker-rs/src/main.rs` — extract the spawn-body tail into a testable `async fn run_executor_slot(active_tasks, exec_fut, report_fn)` mirroring L559-590; assert `active_tasks` 0→1→0 on happy + panic paths, `report_fn` recorded once, no double-decrement.
- **A11a / NEW-1 (High)** `tests/unit/api/admin-backup-security.route.test.ts` — mirror the 4 restore cases against `admin/migrate/import/route.ts` (snapshot abort, durable audit, not-recorded-on-fail, skippedTables). Mock scaffolding already exists.
- **C4-N1-test (High)** `tests/unit/email/` + route tests for the 4 auth routes — generate→validate→consume→reject-reuse→reject-expired; reset-password branch mapping.
- **A11b / NEW-4 (High)** `judge-worker-rs/src/docker.rs` — source-grep contract for `tokio::time::timeout` + cleanup Commands. (Folded into A6's test additions.)
- Tests: these ARE the deliverable.
- Exit: each untested invariant has a revert-RED test.

Gates (run after Phase A, all FOREGROUND with `timeout: 600000` — NOT background): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`.

**Local-build environmental ceiling note:** if `npm run build` hits the 10-min Bash ceiling with 0 output (an environmental stall, not a code defect), treat as "local build indeterminate (environmental)", keep lint/lint:bash/db:check/cargo test/test:unit green, and proceed — the remote deploy build confirms buildability. Do not loop retrying the local build. Record under ERRORS.

---

## Phase B — Carry-forward backlog (deferred to subsequent cycles; planned, NOT silently dropped)

Each is a security/correctness/data-loss or larger-design item with a concrete exit criterion.

- **AGG-1** Restore DB↔files atomicity (MED, design). `restore/route.ts:163` commits DB before `restoreParsedBackupFiles` bare-write loop. Architect PHB-1 staging-then-rename. Mitigated by cycle-2 durable failure audit + pre-restore snapshot (now faithful after A3). Exit: post-commit FS failure cannot leave DB referencing absent blobs.
- **C4-4 / AGG-10** Plaintext-decryption fallback (MED) — `plugins/secrets.ts:61` default flip + re-encryption migration. Pairs with NEW-B (key-version prefix). Exit: `allowPlaintext` defaults false everywhere; explicit opt-in only. *(Lower-priority than the HIGH tier this cycle; deferred with original severity preserved.)*
- **NEW-B** `enc:` key-version prefix (LATENT→MED once AGG-10/AGG-2 ship). `encryption.ts:78`. Exit: zero-downtime key rotation.
- **NEW-M8 / C3-N8** ZIP-bomb streaming decompression (MED). `files/validation.ts:96-107` slow-path. Exit: OOM-before-cap impossible.
- **AGG-36/38/39/40/41 + F-1** Perf queue (architect perf lane, re-confirmed). Best ROI: AGG-41 (audit IN→EXISTS) + F-1 (`canManageProblem` capability fast-path + memo). Exit: per-item perf criteria.
- **AGG-41** Bulk-convert ~103 fire-and-forget `recordAuditEvent` security-critical sites to durable.
- **AGG-54** Migration journal duplicate-prefix regeneration.
- **N2** Wall-clock total-judging cap (immutable `judgeClaimStartedAt`).
- **Debugger R1/R3** worker residuals: R1 compiler chown-fallback 0o777 (intentional mirror); R3 inspect-timeout OOM=false. Phase C.
- **F3** `pids_limit` dead if/else (feature-dev) — resolve branch or raise run-phase for VM languages. Phase C.
- **C4-N2** roles PATCH equal-level cap-stripping (gate removals symmetrically with adds). Phase C.
- **C4-N4** SSE terminal-result stale caps (re-resolve caps in `sendTerminalResult` from the re-auth path).
- **C4-6** roles PATCH TOCTOU (no `FOR UPDATE` unlike DELETE). Phase C.
- **C4-7** `resetRecruitingInvitationAccountPassword` metadata clobber (route through `FOR UPDATE` or `jsonb_set`). Phase C.
- **C4-8** executor.rs source `0o666` vs runner `0o600` (mirror runner hardening). Phase C.
- **ARCH-2/3/4** architectural notes (spurious dead-letters; `_sys.*` merge centralization; collapse two settings writers into one `applySystemSettings` core). Phase C.
- **Designer P1/P2 batch** AGG-58/59/60/61 + UI-1..UI-14 (zero UI files changed this cycle; re-confirmed verbatim).
- **PB-2/PB-3, GS-1..GS-4, A12e** test-infra + CI-grep guards. Phase C.
- **A7 page-read residual** `community/threads/[id]/page.tsx:83` sibling helper. Phase C.
- **NEW-M9** anti-cheat Origin fail-closed when AUTH_URL unset (LOW, bounded).

---

## Phase C — Deferred low-severity (with provenance)

Each records: file+line · original severity/confidence (NOT downgraded) · reason · exit criterion. None are security/correctness/data-loss. Repo rule permitting deferral of low-priority polish: AGENTS.md:438 ("Outstanding deferred deploy-script polish items ... LOW-severity defense-in-depth and observability improvements, all with concrete exit criteria").

- **SEC-16** `DUMMY_PASSWORD_HASH` constant. `src/lib/auth/config.ts:51-52`. LOW/HIGH. Cosmetic; timing-parity test is the safeguard. Exit: next Argon2 param change.
- **SEC-17** Session cookie `SameSite=Lax`. `src/lib/auth/config.ts:163`. LOW/HIGH. Exit: when a state-changing top-level-GET admin route is added.
- **SEC-20** `AUTH_TRUST_HOST=true` doc gap. LOW/MED. Exit: next runbook update.
- **SEC-21** API-key DB equality non-timing-safe. LOW/LOW. 160-bit secret. Exit: if entropy reduced.
- **ARCH-6** gVisor promotion. MED/MED. Ops decision. Exit: after gVisor validation pass.
- **ARCH-8** Settings cache process-local drift. MED/MED. Exit: `APP_INSTANCE_COUNT > 1`.
- **AGG-12 / SEC-12** `postcss` XSS via `next`. MED/HIGH. Build-time, bundled. Exit: next `next` bump.
- **C3-N9** `getPublicBaseUrl` host-header fallback (dev-only). LOW. Exit: defense-in-depth startup warn.
- **feature-dev NEW-2** `validate_secure_judge_urls` skips register/heartbeat/deregister. LOW. Exit: defense-in-depth cycle.
- **listAllProblemDiscussionThreads editorial-scope divergence** LOW. Likely intentional. Exit: document or unify.

## Progress Tracking (Phase A) — END-OF-CYCLE STATUS
- [x] A1 judge `/claim` + `/poll` require workerId; shared token /register-only (C4-2 Part 1) — commit e7a17c22
- [x] A2 JUDGE_STRICT_IP_ALLOWLIST opt-in + startup WARN, no default flip (C4-2 Part 2) — commit e7a17c22
- [x] A3 snapshot `snapshot:true` opt-out + DOC-2/DOC-3 prose (C4-1) — commit 65ca7ef8
- [x] A4 shared reconfirm helper on BOTH writers + C4-N1 `hasOwnInput` port + C4-3 sensitive-key expansion + C4-N3 accepted-solutions list filter + 3 form password fields (ARCH-1) — commit b9fcbc92
- [x] A5 int64 precision serialization verbatim + strtoll/parseLong/long.Parse (F1) — commit 052abf88
- [x] A6 worker cleanup bundle: sweep timeout + startup reap-all + kill_on_drop (N1/R2/R4) — commit c858ce22
- [x] A7 cheap doc + LOW batch: C4-9 CSV durable audit, AGG-51 CSRF doc, AGG-52 push-scan wording, C3-D2 line cite, C3-D1 .env vars, NEW-1 language sizes, A9 per-target deploy env — commit 2c224ab0
- [~] A8 test-gap batch — DEFERRED (test-only; C4-A6 / A11a / auth-token lifecycle). Exit: next cycle.
- Gates: lint ✓, lint:bash ✓, db:check ✓, cargo test ✓ (78), test:unit 2986 pass / 2 pre-existing-environmental (judge-status-report `refreshes judgeClaimedAt` fails on pristine pre-C4-2 code too; migration-drift untracked-file infra test), build ran (local environmental ceiling per brief), test:e2e skipped (no DB/browser infra locally)
- DEPLOY: `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh`
