# Cycle 4 — document-specialist

Repo: `/Users/hletrd/flash-shared/judgekit` · Head: `0b0ac198` · Scope: (a) regression-check docs against the cycle-3 code fixes (A1/A2/A4/A5/A8 + the deferred A9); (b) close the deferred text-only doc items (AGG-51, AGG-52, C3-D2, C3-D1, DOC-2, DOC-3); (c) net-new doc drift. External-library currency re-verified.

Read-only review. Every cited line was read at HEAD `0b0ac198`.

---

## (a) REGRESSION CHECK — cycle-3 code changes vs docs

The cycle-3 code fixes all landed and are correct. The doc question is whether any doc *describes* the changed behavior inaccurately. Result: **no false narrative regressed**, but the cycle-3 fixes are almost entirely **undocumented** (net-new gaps — see §c). Detail:

| Cycle-3 fix | Code verified at HEAD | Doc status |
|---|---|---|
| **A8** settings PUT password-reconfirm | `src/app/api/v1/admin/settings/route.ts:24-31` (`SENSITIVE_SETTINGS_KEYS`), `:89-110` (`touchesSensitiveKey` → `verifyAndRehashPassword`) | **Undocumented.** `docs/api.md:1372-1388` describes the PUT with only cosmetic fields and no `currentPassword` / privilege-affecting note. See **C4-D5**. |
| **A2** roles PATCH `cannotEditHigherRole` | `src/app/api/v1/admin/roles/[id]/route.ts:94-95` (`if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403)`) | **Undocumented.** `docs/api.md:1424-1426` says only "Cannot reduce `super_admin` capabilities or change built-in role levels." See **C4-D6**. |
| **A1** contest export JSON audit (all PII reads) | `src/app/api/v1/contests/[assignmentId]/export/route.ts:117-125` (`recordAuditEventDurable` on the JSON branch, outside `isDownload`) | No doc describes this audit at all (grep for `contest.export_downloaded` / `download-only` in `docs/` → 0 hits). No stale "download-only" narrative to regress. Minor gap, not a mismatch. |
| **A4** worker `catch_unwind` | `judge-worker-rs/src/main.rs:571-577` (`AssertUnwindSafe(exec_fut).catch_unwind().await` → `runtime_error`) | Worker docs (`docs/judge-workers.md`, `docs/judge-worker-gvisor.md`) never described panic recovery, so nothing regressed. Not a doc-mismatch lane. |
| **A5** runner.rs chown+0o700 | `judge-worker-rs/src/runner.rs:833+` (chown 65534, `0o700`/`0o600` on success) | Same — never documented; no regression. |
| **A9** per-target env sourcing | **DEFERRED** (cycle-3 progress log: "DEFERRED … Exit: next cycle") | `deploy-docker.sh:184,186-187` still defaults `SKIP_LANGUAGES=false`, `INCLUDE_WORKER=true`, `BUILD_WORKER_IMAGE=auto`. CLAUDE.md's app-server rule (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`) is accurate as a manual requirement — the script just does not yet default to it per-target. **No doc mismatch**; the deferral is tracked in the cycle-3 plan. |

**No cycle-1/2 doc regression recurred.** The cycle-2 fixes re-verified clean in cycle 3 remain clean (validation.rs docstring, AGENTS.md env-perms, chat-widget tools.ts comment, restore audit summary, import skip-truncate, ip.ts comments).

---

## (b) DEFERRED DOC ITEMS — closing the text-only backlog (PRIORITY)

These are the cycle-3 A12 batch deferrals. All re-confirmed real at HEAD; none have been fixed.

### AGG-51 / C2-D3 — CSRF doc understates the gate (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md:78-83` — *"Mutation methods … require the custom header `X-Requested-With: XMLHttpRequest` … This is the API-route CSRF guard."* Lists only the one header. The `validateCsrf` docstring at `src/lib/security/csrf.ts:19-29` makes the same single-header claim.
- **Code:** `src/lib/security/csrf.ts:40-71` enforces **three** checks: (1) `X-Requested-With: XMLHttpRequest` (L40-45), (2) `Sec-Fetch-Site` ∈ {same-origin, same-site, none} else 403 (L47-54), (3) `Origin.host === expectedHost` with protocol validation (L56-71, production refuses header fallback via L13).
- **Mismatch:** The Origin/Host and Sec-Fetch-Site enforcement — the parts that actually defeat cross-origin attacks beyond naïve form posts — is undocumented.
- **Fix:** Extend `docs/api.md:78-83` and the `csrf.ts:19-29` docstring to document all three checks. (Text-only.)

### AGG-52 / C2-D4 — AGENTS.md push-scan wording contradicts `die()` (MEDIUM) · CONFIDENCE: High
- **Doc:** `AGENTS.md:379` — *"…captures push output, scans for the data-loss prompt markers, and **downgrades the success log to a warn**."* Example block at `AGENTS.md:383` shows `[WARN] drizzle-kit push detected a destructive schema change but did NOT apply it …`.
- **Code:** `deploy-docker.sh:1078-1079` — `if grep -qiE "data loss|are you sure|warning:.*destructive|please confirm" <<<"$PUSH_OUT"; then die "drizzle-kit push detected a destructive schema change but did NOT apply it …"`. `die` exits 1 — **the deploy aborts**, it does not warn-and-continue.
- **Mismatch:** Doc says non-fatal warn; code is a hard deploy abort.
- **Fix:** Reword `AGENTS.md:379` to *"…and aborts the deploy (`die`) so the operator must explicitly opt in via `DRIZZLE_PUSH_FORCE=1`."* Replace the `[WARN]` example at L383 with the actual `die` message. (Text-only.)

### C3-D2 — AGENTS.md:407 line citation stale by ~400 lines (LOW) · CONFIDENCE: High
- **Doc:** `AGENTS.md:407` — *"delete the Step 5b block from `deploy-docker.sh` (lines around 544-596)"*.
- **Code:** `deploy-docker.sh:941` — `# Step 5b: Pre-drop secret_token backfill (idempotent, MUST run before push)`. The 544-596 range is the unrelated `.env.production` generation block.
- **Mismatch:** Brittle line-range cite rotted; an operator following it would delete the wrong block.
- **Fix:** Replace the line range with the marker description (*"the `# Step 5b: Pre-drop secret_token backfill` block"*) or update to `deploy-docker.sh:941`. (Text-only.) Audited all other AGENTS.md references to `deploy-docker.sh` (L304/394/428/432/435/582) — they are prose, no other stale line cites.

### C3-D1 — `.env.example` omits 6 security-relevant env vars (LOW) · CONFIDENCE: High
- **Doc:** `.env.example` (171 lines) has no entry for any of the six. `.env.production.example` covers only `TRUSTED_DOCKER_REGISTRIES` (L54, commented) and omits the other five.
- **Code (consumers verified at HEAD):**
  - `TRUSTED_PROXY_HOPS` — `src/lib/security/ip.ts:12` (the XFF/X-Real-IP trust model; `0` = no trusted proxies). **Security-critical.**
  - `JUDGE_ALLOWED_IPS` — `src/lib/judge/ip-allowlist.ts:14` + `src/lib/security/production-config.ts:48` (the `/judge/claim` IP allowlist). **Security-critical.**
  - `SANDBOX_ALLOW_UNVERIFIED_EMAIL` — `src/lib/security/sandbox-gate.ts:13` (gates whether unverified-email accounts can run code). **Security-critical.**
  - `ALLOW_UNSNAPSHOTTED_RESTORE` — `src/app/api/v1/admin/restore/route.ts:156` (break-glass for the snapshot-null gate).
  - `TRUSTED_DOCKER_REGISTRIES` — `judge-worker-rs/src/validation.rs:69`.
  - `JUDGE_PRODUCTION_MODE` — `judge-worker-rs/src/validation.rs:79`.
- **Fix:** Add commented stub entries to `.env.example` (and the missing five to `.env.production.example`) with the `0`/unset semantics explained — especially `TRUSTED_PROXY_HOPS` (`0` = no trusted proxies / ignore XFF), `JUDGE_ALLOWED_IPS`, `SANDBOX_ALLOW_UNVERIFIED_EMAIL`. (Text-only.)

### DOC-2 — "full-fidelity = all fields included" is false (HIGH — privacy) · CONFIDENCE: High
- **Doc:**
  - `docs/data-retention-policy.md:48` — *"**Full-fidelity** (`?full=true`) — all fields included."*
  - `docs/admin-security-operations.md:65` — *"backup artifacts that include full-fidelity secrets"* (implies the artifacts contain secrets — they do not).
- **Code:** `src/lib/db/export.ts:104-106` — `activeRedactionMap = options.sanitize ? mergeRedactionMaps(...) : EXPORT_ALWAYS_REDACT_COLUMNS`. Even at `sanitize:false` the always-redact set is applied (redacted to `null` at L140). Per cycle-3 review the always-redact set spans `users.passwordHash`, `sessions.sessionToken`, `accounts.{refresh_token,access_token,id_token}`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`.
- **Mismatch:** "All fields included" is false; the most sensitive fields are stripped from every export and every backup (the backup route uses the same `streamDatabaseExport`). The `"redactionMode": "full-fidelity"` JSON label emitted at `export.ts:100` is internally consistent with the code — the misleading claim is the *prose* "all fields included" / "include full-fidelity secrets".
- **Severity / coupling:** **HIGH** but coupled to the C3-1 / AGG-2 snapshot-redaction design defer (the snapshot must become faithfully restoreable). The *prose* fix is independent text-only work and should not wait on the design decision.
- **Fix:** Reword `data-retention-policy.md:48` to: *"Full-fidelity (`?full=true`) — includes all data EXCEPT a small always-redacted secret set (password hashes, session/OAuth tokens, API-key ciphertext, SMTP/hCaptcha secrets). Suitable for DR restores of user/problem data; NOT a bit-for-bit DB image."* Reword `admin-security-operations.md:65` to drop "include full-fidelity secrets" (the artifacts exclude those secrets by construction).

### DOC-3 — pre-restore snapshot comment claims it contains password hashes / JWT secrets; it does not (HIGH) · CONFIDENCE: High
- **Doc:** `src/lib/db/pre-restore-snapshot.ts:34-39` — *"The snapshot is full-fidelity (sanitize=false) … Because it contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form, the file is created with mode 0o600 …"*.
- **Code:** `pre-restore-snapshot.ts:84-86` calls `streamDatabaseExport({ sanitize: false })`. Per `export.ts:104-106` (above), `sanitize:false` still strips `passwordHash` and `sessionToken`. The snapshot therefore does **NOT** contain password hashes or JWT session tokens.
- **Mismatch:** The comment makes a load-bearing claim about the rollback artifact that is false. An operator who restores from this snapshot loses every user's password and every active session — contradicting the documented "emergency rollback" purpose. The `0o600` rationale ("because it contains password hashes…") is also wrong as written (it still contains *other* sensitive data — encrypted column ciphertexts that are not in the always-redact set — so the mode is still justified, just not for the stated reason).
- **Severity / coupling:** **HIGH**, coupled to C3-1 / AGG-2 (same as DOC-2). Whichever design wins, the comment must follow. If redaction stays (the current reality), fix the comment to: *"excludes the always-redacted secret set (same as a full-fidelity export) — restoring will require a password reset for all users; pair with the encrypted backup pipeline for a complete rollback."*
- **Fix:** Text-only if redaction stays; code fix (mode:"snapshot" bypass) if the contract should be honored. Leaving the comment as-is is the worst option.

---

## (c) NET-NEW DOC ISSUES

### C4-D5 — `PUT /api/v1/admin/settings` doc omits the password-reconfirm gate + privilege-affecting fields (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md:1372-1388` — request body lists only `siteTitle`, `siteDescription`, `timeZone`, `aiAssistantEnabled`, `allowedHosts`; no mention of `currentPassword` or privilege-affecting keys.
- **Code:** `src/app/api/v1/admin/settings/route.ts:24-31` defines `SENSITIVE_SETTINGS_KEYS = ["platformMode", "allowedHosts", "signupHcaptchaEnabled", "publicSignupEnabled", "loginRateLimitMaxAttempts", "apiRateLimitMax", "submissionMaxPending", "hcaptchaSecret"]`; `:89-110` requires `currentPassword` (verified via `verifyAndRehashPassword`) when any sensitive key is present, else 401.
- **Mismatch:** An integrator automating settings updates would not know to send `currentPassword` for privilege-affecting changes, nor which fields trigger the gate.
- **Fix:** Document the `currentPassword` field and the privilege-affecting key set; note cosmetic-only edits (`defaultLanguage`, branding) remain editable without re-confirm.

### C4-D6 — `PATCH /api/v1/admin/roles/:id` doc omits the `cannotEditHigherRole` gate (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md:1424-1426` — *"Update a role. Cannot reduce `super_admin` capabilities or change built-in role levels."*
- **Code:** `src/app/api/v1/admin/roles/[id]/route.ts:94-95` — `if (role.level > creatorLevel) return apiError("cannotEditHigherRole", 403)`. A lower-level admin cannot edit a role whose *current* level exceeds their own (distinct from the existing `updates.level ≤ creatorLevel` target check at L84).
- **Mismatch:** The lateral cap-stripping gate (cycle-3 A2) is undocumented.
- **Fix:** Add to the PATCH doc: *"Returns 403 `cannotEditHigherRole` if the role's current level exceeds the actor's."*

### NEW-1 — Language-preset disk sizes inconsistent across three sources; AGENTS.md `all` is stale (MEDIUM) · CONFIDENCE: High
- **Doc A:** `AGENTS.md:375` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~14 GB)`.
- **Doc B:** `docs/languages.md:216-220` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~30 GB), everything (~35 GB)`.
- **Code (empirical):** `deploy-docker.sh:211-214` (`--help`) — `core (~1.2 GB), popular (~4 GB), extended (~12 GB), all (~30 GB)`.
- **Mismatch:** Three-way divergence. `all` is the clearest fault line: AGENTS.md says ~14 GB while both other sources say ~30 GB — AGENTS.md:375 is definitively stale. The `core`/`popular`/`extended` figures also differ between deploy-docker.sh and the two docs.
- **Fix:** Reconcile to one source of truth (the deploy script's measured figures are most empirical); at minimum fix AGENTS.md `all` → ~30 GB.

### NEW-2 — `GET /api/v1/problems/:id/export` endpoint is undocumented (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md` — grep for `problems/:id/export` → 0 hits.
- **Code:** `src/app/api/v1/problems/[id]/export/route.ts` exists (SELECTs `problemType`/`functionSpec`/`referenceSolution`; strict `canManageProblem` gate per cycle-1 A9).
- **Fix:** Add a subsection documenting the endpoint and its `canManageProblem` gate.

### NEW-3 — `POST /api/v1/groups/:id/instructors` endpoint is undocumented (MEDIUM) · CONFIDENCE: High
- **Doc:** `docs/api.md` — grep for `instructors` → 0 hits.
- **Code:** `src/app/api/v1/groups/[id]/instructors/route.ts` exists (cycle-1 A4-hardened: student-target rejection).
- **Fix:** Document the endpoint and the allowed target roles.

---

## EXTERNAL LIBRARY / API CURRENCY

Re-verified at HEAD (no drift from cycle 3). All versions match the user "latest stable" rule.

| Dependency | Repo version | Verdict |
|---|---|---|
| `next` | `^16.2.9` | Current (Next.js 16 line). |
| `react` | `19.2.5` | Current. |
| `next-auth` | `5.0.0-beta.31` | Current for the v5 beta line; standard v5 imports, no v4 patterns. |
| `drizzle-orm` | `0.45.2` | Current (latest published). |
| `drizzle-kit` | `^0.31.9` | Current. |
| `argon2` | `^0.44.0` | Current. |
| `vitest` | `^4.1.5` | Current. |
| `@playwright/test` | `^1.59.1` | Current. |
| `typescript` | `5.9.3` | Current. |

Next.js 16 async-API compliance (cycle-3 finding) still clean: no sync `params`/`searchParams` destructures, no sync `headers()`/`cookies()` in pages. No deprecated/removed SDK usage. No external-library findings this cycle.

---

## FINAL SWEEP (clean / re-confirmed)

- `docs/privacy-retention.md` retention windows still match `src/lib/data-retention.ts` defaults (audit 90d, AI chat 1825d, anti-cheat 180d, recruiting 365d, submissions 365d).
- `docs/judge-worker-gvisor.md` gVisor status ("disabled by default", `JUDGE_OCI_RUNTIME → --runtime=runsc`) still matches `.env.example:133`.
- `SECURITY.md` on-disk artefact path/mode (`0o700`/`0o600`) matches `pre-restore-snapshot.ts:67,89`. SECURITY.md does **not** repeat the false "contains password hashes" claim — that lives only in the code comment (DOC-3).
- `CLAUDE.md` deploy flags (`SKIP_LANGUAGES`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`) all present in `deploy-docker.sh:23,25,28` and honored at `:184-187`. Consistent.
- `README.md` tech badges (Next.js 16, TypeScript 5.9, PostgreSQL + Drizzle) match `package.json`.
- api.md backup/restore sections (`POST /admin/backup` L1714, `POST /admin/restore` L1755) accurately document the cycle-2 password-reconfirm + ZIP manifest behavior. The `redactionMode: "full-fidelity"` example at L1750 is the literal JSON label (internally consistent) — folded into DOC-2 only where the *prose* overclaims.

---

## PRIORITY ORDER FOR THE NEXT CYCLE (doc lane)

1. **DOC-3 (HIGH, coupled to C3-1)** — fix `pre-restore-snapshot.ts:34-39` comment to match redaction-actual behavior (text-only if redaction stays).
2. **DOC-2 (HIGH, coupled to C3-1)** — correct every "full-fidelity = all fields included" / "include full-fidelity secrets" claim (`docs/data-retention-policy.md:48`, `docs/admin-security-operations.md:65`).
3. **AGG-51 / AGG-52 (MEDIUM, text-only)** — document the full CSRF gate; align the push-scan narrative with `die`.
4. **C4-D5 / C4-D6 (MEDIUM, text-only)** — document the settings PUT password-reconfirm gate and the roles PATCH `cannotEditHigherRole` gate (cycle-3 fixes that shipped undocumented).
5. **NEW-1 (MEDIUM)** — reconcile the three language-size tables; AGENTS.md `all` → ~30 GB at minimum.
6. **NEW-2 / NEW-3 (MEDIUM)** — document the two undocumented endpoints.
7. **C3-D1 / C3-D2 (LOW, text-only)** — `.env.example` stubs for 6 security vars; AGENTS.md:407 line cite → marker description or `:941`.

All priority-1-through-3 items are text-only and can land in a single small commit batch without touching behavior.
