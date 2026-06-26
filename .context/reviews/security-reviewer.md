# Cycle 4 — security-reviewer

**Scope:** Deep re-audit of JudgeKit at HEAD. Regression-checked every cycle‑1/2/3 changed security surface named in the brief; re‑validated the deferred items; hunted net‑new OWASP issues across auth/authz, secrets, judge IPC, restore/export, file upload, and the Rust worker. Validated the new `deploy-docker.sh` DEPLOY_CMD flagged in `CLAUDE.md`.

**Risk Level: MEDIUM** — No CRITICAL, no new SQLi/SSRF/command‑inj/path‑traversal. The two carry‑forward HIGHs (C4‑1 snapshot unrestoreable, C4‑2 judge shared‑token claim + default‑open IP allowlist) remain the only items with concrete, exploitable blast radius. The cycle‑3 fixes (contest JSON audit, SSE re‑auth, settings reconfirm, recruiting FOR UPDATE, Rust chown+0o700) all HOLD on regression — no bypass introduced by the fix. This cycle’s new findings are all MED/LOW gaps *inside* existing controls, not new holes. npm‑audit‑equivalent surface unchanged (0 high/critical per cycle‑3).

## Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 2 | C4‑1 (AGG‑2 snapshot unrestoreable, re‑confirmed), C4‑2 (NEW‑H5 judge shared‑token `/claim` + default‑open allowlist, re‑confirmed — highest impact) |
| Medium | 2 | C4‑3 (settings reconfirm list incomplete — AI/compiler/upload bypass), C4‑4 (AGG‑10 plaintext‑decrypt default true, re‑confirmed) |
| Low | 5 | C4‑5 (settings dead‑reconfirm / un‑persisted keys), C4‑6 (roles PATCH TOCTOU, no FOR UPDATE), C4‑7 (recruiting `resetAccountPassword` unserialized metadata clobber), C4‑8 (executor.rs source file 0o666 inconsistency), C4‑9 (contest CSV export non‑durable audit) |

---

## REGRESSION CHECK — cycle‑1/2/3 changed security surface

| # | Item (brief anchor) | Status | Evidence @ HEAD |
|---|---|---|---|
| 1 | `admin/roles/[id]/route.ts` `cannotEditHigherRole` (removing caps from higher role; lateral strip; `level` interactions) | **HOLDS** — with one new LOW (C4‑6) | `route.ts:94` `if (role.level > creatorLevel) return cannotEditHigherRole` runs *before* any mutation and blocks **all** edits to a strictly‑higher role, so stripping caps from / demoting a higher role is impossible. Lateral same‑level strip is still permitted (`>` is strict) — that is peer behaviour, not a privilege violation. `level` interactions are sound: built‑in level change blocked (:78), `updates.level > creatorLevel` blocked (:84), added‑caps gated against actor set (:102‑109). POST mirrors both gates (`roles/route.ts:65,75`). **Gap:** PATCH reads the role (:59) and writes (:121) with **no transaction / `FOR UPDATE`**, unlike DELETE (:156‑162 `for("update")`); see C4‑6. |
| 2 | `admin/settings/route.ts` password reconfirm (is the privilege‑affecting set COMPLETE?) | **PARTIAL — new MED C4‑3 + LOW C4‑5** | Reconfirm fires for any key in `SENSITIVE_SETTINGS_KEYS` (list :24‑43) and verifies via `verifyAndRehashPassword` (:98‑109). The keys that are actually persisted AND sensitive are correctly gated (platformMode, allowedHosts, hcaptcha*, rate limits, sessionMaxAge). **But** the list is provably incomplete vs the persisted set — see C4‑3 (AI/compiler/uploadMax bypass) and C4‑5 (dead reconfirm for keys that are listed but never persisted). |
| 3 | `contests/[assignmentId]/export/route.ts` JSON audit unconditional | **HOLDS (FIXED)** | `route.ts:117` calls `recordAuditEventDurable(...)` on **every** JSON PII read, outside any `isDownload` gate; comment (:113‑116) documents the recruiter‑panel UI path. Anonymized path also audited; `ipAddresses` blanked when `anonymized` (:109). CSV path still audited (:182) but with non‑durable `recordAuditEvent` → C4‑9 (LOW consistency). No remaining format/branch bypasses the audit. |
| 4 | `submissions/[id]/events/route.ts` SSE re‑auth (`canAccessSubmission`, interval, TOCTOU) | **HOLDS (FIXED)** | `events/route.ts:459` re‑check every 30s; the IIFE (:461‑514) now re‑runs `canAccessSubmission` (:479) on a freshly fetched row, then processes the event — a revoked viewer is closed *before* the next event is emitted, so no “one more event” leak. `lastAuthCheck` initialized at stream start (:398) so the first 30s window has no re‑check (acceptable). The terminal fast‑path (:347‑361) is a single immediate response post‑handshake; no streaming leak. |
| 5 | `recruiting-invitations.ts` metadata tx+FOR UPDATE (deadlock, serialization, other RMW) | **HOLDS — one new LOW C4‑7** | `updateRecruitingInvitation` (:396‑434) takes `SELECT … FOR UPDATE` then merges — serializes against `incrementFailedRedeemAttempt`/`resetFailedRedeemAttempt` (atomic `jsonb_set` row‑lock) and the redeem claim. No multi‑row lock ordering → no deadlock. `sql.raw` keys are compile‑time constants asserted against `INTERNAL_KEY_PATTERN` (:39,55‑60). **Gap:** `resetRecruitingInvitationAccountPassword` (:462‑511) does a read‑modify‑write of `metadata` with NO `FOR UPDATE` and can clobber the brute‑force counter → C4‑7. |
| 6 | `community/{threads,votes}/route.ts` scope helper (any scopeType inlined?) | **HOLDS** | `PROBLEM_LINKED_SCOPES = ["problem","editorial","solution"]` is the single source (`permissions.ts:17`). threads POST routes through `isProblemLinkedScope` + `canAccessProblemScopedThread` (:17‑35); votes POST derives `scopeType`/`problemId` for both thread and post targets then calls the same helper (:65‑89). No inlined scope set remains. |
| 7 | `admin/migrate/import`, `restore`, `backup` consistent hardening | **HOLDS** | All three: `getApiUser` + CSRF (skipped only for `_apiKeyAuth`, no cookies) + `system.backup` cap + `consumeApiRateLimit` + `verifyAndRehashPassword` reconfirm + (import/restore) snapshot‑null abort + `recordAuditEventDurable`. restore (:20‑235), import (:25‑257), backup (:21‑121). Import still carries a deprecated JSON‑body path (:145+) with `Deprecation`/`Sunset` headers (:229,252) and a warn log (:148) — password‑in‑JSON is legacy, not a regression. |
| 8 | `judge-worker-rs` chown+0o700 (TOCTOU chown↔chmod; race with container start) | **HOLDS — one new LOW C4‑8** | `tempfile::TempDir` already creates the dir at 0o700, so the chown→chmod window never exposes a world‑traversable dir. Order is correct in both files: dir chown → dir chmod → **then** write source → source chmod → **then** container start. There is no window where the container or another host process sees an unhardened dir, and no TOCTOU between chmod and container start. runner.rs source file uses 0o600‑on‑chown‑success (:874‑881). **Gap:** executor.rs source file is hardcoded 0o666 (:393‑396) — see C4‑8. |

**Regression verdict: 8/8 hold; the fix did not introduce a bypass on any surface. Five new LOW/MED gaps found *adjacent* to the fixes (C4‑3, C4‑5, C4‑6, C4‑7, C4‑8).**

---

## DEFERRED ITEMS — re‑validation

| Item | Verdict | Evidence @ HEAD |
|---|---|---|
| **NEW‑H5** judge `/claim` shared‑token fallback + default‑open IP allowlist | **STILL OPEN — HIGH (C4‑2)** | `claim/route.ts:176‑180`: when `workerId` is omitted (schema makes it optional, :104‑115), auth falls back to `isJudgeAuthorized` = the **shared** `JUDGE_AUTH_TOKEN`. `buildClaimSql(false)` then claims a real submission and the response (:410‑424) returns `sourceCode` + every `testCase` including `expectedOutput` + `input`. So a holder of the shared token can exfiltrate the full problem suite (solution source + all hidden expected outputs) without registering a worker. `auth.ts:42‑47` claims the shared token is “only honoured on the registration path”, but `isJudgeAuthorized` is in fact wired into claim/poll/deregister/heartbeat. Compounded by `ip-allowlist.ts:164‑166` returning `true` when `JUDGE_ALLOWED_IPS` is unset (default‑open). The shared token is the broadest judge secret (`.env`, `docker-compose.worker.yml`, CI) → leak surface is wide. |
| **C3‑1 / AGG‑2** snapshot full‑fidelity redaction bypass | **STILL OPEN — HIGH (C4‑1)** | `export.ts:104‑106` still applies `EXPORT_ALWAYS_REDACT_COLUMNS` even when `sanitize:false`; `pre-restore-snapshot.ts:84‑86` calls `streamDatabaseExport({ sanitize: false })`. The snapshot therefore loses `users.passwordHash`, `sessions.sessionToken`, `accounts.*_token`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`. Restoring it after a bad import = total lockout + every active session invalidated. (Confirmed: snapshot is the only `sanitize:false` caller besides the password‑gated `backup`/`migrate/export` routes — those are intentional operator downloads.) |
| **AGG‑10** plaintext‑decryption fallback default | **STILL OPEN — MED (C4‑4)** | `plugins/secrets.ts:61` `allowPlaintext = options?.allowPlaintextFallback ?? true`. `decryptPluginConfigForUse` (:162) calls it with no options → default‑open. A plaintext row planted via SQL/insider access is returned as‑is, bypassing AES‑256‑GCM authentication. |
| **NEW‑M8** ZIP‑bomb | **CLOSED / well‑mitigated** | `files/validation.ts`: fast path reads `uncompressedSize` from entry metadata (:73‑88), per‑entry cap 50 MB (:81), total cap + 10 000‑entry cap (:66) all enforced **before** decompression; slow path (:96‑107) decompresses entry‑by‑entry with the same per‑entry cap. `export-with-files.ts` backup path has its own caps (cycle‑3 NEW‑M8). No residual. |
| **NEW‑M9** anti‑cheat Origin fail‑closed | **NARROWED — LOW, unchanged** | `anti-cheat/route.ts:65‑67` missing Origin → 403 (closed). Value compare :70‑78 gated on `expectedHost` non‑null; `env.ts` boot‑throws without `AUTH_URL`, so prod is always non‑null. Residual (curl with a spoofed `Origin`) is a defense‑in‑depth narrow. |
| **SEC‑16/17/20/21** low carry‑forwards | Backlog, no regression | — |

---

## FINDINGS (NEW + RE‑CONFIRMED)

### C4‑1. Pre‑restore snapshot is unrestoreable (AGG‑2 / C3‑1, re‑confirmed HIGH)
**Severity:** HIGH · **Confidence:** HIGH (A08 Integrity Failures / A09 Recovery) · **Status:** confirmed, open since cycle 1
**Location:** `src/lib/db/export.ts:104-106` × `src/lib/db/pre-restore-snapshot.ts:84-86`
**Exploitability:** Operator‑side. Triggered by any restore/migrate‑import that needs rollback.
**Blast radius:** Total user lockout + every active session invalidated if the snapshot is the only recovery path. Single‑instance deployments with no external DB backup are fully dependent on it.
**Issue:** Snapshot is advertised as the operator’s full‑fidelity emergency rollback artifact, but `streamDatabaseExport({ sanitize: false })` still redacts `EXPORT_ALWAYS_REDACT_COLUMNS` (password hashes, session tokens, OAuth tokens, encrypted API‑key material, hCaptcha/SMTP secrets). Restoring it after a bad import yields a DB where nobody can authenticate and all sessions are dead.
**Remediation:**
```ts
// export.ts:72 — add an opt-out for snapshot mode
export function streamDatabaseExport(
  options: { signal?: AbortSignal; sanitize?: boolean; snapshot?: boolean; dbNow?: Date } = {},
) {
  // …
  const activeRedactionMap = options.snapshot
    ? {}                                   // snapshot = true operator rollback artifact
    : options.sanitize
      ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
      : EXPORT_ALWAYS_REDACT_COLUMNS;
}
// pre-restore-snapshot.ts:84 → streamDatabaseExport({ sanitize: false, snapshot: true })
```
Secret‑at‑rest exposure is already covered by `createWriteStream(fullPath, { mode: 0o600 })` + dir `chmod 0o700`.

### C4‑2. Judge `/claim` honours the shared token + IP allowlist is default‑open (NEW‑H5, re‑confirmed HIGH)
**Severity:** HIGH · **Confidence:** HIGH (A01 Broken Access Control / A05 Misconfig) · **Status:** confirmed, open
**Location:** `src/app/api/v1/judge/claim/route.ts:176-180,410-424` × `src/lib/judge/ip-allowlist.ts:160-166`
**Exploitability:** Remote, unauthenticated‑except‑for‑the‑shared‑token. No worker registration required.
**Blast radius:** Full problem‑set theft: a single `POST /api/v1/judge/claim` with `Authorization: Bearer <JUDGE_AUTH_TOKEN>` and **no** `workerId` claims a pending submission and returns the candidate’s `sourceCode` plus every hidden `testCase` (`input` + `expectedOutput`) for that problem (:410‑424). Repeat across the queue to harvest an entire contest/private problem set’s canonical solutions. The shared token is the broadest judge secret — it lives in `.env`, `docker-compose.worker.yml`, CI runners, and every worker host — so the leak surface is far wider than a per‑worker `secretTokenHash`. The default‑open allowlist (`ip-allowlist.ts:164‑166` returns `true` when `JUDGE_ALLOWED_IPS` unset) means there is no network‑layer backstop once the token leaks.
**Issue:** `isJudgeAuthorizedForWorker` correctly killed the shared‑token fallback *when a `workerId` is supplied* (auth.ts:79‑96 — legacy plaintext‑fallback also gone), but the **no‑`workerId`** branch (:176‑180) still accepts the shared token alone, and `claimRequestSchema` makes `workerId` optional (:104‑115). The `auth.ts:42‑47` comment asserting the shared token is “only honoured on the registration path” is contradicted by the claim/poll/deregister/heartbeat wiring.
**Remediation:**
1. Make `workerId` (+ `workerSecret`) **required** on `/claim`, `/poll`, `/deregister`, `/heartbeat` so the shared token is bootstrap‑only (register). Keep `isJudgeAuthorized` only on `/register`.
2. Flip the allowlist default to fail‑closed: `ip-allowlist.ts:164` — when `JUDGE_ALLOWED_IPS` is unset, log a loud startup warning and either deny or require an explicit `JUDGE_ALLOW_ALL_IPS=1`. At minimum, document that unset == open and emit a boot warning.

**Recommended safe implementation — decouple into two independently‑shippable parts (they carry very different revert risk):**
- **Part 1 — SHIP; low revert risk (this is the security fix).** Require `workerId` + `workerSecret` on `/claim`, `/poll`, `/deregister`, `/heartbeat`; the shared `JUDGE_AUTH_TOKEN` becomes `/register`‑only. This alone removes the exfil blast radius — a leaked shared token can no longer claim work or read `sourceCode`/`testCases`. It only breaks clients authenticating with the shared token alone, which is exactly the legacy/unsafe pattern that should re‑register, so revert risk is low.
- **Part 2 — HIGH revert risk; opt‑in hardening, NOT a bare default flip.** `ip‑allowlist.ts:6‑7,16,163` documents `unset == allow‑all` as the backward‑compatible behaviour, so silently flipping the default fail‑closed will break any deployment currently relying on it — the same class of breakage that took down cycle‑2 (`23851d69` / C2‑H7; read that revert and the C2‑H7 deferral before implementing). Safe shape: keep `unset == allow‑all` for back‑compat but emit a loud startup WARN, and add an explicit opt‑in `JUDGE_STRICT_IP_ALLOWLIST=1` (equivalently, fail‑closed only when `JUDGE_ALLOWED_IPS` is set) so operators opt into strictness deliberately.
- **Sequencing:** Part 1 is the security fix and must not be blocked by Part 2. Part 2 is defence‑in‑depth and must not be a blanket behaviour change — land it as config‑gated opt‑in so it cannot repeat the `23851d69` production break.

### C4‑3. Settings reconfirm list is incomplete (AI/compiler/uploadMax bypass)
**Severity:** MEDIUM · **Confidence:** HIGH (A05 Misconfig / A07 Auth Failures) · **Status:** confirmed, new
**Location:** `src/app/api/v1/admin/settings/route.ts:24-43` vs `:143-144` and `allowedConfigKeys :128-129`
**Exploitability:** Remote, authenticated admin with a stolen/leaked session cookie.
**Blast radius:** A stolen admin session can flip `allowAiAssistantInRestrictedModes:true` and `allowStandaloneCompilerInRestrictedModes:true` (persisted :143‑144, but absent from `SENSITIVE_SETTINGS_KEYS`) to re‑enable AI‑assistant / compiler access during restricted/exam mode — directly defeating the exam‑integrity trust boundary the reconfirm control exists to protect — and raise `uploadMaxImageSizeBytes` / `uploadMaxFileSizeBytes` / `uploadMaxZipDecompressedSizeBytes` (allowlist :128‑129) to widen the upload DoS / storage‑exhaustion ceiling, all without re‑verifying the password.
**Issue:** The reconfirm gate’s own header comment (:17‑23) says it exists “so a stolen session cookie cannot silently weaken the platform.” The exam‑integrity knobs and upload ceilings are exactly such posture changes, yet they are destructured straight into `baseValues` and never pass through `SENSITIVE_SETTINGS_KEYS`.
**Remediation:** Add to `SENSITIVE_SETTINGS_KEYS`: `allowAiAssistantInRestrictedModes`, `allowStandaloneCompilerInRestrictedModes`, `aiAssistantEnabled`, `uploadMaxImageSizeBytes`, `uploadMaxFileSizeBytes`, `uploadMaxImageDimension`, `uploadMaxZipDecompressedSizeBytes`.

### C4‑4. Plaintext‑decryption fallback default true (AGG‑10, re‑confirmed MED)
**Severity:** MEDIUM · **Confidence:** HIGH (A02 Cryptographic Failures) · **Status:** confirmed, open since cycle 1
**Location:** `src/lib/plugins/secrets.ts:61`
**Exploitability:** Requires write access to the `plugins` table (insider / SQL‑level).
**Blast radius:** A row planted in plaintext is returned verbatim by `decryptPluginSecret` (called default‑open from `decryptPluginConfigForUse` :162), silently bypassing AES‑256‑GCM authentication.
**Remediation:** Flip the default to `false`; have genuine migration call sites pass `{ allowPlaintextFallback: true }` explicitly with a deadline; add a startup pass that re‑encrypts any plaintext rows.

---

### LOW findings

#### C4‑5. Several `SENSITIVE_SETTINGS_KEYS` are never persisted (dead reconfirm / functional bug)
**Severity:** LOW · **Confidence:** HIGH (A05) · `src/app/api/v1/admin/settings/route.ts:28,32-34` × destructors `:71-87` × allowlist `:118-130`
**Issue:** `emailVerificationRequired`, `communityUpvoteEnabled`, `communityDownvoteEnabled`, and `smtpPass` are listed in `SENSITIVE_SETTINGS_KEYS` (so their presence in the body *triggers* reconfirm and returns 200) but they are **neither destructured nor in `allowedConfigKeys`**, so `restConfig` filtering drops them — they are never written. An admin who toggles “require email verification” is silently ignored; SMTP password cannot be set via this route at all. The reconfirm UX is misleading.
**Fix:** Either destructure + persist these (for `smtpPass`, also `encrypt()` like `hcaptchaSecret` :148) or remove them from `SENSITIVE_SETTINGS_KEYS` and surface a “not settable here” error.

#### C4‑6. roles PATCH has a TOCTOU window (no `FOR UPDATE`, unlike DELETE)
**Severity:** LOW · **Confidence:** MEDIUM (A01) · `src/app/api/v1/admin/roles/[id]/route.ts:59-63` (read) × `:121-124` (write)
**Issue:** DELETE locks the row inside `execTransaction(... for("update"))` (:156‑162); PATCH does not — it reads the role (:59), checks `role.level > creatorLevel` (:94), then writes (:121) with no transaction. If a super_admin raises the role’s level in the window between a lower admin’s read and write, the lower admin’s edit (e.g. capability strip) applies to a now‑higher role. Exploitation needs a precisely‑timed concurrent promotion by a higher admin, so impact is low, but the asymmetry with DELETE is a real gap.
**Fix:** Wrap PATCH’s read+check+update in `execTransaction` with `.for("update")`, mirroring DELETE.

#### C4‑7. `resetRecruitingInvitationAccountPassword` clobbers the brute‑force counter (unserialized metadata RMW)
**Severity:** LOW · **Confidence:** MEDIUM (A01/A07) · `src/lib/assignments/recruiting-invitations.ts:463` (read) × `:503-509` (write)
**Issue:** `updateRecruitingInvitation` correctly merges metadata under `SELECT … FOR UPDATE` (:396‑434) to serialize against the atomic `jsonb_set` counter increments. But `resetRecruitingInvitationAccountPassword` reads metadata outside the tx (`getRecruitingInvitation` :463) then writes the whole object (:503‑509) with **no `FOR UPDATE`**. A concurrent `incrementFailedRedeemAttempt` (fired on the re‑entry wrong‑password path :646, which is reachable while `status==='redeemed'`) that commits in that window has its increment overwritten by the stale snapshot — partially defeating the per‑invitation lockout. Requires an admin password‑reset racing a live brute‑force on the same token.
**Fix:** Do the metadata read+write inside a `FOR UPDATE` tx, or merge via `jsonb_set` so only the reset key is touched and the counter survives.

#### C4‑8. executor.rs source file is hardcoded 0o666 (inconsistent with runner.rs 0o600)
**Severity:** LOW · **Confidence:** HIGH (A05) · `judge-worker-rs/src/executor.rs:393-396` × `runner.rs:874-881`
**Issue:** runner.rs mirrors the workspace hardening onto the source file (chown 65534 → 0o600 on success, 0o666 only on chown failure). executor.rs unconditionally `set_permissions(0o666)` on the source file (:393‑396) — the test at `runner.rs:210` asserts the 0o600 contract that executor.rs violates. In production (worker root + CAP_CHOWN) the 0o700 dir gates traversal so the 0o666 source is only reachable by 65534/root, but in the **chown‑fail fallback** (rootless dev) the dir is 0o777 *and* the source is 0o666, so any local user can read in‑flight source/compile artifacts. No TOCTOU (order is correct); this is purely the weaker source‑file mode.
**Fix:** Mirror runner.rs in executor.rs: `chown(source,65534,65534)`; `mode = chown_ok ? 0o600 : 0o666`.

#### C4‑9. Contest CSV export uses non‑durable audit (JSON path is durable)
**Severity:** LOW · **Confidence:** HIGH (A09) · `src/app/api/v1/contests/[assignmentId]/export/route.ts:182` vs `:117`
**Issue:** The JSON export path was correctly switched to `recordAuditEventDurable` (:117, C3‑2 fix). The CSV path still calls the buffered `recordAuditEvent` (:182). A SIGKILL/OOM in the 5 s flush window can drop the CSV download audit row — the same loss the durable helper was introduced to prevent for the JSON path. Both paths export the same PII.
**Fix:** Switch the CSV audit to `recordAuditEventDurable` for parity.

---

## NET‑NEW HUNT (negative results — clean)

| Category | Coverage | Result |
|---|---|---|
| **SSRF** | Every `fetch(\`…\`)` site: `code-similarity-client.ts:45`, `docker/client.ts:182,222`, `rate-limiter-client.ts:72`, `compiler/execute.ts:550` | **CLEAN.** All URLs interpolate only server env vars (`CODE_SIMILARITY_URL`, `JUDGE_WORKER_URL`, `RATE_LIMITER_URL`, `COMPILER_RUNNER_URL`). No user‑controlled outbound URL. |
| **Mass assignment** | `Object.assign(...body)` / `...body` / `...req` across `src/app/api` | **CLEAN.** Only chat‑widget `[...body.messages]` (already‑validated) and a languages audit `details` spread. settings PUT uses an explicit `allowedConfigKeys` allowlist; roles/api‑keys/languages build explicit update objects. |
| **Secrets in logs** | `console.*` with secret‑like names; pino `LOGGER_REDACT_PATHS` | **CLEAN.** No `console.{log,error,warn,info}` touching password/secret/token vars in `src`. Pino redaction (`logger.ts:13` ← `secrets.ts:48 LOGGER_REDACT_PATHS`) covers authorization, password*, *token, encryptedKey, hcaptchaSecret, smtpPass, runnerAuthToken. |
| **SQL injection** | `sql.raw` consumers; `rawQuery*` parameterization | **CLEAN.** recruiting `sql.raw` is a module‑constant JSONB key asserted against `INTERNAL_KEY_PATTERN` (:39). export `sql.raw` is a transaction‑mode literal. `rawQueryAll/One` use `@param` binding. |
| **Judge IPC auth** | `/claim`, `/poll`, `/register`, `/deregister`, `/heartbeat` | **CLEAN per‑worker** (timing‑safe `hashToken` compare, plaintext fallback removed) — **except** the shared‑token `/claim` path (C4‑2). |

---

## deploy‑docker.sh DEPLOY_CMD safety (flagged in CLAUDE.md)

**Verdict: SAFE — no concern with the documented invocation.**

The CLAUDE.md invocation for the app server — `SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false ./deploy-docker.sh` — is honoured exactly:
- `SKIP_LANGUAGES` default `false` (:184), `INCLUDE_WORKER` default `true` (:186), `BUILD_WORKER_IMAGE` default `auto` → follows `INCLUDE_WORKER` (:227‑228). So `INCLUDE_WORKER=false` ⇒ worker image build skipped (:746‑752) and app‑only compose override generated (:820‑821). `SKIP_LANGUAGES=true` ⇒ language‑image build skipped (:765).
- The destructive‑op guard the CLAUDE.md warns about (`docker system prune --volumes`) is **not** present. The post‑deploy cleanup (`prune_old_docker_artifacts` :387‑409) uses `container prune -f`, `image prune -f` (dangling only, **not** `-af` for images that matter), `builder prune -af`, and `volume prune -f` — and the volume prune is **gated on `judgekit-db` running** (:402‑406) with an explicit CLAUDE.md‑referencing skip+warn when it is not. `volume prune -f` without `--all` removes only anonymous unused volumes, so the DB’s named volume is safe while the DB container references it. Opt‑out via `SKIP_POST_DEPLOY_PRUNE=1` (:390).
- No `rm -rf` touches data volumes; the one `rm -rf` (:282) targets the SSH control‑socket dir only.

---

## FINAL SWEEP — OWASP coverage

- **A01 Broken Access Control** — roles level/cap gates hold (C4‑6 TOCTOU residual); community scope centralized; judge per‑worker auth solid; **C4‑2 shared‑token `/claim` is the standout A01 issue**.
- **A02 Cryptographic Failures** — AES‑256‑GCM + HKDF sound; **AGG‑10 plaintext default still open (C4‑4)**; env 0600 + boot guard hold.
- **A03 Injection** — 0 SQLi / command‑inj / SSRF. Prompt‑injection sanitization unchanged from cycle 3.
- **A04 Insecure Design** — **C4‑3 settings reconfirm gap**; C4‑5 dead reconfirm; C4‑7 counter‑clobber race.
- **A05 Security Misconfiguration** — **default‑open judge IP allowlist (C4‑2)**; C4‑8 executor source mode; deploy script clean.
- **A07 Auth Failures** — recruiting brute‑force counter solid except C4‑7; reconfirm gates solid except C4‑3.
- **A08 Integrity / A09 Recovery/Logging** — **C4‑1 snapshot unrestoreable (HIGH)**; C4‑9 CSV audit non‑durable; restore/import durable‑audit + snapshot‑abort hold.

**Remediation priority:**
1. **Urgent (<1wk):** C4‑2 make `workerId` required on `/claim` (+poll/deregister/heartbeat) and flip the allowlist default to fail‑closed; C4‑1 add `snapshot:true` mode (one‑line + call‑site).
2. **Important (<2wk):** C4‑3 extend `SENSITIVE_SETTINGS_KEYS`; C4‑4 flip plaintext default to `false`.
3. **Planned (<1mo):** C4‑5..C4‑9 LOW batch.

## Security Checklist
- [x] No hardcoded secrets (env 0600; placeholders used only for equality‑rejection)
- [x] Inputs validated (Zod at API boundary)
- [x] Injection prevention verified (Drizzle parameterized; `sql.raw` only const/literal)
- [x] Auth/authz verified on changed surface (8/8 regression items hold; C4‑2/C4‑3/C4‑6 residuals)
- [ ] Recovery path verified (C4‑1 snapshot unrestoreable — HIGH)
- [ ] Judge trust boundary closed (C4‑2 shared‑token `/claim` + default‑open allowlist — HIGH)
