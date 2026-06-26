# Cycle 4 Aggregate Review

Date: 2026-06-27
Repository: `/Users/hletrd/flash-shared/judgekit`
Head: `edd45cca` (cycle-3 Phase A complete; 43 commits green across cycles 1–3)
Prior: cycle-1/2/3 aggregates preserved in git history. Per-agent files overwritten with cycle-4 reviews.

## Fan-Out Status

All 11 dispatched review agents completed successfully (no failures, no retries). Per-agent files live alongside this one.

- `security-reviewer.md` — 0 CRITICAL + 2 HIGH (C4-1, C4-2) + 2 MED (C4-3, C4-4) + 5 LOW (C4-5..C4-9)
- `code-reviewer.md` — 0 CRIT + 0 HIGH + 1 MED (C4-N1) + 3 LOW (C4-N2/N3/N4) + 2 INFO
- `critic.md` — VERDICT: REVISE; one HIGH (A8 on wrong path — 5-agent convergence)
- `architect.md` — REG-A3/A4/A7/A8 sound; ARCH-1 HIGH (settings reconfirm wrong path) + ARCH-2/3/4 LOW; PERF lane + DESIGN lane re-confirmed
- `verifier.md` — 11/12 VERIFIED + 1 PARTIAL (settings reconfirm N1); 0 FAILED; net-new N1..N5
- `tracer.md` — F-recruit/F-roles/F-sse/F-export/F-settings/F-claim/F-restore traced; F-snapshot CLOSED (mechanism = the bug)
- `debugger.md` — 5 cycle-3 fixes CONFIRMED; R1..R4 still open; N1 net-new MEDIUM (cleanup sweep no timeout)
- `document-specialist.md` — no doc regression; DOC-2/DOC-3 HIGH prose mismatch; AGG-51/52/C3-D1/C3-D2 + C4-D5/D6 + NEW-1/2/3
- `designer.md` — REG-3/4/5 clean (zero UI files changed); Designer P1 batch re-confirmed verbatim; UI-14 NEW P3
- `test-engineer.md` — cycle-3 a1/a2/a3 STRONG; a4/a5/a6 WEAKEST; C4-A6 + C4-N1 (auth-token) + A11a highest-ROI
- `feature-dev-code-reviewer.md` — NEW-1 + AGG-15 verified landed; F1 HIGH (int64 precision); F2 MED (orphan sweep); F3 LOW-MED (pids_limit dead branch)

No agent failures this cycle.

---

## VALIDATED THIS CYCLE (multi-agent convergence is load-bearing)

Every HIGH below is confirmed by direct Read of the cited lines by ≥1 agent this cycle, and the cross-agent convergences are flagged. **No CRITICAL was found by any agent.** The regression surface (8 cycle-3 fixes) holds cleanly: 8/8 security-reviewer regression checks PASS, verifier 11/12 VERIFIED + 1 PARTIAL, debugger 5/5 CONFIRMED, architect A3/A4/A7/A8 CLEAN.

---

## CRITICAL (must fix this cycle)

*None.* No agent produced a CRITICAL-at-HIGH-confidence finding.

---

## HIGH (schedule this cycle — pre-validated, non-deferrable security/data-loss/correctness)

### C4-2 / NEW-H5 / F-claim — Judge `/claim` honors the shared token with no `workerId`; IP allowlist default-open (HIGH, security-reviewer + tracer)
**Source:** security-reviewer C4-2 · tracer F-claim · **Validated:** `src/app/api/v1/judge/claim/route.ts:104-115,176-180,410-424`; `src/lib/judge/ip-allowlist.ts:14,163-166`; sibling routes `poll/deregister/heartbeat`
**Issue:** When `workerId` is omitted (schema optional, L104-115), auth falls back to the **shared** `JUDGE_AUTH_TOKEN` (`isJudgeAuthorized`, L176-180). `buildClaimSql(false)` then claims a real submission and the response (L410-424) returns `sourceCode` + every hidden `testCase` (`input` + `expectedOutput`). A shared-token holder exfiltrates the full problem suite without registering a worker. Compounded by `ip-allowlist.ts:164-166` returning `true` when `JUDGE_ALLOWED_IPS` is unset (default-open). The shared token is the broadest judge secret (`.env`, `docker-compose.worker.yml`, CI, every worker host).
**Fix — decouple into two independently-shippable parts (different revert risk):**
- **Part 1 — SHIP; low revert risk (the security fix).** Make `workerId`+`workerSecret` **required** on `/claim`, `/poll`, `/deregister`, `/heartbeat`; shared token becomes `/register`-only. Removes the exfil blast radius. Only breaks clients authenticating with the shared token alone — exactly the legacy pattern that should re-register.
- **Part 2 — HIGH revert risk; opt-in hardening, NOT a bare default flip.** `ip-allowlist.ts:6-7,16,163` documents `unset == allow-all` as back-compat. **The cycle-2 attempt to flip this default was reverted in `23851d69` (C2-H7) because it broke deployed workers** — do NOT repeat that. Safe shape: keep `unset == allow-all` for back-compat, emit a loud startup WARN, and add an explicit opt-in `JUDGE_STRICT_IP_ALLOWLIST=1` (equivalently, fail-closed only when `JUDGE_ALLOWED_IPS` is set) so operators opt into strictness deliberately.
**Sequencing:** Part 1 is the security fix and must not be blocked by Part 2. Part 2 is defence-in-depth and must not be a blanket behaviour change.
**Exit:** a leaked shared token can no longer claim work or read `sourceCode`/`testCases`; operators can opt into strict IP enforcement without a forced migration.

### C4-1 / AGG-2 / C3-1 / DOC-2 / DOC-3 — Pre-restore snapshot is unrestoreable (HIGH, security-reviewer + document-specialist + tracer)
**Source:** security-reviewer C4-1 · document-specialist DOC-2/DOC-3 · tracer F-snapshot · **Validated:** `src/lib/db/export.ts:104-106`; `src/lib/db/pre-restore-snapshot.ts:34-39,84-86`; `src/lib/security/secrets.ts:36-42`; `docs/data-retention-policy.md:48`; `docs/admin-security-operations.md:65`
**Issue:** `EXPORT_ALWAYS_REDACT_COLUMNS` is applied even at `sanitize:false` (export.ts:104-106). `takePreRestoreSnapshot` calls `streamDatabaseExport({ sanitize: false })` (pre-restore-snapshot.ts:84-86), so the snapshot loses `users.passwordHash`, `sessions.sessionToken`, `accounts.*_token`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`. Restoring after a bad import = **total lockout + every active session invalidated**. The pre-restore-snapshot.ts:34-39 docstring ("contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form") is **provably false**.
**Fix:** Add a `snapshot:true` opt-out in `streamDatabaseExport` (bypass `EXPORT_ALWAYS_REDACT_COLUMNS` when `snapshot` is set); pass `snapshot:true` from `pre-restore-snapshot.ts:84`. At-rest exposure is already covered by `createWriteStream(fullPath, { mode: 0o600 })` + dir `chmod 0o700`. Pair with the DOC-2/DOC-3 prose fix (correct the false full-fidelity claim — the prose fix is independent text-only work; the code fix makes the claim true).
**Exit:** snapshots faithfully restoreable without secret-exfiltration path; docstring + docs match code reality.

### ARCH-1 / A8-wrong-path — Settings password-reconfirm gate is on the WRONG write path (HIGH, 5-agent convergence: critic + architect + verifier + security-reviewer + tracer)
**Source:** critic ARCH-1 · architect ARCH-1 · verifier §2 PARTIAL · security-reviewer C4-3/C4-5 · tracer F-settings · **Validated:** `src/app/api/v1/admin/settings/route.ts:89-110` (gated API route, no UI caller); `src/lib/actions/system-settings.ts:63-82` (UNGATED server action the UI calls); UI callers `src/app/(dashboard)/dashboard/admin/settings/{allowed-hosts-form.tsx:53, config-settings-form.tsx:70, system-settings-form.tsx:166, footer-content-form.tsx:105, home-page-content-form.tsx:94}`
**Issue:** A8 put `verifyAndRehashPassword` on the API route PUT. But **no UI client PUTs to that route** (grep finds only nav-link strings). Every admin settings form calls the **server action** `updateSystemSettings`, which has **no** `currentPassword`/`verifyAndRehashPassword` anywhere (grep-confirmed empty). The most sensitive field `allowedHosts` has its own dedicated form calling `updateSystemSettings({ allowedHosts })` — exactly the "silently widen allowedHosts" threat A8 documented, still live on the real UI path.
**Fix:** Extract reconfirm into a shared helper `requireReconfirmIfSensitive(body, SENSITIVE_SETTINGS_KEYS, user)` returning a `NextResponse | null` (or a server-action-shaped result); call it at the top of **both** the API route and the server action. Move `SENSITIVE_SETTINGS_KEYS` to a shared module imported by both writers.
**Exit:** stolen session POSTing `allowedHosts` via the action without `currentPassword` → 401; both writers share one sensitive-key set.

**Sub-findings bundled into the same settings area (same files, same commit cluster):**

- **C4-N1 (code-reviewer MED; security-reviewer C4-5 LOW)** — `PUT /api/v1/admin/settings` partial update wipes every unspecified field. `baseValues` is built **unconditionally** with defaults (route.ts:136-150); a PUT supplying only `{siteTitle:"x"}` overwrites `hcaptchaSecret → null`, `signupHcaptchaEnabled → false`, `publicSignupEnabled → false`. The twin server action guards every field with `hasOwnInput` (system-settings.ts:144-222) — the UI path is safe, the public REST endpoint is broken. **Also defeats the C3-AGG-7 reconfirm gate** (a stolen session sending `{siteTitle:"x"}` passes no sensitive key → no `currentPassword` → yet wipes `hcaptchaSecret` as a side effect). **Fix:** port the `hasOwnInput` guard from the action to the route; preserve the existing `touchesSensitiveKey` gate. **Negative test:** `PUT {siteTitle:"x"}` (no sensitive key, no currentPassword) → stored `hcaptchaSecret`/`publicSignupEnabled` unchanged.

- **C4-3 (security-reviewer MED; verifier N1)** — `SENSITIVE_SETTINGS_KEYS` is provably incomplete vs the persisted set. `allowAiAssistantInRestrictedModes` + `allowStandaloneCompilerInRestrictedModes` (persisted route.ts:143-144; action system-settings.ts:162-167) flip platform-mode **exam-mode restrictions** off but are absent from the sensitive list — a stolen session can re-enable AI assistant / standalone compiler during a restricted/exam-mode contest with no reconfirm, directly defeating the exam-integrity trust boundary. Also `uploadMaxImageSizeBytes` / `uploadMaxFileSizeBytes` / `uploadMaxZipDecompressedSizeBytes` / `uploadMaxImageDimension` (allowlist route.ts:128-129) widen upload DoS ceilings without reconfirm. **Fix:** add `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`, `aiAssistantEnabled`, the four `uploadMax*` keys to the shared `SENSITIVE_SETTINGS_KEYS`.

- **C4-N3 (code-reviewer LOW)** — accepted-solutions list SELECT under-fills pages. Cycle-3 added `eq(users.shareAcceptedSolutions, true)` to the **count** WHERE (route.ts:51-56) but the **list** SELECT (route.ts:69-88) still uses the unfiltered `whereClause`, then JS-filters at L92. Non-sharing authors consume `pageSize`/`offset` slots and are discarded → a page renders fewer than `pageSize` solutions while `total` overstates. **Fix:** add `eq(users.shareAcceptedSolutions, true)` to the list WHERE; drop the now-redundant `.filter` at L92.

- **C4-5 (security-reviewer LOW; verifier N2; tracer F-settings)** — `emailVerificationRequired`, `communityUpvoteEnabled`, `communityDownvoteEnabled`, `smtpPass` are listed in `SENSITIVE_SETTINGS_KEYS` (so they trigger reconfirm) but are neither destructured nor in `allowedConfigKeys` in the **route** — silently dropped by the `restConfig` filter. The action persists them; the route does not. Fixed by ARCH-1 (shared key set + align the two writers' key sets) subsumes this.

### F1 — Function-judging int64 precision broken end-to-end (HIGH, judge-correctness)
**Source:** feature-dev-code-reviewer F1 · **Validated:** `src/lib/judge/function-judging/serialization.ts:6`; `src/lib/judge/function-judging/adapters/cpp.ts:47`; `adapters/java.ts:75`; `adapters/csharp.ts:78-80`
**Issue:** `serialization.ts:6` `String(Math.trunc(Number(v)))` coerces to IEEE-754 float64 → every integer with magnitude `> 2^53` (9007199254740992) is **silently rounded at encode time** on the app server, before any adapter sees it. Concrete: author enters `9223372036854775807` (LLONG_MAX) → `Number()` rounds to `9223372036854775808`, which is **outside int64 range**. Reached by both stdin args (`encodeArgs` → `encodeJson` → `encodeScalar`) and return (`encodeValue` → `encodeJson` → `encodeScalar`). Secondary: C++/Java/C# adapters parse ints through `double` (`cpp.ts:47` `llround(stod(...))`, `java.ts:75` `Math.round(Double.parseDouble(...))`, `csharp.ts:78` `Math.Round(double.Parse(...))`). Large-int function problems get wrong verdicts; harness can throw out-of-range.
**Fix (BOTH layers together, or fixing one alone creates cross-language divergence):**
- `serialization.ts:6`: serialize `int`/`long` verbatim — emit the value as a string token without `Number()` coercion; accept string/bigint input at the boundary.
- `adapters/cpp.ts:47`: replace `llround(stod(...))` with `strtoll`/`std::stoll` over an integer-only token.
- `adapters/java.ts:75`: replace with `Long.parseLong(...)`.
- `adapters/csharp.ts:78-80`: replace with `long.Parse(..., CultureInfo.InvariantCulture)`.
Document that JS/TS remain bounded to `Number.MAX_SAFE_INTEGER` for function judging.
**Exit:** an `int`/`long` value `> 2^53` round-trips byte-identical through stdin→adapter→return for C++/Java/C#/Python/Go.

---

## MEDIUM (high-ROI, schedule if reachable this cycle)

### Worker cleanup-hardening bundle — debugger N1 + R2 + R4 + feature-dev F2 (MED, 2-agent convergence)
**Source:** debugger N1 + R2 + R4 · feature-dev F2 · **Validated:** `judge-worker-rs/src/docker.rs:642-681,175,245,263`; `judge-worker-rs/src/main.rs:505-508`
**Issue (N1, highest-ROI worker item):** `cleanup_orphaned_containers` (docker.rs:642-681) runs un-timeout'd `docker ps`/`docker rm` and is awaited **inline in the main loop** (main.rs:505-508); the shutdown `tokio::select!`s sit *below* this point, so a wedged dockerd freezes polling **and** blocks graceful shutdown (operators must SIGKILL, leaving claims stuck until `staleClaimTimeoutMs`). The heartbeat task keeps beating, so the server thinks the worker is alive while it processes zero submissions.
**Issue (R2):** the sweep filters `status=exited` only (docker.rs:647-651). A container still `running` after `kill`/`rm` timed out is invisible to the sweep and never reaped, contradicting the "orphan sweep will reap" log promise (docker.rs:255,273). On a forced restart (deploy SIGTERM→SIGKILL, OOM-kill, host reboot) every in-flight `oj-*` container leaks, each pinning its `--memory`/`--pids-limit`/CPU.
**Issue (R4):** none of the cleanup Commands chain `.kill_on_drop(true)` (docker.rs:175,245,263) → orphaned `docker` CLI children under wedged dockerd.
**Fix:** wrap both sweep Commands in `tokio::time::timeout(Duration::from_secs(DOCKER_CLEANUP_TIMEOUT_SECS))` (reuse existing constant); chain `.kill_on_drop(true)` (also closes R4 for these sites); add a one-shot **startup** sweep that force-removes all `oj-*` containers regardless of status (at startup there are no in-flight judgements, so nuking every `oj-*` is safe); move the periodic sweep off the hot loop (`tokio::spawn` or `tokio::select!` with `&mut shutdown`) so a hung sweep cannot block polling/shutdown.
**Exit:** a wedged dockerd cannot freeze the main loop or block shutdown; no `oj-*` container accumulates across a forced restart.

### C4-4 / AGG-10 — Plaintext-decryption fallback default true (MED, re-confirmed)
**Source:** security-reviewer C4-4 · architect AGG-10 · **Validated:** `src/lib/plugins/secrets.ts:61`; `src/lib/security/encryption.ts:99` (core already `false`); `src/lib/email/providers/smtp.ts:54`; `src/lib/security/hcaptcha.ts:23`
**Issue:** encryption core default is already `false` (encryption.ts:99), but `plugins/secrets.ts:61` still defaults `true` and two production read-paths (`smtp.ts:54`, `hcaptcha.ts:23`) pass `{ allowPlaintextFallback: true }` explicitly. A plaintext row planted via SQL/insider access is returned as-is, bypassing AES-256-GCM authentication. No mechanism forces migration to completion.
**Fix:** flip `plugins/secrets.ts:61` default to `false`; drop the explicit `true` at the two call sites (or have them pass it deliberately with a deadline). Pairs with NEW-B (key-version prefix) — do together.
**Exit:** `allowPlaintext` defaults false everywhere; explicit opt-in only.

---

## LOW (defer-or-bundle; see Phase C / backlog)

- **C4-N2** roles PATCH equal-level peer cap-stripping residual (code-reviewer) — strict-`>` gate permits same-level removal of caps the actor lacks. Bounded (no level raise, no cap add). Phase C.
- **C4-N4** SSE terminal-result event sanitized with stale capabilities (code-reviewer) — one final `event: result` under a mid-stream downgrade. Bounded by access re-check. Phase C.
- **C4-6** roles PATCH TOCTOU, no `FOR UPDATE` unlike DELETE (security-reviewer) — narrow concurrent-promotion window. Phase C.
- **C4-7** `resetRecruitingInvitationAccountPassword` clobbers brute-force counter (security-reviewer/tracer H3) — unserialized metadata RMW. Under-count by ~1 on a rare admin action. Phase C.
- **C4-8** executor.rs source file hardcoded `0o666` vs runner `0o600` (security-reviewer/code-reviewer INFO) — consistency nit; workspace dir 0o700 gates traversal. Phase C.
- **C4-9** contest CSV export non-durable audit (security-reviewer/tracer/critic A1-residual) — swap to `recordAuditEventDurable` for parity. Cheap ride-along.
- **F3** `pids_limit` dead if/else both `"128"` (feature-dev) — resolve branch or raise run-phase for VM languages. Phase C.
- **N-C2/C4-6** roles PATCH should take the same row lock as DELETE (critic/architect).
- **A7 page-read residual** `community/threads/[id]/page.tsx:83` still uses sibling helper (critic N-C3).
- **A9** `deploy-docker.sh` per-target env sourcing still deferred (critic un-defer recommendation; CLAUDE.md mandate). Still real at `deploy-docker.sh:119-123,184-187`.
- **Designer P1/P2 batch** AGG-58/59/60/61 + UI-1..UI-14 — zero UI files changed this cycle, all re-confirmed verbatim. Backlog.

## Test-gap cluster (test-engineer; high-ROI, test-only)
- **C4-A6** main.rs `active_tasks.fetch_sub` exactly-once accounting (High) — extract spawn-body tail, assert 0→1→0 on happy + panic paths.
- **A11a / NEW-1** migrate/import 0 snapshot/audit tests (High) — mirror the 4 restore cases; mock scaffolding already exists.
- **C4-N1-test** auth-token lifecycle untested at lib AND route layer (High) — `@/lib/email` token functions + 4 auth routes have zero tests.
- **A11b / NEW-4** docker.rs cleanup-timeout coverage (High) — source-grep contract.
- **C4-A4/A5** SSE re-auth behavioral + recruiting race serialization (Medium) — wiring tests today.
- PB-2/PB-3, GS-1..GS-4, A12e X-Real-IP CI-grep — backlog.

## Doc batch (text-only, no behavior change — bundle into one docs commit)
- **DOC-2/DOC-3** (HIGH prose) — false "full-fidelity = all fields included" / "contains password hashes" claims. Reword to match redaction-actual (becomes true once C4-1 ships snapshot mode).
- **AGG-51** `docs/api.md:78-83` CSRF doc understates the gate (documents only one header; impl enforces three).
- **AGG-52** `AGENTS.md:379` push-scan wording says "downgrades to warn"; code is a hard `die()` abort.
- **C3-D2** `AGENTS.md:407` line cite `544-596` stale → marker description or `:941`.
- **C3-D1** `.env.example` omits 6 security-relevant vars (`TRUSTED_PROXY_HOPS`, `JUDGE_ALLOWED_IPS`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`, `ALLOW_UNSNAPSHOTTED_RESTORE`, `TRUSTED_DOCKER_REGISTRIES`, `JUDGE_PRODUCTION_MODE`).
- **C4-D5/D6** `docs/api.md:1372-1388` settings PUT doc omits password-reconfirm; `:1424-1426` roles PATCH doc omits `cannotEditHigherRole`.
- **NEW-1/2/3** language-preset disk sizes diverge across 3 sources (AGENTS.md `all`~14GB stale vs ~30GB); `GET /problems/:id/export` + `POST /groups/:id/instructors` undocumented.
- **AGG-55** orphaned `min_password_length` column in `schema.pg.ts:591` — dead schema, no writer.

---

## Cross-Agent Agreement (high-signal — flagged by ≥2 agents)

| Topic | Agents | Unified ID | Verdict |
|---|---|---|---|
| Settings reconfirm on wrong path | critic, architect, verifier, security, tracer | ARCH-1 / A8 | **DO this cycle (5-agent convergence)** |
| Snapshot unrestoreable | security, document-specialist, tracer | C4-1 / AGG-2 / DOC-2/3 | **DO this cycle** |
| Judge `/claim` shared-token + IP default-open | security, tracer | C4-2 / NEW-H5 | **DO this cycle (Part 1 + Part 2 opt-in)** |
| Settings reconfirm list incomplete (exam-mode + upload) | security, verifier | C4-3 / N1 | **DO this cycle** |
| Settings PUT partial-wipe | code-reviewer, security (C4-5) | C4-N1 | **DO this cycle** |
| Function-judging int64 precision | feature-dev | F1 | **DO this cycle** |
| Worker cleanup sweep no-timeout / no-startup-reap | debugger (N1+R2+R4), feature-dev (F2) | Worker bundle | **DO this cycle** |
| Roles PATCH TOCTOU (no FOR UPDATE) | security (C4-6), critic (N-C2), tracer (F-roles) | — | Backlog (LOW) |
| Recruiting reset counter clobber | security (C4-7), tracer (H3) | — | Backlog (LOW) |
| CSV audit non-durable | security (C4-9), tracer, critic (A1-residual) | — | Cheap ride-along |

## Items verified FIXED / CLOSED / NON-ISSUES this cycle

- **All 8 cycle-3 fixes** — security-reviewer 8/8 PASS, verifier 11/12 VERIFIED + 1 PARTIAL (settings reconfirm list — promoted to C4-3), debugger 5/5 CONFIRMED, architect A3/A4/A7/A8 CLEAN. No regression.
- **AGG-37** rankings ISR — **CLOSED** (page calls `auth()` → forces dynamic; ISR flag would be a no-op).
- **AGG-56** contrast — **INVALIDATED** (re-confirmed false positive, 6.54:1).
- **AGG-44** rate-limiter overflow — non-issue (re-confirmed `MAX_CONSECUTIVE_BLOCKS_EXP=4`, max `2^4=16`).
- **AGG-43/45** C++ family registry — **closed-by-design** (feature-dev: registry gate is clean end-to-end; users never reach a confusing compile error). Backlog polish if parity desired.
- **NEW-M8** ZIP-bomb fast-path — well-mitigated on the fast path; slow-path (data-descriptor) OOM risk still open in backlog.
- **NEW-M7** recruiting brute-force race — RESOLVED in cycle 3 (atomic UPDATE); residual metadata-clobber tracked (C4-7, LOW).

## Note on Deferrals

Detailed deferral records (file+line, original severity/confidence preserved, reason, exit criterion) are authored in PROMPT 2 under `plan/cycle-4-2026-06-27-review-remediation.md`. Per repo rules (CLAUDE.md, AGENTS.md, .context/**), security/correctness/data-loss findings are NOT silently dropped. The HIGH/MEDIUM items above are scheduled for THIS cycle; the design-heavy deferrals each record a concrete exit criterion and quote the permitting repo rule where applicable (AGENTS.md:438 permits LOW-severity defense-in-depth/observability polish deferral).
