# Cycle 5 — Aggregated Review (merged from per-agent files)

**Repo:** `/Users/hletrd/flash-shared/judgekit` · **Head:** `7ebea50e` (cycle-4 close) · **Date:** 2026-06-27
**Sources aggregated (7 cycle-5 per-agent files, written 04:51–05:01):** `code-reviewer.md`, `security-reviewer.md`, `tracer.md`, `debugger.md`, `test-engineer.md`, `designer.md`, `document-specialist.md`. (architect/critic/verifier/perf-reviewer did not rewrite this cycle — their last output is carried via the cycle-4 aggregate + carry-forward plans.)
**Carry-forward plans read:** `plan/cycle-{1,2,3,4}-2026-06-2{6,7}-review-remediation.md` (cycle-4 Phase B/C deferred list is the pre-validated backlog).

Method: per-finding dedupe (preserve highest severity, note cross-agent agreement), regression-first ordering. Severity held tight per lead — no inflation of polish.

---

## HEADLINE

- **Cycle-1..4 code regressions: NONE.** All 7 reviewers independently confirm the 6–9 cycle-4 fix bundles (C4-1 snapshot, C4-2 claim/poll workerId + strict IP, ARCH-1/C4-N1/C4-3 settings reconfirm on BOTH writers, F1 int64, C4-9 CSV durable audit, A6 worker cleanup N1/R2/R4) achieve their stated purpose with no production regression. Tracer labels all four named flows (F-claim, F-snapshot, F-settings, F-int64) **CLOSED**; debugger labels all five mission areas **CONFIRMED**; security-reviewer **6/6 PASS**; code-reviewer **9/9 VERIFIED**.
- **One cycle-4-introduced REGRESSION (doc-only):** C5-DOC-1 / C5-L1 — commit `2c224ab0` rewrote the CSRF doc/docstring into a FALSE "any one passing is sufficient" (OR-semantics) claim; the code is actually AND-shaped (`X-Requested-With: XMLHttpRequest` is REQUIRED). Behaviour is correct AND stricter than the doc, so there is **no exploitable gap** — but the doc teaches the wrong mental model and the regression was introduced by a cycle-4 commit. Two-agent agreement (doc-specialist HIGH-regression; security-reviewer LOW-doc). Cheap text fix.
- **Findings trend:** 112 → 25 → 28 → (cycle-4 MED+LOW) → **cycle-5: 0 CRITICAL, 0 HIGH (behaviour), 1 MED net-new (C5-N1), rest LOW + 1 HIGH-ROI test gap (C5-A1) + doc drift.** Converging.
- **Deferred carry-forward unchanged:** C4-4/AGG-10 plaintext-decryption default (MED, the only remaining open MED security item), plus the LOW Phase B/C backlog (C4-6/7/8/N2, NEW-M8, R1/R3, perf queue, Designer P1/P2, A8 test-gap batch).

---

## STAGE 1 — Regression verdict on cycle-1..4 fixes (all PASS)

| Fix bundle | Verdict | Cross-agent agreement |
|---|---|---|
| C4-2 P1 workerId required on /claim + /poll + /deregister + /heartbeat; shared token /register-only | **PASS / CLOSED** | security 6/6, code-reviewer, tracer (F-claim CLOSED, mechanism certain), debugger |
| C4-2 P2 `JUDGE_STRICT_IP_ALLOWLIST` opt-in, unset==allow-all preserved + warn | **PASS** | security, code-reviewer, tracer |
| C4-1 `snapshot:true` opt-out bypasses ALWAYS_REDACT; only `takePreRestoreSnapshot` passes it | **PASS / CLOSED** | security, code-reviewer, tracer (F-snapshot CLOSED), debugger (argon2 self-heal verified) |
| ARCH-1 + C4-N1 + C4-3 shared reconfirm helper on BOTH writers + `hasOwnInput` port + sensitive-key expansion + accepted-solutions list filter | **PASS / CLOSED** | security, code-reviewer, tracer (F-settings CLOSED), debugger (fail-closed on every path) |
| F1 int64 verbatim serialize + strtoll/parseLong/long.Parse | **PASS / CLOSED (wire-level)** | security, code-reviewer, tracer (F-int64 CLOSED wire; UI cap at 2^53 is pre-existing v1 deferral), debugger (throw unreachable from production) |
| C4-9 contest CSV export durable audit | **PASS** | security, code-reviewer |
| A6 worker cleanup bundle N1+R2+R4 | **PASS / CONFIRMED** | code-reviewer, debugger (R2/R4 CLOSED, all 4 mission questions answered), test-engineer (a8 revert-RED structural contract) |

**Regressions requiring a fix this cycle: see C5-DOC-1 below (doc-only).**

---

## STAGE 2 — Net-new findings (cycle-5), deduped

### C5-DOC-1 / C5-L1 — CSRF doc/docstring false "any one passing is sufficient" (REGRESSION, cycle-4-introduced; doc-only)
- **Severity:** HIGH as a *doc-correctness regression* (doc-specialist) / LOW as a *security* item (security-reviewer — behaviour is stricter than doc, no exploit). **Merged: fix it — cheap text fix to both `docs/api.md:80-84` and `src/lib/security/csrf.ts:20-31`.**
- **Cross-agent agreement:** 2 agents (document-specialist C5-DOC-1, security-reviewer C5-L1).
- **Root cause:** cycle-4 commit `2c224ab0` overcorrected the prior accurate "X-Requested-With required" wording into a false OR claim. Code (`csrf.ts:42-47`) returns 403 whenever `X-Requested-With !== "XMLHttpRequest"` BEFORE the Sec-Fetch-Site / Origin checks even run.
- **Exit:** both doc + docstring say `X-Requested-With: XMLHttpRequest` is REQUIRED (HTML forms cannot set it); Sec-Fetch-Site (when present) and Origin (when present + AUTH_URL resolvable) are additional fail-closed gates.

### C5-N1 — `JUDGE_ALLOW_UNREGISTERED_MODE` is a silent footgun post-C4-2 (MEDIUM, judge-operational) — code-reviewer (unique)
- **Files:** `judge-worker-rs/src/main.rs:326-341,552`; `judge-worker-rs/src/config.rs:270-274`; claim gate `src/app/api/v1/judge/claim/route.ts:106-128`.
- **Issue:** C4-2 removed the shared-token fallback from `/claim` (correctly). But the worker binary still honours `JUDGE_ALLOW_UNREGISTERED_MODE`: if registration fails and the flag is set, the worker continues with `worker_id=None`/`worker_secret=None` and polls forever; each poll POSTs `{worker_id:null,...}` → `/claim` superRefine rejects `workerIdRequired` → 400 → worker logs "Poll failed" and treats it as "no work". Submissions pile up unjudged while the worker is "up". Pre-C4-2 this was an intentional resilience escape hatch; post-C4-2 it has no valid function.
- **Exit:** a worker that cannot register does not silently spin — fail loud (refuse to enter the poll loop / exit non-zero) when unregistered, since claiming is now impossible. (Remove the flag OR make unregistered mode fatal.)

### C5-A1 — ARCH-1 action-side reconfirm gate is unguarded (HIGH-ROI test gap, S effort) — test-engineer #1
- **Files:** `tests/unit/actions/system-settings.test.ts:19-22,63,148-342`; prod `src/lib/actions/system-settings.ts:100`.
- **Issue:** the test wires `requireSettingsReconfirm: vi.fn().mockResolvedValue({ ok: true })` and the comment at :19-21 says "the dedicated reconfirm test below overrides this…" — **but no such test exists.** Every `it()` covers auth/rate-limit/validation/success; none overrides the mock to assert the action rejects on `{status:401, error:"passwordReconfirmRequired"}`. The route twin has a real revert-RED test (a5); the action twin has only a passing mock. A refactor that inverts the gate stays green.
- **Exit:** ~15-line test: override mock → `mockResolvedValue({ status:401, error:"passwordReconfirmRequired" })`, call `updateSystemSettings({allowedHosts:[...]})`, assert `{success:false, error:"passwordReconfirmRequired"}` and `dbInsert` NOT called.

### C5-A2 — C4-N3 accepted-solutions SQL filter is NOT revert-RED (MEDIUM, test tightens correctness) — test-engineer
- **Files:** `tests/unit/api/problem-accepted-solutions.route.test.ts:142-160`; prod `accepted-solutions/route.ts:88`.
- **Issue:** the test mock was edited to drop the opted-out author, so the test *assumes* the SQL filter exists rather than *proving* it. Reverting the `eq(users.shareAcceptedSolutions, true)` clause leaves the test green.
- **Exit:** ~12-line behavioral test: mock list SELECT to return BOTH an opted-in and an opted-out author; assert response contains ONLY the opted-in one.

### C5-N2 — settings PUT audit `details` records default values for OMITTED fields (LOW, audit-accuracy) — code-reviewer
- **File:** `src/app/api/v1/admin/settings/route.ts:184-194`.
- **Issue:** after the C4-N1 `hasOwnInput` fix, omitted fields are no longer written to the DB, but the audit `details` still records `platformMode ?? DEFAULT_PLATFORM_MODE`, `aiAssistantEnabled ?? true`, etc. — the default-applied value, NOT what was written. A forensic reviewer gets a false positive ("did this PUT change platformMode?").
- **Exit:** only include a key in `details` when `hasOwnInput(key)` (mirror `baseValues`).

### C5-N3 / debugger-N6 — startup reap-all sweep is awaited bare; SIGTERM during startup sweep is queued ~20s (LOW) — code-reviewer + debugger AGREEMENT
- **File:** `judge-worker-rs/src/main.rs:498` (`cleanup_all_oj_containers_at_startup().await`).
- **Issue:** unlike the periodic sweep (L515-524, `tokio::select!`-wrapped against `&mut shutdown`), the startup sweep is awaited directly. Each internal docker call is bounded by `DOCKER_CLEANUP_TIMEOUT_SECS=10`, so worst case ≈ 20s; a deploy SIGTERM in that window is queued. Bounded, idempotent, self-healing — operationally noisy only.
- **Exit:** wrap the startup sweep in the same `tokio::select! { _ = &mut shutdown => ..., _ = cleanup_all_oj_containers_at_startup() => {} }` shape.

### C5-N4 — dead `shareAcceptedSolutions` column fetch in accepted-solutions list SELECT (LOW) — code-reviewer
- **File:** `src/app/api/v1/problems/[id]/accepted-solutions/route.ts:80`.
- **Issue:** after C4-N3, the WHERE filters `shareAcceptedSolutions` in SQL and the `.map` (L96-109) no longer references `solution.shareAcceptedSolutions` — only `acceptedSolutionsAnonymous` is used. The column is still in the SELECT list (dead fetch).
- **Exit:** drop `shareAcceptedSolutions: users.shareAcceptedSolutions` from the select list (`acceptedSolutionsAnonymous` must stay).

### C5-N5 — claim route defense-in-depth `if (worker.secretTokenHash)` now unreachable + misleading comment (LOW) — code-reviewer
- **File:** `src/app/api/v1/judge/claim/route.ts:198-208`.
- **Issue:** reached only after `isJudgeAuthorizedForWorker` returned `authorized:true`, which already rejects hashless workers (`workerSecretNotMigrated`). The inner `if` is always-true, the else is dead; the comment reads as if hashless workers are handled here.
- **Exit:** delete the redundant inner hash check (primary `isJudgeAuthorizedForWorker` already enforces it) and rewrite the comment as a flat defense-in-depth assertion.

### debugger-N5 — startup reap-all has no worker-identity guard; shared-host deploy would nuke sibling worker's in-flight containers (LOW/MED, future topology) — debugger
- **Files:** `judge-worker-rs/src/docker.rs:752-810,318`.
- **Issue:** container names are `oj-{uuid4}` (no worker-id prefix); the startup sweep matches `--filter name=oj-` globally. Safe in the documented single-worker-per-host topology (CLAUDE.md; `deploy-docker.sh:929-935` `compose down --remove-orphans` guarantees no overlap). Risk is exclusively a future shared-host topology.
- **Exit:** add a `JUDGE_WORKER_CONTAINER_PREFIX` env var read at the spawn site + both sweep filters (default `oj-`); no behavior change in the default deployment. Forward-looking; defer with provenance.

### tracer net-new (LOW trio)
- **tracer-N1** `/claim` audit `actorRole:"system"` despite per-worker attribution being available (LOW, observability). `claim/route.ts:284-301`. Worker IS a system actor; audit dashboards grouping by `actorId` lose granularity. Defer.
- **tracer-N2** Pre-fix in-flight submissions stall ~5 min on deploy (LOW, one-time, self-heals). `/poll` hard-rejects `judgeWorkerId=null` submissions; they clear when the 5-min stale-claim timeout fires. Runbook note. Defer.
- **tracer-N3** `streamDatabaseExport({snapshot:true})` API shape is a footgun (LOW, single call site today). Rename to `includeLiveSecrets` or move behind a dedicated fn. Defer.

### Designer net-new (LOW polish)
- **UI-15** password field uses plain `<label>` instead of `<Label>` component in 3 settings forms (baseline drift). Trivial tag-only swap. Ride-along.
- **UI-16** `passwordReconfirmRequired` error is toast-only (no inline `role="alert"`). Marginal — `required` attribute is the real user path. Defer.

### Document-specialist net-new doc drift (text-only)
- **C5-DOC-2** (MED) settings PUT doc STILL omits `currentPassword` + sensitive-key gate — commit `2c224ab0` message falsely claimed C4-D5 done. `docs/api.md:1380-1395`.
- **C5-DOC-3** (MED) roles PATCH doc STILL omits `cannotEditHigherRole` gate. `docs/api.md:1432-1434`.
- **C5-DOC-4** (MED) `/claim` doc shows no request body at all post-C4-2 (net-new drift — worker integrator would not know to send `workerId`/`workerSecret`). `docs/api.md:1287-1291`.
- **C5-DOC-5** (MED) `docs/languages.md:216-218` sizes stale (NEW-1 half-reconciled; AGENTS.md fixed, languages.md missed).
- **C5-DOC-6** (MED) `GET /problems/:id/export` undocumented (2nd deferral).
- **C5-DOC-7** (MED) `POST /groups/:id/instructors` undocumented (2nd deferral).
- **C5-DOC-8** (LOW) `.env.production.example` missing 5 vars + judge-section auth vagueness.

---

## STAGE 3 — Carry-forward backlog (cycle-4 Phase B/C, unchanged this cycle)

Re-validated at HEAD by security-reviewer / tracer / debugger. None escalated; none closed by cycle-5 line-level change. Severity preserved.

**Open MED security/correctness (deferrable only with provenance — quoted rule):**
- **C4-4 / AGG-10** plaintext-decryption fallback default `true` (MED). `src/lib/plugins/secrets.ts:61`. Pairs with **NEW-B** `enc:` key-version prefix (`encryption.ts:78`). Exit: `allowPlaintext` defaults false everywhere + re-encryption migration; zero-downtime key rotation.
- **AGG-1** Restore DB↔files atomicity (MED, design). `restore/route.ts:163` commits DB before the bare-write FS loop. Mitigated by cycle-2 durable failure audit + cycle-4 faithful snapshot. Exit: staging-then-rename (PHB-1).
- **NEW-M8 / C3-N8** ZIP-bomb streaming decompression (LOW-MED, tracer; perm-gated + authenticated upload). `src/lib/files/validation.ts:96-107` slow path allocates before per-entry cap. Exit: streaming decompress with running-byte counter.

**Open LOW (Phase C):**
- **C4-6** roles PATCH TOCTOU (no `FOR UPDATE` unlike DELETE). `admin/roles/[id]/route.ts:59-63,121-124`.
- **C4-7** `resetRecruitingInvitationAccountPassword` metadata clobber. `recruiting-invitations.ts:463-509`.
- **C4-N2** lateral (same-level) cap-stripping (`role.level > creatorLevel` strict `>`). `admin/roles/[id]/route.ts:94`.
- **C4-8** executor.rs source `0o666` vs runner `0o600`. `judge-worker-rs/src/executor.rs`.
- **R3** inspect-timeout returns `oom_killed:false` (masks real OOM whose inspect stalls >10s). `docker.rs:188-198`.
- **R1** compiler chown-fallback `0o777`/`0o666` (intentional mirror of runner; accepted-by-design). `compiler/execute.ts:748-757`.
- **AGG-12/SEC-12** `postcss` XSS via `next` (MED, build-time, bundled). Exit: next `next` bump.
- **AGG-41** audit IN→EXISTS; **F-1** `canManageProblem` fast-path + memoize (perf, MED). Deferred with provenance.
- **ARCH-2/3/4** dead-letters; `_sys.*` merge centralization; collapse two settings writers into one `applySystemSettings` core.
- **Designer P1/P2 batch** AGG-58/59/60/61 + UI-1..UI-14 (zero UI files changed cycles 4 or 5 except the 3 settings forms; re-confirmed verbatim).
- **A8 test-gap batch** (test-engineer re-validated OPEN): C4-A6 main.rs `active_tasks` exactly-once; A11a migrate/import mirror tests; C4-N1-test auth-token lifecycle; PB-2/PB-3/A12e/GS-1/GS-2/C4-A4/C4-A5; C5-A3 snapshot behavioral output-byte test.
- SEC-16/17/20/21, ARCH-6/8, NEW-M9, C3-N9, feature-dev NEW-2 — unchanged backlog.

---

## RECOMMENDED CYCLE-5 SCOPE (priority order)

1. **C5-DOC-1 / C5-L1** — fix the cycle-4-introduced CSRF doc regression (text-only). The only true regression.
2. **C5-N1** — kill the `JUDGE_ALLOW_UNREGISTERED_MODE` silent footgun (the only MED net-new; judge-operational silent failure).
3. **C5-A1** — action-side reconfirm test (HIGH-ROI, ~15 lines, mock pre-wired).
4. **C5-A2** — accepted-solutions behavioral test (tightens C4-N3; pairs with C5-N4).
5. **Cheap ride-alongs:** C5-N2 (audit details), C5-N3/N6 (startup sweep `select!`), C5-N4 (dead column), C5-N5 (dead conditional + comment), UI-15 (`<Label>` swap).
6. **Docs bundle (text-only):** C5-DOC-2, C5-DOC-3, C5-DOC-4, C5-DOC-5, C5-DOC-6, C5-DOC-7, C5-DOC-8.
7. **Defer with provenance (preserve severity):** C4-4/AGG-10+NEW-B (MED, migration risk), AGG-1, NEW-M8, debugger-N5, perf queue, Designer P1/P2, remaining A8 test gaps, LOW Phase C.
