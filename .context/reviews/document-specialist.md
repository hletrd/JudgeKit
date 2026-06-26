# Cycle 3 — document-specialist

Repo: `/Users/hletrd/flash-shared/judgekit` · Head: `207623f9` · Scope: doc/code mismatch verification of cycle-2 fixes (regression), carry-over Phase B doc items (AGG-51..55, DOC-2/3, NEW-1..3, LOW-1/3), and external-library/API currency (Next.js 16, next-auth v5, drizzle-orm 0.45, argon2, vitest, playwright).

Read-only review. Every cited line was read at HEAD.

---

## REGRESSION CHECK — cycle-2 doc fixes verified

| ID | Status | Verification |
|---|---|---|
| **C2-D1 / AGG-53** validation.rs docstring | **FIXED** | `judge-worker-rs/src/validation.rs:84-95` now reads: *"Production behavior (`JUDGE_PRODUCTION_MODE=1`): requires a NON-empty trusted-registry list. When that list is set, unqualified local `judge-*` images are still accepted…"* — matches code at L29-30 (`!hasRegistryPrefix { return segments.len() == 1; }`) + L60 (`is_production && trusted_prefixes.is_empty() → false`). The prior false wording ("rejects images without a trusted registry prefix") is explicitly called out as inaccurate. Commit `07bab8dd`. |
| **C2-D2 / REG-2** AGENTS.md env-perms | **FIXED** | `AGENTS.md:427` now states 0600 was extended to **all `.env*`** files (commit `40250e63`) and documents the production startup guard `assertLoadedEnvFilePermissions`. Verified against `src/lib/security/env.ts:182-211` (throws in production when group/other bits set, `chmod 600` remediation hint). Accurate. |
| **A14d / C2-L4** chat-widget tools.ts comment | **FIXED** | `src/lib/plugins/chat-widget/tools.ts:68-74` rewritten: *"Each case below coerces the fields it uses and re-scopes every DB lookup to `context.userId`… Adding per-tool Zod schemas on top of this scoping is tracked as defense-in-depth."* No false Zod claim. Matches the manual-coercion code in each `case`. |
| **A7** restore audit summary | **FIXED** | `src/app/api/v1/admin/restore/route.ts:216-218` summary is now past-tense (*"Restored from ZIP backup…"*); the durable audit at L209 fires AFTER `restoreParsedBackupFiles` (L180); file-restore failure gets its own durable audit (L183-196). Comments at L204-208 accurate. |
| **A1** import skip-truncate | **FIXED** | `src/lib/db/import.ts:137-153` comment ("only truncate tables that are PRESENT in the incoming export") matches the `if (!data.tables[tableName]) { … continue; }` guard. |
| **A8 revert** ip.ts comments | **CLEAN** | `src/lib/security/ip.ts:113` comment (*"Only trust X-Real-IP when XFF is absent"*) matches the reverted behavior. C2-H7 (X-Real-IP trusted at hops=0) is a deferred *security* item, not a doc mismatch — the comments describe the code as it actually runs. |

No new doc regressions introduced by the cycle-2 commits.

---

## STILL VALID — deferred from cycle 2 (re-confirmed at HEAD)

### AGG-51 / C2-D3 — docs/api.md CSRF section understates the gate (MEDIUM)
- **Confidence:** High
- **Doc:** `docs/api.md:78-83` — *"Mutation methods (`POST`, `PUT`, `PATCH`, `DELETE`) require the custom header `X-Requested-With: XMLHttpRequest`… This is the API-route CSRF guard."* (Lists only the one header.) Same in the `validateCsrf` docstring at `src/lib/security/csrf.ts:19-29`.
- **Code:** `src/lib/security/csrf.ts:36-71` — the impl enforces **three** checks: (1) `X-Requested-With: XMLHttpRequest` (L40-45), (2) `Sec-Fetch-Site` ∈ {same-origin, same-site, none} else reject (L47-54), (3) `Origin.host === expectedHost` with protocol validation (L56-71).
- **Mismatch:** The doc claims only the custom-header check; the Origin/Host and Sec-Fetch-Site enforcement (the parts that actually stop cross-origin attacks beyond naïve form posts) is undocumented. Plan A15c deferred this.
- **Fix:** Extend the CSRF section to document all three checks; update the docstring at csrf.ts:19-29 likewise.

### AGG-52 / C2-D4 — AGENTS.md push-scan wording contradicts `die()` (MEDIUM)
- **Confidence:** High
- **Doc:** `AGENTS.md:379` — *"the script captures push output, scans for the data-loss prompt markers, and downgrades the success log to a warn."* The example block at L383 shows `[WARN] drizzle-kit push detected a destructive schema change but did NOT apply it …`
- **Code:** `deploy-docker.sh:1078-1079` — `if grep -qiE "data loss|are you sure|warning:.*destructive|please confirm" <<<"$PUSH_OUT"; then die "drizzle-kit push detected a destructive schema change but did NOT apply it…"` — `die` exits 1 (**aborts the deploy**), it does not warn-and-continue.
- **Mismatch:** Doc says the destructive-diff case is a non-fatal warn; code treats it as a hard deploy abort. Plan A15d deferred this.
- **Fix:** Reword AGENTS.md:379 to *"…and aborts the deploy (`die`) so the operator must explicitly opt in via `DRIZZLE_PUSH_FORCE=1`."* Replace the `[WARN]` example with the actual `die` message.

### NEW-1 — Language-preset disk sizes are inconsistent across three sources (MEDIUM)
- **Confidence:** High
- **Doc A:** `AGENTS.md:375` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~14 GB)`
- **Doc B:** `docs/languages.md:216-219` — `core (~0.8 GB), popular (~2.5 GB), extended (~8 GB), all (~30 GB)`
- **Code:** `deploy-docker.sh:211-214` (`--help` text) — `core (~1.2 GB), popular (~4 GB), extended (~12 GB), all (~30 GB)`
- **Mismatch:** Three-way inconsistency. `all` is the clearest fault line: AGENTS.md says ~14 GB while both other sources say ~30 GB — AGENTS.md is definitively stale. The `core`/`popular`/`extended` figures also differ between deploy-docker.sh and the two docs.
- **Fix:** Pick one source of truth (the deploy script's measured figures are most empirical); reconcile AGENTS.md:375 and docs/languages.md:216-219 to match. At minimum fix AGENTS.md `all` → ~30 GB.

### NEW-2 — `GET /api/v1/problems/:id/export` endpoint is undocumented (MEDIUM)
- **Confidence:** High
- **Doc:** `docs/api.md` — grep for `problems/:id/export` returns zero hits. Only `groups/:id/assignments/:assignmentId/export` (L802) and `contests/:assignmentId/export` (L931) are documented.
- **Code:** `src/app/api/v1/problems/[id]/export/route.ts` exists (A9-hardened: SELECTs `problemType`/`functionSpec`/`referenceSolution`, strict `canManageProblem` gate).
- **Fix:** Add a subsection to `docs/api.md` documenting the endpoint and its canManageProblem gate.

### NEW-3 — `POST /api/v1/groups/:id/instructors` endpoint is undocumented (MEDIUM)
- **Confidence:** High
- **Doc:** `docs/api.md` — grep for `instructors` / `co_instructor` returns zero hits.
- **Code:** `src/app/api/v1/groups/[id]/instructors/route.ts` exists (A4-hardened: student-target rejection).
- **Fix:** Document the endpoint and the allowed target roles.

### DOC-2 — "full-fidelity = all fields included" is false (HIGH — privacy)
- **Confidence:** High
- **Doc:** `docs/data-retention-policy.md:48` — *"**Full-fidelity** (`?full=true`) — all fields included."*
- **Code:** `src/lib/db/export.ts:104-106` applies `EXPORT_ALWAYS_REDACT_COLUMNS` even when `sanitize:false`. `src/lib/security/secrets.ts:36-42` defines the always-redact set: `users.passwordHash`, `sessions.sessionToken`, `accounts.{refresh_token,access_token,id_token}`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}` (7 columns across 5 tables).
- **Mismatch:** "All fields included" is false; the most sensitive fields are stripped even from full-fidelity exports. Note the `"redactionMode": "full-fidelity"` string IS what the code emits (`export.ts:288`), so the label itself is internally consistent — the misleading claim is the *prose* "all fields included".
- **Coupling:** This is the doc side of C2-M2 / AGG-2 (snapshot redaction design). Fixing the prose is independent of the design decision.
- **Fix:** Reword data-retention-policy.md:48 to: *"Full-fidelity (`?full=true`) — includes all data EXCEPT a small always-redacted secret set (password hashes, session/OAuth tokens, API-key ciphertext, SMTP/hCaptcha secrets). Suitable for disaster-recovery restores of user/problem data; NOT a bit-for-bit DB image."* Also check `docs/admin-security-operations.md:65` ("backup artifacts that include full-fidelity secrets") — same inversion.

### DOC-3 — pre-restore snapshot comment claims it contains password hashes / JWT secrets; it does not (HIGH)
- **Confidence:** High
- **Doc:** `src/lib/db/pre-restore-snapshot.ts:34-39` — *"The snapshot is full-fidelity (sanitize=false) — it is the operator's own emergency rollback artifact… Because it contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form, the file is created with mode 0o600…"*
- **Code:** `pre-restore-snapshot.ts:84-86` calls `streamDatabaseExport({ sanitize: false })`. Per export.ts:104-106 + secrets.ts:36-42, `sanitize:false` still strips `passwordHash` and `sessionToken`. The snapshot therefore does **NOT** contain password hashes or JWT session tokens.
- **Mismatch:** The comment makes a load-bearing claim about the rollback artifact that is false. An operator who restores from this snapshot loses every user's password and every active session — directly contradicting the documented "emergency rollback" purpose. The 0o600 rationale ("because it contains password hashes…") is also wrong as written.
- **Coupling:** Functional side is C2-M2 / AGG-2 (snapshot must be faithfully restoreable). The comment fix must follow whichever design wins: (a) if snapshots should be true full-fidelity, the redaction needs a `mode:"snapshot"` bypass; (b) if redaction stays, the comment must say *"excludes the always-redacted secret set (same as a full-fidelity export) — restoring will require a password reset for all users; pair with the encrypted backup pipeline for a complete rollback."*
- **Fix:** Either fix the comment to match reality (b), or fix the code to honor the documented contract (a). Leaving the comment as-is is the worst option.

### AGG-54 — Drizzle migration journal has duplicate prefixes (LOW)
- **Confidence:** High
- **Code:** `drizzle/pg/` contains `0012_*` ×2, `0016_*` ×2, `0027_*` ×2, `0028_*` ×2. `drizzle-kit` journals resolve by filename but the duplicate numeric prefixes are fragile.
- **Fix:** Regenerate the journal with unique sequential prefixes when the next migration lands.

### AGG-55 — Orphan `min_password_length` column (LOW)
- **Confidence:** High
- **Code:** `src/lib/db/schema.pg.ts:591` — `minPasswordLength: integer("min_password_length")`. Zero readers in `src/` (grep returns only the definition). Carry-over from cycle 1.
- **Fix:** Drop in the next schema batch.

---

## NEW THIS CYCLE

### C3-D1 — `.env.example` still omits security-relevant env vars (LOW → re-list of LOW-1, expanded)
- **Confidence:** High
- **Doc:** `.env.example` (171 lines) — no entry for the security boundary vars.
- **Code (consumers verified at HEAD):**
  - `TRUSTED_PROXY_HOPS` — `src/lib/security/ip.ts:12` (the whole XFF/X-Real-IP trust model; `0` = no trusted proxies). **Security-critical to document.**
  - `TRUSTED_DOCKER_REGISTRIES` — `judge-worker-rs/src/validation.rs:69`.
  - `JUDGE_PRODUCTION_MODE` — `judge-worker-rs/src/validation.rs:79`.
  - `JUDGE_ALLOWED_IPS` — `src/lib/judge/ip-allowlist.ts:14` + `src/lib/security/production-config.ts:48` (the `/judge/claim` IP allowlist). **Security-critical.**
  - `SANDBOX_ALLOW_UNVERIFIED_EMAIL` — `src/lib/security/sandbox-gate.ts:13` (gates whether unverified-email accounts can run code). **Security-critical.**
  - `ALLOW_UNSNAPSHOTTED_RESTORE` — `src/app/api/v1/admin/restore/route.ts:156` (the documented break-glass for the snapshot-null gate).
- **Mismatch:** `.env.example` is the operator's reference; six env vars that change security posture are absent. `.env.production.example` covers `TRUSTED_DOCKER_REGISTRIES` (commented) but also omits the other five.
- **Fix:** Add commented stub entries with the `0`/unset semantics explained, especially `TRUSTED_PROXY_HOPS` (document `0` = no trusted proxies / ignore XFF), `JUDGE_ALLOWED_IPS`, and `SANDBOX_ALLOW_UNVERIFIED_EMAIL`.

### C3-D2 — AGENTS.md:407 Step 5b line citation is stale by ~400 lines (LOW)
- **Confidence:** High
- **Doc:** `AGENTS.md:407` — *"delete the Step 5b block from `deploy-docker.sh` (lines around 544-596)"*
- **Code:** `deploy-docker.sh:941` — `# Step 5b: Pre-drop secret_token backfill (idempotent, MUST run before push)`. The 544-596 range is the unrelated `.env.production` generation block.
- **Mismatch:** Brittle line-range cite rotted; an operator following it would delete the wrong block.
- **Fix:** Replace the line range with the marker description (*"the `# Step 5b: Pre-drop secret_token backfill` block"*) or update to `deploy-docker.sh:941`.

---

## EXTERNAL LIBRARY / API CURRENCY (Mission item 3)

All checked against authoritative sources (npm / official docs) via web search.

| Dependency | Repo version | Latest | Verdict |
|---|---|---|---|
| `next` | `^16.2.9` | Next.js 16.2 line (16.2 shipped Mar 2026) | **Current.** Aligned with user rule "Next.js 16". |
| `react` | `19.2.5` | React 19.2.x | **Current.** |
| `next-auth` | `5.0.0-beta.31` | v5 beta track | **Current** for the beta line. Standard v5 imports (`next-auth`, `next-auth/jwt`, `next-auth/providers/credentials`, `next-auth/react`, `next-auth/adapters`) — no deprecated patterns observed. |
| `drizzle-orm` | `0.45.2` | `0.45.2` (npm) | **Current** (latest published). |
| `drizzle-kit` | `^0.31.9` | 0.31.x | **Current.** |
| `argon2` | `^0.44.0` | 0.44.x | **Current.** |
| `vitest` | `^4.1.5` | 4.1.x | **Current.** |
| `@playwright/test` | `^1.59.1` | 1.59.x | **Current.** |
| `typescript` | `5.9.3` | 5.9.x | **Current.** |

**Next.js 16 async-API compliance sweep:** 26 files in `src/app/` declare `params: Promise<{…}>` / `searchParams: Promise<{…}>` (the Next.js 15+ contract). Grep for sync `const { params } =` destructures in `src/app/` returns **zero** hits. No deprecated dynamic-API usage detected. No `headers()`/`cookies()` sync calls observed in page components.

**next-auth v5 pattern check:** `src/lib/auth/config.ts` uses the standard v5 `NextAuthConfig` + `Credentials` provider shape; JWT/Session typing via `next-auth/jwt`. No v4-style `[…nextauth]` route or deprecated `session.strategy` issues.

**README tech badges:** `README.md:9-11` badges (Next.js 16, TypeScript 5.9, PostgreSQL + Drizzle) match `package.json`. No version mismatch.

No deprecated/removed SDK APIs in use. No external-library findings this cycle.

---

## FINAL SWEEP (clean)

- `docs/privacy-retention.md` retention windows (audit 90d, AI chat 1825d, anti-cheat 180d, recruiting 365d, submissions 365d) **exactly match** `src/lib/data-retention.ts:1-16` defaults. Env-var override names (L36) match data-retention.ts:27-30. Privacy claim is accurate.
- `docs/judge-worker-gvisor.md` status ("disabled by default", `JUDGE_OCI_RUNTIME` → `--runtime=runsc`) matches `.env.example:133` and the worker wiring. Accurate.
- `SECURITY.md` "Sensitive on-disk artefacts" → pre-restore snapshot path/mode (`0o700`/`0o600`) matches `pre-restore-snapshot.ts:67,86+`. Accurate (it does not repeat the false "contains password hashes" claim — that is only in the code comment, DOC-3).
- `CLAUDE.md` deploy flags (`SKIP_LANGUAGES`, `BUILD_WORKER_IMAGE`, `INCLUDE_WORKER`) all present in `deploy-docker.sh:23,25,28`. Consistent.
- `README.md` default-creds claim (`admin / admin123`, L47) is a setup-time seed claim — out of scope for doc/code mismatch unless challenged.

---

## PRIORITY ORDER FOR THE NEXT CYCLE (doc lane)

1. **DOC-3 (HIGH)** — fix `pre-restore-snapshot.ts:34-39` comment to match the redaction-actual behavior (or fix the code to match the comment). Pairs with AGG-2 design decision.
2. **DOC-2 (HIGH)** — correct every "full-fidelity = all fields included" claim (`docs/data-retention-policy.md:48`, `docs/admin-security-operations.md:65`).
3. **AGG-51 / AGG-52 (MEDIUM)** — document the full CSRF gate (Sec-Fetch-Site + Origin/Host); align the push-scan narrative with `die`.
4. **NEW-1 (MEDIUM)** — reconcile the three language-size tables; AGENTS.md `all` → ~30 GB at minimum.
5. **NEW-2 / NEW-3 (MEDIUM)** — document the two undocumented endpoints.
6. **C3-D1 / C3-D2 / AGG-54 / AGG-55 (LOW)** — env-example stubs, stale line cite, journal prefixes, orphan column.
