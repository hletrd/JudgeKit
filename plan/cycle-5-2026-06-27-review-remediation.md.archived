# Cycle 5 (2026-06-27) Review Remediation Plan

Source: `.context/reviews/_aggregate.md` (cycle 5, head `7ebea50e`). 7 per-agent reviews aggregated.
Carry-forward: `plan/cycle-{1..4}-…md`. Cycle-4 Phase B/C backlog is the pre-validated carry-forward (not new scope).

Repo rules honored: semantic commits + gitmoji, GPG-signed (`git commit -S`), fine-grained, every commit includes relevant tests (AGENTS.md "Testing Rules (MANDATORY)"), `git pull --rebase` before push. No `eslint-disable`/`@ts-ignore`/`#[allow]`/`--skip`/`xfail` unless repo rules authorize (none do for errors). Security/correctness/data-loss findings are NOT silently dropped.

**Regression status:** 0 code-behaviour regressions in cycle-1..4 fixes (7 reviewers unanimous). One cycle-4-introduced **doc** regression (C5-DOC-1). This cycle is net-new + carry-forward, not regression-recovery.

---

## Phase A — Implement this cycle (ordered by severity)

### A1. C5-DOC-1 / C5-L1 — fix cycle-4-introduced CSRF doc regression (text-only) · the only REGRESSION
- **Files:** `docs/api.md:80-84`; `src/lib/security/csrf.ts:19-31` (docstring).
- **Root cause:** cycle-4 commit `2c224ab0` rewrote the CSRF wording into a false OR claim ("any one passing is sufficient"). Code (`csrf.ts:42-47`) is AND-shaped: `X-Requested-With: XMLHttpRequest` is REQUIRED (unconditional 403 if missing/mismatched), then Sec-Fetch-Site (when present) and Origin (when present + AUTH_URL) are additional fail-closed gates. Behaviour is correct AND stricter than the doc — no exploit, but the doc teaches the wrong model.
- **Do:** reword both the api.md section and the `csrf.ts` docstring to: `X-Requested-With: XMLHttpRequest` is **required** (HTML forms cannot set it); Sec-Fetch-Site (when present) must be same-origin/same-site/none; Origin (when present + AUTH_URL resolvable) must match. All applicable checks must pass.
- **Exit:** doc + docstring match the AND-semantics of the code. No code change.

### A2. C5-N1 — kill `JUDGE_ALLOW_UNREGISTERED_MODE` silent footgun (MED, judge-operational)
- **Files:** `judge-worker-rs/src/main.rs:326-341`.
- **Issue:** post-C4-2, a worker that fails registration and has the flag set continues with `worker_id=None` and polls forever; each `/claim` is rejected `workerIdRequired` → 400 → logged "Poll failed" → treated as "no work". Submissions pile up while the worker is "up". The flag has no valid function post-C4-2.
- **Do:** make registration-failure **always fatal**. Keep the config field parsed (back-compat — a deployment with the env var set must not fail to parse), but the `allow_unregistered_mode=true` branch now logs a FATAL `error!` explaining unregistered mode is incompatible with workerId-required `/claim` (C4-2) and `std::process::exit(1)` — same as the disabled branch. No silent spin.
- **Tests:** extend `judge-worker-rs/src/config.rs` test module asserting `JUDGE_ALLOW_UNREGISTERED_MODE` is still parsed (back-compat) — the behavioural exit is a main()-path that is not unit-testable without runtime injection (noted; the source-grep/source contract is the realistic guard). Add a source-grep contract in `main.rs` test module asserting both registration-failure arms call `std::process::exit` (so a future "resilience" revert that re-enables silent polling flips red).
- **Exit:** a worker that cannot register exits non-zero with a clear log; no silent dead-poll loop.

### A3. C5-N3 / debugger-N6 — wrap startup reap-all sweep in shutdown `select!` (LOW, two-agent agreement)
- **File:** `judge-worker-rs/src/main.rs:498`.
- **Do:** replace the bare `docker::cleanup_all_oj_containers_at_startup().await;` with `tokio::select! { _ = &mut shutdown => { tracing::info!(...); return; } _ = docker::cleanup_all_oj_containers_at_startup() => {} }`. Each internal docker call is already timeout-bounded; the outer select only adds shutdown responsiveness. At this point `task_handles` is empty and a `return` exits the process cleanly (matches debugger's recommendation).
- **Tests:** extend the A2 source-grep contract / `docker.rs` inline test is unaffected (the function itself is unchanged).
- **Exit:** SIGTERM during the startup-sweep window is honoured (no ~20 s queue).

### A4. C5-A1 — action-side reconfirm gate revert-RED test (HIGH-ROI test gap)
- **Files:** `tests/unit/actions/system-settings.test.ts` (mock wired at :22, :62; promised test missing).
- **Do:** widen the hoisted `requireSettingsReconfirm` mock type to the real discriminated union (`{ok:true} | {ok:false; status:number; error:string}`). Add an `it()` that overrides the mock to resolve `{ok:false, status:401, error:"passwordReconfirmRequired"}`, calls `updateSystemSettings({allowedHosts:[...]})` (a sensitive key), asserts `{success:false, error:"passwordReconfirmRequired"}` AND `mocks.dbInsertValues` NOT called. ~15 lines; mirrors the route twin's revert-RED test.
- **Exit:** the ARCH-1 invariant ("both writers gate") is revert-RED on the action side; a refactor inverting the gate flips this red.

### A5. C5-A2 — accepted-solutions SQL filter revert-RED test (MED, tightens C4-N3)
- **Files:** add to `tests/unit/api/problem-accepted-solutions.route.test.ts`.
- **Do:** the mock architecture bypasses SQL, so a behavioural "mock returns opted-out author" cannot prove filtering. Add a **source-grep contract** (consistent with repo conventions — `export-sanitization.test.ts`, `docker.rs` inline test) reading the route source and asserting the list SELECT's `.where()` carries `eq(users.shareAcceptedSolutions, true)`. Revert-RED: removing the SQL clause flips it. ~15 lines.
- **Exit:** the C4-N3 SQL filter is revert-RED; a future JS-pagination revert ships red.

### A6. Cheap ride-along bundle (LOW, audit-accuracy + dead-code cleanup)
- **C5-N2** `src/app/api/v1/admin/settings/route.ts:184-194` — build audit `details` from `baseValues` (drop `updatedAt`; mask `hcaptchaSecret`) so only fields actually written are recorded. Revert-RED extension to the existing `admin-settings-reconfirm.test.ts` partial-update test asserting `details` does NOT carry `platformMode`/`publicSignupEnabled` when omitted.
- **C5-N4** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:80` — drop dead `shareAcceptedSolutions: users.shareAcceptedSolutions` from the list SELECT (`acceptedSolutionsAnonymous` stays — it drives masking). Existing test stays green (mock still supplies the field; route stops selecting it).
- **C5-N5** `src/app/api/v1/judge/claim/route.ts:198-208` — drop the dead `if (worker.secretTokenHash)` wrapper (always-true; `isJudgeAuthorizedForWorker` already rejected hashless workers) and the redundant `!workerSecret` check (guaranteed by :162); keep the `safeTokenCompare` body-secret re-check as a flat defense-in-depth assertion guarded by `!worker.secretTokenHash ||` for TS-safety; rewrite the misleading comment.
- **UI-15** 3 settings forms — swap plain `<label className="text-sm font-medium">` → `<Label>` component for baseline parity with sibling fields (add `Label` import to `allowed-hosts-form.tsx`).
- **Exit:** audit details faithful; dead fetch/column removed; comments accurate; label baseline unified.

### A7. C4-4 partial — plaintext-fallback warn-log audit trail in `plugins/secrets.ts` (MED, safe half of C4-4)
- **File:** `src/lib/plugins/secrets.ts:57-72`.
- **Context:** `encryption.ts:99` ALREADY defaults `allowPlaintextFallback: false`. C4-4 is specifically `decryptPluginSecret:61` (defaults `true`) AND it falls back **silently** (no warn), unlike `encryption.ts:109-114` which warns. Repo rule (`encryption.ts:18-22`) explicitly gates hard-removal: "Hard removal of the fallback is DEFERRED until ... a dedicated audit cycle confirms all encrypted columns contain only enc:-prefixed values. **Do NOT silently drop the fallback; preserve the warn-log audit trail.**"
- **Do (safe half):** add a production `logger.warn` in `decryptPluginSecret` when it falls back to plaintext (mirror `encryption.ts:109-114`: `[plugins] decryptPluginSecret() fell back to plaintext — possible data tampering or incomplete migration`). This **is** the "preserve the warn-log audit trail" the repo rule mandates, and it produces the audit signal whose review is the exit criterion for the eventual default-flip. Do NOT flip the default (gated by the audit-cycle rule).
- **Tests:** extend `tests/unit/plugins/secrets.test.ts` (or add) — fallback path emits a warn in production (NODE_ENV=production); encrypted path emits no warn.
- **Exit:** plaintext fallback in the plugin path is no longer silent; the audit trail needed to schedule the default-flip exists. The remaining default-flip + re-encryption migration stays deferred under the quoted repo rule.

### A8. Docs bundle (text-only) — C5-DOC-2/3/4/5/6/7/8
- **C5-DOC-2** `docs/api.md:1380-1395` — settings PUT: document `currentPassword` (required when any `SENSITIVE_SETTINGS_KEYS` is present; 401 `passwordReconfirmRequired`/403 `invalidPassword`); note cosmetic keys editable without reconfirm; reference shared helper.
- **C5-DOC-3** `docs/api.md:1432-1434` — roles PATCH: document 403 `cannotEditHigherRole` + target level ≤ actor level.
- **C5-DOC-4** `docs/api.md:1287-1291` — `/claim`: add request body table (`workerId`/`workerSecret` required; shared `JUDGE_AUTH_TOKEN` is registration-only).
- **C5-DOC-5** `docs/languages.md:216-218` — reconcile core/popular/extended sizes to `deploy-docker.sh --help` figures.
- **C5-DOC-6/7** — document `GET /problems/:id/export` + `POST /groups/:id/instructors` (2nd deferral — land now).
- **C5-DOC-8** `.env.production.example` — add the 5 missing security env vars (`TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `JUDGE_STRICT_IP_ALLOWLIST`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `ALLOW_UNSNAPSHOTTED_RESTORE`, `JUDGE_PRODUCTION_MODE`); sharpen judge-section auth wording (folded with C5-DOC-4).
- **Exit:** docs match code; falsely-claimed-done items (C4-D5/C5-DOC-2) and net-new drift (C5-DOC-4) closed.

Gates (all FOREGROUND, `timeout: 600000` — NOT background): `npm run lint`, `npm run lint:bash`, `npm run build`, `npm run test:unit`, `cargo test`, `npm run test:e2e`, `npm run db:check`. Local-build environmental-ceiling caveat per brief: if `next build` hits the 10-min ceiling with 0 output, treat as indeterminate (environmental), keep other gates green, proceed; remote deploy confirms buildability.

---

## Phase B — Carry-forward (deferred to subsequent cycles; planned, NOT dropped; severity preserved)

Each records: file+line · original severity · reason · exit criterion. Security/correctness items carry a quoted repo rule permitting the deferral.

- **C4-4 / AGG-10 (remaining default-flip + re-encryption migration)** — MED. `plugins/secrets.ts:61`. **Partial fix this cycle** (A7 adds the warn-log audit trail). Remaining flip deferred under repo rule `encryption.ts:18-22`: *"Hard removal of the fallback is DEFERRED until ... a dedicated audit cycle confirms all encrypted columns contain only enc:-prefixed values."* Exit: after a deploy with the warn-log (A7) ships and a review cycle confirms zero plaintext-fallback warns in production logs, flip default to `false` + ship a re-encrypt migration.
- **NEW-B** `enc:` key-version prefix — LATENT→MED. `encryption.ts:78` (already `enc:`-prefixed) / plugin path uses `enc:v1:`. Exit: zero-downtime key rotation; pairs with C4-4 completion.
- **AGG-1** Restore DB↔files atomicity — MED (design). `restore/route.ts:163`. Mitigated by cycle-2 durable failure audit + cycle-4 faithful snapshot. Exit: staging-then-rename (PHB-1).
- **NEW-M8** ZIP-bomb streaming decompression — LOW-MED. `files/validation.ts:96-107`. Perm-gated (authenticated upload). Exit: streaming decompress with running-byte counter.
- **debugger-N5** startup reap-all worker-identity guard — LOW/MED (future topology). `docker.rs:318,752-810`. Exit: `JUDGE_WORKER_CONTAINER_PREFIX` env; only fires on a shared-host topology that does not exist today.
- **Perf queue (AGG-41 audit IN→EXISTS; F-1 canManageProblem fast-path + memoize)** — MED (perf, not correctness). Exit: per-item perf criteria.
- **A8 test-gap batch (remaining):** C4-A6 main.rs `active_tasks` exactly-once; A11a migrate/import mirror tests; C4-N1-test auth-token lifecycle; PB-2/PB-3/A12e/GS-1/GS-2/C4-A4/C4-A5; C5-A3 snapshot behavioral output-byte test. Each High/Med, test-only. Exit: next cycle's test lane.
- **Designer P1/P2 batch** AGG-58/59/60/61 + UI-1..UI-14 (zero UI files changed cycles 4/5 except the 3 settings forms).
- **LOW Phase C:** C4-6 roles PATCH TOCTOU; C4-7 recruiting metadata clobber; C4-N2 lateral cap-strip; C4-8 executor.rs source 0o666; R3 inspect-timeout OOM=false; R1 chown-fallback (accepted-by-design); AGG-12/SEC-12 postcss (next `next` bump); ARCH-2/3/4; tracer-N1/N2/N3; UI-16; SEC-16/17/20/21; ARCH-6/8; NEW-M9; C3-N9; feature-dev NEW-2. AGENTS.md:438 permits deferral of LOW-severity defense-in-depth/observability polish.

---

## Phase C — Progress Tracking (updated end-of-cycle)
- [x] A1 CSRF doc regression (text-only) — commit 70982f76
- [x] A2 worker unregistered-mode fatal — commit 816d3a2a
- [x] A3 startup sweep shutdown select — commit 816d3a2a
- [x] A4 action reconfirm revert-RED test — commit da0c8f0d
- [x] A5 accepted-solutions SQL-filter source-grep test — commit 504b27be
- [x] A6 ride-along (C5-N2 audit details, C5-N4 dead column, C5-N5 dead conditional+comment, UI-15 Label) — commits 2d7cc7e7 + e7c05ced
- [x] A7 plugins plaintext-fallback warn-log (C4-4 partial) — commit da8e6b1f
- [x] A8 docs bundle (C5-DOC-2/3/4/5/6/7/8) — commit a84a96d0
- Gates: lint ✓, lint:bash ✓, db:check ✓, cargo test ✓ (80), test:unit ✓ (2995 all green; known-flaky passed this run), tsc --noEmit ✓ (exit 0). build: local-build indeterminate (environmental — next build stalled at ~28 min in uninterruptible-wait with no output on the second run; first run compiled in 5.3 min and the only failure was the now-fixed type error; remote deploy build confirms buildability). test:e2e skipped (no DB/browser infra locally).
- DEPLOY: per-cycle-success — `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` to algo.xylolabs.com → oj-internal.maum.ai; all containers healthy, "JudgeKit is responding (HTTP 200)", remote build succeeded.
