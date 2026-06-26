# Doc/Code Mismatch Review — judgekit @ 0b0ac198

_Generated 2026-06-26. Scope: documentation claims verified against source code at HEAD._

## Coverage

**Docs inspected (read end-to-end or by section):** `README.md`, `AGENTS.md`, `CLAUDE.md`, `SECURITY.md`, `docs/api.md`, `docs/authentication.md`, `docs/privacy-retention.md`, `docs/data-retention-policy.md`, `docs/judge-worker-gvisor.md`, `docs/judge-workers.md`, `docs/deployment.md`, `docs/admin-security-operations.md`, `docs/operator-incident-runbook.md`, `docs/release-readiness-checklist.md`, `docs/high-stakes-validation-matrix.md`, `messages/en.json`, `messages/ko.json`, `deploy-docker.sh` (header + Step 5b + drizzle section), `judge-worker-rs/src/validation.rs`.

**Code verified:** `src/lib/security/csrf.ts`, `src/lib/security/password.ts`, `src/lib/security/secrets.ts`, `src/lib/api/auth.ts`, `src/lib/api/api-key-auth.ts`, `src/lib/api/handler.ts`, `src/lib/db/export.ts`, `src/lib/db/pre-restore-snapshot.ts`, `src/lib/data-retention.ts`, `src/lib/db/schema.pg.ts`, `drizzle/pg/meta/_journal.json`.

**Prior-cycle items re-verified:** 5 (CSRF doc, auth bearer doc, privacy 30d/5y, deploy topology, destructive migration docs).
**New angles verified:** 5 (minPasswordLength, trusted-registries wording, drizzle migrate escape-hatch, pre-restore snapshot redaction, full-fidelity backup redaction).
**Message parity:** en.json vs ko.json full recursive key diff.

---

## Summary

| ID | Severity | Confidence | One-line |
|---|---|---|---|
| DOC-1 | Medium | High | CSRF doc lists only `X-Requested-With`; code also enforces `Sec-Fetch-Site` + `Origin`/`Host`. |
| DOC-2 | High | High | "Full-fidelity … all fields included" is false: `users.passwordHash` + 4 other tables ALWAYS redacted. |
| DOC-3 | High | High | Pre-restore snapshot comment says "contains password hashes"; `sanitize=false` still redacts `passwordHash`. |
| DOC-4 | Medium | High | AGENTS.md says push-scan "downgrades to a warn" + shows `[WARN]`; code `die`s (aborts deploy). |
| DOC-5 | Medium | High | `validation.rs` docstring says prod mode "rejects images without a trusted registry prefix"; it does not. |
| DOC-6 | Medium | Medium | drizzle-kit migrate escape hatch is documented as viable; journal has duplicate prefixes (0012/0016/0027/0028) + gap 0029-0032. |

**Resolved (verified clean at HEAD):** auth bearer doc, privacy 30d→5y, deploy topology, minPasswordLength removal, en/ko parity. Details at end.

---

## Findings

### DOC-1 — CSRF doc under-documents the guard (medium)

**Doc:** `docs/api.md:78-83`
```
Mutation methods (POST, PUT, PATCH, DELETE) require the custom header
`X-Requested-With: XMLHttpRequest` when using session-cookie authentication.
This is the API-route CSRF guard; it is separate from Auth.js sign-in CSRF.
API-key requests skip CSRF validation automatically.
```

**Code:** `src/lib/security/csrf.ts:30-74`

The header check is only the first of three gates. After the `X-Requested-With` check (L40-45), `validateCsrf` ALSO enforces:
- `Sec-Fetch-Site` (L47-54): rejects any value that is not `same-origin`/`same-site`/`none`.
- `Origin` vs expected host (L56-71): parses `Origin`, requires `http(s)://` prefix, and rejects when `new URL(origin).host !== expectedHost` (where `expectedHost` comes from `AUTH_URL`, or `x-forwarded-host`/`host` in non-production).

**Contradiction:** A client that sends the correct `X-Requested-With: XMLHttpRequest` but a cross-site `Sec-Fetch-Site` or a mismatched `Origin` is still rejected with `csrfValidationFailed`. The doc does not mention either check, so integrators following only the doc will be surprised by 403s from behind某些 reverse proxies or preflight-less cross-origin setups.

**Confidence:** High — code is unambiguous; `docs/authentication.md` and `docs/api.md` grep finds zero mentions of `sec-fetch-site`/`origin`/`same-origin` in the CSRF context.

**Fix:** Extend the CSRF section in `docs/api.md` to document all three checks and the `AUTH_URL` dependency of the host comparison; mirror in `docs/authentication.md`.

---

### DOC-2 — "Full-fidelity … all fields included" is false (high)

**Doc:** `docs/data-retention-policy.md:46-48`
```
**Full-fidelity** (`?full=true`) — all fields included. Use only for
disaster-recovery backups. Treat the output as a secret; store with
encryption and access controls equivalent to the live database.
```

**Code:**
- `src/lib/db/export.ts:104-106`:
  ```ts
  const activeRedactionMap = options.sanitize
    ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
    : EXPORT_ALWAYS_REDACT_COLUMNS;
  ```
  So even when `sanitize` is false, `EXPORT_ALWAYS_REDACT_COLUMNS` is applied.
- `src/lib/security/secrets.ts:36-42` — `EXPORT_ALWAYS_REDACT_COLUMNS`:
  - `users.passwordHash`
  - `sessions.sessionToken`
  - `accounts.refresh_token`, `access_token`, `id_token`
  - `apiKeys.encryptedKey`
  - `systemSettings.hcaptchaSecret`, `smtpPass`

**Contradiction:** "All fields included" is directly false. Seven columns across five tables are nullified in every export, including full-fidelity. The neighbouring comment in `secrets.ts:17-19` explicitly states that `judgeWorkers.secretTokenHash`/`judgeClaimToken` are deliberately retained in full-fidelity "as a reference for operators to re-provision workers after restore" — but `users.passwordHash` is in the ALWAYS-redact set, so the same reasoning was NOT extended to user credentials.

**Operational impact:** An operator who restores user logins from a "full-fidelity" backup will find every `passwordHash` null — every user is locked out and every password must be reset. The doc actively misleads about disaster-recovery scope.

**Supporting doc that is also misleading:** `docs/admin-security-operations.md:65` lists "backup artifacts that include full-fidelity secrets" as a secret to protect. The artifact is still sensitive (it retains worker tokens, recruiting token hashes, plugin configs), but the phrase overstates what is present.

**Confidence:** High — the redaction is enforced in the export hot path and covered by `secrets.ts` tests.

**Fix:** Rewrite `docs/data-retention-policy.md:48` to enumerate what full-fidelity retains vs ALWAYS-redacts (or at minimum say "all fields except the ALWAYS-redacted credential columns: `users.passwordHash`, active sessions, OAuth tokens, API key material, and the hCaptcha/SMTP secrets"). Add the same caveat to `docs/admin-security-operations.md:65` and `docs/release-readiness-checklist.md:66`.

---

### DOC-3 — Pre-restore snapshot comment claims it "contains password hashes" (high)

**Doc (code comment):** `src/lib/db/pre-restore-snapshot.ts:34-38`
```
* The snapshot is full-fidelity (sanitize=false) — it is the operator's
* own emergency rollback artifact, not a portable export. Because it
* contains password hashes, encrypted column ciphertexts, and JWT
* secrets in their stored form, the file is created with mode 0o600 ...
```

**Code:** `src/lib/db/pre-restore-snapshot.ts:84-86` calls `streamDatabaseExport({ sanitize: false })`, which (per DOC-2) applies `EXPORT_ALWAYS_REDACT_COLUMNS` and nullifies `users.passwordHash`, session tokens, API key material, etc.

**Contradiction:** The snapshot does NOT contain password hashes — they are redacted to `null` before the stream hits disk. The `0o600` mode is still appropriate (worker tokens, plugin secrets, and recruiting token hashes remain), but the specific claim "contains password hashes, encrypted column ciphertexts, and JWT secrets in their stored form" is false on the password-hash clause and on "JWT secrets" (no JWT secret column exists in the always-retain set; the Auth.js secret lives in env, not the DB).

**Operational impact:** An operator relying on a pre-restore snapshot to roll back credential state after a botched import will silently lose every user password hash. This is the exact "emergency rollback artifact" the comment claims it is safe for.

**Confidence:** High — same code path as DOC-2; verified `streamDatabaseExport({ sanitize: false })` is the only producer.

**Fix:** Correct the comment to state what IS retained (worker `secretTokenHash`/`judgeClaimToken`, `recruitingInvitations.tokenHash`, plugin configs) and what is ALWAYS redacted (`users.passwordHash`, sessions, API keys, system secrets). Cross-reference `EXPORT_ALWAYS_REDACT_COLUMNS`.

---

### DOC-4 — AGENTS.md says push-scan "warns"; code `die`s (medium)

**Doc:** `AGENTS.md:379`
```
The script captures push output, scans for the data-loss prompt markers,
and downgrades the success log to a warn.
```
`AGENTS.md:383` then shows the marker line as:
```
[WARN] drizzle-kit push detected a destructive schema change but did NOT apply it ...
```

**Code:** `deploy-docker.sh:1080-1085`
```bash
if grep -qiE "data loss|are you sure|warning:.*destructive|please confirm" <<<"$PUSH_OUT"; then
  die "drizzle-kit push detected a destructive schema change but did NOT apply it (interactive prompt unanswered or declined). Review the diff above, then re-run with DRIZZLE_PUSH_FORCE=1 to apply, or use the journal-driven migrate strategy. See AGENTS.md \"Database migration recovery (DRIZZLE_PUSH_FORCE)\" section for details."
else
  success "Database migrated"
fi
```
`die()` is defined at `deploy-docker.sh:253` as `error "$*"; exit 1`. The deploy-docker.sh internal comment at L1036-1037 correctly says "it aborts before new app code is started."

**Contradiction:** The doc says the behavior is a warn-and-continue ("downgrades the success log to a warn"); the code aborts the entire deploy with `die` (exit 1). The `[WARN]` log-line snippet in AGENTS.md is also wrong — the actual emission is an `[ERROR]` followed by exit.

**Operational impact:** An operator reading AGENTS.md before an incident expects a non-fatal warn and a partially-completed deploy (app starts against the old schema). The actual behavior is a hard stop after migrations, before containers restart — app stays on the previous running containers. Runbook expectations diverge.

**Confidence:** High — `die` is unambiguous and the deploy script's own comment agrees with the code, not with AGENTS.md.

**Fix:** In `AGENTS.md:379` change "downgrades the success log to a warn" to "aborts the deploy with an error" and replace the `[WARN] ...` snippet at L383 with the actual `[ERROR] drizzle-kit push detected a destructive schema change ...` line.

---

### DOC-5 — `validation.rs` docstring misleads about production mode (medium)

**Doc (code docstring):** `judge-worker-rs/src/validation.rs:51-53`
```
/// In production (JUDGE_PRODUCTION_MODE=1), requires non-empty trusted registries
/// and rejects images without a trusted registry prefix.
```

**Code:** `judge-worker-rs/src/validation.rs:29-31` (inside `validate_docker_image_with_trusted`):
```rust
if !hasRegistryPrefix {
    return segments.len() == 1;
}
```
For an unqualified reference like `judge-python:latest`, `segments == ["judge-python:latest"]`, so `segments.len() == 1` is true and the function returns `true` without ever consulting `trusted_prefixes`. The production gate at L66-68 only rejects when `trusted.is_empty()`.

So in production mode with `TRUSTED_DOCKER_REGISTRIES=registry.example.com`:
- `validate_docker_image("judge-python:latest")` returns **true** (accepted).
- `validate_docker_image("registry.evil.com/judge-python:latest")` returns false (rejected — good).
- `validate_docker_image("library/judge-python:latest")` returns false (rejected — `segments.len() != 1` and no registry dot).

**Contradiction:** The docstring says production mode "rejects images without a trusted registry prefix." It does not: unqualified `judge-*` images are accepted in production as long as the trusted list is non-empty (the empty-list gate is the only thing production mode adds).

**Cross-reference:** `README.md:244` is correct: "Unqualified local images such as `judge-python:latest` remain allowed." So the codebase's own README contradicts the Rust docstring.

**Confidence:** High — covered by the `production_mode_rejects_images_without_trusted_registry` test (L182-199), which only asserts the empty-list case and the qualified-registry case; it does NOT assert that unqualified images are blocked when the list is non-empty (because they are not).

**Fix:** Rewrite the docstring to: "In production (JUDGE_PRODUCTION_MODE=1), requires a non-empty trusted-registry list; unqualified `judge-*` images remain allowed, but any registry-prefixed image must match a trusted prefix." If the intent was actually to block unqualified images in production, that is a code bug, not a doc fix — flag to owner.

---

### DOC-6 — drizzle-kit migrate escape hatch points at a broken journal (medium)

**Doc:**
- `AGENTS.md:388`: "Switch to `drizzle-kit migrate` — change the `npx drizzle-kit push` line in `deploy-docker.sh` to `npx drizzle-kit migrate` for that one deploy. The journal SQL files (`drizzle/pg/<NN>_*.sql`) are then executed in order … Verify `drizzle/pg/meta/_journal.json` and `meta/<NN>_snapshot.json` are in sync with `src/lib/db/schema.pg.ts` before doing this."
- `deploy-docker.sh:1042-1044` (the in-script escape-hatch comment): "For journal-driven migrations instead, change `drizzle-kit push` to `drizzle-kit migrate` here AND verify drizzle/pg/meta/_journal.json + meta/<NN>_snapshot.json files stay in sync with src/lib/db/schema.pg.ts."

**Code/state:** `drizzle/pg/` contains duplicate four-digit prefixes and a gap:
- `0012_flimsy_korg.sql` AND `0012_public_signup_settings.sql`
- `0016_fat_loki.sql` AND `0016_wandering_snowbird.sql`
- `0027_exam_mode_check_and_drift_catchup.sql` AND `0027_upload_max_zip_setting.sql`
- `0028_platform_mode_restriction_overrides.sql` AND `0028_striped_nicolaos.sql`
- Gap: `0029`–`0032` absent; sequence jumps 0028 → 0033.

`drizzle/pg/meta/_journal.json` mirrors the duplicates (e.g. `idx:11 → 0012_public_signup_settings`, `idx:12 → 0012_flimsy_korg`).

**Contradiction (soft):** Neither doc warns that the journal is in this state. Both frame the "verify _journal.json in sync" step as a routine checkbox, but the verification will fail for any operator who actually runs it, and the behaviour of `drizzle-kit migrate` against duplicate-prefix SQL files is at best confusing (drizzle tracks applied migrations by tag hash in `__drizzle_migrations`, so replay may work, but the on-disk naming is ambiguous and the gap implies deleted/renamed migrations). An operator reaching for this escape hatch during a destructive-migration incident is the exact operator who cannot afford a second surprise.

**Confidence:** Medium — the journal state is unambiguous; the operational risk is that neither doc discloses it. Whether `drizzle-kit migrate` actually fails depends on drizzle-kit version behaviour, which is itself a reason to flag.

**Fix:** Add a callout under `AGENTS.md` "Database migration recovery" and in the `deploy-docker.sh:1042` comment block: "WARNING: `drizzle/pg/` currently contains duplicate prefixes (0012, 0016, 0027, 0028) and a gap (0029-0032). Do NOT switch to `drizzle-kit migrate` without first reconciling the journal with `src/lib/db/schema.pg.ts` and verifying applied-migration state in the target DB's `drizzle.__drizzle_migrations` table." Longer term, deduplicate the prefixes or regenerate the journal.

---

## Resolved (verified clean at HEAD)

### R1 — Auth bearer doc (prior flag)
`docs/authentication.md:13-15` and `docs/api.md:68-76` say API keys use `Authorization: Bearer jk_...`. `src/lib/api/api-key-auth.ts:53` enforces `rawKey.startsWith(API_KEY_PREFIX)` with `API_KEY_PREFIX = "jk_"` (`api-key-auth.ts:12`). Non-`jk_` Bearer tokens are rejected in both the fast path (`auth.ts:66`) and the fallback (`auth.ts:82` → `authenticateApiKey`). The CSRF-skip-for-API-keys claim is implemented at `src/lib/api/handler.ts:141-143` (`isApiKeyAuth` via the `_apiKeyAuth` marker). **No mismatch.**

### R2 — Privacy retention 30d vs 5y (prior flag)
`docs/privacy-retention.md:25` says "AI chat logs | 5 years (1,825 days)"; `docs/data-retention-policy.md:14` says "5 years (1825 days)"; `src/lib/data-retention.ts:3` is `chatMessages: 365 * 5`. No 30-day chat-retention remnant exists (the "30" hits in messages are `expiry30d`, backup `BACKUP_RETAIN_DAYS`, and the DSAR 30-day acknowledgement window — all unrelated). **Resolved.**

### R3 — Deploy topology (prior flag)
`deploy-docker.sh` header is generic ("builds Docker images on the server"). The env-var docstrings (L27-29 `BUILD_WORKER_IMAGE`, L23-25 `SKIP_LANGUAGES`, L31-33 `INCLUDE_WORKER`) correctly cross-reference CLAUDE.md for app-only targets. `AGENTS.md:431` states the algo.xylolabs.com contract (`SKIP_LANGUAGES=true BUILD_WORKER_IMAGE=false INCLUDE_WORKER=false`) verbatim. `docs/deployment.md:152,157` documents the split. **No mismatch with CLAUDE.md.**

### R4 — minPasswordLength removal (new angle a)
`schema.pg.ts:591` still defines the column (orphan, not settable), but no doc, message, or policy text references a configurable minimum:
- `docs/authentication.md:22`: "exactly an 8-character minimum" — matches `FIXED_MIN_PASSWORD_LENGTH = 8`.
- `AGENTS.md:630-634`: documents the fixed-8 policy and the file location.
- `messages/*.json`: `passwordTooShort` is hardcoded to "8 characters" / "8자"; the two `{min}` placeholders (`passwordHint`, `accountPasswordTooShort`) are interpolated with `FIXED_MIN_PASSWORD_LENGTH`/`MIN_PASSWORD_LENGTH` at the call sites (`signup-form.tsx:197`, `recruit-start-form.tsx:55`).
- `docs/api.md:1378-1386` admin settings body omits `minPasswordLength`.
**No stale reference. Resolved.**

### R5 — en/ko message parity
Recursive key-diff of `messages/en.json` vs `messages/ko.json`: **0 mismatches** (every key present in one is present in the other). Spot-checked password, retention, and CSRF-adjacent keys. **Clean.**

---

## Recommended next steps (priority order)

1. **DOC-2 / DOC-3 (high):** Correct every "full-fidelity = all fields" claim and the pre-restore-snapshot comment. These mislead disaster-recovery planning. Single fix in `src/lib/security/secrets.ts` comment + `docs/data-retention-policy.md:48` + `src/lib/db/pre-restore-snapshot.ts:34-38` + `docs/admin-security-operations.md:65`.
2. **DOC-4:** Align AGENTS.md narrative with the `die` behavior. Trivial wording fix, high runbook value.
3. **DOC-1:** Document the `Sec-Fetch-Site` + `Origin`/`Host` CSRF gates in `docs/api.md` so external integrators stop hitting surprise 403s.
4. **DOC-5:** Fix the Rust docstring (or, if the described behaviour was intended, file as a code bug — the unqualified-image path is a real trust-boundary question).
5. **DOC-6:** Add the journal-integrity warning to both escape-hatch locations; schedule a journal reconciliation task.
