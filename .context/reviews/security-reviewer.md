# Cycle 3 — security-reviewer

**Scope:** Full deep re-audit of JudgeKit at HEAD `207623f9`. Regression-checked the 10 cycle-1+2 shipped fixes; validated the 14 carry-forward Phase B items; hunted net-new OWASP issues across all 113 API routes, auth/security libs, restore/export pipeline, file storage, judge/compiler IPC, chat-widget plugin, anti-cheat, recruiting, and Rust worker.

**Risk Level: MEDIUM** — All 10 prior fixes hold; SEC-9 (community write-side IDOR) is now FIXED since cycle 2. AGG-2 (snapshot unrestoreable) remains the single HIGH-severity defensible finding. NEW-M3 (contest JSON export audit gap) is a confirmed audit-bypass with PII exfiltration potential and should be elevated to HIGH priority this cycle. No CRITICAL issues, no SQL/SSRF/path-traversal/command-injection vectors, no new secrets exposure. npm audit clean (0 high/critical, 2 moderate build-time).

## Summary

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 1 | C3-1 (AGG-2 snapshot unrestoreable, re-confirmed) |
| Medium | 3 | C3-2 (NEW-M3 JSON export audit gap, escalated), C3-3 (NEW-M5 admin/settings no step-up), C3-4 (AGG-10 plaintext-decrypt default true) |
| Low | 6 | C3-5 (C2-H7 X-Real-IP residual, narrowed), C3-6 (NEW-M2 SSE identity-only re-auth), C3-7 (CSRF Origin-required narrow), C3-8 (NEW-M9 anti-cheat Origin defense-in-depth), C3-9 (C2-4 chat-widget Zod contract gap), C3-10 (C2-5 api-keys same-role mutation) |

---

## REGRESSION CHECK — 10 cycle-1+2 fixes (HEAD `207623f9`)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `src/lib/security/env.ts` 0600 env files + startup guard | SECURE | env.ts:200 `(stats.mode & 0o077) !== 0` throws in production; `resolveLoadedEnvFilePath` walks `.env.production.local`→`.env` (L150-169). All 6 on-disk `.env*` are `-rw-------` (verified by `ls -la`). |
| 2 | `groups/[id]/route.ts` DELETE IDOR gate | SECURE — NO BYPASS | route.ts:192-229. Fetches `instructorId` inside `tx...for("update")` (L199-204), calls `canManageGroupResourcesAsync` (L211-216), denies unless `caps.has("groups.view_all")`. Single tx path; no alternate route reaches `tx.delete`. |
| 3 | `groups/[id]/instructors/route.ts` student→co_instructor block | SECURE | route.ts:87-89 rejects `(await getRoleLevel(targetUser.role)) <= 0` with 409 before any insert/update. |
| 4 | `admin/api-keys/[id]/route.ts` PATCH + DELETE role gate | SECURE | PATCH L51 selects `existing.role`; L86 `targetRole = body.role ?? existing.role`; L87-90 applies `canManageRoleAsync` to ALL mutations. DELETE L114 selects `existing.role`; L120-123 applies symmetric gate. (Residual LOW-C3-10: same-role mutation clause.) |
| 5 | `plugins/chat-widget/chat/route.ts` + `tools.ts` prompt-injection sanitize | SECURE | route.ts:18 imports `sanitizePromptInput`; L373-376 sanitizes every inbound message; L508 sanitizes tool results fed back into the prompt. tools.ts L71-72 comment + L96/L135/L178/L233 enforce `context.userId`/`context.problemId` scoping on every DB lookup, so a crafted tool arg cannot exfiltrate another user's data. (Residual LOW-C3-9: documented Zod contract unmet.) |
| 6 | `lib/security/ip.ts` XFF gating (C2-H7 OPEN) | PARTIAL — see C3-5 | ip.ts:97 `if (trustedHops > 0 && parts.length >= trustedHops + 1)` correctly skips XFF when `=0`. **But** L113-117 still trusts `x-real-ip` unconditionally. The revert (23851d69) was correct for the deployed nginx (scripts/online-judge.nginx.conf:60,74,85,97 overwrites X-Real-IP via `proxy_set_header X-Real-IP $remote_addr`). Residual risk to non-nginx deploys — narrowed to MED/LOW. |
| 7 | `admin/languages/*` dockerImage allowlist | SECURE | route.ts:70 `if (!isAllowedJudgeDockerImage(body.dockerImage.trim()))` in POST; `[language]/route.ts`:48 same gate in PATCH before any update. Mirrors `admin/docker/images/build/route.ts`. |
| 8 | `groups/[id]/assignments/*` accessCode projection | SECURE — IMPLICIT | Community/assignments use centralized `canManageGroupResourcesAsync` for manager-only branch; the prior projection fix is preserved (verified at `assignments/route.ts` columns clause; accessCode/freezeLeaderboardAt omitted for non-managers per cycle-2 NEW-H2). |
| 9 | `problems/[id]` strict canManageProblem (API + edit page) | SECURE | API `problems/[id]/route.ts`:65 routes GET through strict `canManageProblem`; L75 strips `referenceSolution` for non-managers. Edit page paired via A11. Export route (`problems/[id]/export/route.ts`) gates on the same helper. |
| 10 | `admin/restore/route.ts` snapshot-null abort | SECURE | restore/route.ts:149-161 aborts with `preRestoreSnapshotFailed` (500) when `preSnapshotPath === null` and `ALLOW_UNSNAPSHOTTED_RESTORE !== "1"` — BEFORE `importDatabase`. Same shape at `admin/migrate/import/route.ts`:98-107. Audit now uses `recordAuditEventDurable` (L209, post-commit + post-file-restore). |

**Regression verdict: 10/10 hold; 1 partial (C2-H7) unchanged from cycle 2 with a narrower scope.**

---

## PHASE-B VALIDATION

| Item | Verdict | Evidence |
|---|---|---|
| **AGG-1** Restore DB-before-files atomicity | STILL_OPEN (MED, design) | restore/route.ts:163 commits DB tx, then L180 calls `restoreParsedBackupFiles`. File-write failure leaves DB referencing missing uploads. Mitigated by post-commit durable failure-audit (L183-201). |
| **AGG-2** Snapshot redacts ALWAYS-columns | STILL_OPEN — **HIGH (C3-1)** | pre-restore-snapshot.ts:84 calls `streamDatabaseExport({ sanitize: false })`; export.ts:104-106 still applies `EXPORT_ALWAYS_REDACT_COLUMNS` even at `sanitize:false`. Snapshot loses `users.passwordHash`, `sessions.sessionToken`, `accounts.*_token`, `apiKeys.encryptedKey`. Restore-after-bad-import = total lockout. |
| **AGG-10** Plaintext-decryption fallback default | STILL_OPEN (MED, C3-4) | secrets.ts:61 `allowPlaintext = options?.allowPlaintextFallback ?? true`. No call site passes `false`. |
| **NEW-M2** SSE re-auth | NARROWED (LOW, C3-6) | events/route.ts:459-475 re-checks `getApiUser` every 30s but only verifies identity (`reAuthUser.id !== viewerId`). `canAccessSubmission` runs only at handshake (L334). Revoked group membership continues streaming until session invalidates. |
| **NEW-M3** Contest export JSON audit gap | STILL_OPEN — **HIGH (C3-2)** | export/route.ts:58 `isDownload = download==="1" || format==="csv"`. Audit fires only inside `if (isDownload)` (L113-125). A plain `GET ?format=json` returns the same PII payload (names, usernames, IP addresses per L90-110) with **zero audit**. Trivially reachable by any `canViewAssignmentSubmissions` holder. |
| **NEW-M5** admin/settings re-confirm | STILL_OPEN (MED, C3-3) | settings/route.ts:37-148 PUT gated solely by `system.settings` cap. No current-password / step-up before mutating `hcaptchaSecret`, `allowedHosts`, rate-limit config, `signupHcaptchaEnabled`. A stolen admin session can disable hCaptcha or add attacker origins to `allowedHosts`. |
| **NEW-M6** roles PATCH target-level | **FIXED** | roles/[id]/route.ts:78 blocks built-in level change; :82-86 rejects `updates.level > creatorLevel`. Symmetric on POST (roles/route.ts:64-67). |
| **NEW-M7** recruiting brute-force race | **FIXED** | recruiting-invitations.ts:741-773 atomic `UPDATE ... WHERE id=? AND status='pending' AND (expiresAt IS NULL OR expiresAt > NOW()) RETURNING` inside tx; no returned row ⇒ `alreadyRedeemed` rollback. Create path adds `pg_advisory_xact_lock` on `assignmentId:email` (route.ts:50-66). Failed-redeem counter incremented outside tx (persists on rollback) at L617-618. |
| **NEW-M8** zip-bomb streaming | **FIXED** | export-with-files.ts:33-35 caps: `MAX_BACKUP_ZIP_ENTRIES=10_000`, `MAX_BACKUP_ZIP_ENTRY_BYTES=100MiB`, `MAX_BACKUP_ZIP_DECOMPRESSED_BYTES=512MiB`. `enforceBackupZipSizeLimits` (L131-149) checks declared uncompressed size from metadata BEFORE decompressing. |
| **NEW-M9** anti-cheat Origin fail-closed | NARROWED (LOW, C3-8) | anti-cheat/route.ts:65-67 missing-Origin returns 403 (closed). Value comparison at L70 gated by `if (expectedHost)`; skipped when `AUTH_URL` unset. Unreachable in prod — env.ts:127-132 throws at boot without AUTH_URL. |
| **AGG-29/30** anti-cheat IP/Origin | **FIXED** | anti-cheat/route.ts:156,177 IP via `extractClientIp(req.headers)`. Expected host via `getAuthUrlObject()?.host` (L69) — operator-controlled, not client headers. |
| **AGG-31** Key rotation | **FIXED** | derive-key.ts:9-17 HKDF-SHA256 domain-separated. secrets.ts:79-95 tries HKDF key first, then legacy SHA-256 — old ciphertexts remain readable, new writes use HKDF. AES-256-GCM with `enc:v1:iv:tag:ciphertext` format. |
| **AGG-32** AUTH_SECRET entropy | **FIXED** | env.ts:284-292 rejects placeholder + `length < 32`. Same pattern for `JUDGE_AUTH_TOKEN` (32-char min, L294-312). |
| **AGG-33** CSRF Origin-required | NARROWED (LOW, C3-7) | csrf.ts:56 `if (origin && expectedHost)` skips value check when Origin missing. X-Requested-With (L40) + Sec-Fetch-Site (L47-54) remain enforced; X-Requested-With triggers CORS preflight, blocking cross-origin state-changing fetches. In prod, expectedHost is non-null (csrf.ts:13-15). |
| **AGG-34** hCaptcha throw | **FALSE POSITIVE** | hcaptcha.ts:42-89 returns structured `{success:false}` for all controllable failures; only throws on network/TLS/timeout (not input-controllable, and timeout still blocks signup). |
| **SEC-9 / C2-2** Community write-side IDOR | **FIXED since cycle 2** | community/threads/[id]/posts/route.ts:40-47 calls `canAccessProblemScopedThread` covering problem/editorial/solution. community/votes/route.ts:62-76 uses `isProblemLinkedScope` + `canAccessProblem` for both thread and post targets. Centralized via `lib/discussions/permissions.ts`. |
| **AGG-41** Restore audit durability | **FIXED** | restore/route.ts:209 + migrate/import/route.ts:123 both use `await recordAuditEventDurable(...)`. Restored-files-failed audit (restore:183) also durable. |
| **AGG-42** CSV injection | **FIXED** | lib/csv/escape-field.ts:13 prefixes `=+\-@\t\r` with tab. Contest export CSV path uses `escapeCsvField` (L150-176). |
| **SEC-16/17/20/21** low-severity carry-forwards | Still in backlog | No regression; small doc/code-style items tracked in `_aggregate.md`. |

---

## FINDINGS (NEW + RE-CONFIRMED)

### C3-1. Pre-restore snapshot is unrestoreable (AGG-2, re-confirmed HIGH)
**Severity:** HIGH · **Confidence:** HIGH (A09 Recovery Integrity)
**Location:** `src/lib/db/pre-restore-snapshot.ts:84-86` × `src/lib/db/export.ts:104-106`
**Exploitability:** Operator-side. Triggered by any restore that requires rollback.
**Blast radius:** Total user lockout + every active session invalidated if the snapshot is the only recovery path. Single-instance deployments without external DB backups are fully dependent on this snapshot.
**Issue:** Snapshot is advertised as "the operator's emergency rollback artifact" with full-fidelity mode, but `streamDatabaseExport({ sanitize: false })` still applies `EXPORT_ALWAYS_REDACT_COLUMNS`. Those columns include `users.passwordHash`, `sessions.sessionToken`, `accounts.{refresh_token,access_token,id_token}`, `apiKeys.encryptedKey`, `systemSettings.{hcaptchaSecret,smtpPass}`. A snapshot restored after a bad import yields a DB where no user can authenticate and every active session is invalid.
**Remediation:**
```ts
// BAD (src/lib/db/export.ts:104-106)
const activeRedactionMap = options.sanitize
  ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
  : EXPORT_ALWAYS_REDACT_COLUMNS;

// GOOD — add an opt-out for snapshot-mode (defense-in-depth already covered by 0o600 file + 0o700 dir)
type RedactionConfig = { sanitize?: boolean; snapshot?: boolean };
export function streamDatabaseExport(options: RedactionConfig = {}) {
  const activeRedactionMap = options.snapshot
    ? {}
    : options.sanitize
      ? mergeRedactionMaps(EXPORT_SANITIZED_COLUMNS, EXPORT_ALWAYS_REDACT_COLUMNS)
      : EXPORT_ALWAYS_REDACT_COLUMNS;
  // ...
}
// pre-restore-snapshot.ts:84 — pass { sanitize: false, snapshot: true }
```
The original concern (snapshot file leaking secrets at rest) is already mitigated by `createWriteStream(fullPath, { mode: 0o600 })` (pre-restore-snapshot.ts:89) and `chmod 0o700` on the directory (L67).

### C3-2. Contest JSON export bypasses audit (NEW-M3, escalated to HIGH)
**Severity:** HIGH · **Confidence:** HIGH (A09 Logging Integrity, A01 Access Control)
**Location:** `src/app/api/v1/contests/[assignmentId]/export/route.ts:58, 89-133`
**Exploitability:** Remote, authenticated. Any user with `canViewAssignmentSubmissions` (instructor/TA of the group).
**Blast radius:** Silent exfiltration of contest PII (real names, usernames, IP addresses, anti-cheat event counts) with no audit trail. CSV path is always audited (L180-190) — the gap is JSON-specific. A malicious insider can exfiltrate candidate data without leaving a forensic footprint.
**Issue:** `isDownload = download==="1" || format==="csv"` (L58). The audit `recordAuditEvent` is only invoked inside `if (isDownload)` (L113-125). The JSON branch sets `Content-Disposition: attachment` (L130) — the data is downloaded either way — but the audit only fires when `download=1` is also passed. `GET ?format=json` returns the full payload with zero audit.
**Remediation:**
```ts
// BAD — audit gated on isDownload
if (format === "json") {
  // ... build data ...
  if (isDownload) {
    recordAuditEvent({ /* ... */ });
  }
  return NextResponse.json(/* ... */);
}

// GOOD — audit every successful PII export, JSON or CSV
if (format === "json") {
  // ... build data ...
  recordAuditEvent({
    actorId: user.id,
    actorRole: user.role,
    action: anonymized ? "contest.export_downloaded_anonymized" : "contest.export_downloaded",
    resourceType: "assignment",
    resourceId: assignmentId,
    resourceLabel: assignment.title,
    summary: `Exported contest "${assignment.title}" as JSON${anonymized ? " (anonymized)" : ""}`,
    details: { format, anonymized, truncated },
    request: req,
  });
  return NextResponse.json(/* ... */);
}
// Use recordAuditEventDurable for parity with restore (PII export is high-stakes).
```

### C3-3. Admin security-settings mutation without step-up (NEW-M5)
**Severity:** MEDIUM · **Confidence:** HIGH (A07 Auth Failures, A05 Security Misconfiguration)
**Location:** `src/app/api/v1/admin/settings/route.ts:37-148`
**Exploitability:** Remote, authenticated admin with stolen/leaked session cookie.
**Blast radius:** Disable hCaptcha (`signupHcaptchaEnabled=false`), add attacker origins to `allowedHosts` (enables CSRF/link-poisoning), rotate `hcaptchaSecret`, change rate-limit ceilings. The session holder becomes super_admin-equivalent for trust-boundary config without re-verifying identity.
**Issue:** PUT is gated solely by `auth: { capabilities: ["system.settings"] }`. No current-password verification, no step-up auth, no re-confirmation step.
**Remediation:** Require `currentPassword` verification (via `verifyAndRehashPassword`, mirroring restore/route.ts:49-62) for security-sensitive keys (`signupHcaptchaEnabled`, `hcaptchaSecret`, `allowedHosts`, `*-rate-limit-*`). Alternatively gate the whole PUT behind step-up and re-issue the session.

### C3-4. Plaintext-decryption fallback default true (AGG-10)
**Severity:** MEDIUM · **Confidence:** HIGH (A02 Cryptographic Failures)
**Location:** `src/lib/plugins/secrets.ts:61`
**Exploitability:** Requires write access to the plugins table (insider/SQL-level).
**Blast radius:** A row planted in plaintext form is returned as-is by `decryptPluginSecret`, silently bypassing AES-256-GCM authentication.
**Issue:** `allowPlaintext = options?.allowPlaintextFallback ?? true`. Default-open plaintext acceptance defeats authenticated-encryption guarantees.
**Remediation:** Flip the default to `false`; have call sites that genuinely need migration pass `{ allowPlaintextFallback: true }` explicitly with a deadline comment. Add a startup migration that re-encrypts any plaintext rows.

---

### LOW findings

#### C3-5. X-Real-IP trusted unconditionally (C2-H7 narrowed)
**Severity:** LOW (narrowed from HIGH) · **Confidence:** HIGH (A05 Misconfig)
**Location:** `src/lib/security/ip.ts:113-117`
**Exploitability:** Local-only for the deployed nginx configuration; remote for non-nginx deploys.
**Blast radius:** Drives rate-limit keys, audit IPs, judge IP allowlist. In the deployed configuration (scripts/online-judge.nginx.conf:60,74,85,97) nginx overwrites X-Real-IP via `proxy_set_header X-Real-IP $remote_addr`, so production is safe. The residual risk is to deployments without that nginx or where the proxy passes the header through unchanged.
**Verdict (load-bearing):** The revert (23851d69) was correct for the deployed case. Unconditional trust is unsafe in principle but the deployed nginx mitigates it.
**Recommended opt-in design:**
```ts
// Introduce TRUST_X_REAL_IP, defaulting to true in production (preserves deployed
// behavior), explicitly settable to false. Log a startup warning when set alongside
// TRUSTED_PROXY_HOPS=0 (operator may have intended "no trusted proxy").
function shouldTrustXRealIp(): boolean {
  if (process.env.TRUST_X_REAL_IP !== undefined) {
    return process.env.TRUST_X_REAL_IP === "true";
  }
  // Default: preserve deployed behavior (nginx overwrites the header).
  return process.env.NODE_ENV === "production";
}
// ip.ts:113
const realIp = shouldTrustXRealIp() ? headers.get("x-real-ip")?.trim() : null;
```

#### C3-6. SSE re-auth is identity-only (NEW-M2)
**Severity:** LOW · **Confidence:** MEDIUM (A01 Broken Access Control)
**Location:** `src/app/api/v1/submissions/[id]/events/route.ts:459-475`
**Issue:** Re-auth checks `reAuthUser.id !== viewerId` but not `canAccessSubmission`. A revoked group membership continues streaming until the session itself invalidates (≤30s tick + session expiry). Blast radius limited to a single submission's event stream.

#### C3-7. CSRF Origin-required narrow (AGG-33)
**Severity:** LOW · **Confidence:** MEDIUM (A01)
**Location:** `src/lib/security/csrf.ts:56`
**Issue:** `if (origin && expectedHost)` skips when Origin is missing. Defense-in-depth via `X-Requested-With: XMLHttpRequest` (L40, non-CORS-safelisted → triggers CORS preflight → blocks cross-origin state-changing fetches) and `Sec-Fetch-Site` cross-site rejection (L47-54). In prod, expectedHost is non-null. Residual: a request with no Origin AND no Sec-Fetch-Site AND `X-Requested-With: XMLHttpRequest` set is CSRF-allowed; the latter requires CORS preflight cooperation from the server.

#### C3-8. Anti-cheat Origin defense-in-depth (NEW-M9)
**Severity:** LOW · **Confidence:** HIGH (A05)
**Location:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:65-70`
**Issue:** Missing-Origin fails closed (good). Value comparison skipped when `AUTH_URL` unset. Unreachable in prod (env.ts boot guard).

#### C3-9. Chat-widget tool args use ad-hoc coercion (C2-4)
**Severity:** LOW · **Confidence:** MEDIUM (A03)
**Location:** `src/lib/plugins/chat-widget/tools.ts:131,169`
**Issue:** Documented Zod validation contract unmet; handlers use `Number()`/`String()`. No exploit today (`context.userId` re-scopes every DB lookup), but the documented contract is unmet.

#### C3-10. api-keys PATCH same-role mutation (C2-5)
**Severity:** LOW · **Confidence:** MEDIUM (A01)
**Location:** `src/app/api/v1/admin/api-keys/[id]/route.ts:88`
**Issue:** `if (!canManage && user.role !== targetRole)` permits same-role mutation without `canManageRoleAsync`, allowing a manager to downgrade an admin-owned key to manager-level (DoS). Fix: `if (!canManage) return apiError("cannotAssignHigherRole", 403);`.

---

## NET-NEW HUNT (negative results — clean)

| Category | Coverage method | Result |
|---|---|---|
| **SQL injection** | Exhaustive scan of all `sql\`...\`` (~85 sites), `db.execute`/`tx.execute` (11 sites), `sql.raw` (5 sites), `.where`/`.set` concatenation, user-driven `orderBy`/`groupBy` across all 113 API routes + lib/db + lib/judge + lib/assignments + lib/community + lib/discussions | **0 DANGEROUS, 0 SUSPICIOUS.** Drizzle parameterized throughout. Only `sql.raw` consumers are a transaction-mode string literal (export.ts:90) and a module-level JSONB-path constant protected by regex assertion (recruiting-invitations.ts:39-60). All LIKE inputs pass through `escapeLikePattern()`. The single user-driven sort (`accepted-solutions/route.ts:29-30`) is allowlisted against a static `Set`. |
| **SSRF** | Inspected every `fetch()` site (chat-widget test-connection, providers, email providers, code-similarity-client, docker/client, rate-limiter-client, hcaptcha, compiler/execute) | **CLEAN.** chat-widget test-connection uses hardcoded provider URLs + regex-validated model names (`SAFE_GEMINI_MODEL_PATTERN`, `OPENAI_MODEL_PATTERN`). API key fetched from DB, not request body. Gemini URL interpolation gated by `validateGeminiModel`. Internal sidecar URLs (judge worker, rate-limiter, code-similarity, compiler) are constructed from server env vars. No user-controlled outbound URL fetch. |
| **Path traversal** | Inspected `lib/files/storage.ts`, `lib/db/export-with-files.ts`, `admin/restore`, `admin/migrate/import`, `admin/backup`, `problems/import` | **CLEAN.** `resolveStoredPath` (storage.ts:20-25) enforces `SAFE_STORED_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]+$/` + explicit `..` rejection. `parseBackupZip` (export-with-files.ts:318-324) normalizes then rejects any `..`, `/`, `\`. Manifest cross-check (L113-114, L328-338) catches size/hash mismatches. |
| **Zip bombs** | Inspected `parseBackupZip` + `enforceBackupZipSizeLimits` | **CLEAN.** Entry-count, per-entry, and cumulative decompressed-size caps enforced from declared metadata before decompression (export-with-files.ts:131-149). |
| **Command injection** | Inspected `lib/docker/client.ts`, `lib/compiler/execute.ts`, `lib/system-info.ts` | **CLEAN.** All `execFile`/`spawn` calls use argv-array form (no shell). Container names, image tags, and dockerfile paths are server-derived. |
| **Deserialization** | All `JSON.parse` sites (27 in src) | **CLEAN.** Restore/migrate/parseBackupZip all wrap in try/catch with typed error (`invalidJsonFile`, `invalidDatabaseJson`, `invalidBackupManifest`). |
| **Mass assignment** | Inspected `admin/settings` (PUT), `admin/api-keys/[id]` (PATCH), `admin/languages/[language]` (PATCH) | **CLEAN.** settings PUT enumerates allowed numeric keys via `allowedConfigKeys` allowlist (L64-76) and filters `restConfig` (L78-80). api-keys/langs build explicit `updateValues` from validated schema fields only. |
| **Secrets scan** | grep `api[_-]?key\|password\|secret\|token` in src + on-disk env inspection | **CLEAN.** All 6 on-disk `.env*` files are `-rw-------`. `LOGGER_REDACT_PATHS` (secrets.ts:48-73) covers `authorization`, `password*`, `*token`, `encryptedKey`, `hcaptchaSecret`, `smtpPass`, `runnerAuthToken`. No hardcoded credentials in src (only placeholder constants at env.ts:5-8, used for equality-rejection). |
| **Rate limits** | Inspected all auth-sensitive endpoints | **CLEAN.** `forgot-password`, `reset-password`, `verify-email`, `resend-verification` all use `consumeRateLimitAttemptMulti` (IP + email/token buckets). `contests/join`, `recruiting/validate`, `playground/run`, `compiler/run` all rate-limited. No gap on auth-sensitive paths. |
| **Dependencies** | `npm audit --json` | 0 critical, 0 high, 2 moderate (`postcss <8.5.10` bundled inside `next`, build-time only; XSS via unescaped `</style>` in stringify output — not exploitable in this app's pipeline). |
| **XSS** | Inspected sanitize pipelines | **CLEAN.** `sanitizeMarkdown` (community posts) + `react-markdown skipHtml`. Chat-widget sanitizes user messages + tool results. CSV cells escaped via `escapeCsvField`. |

---

## FINAL SWEEP — OWASP coverage

- **A01 Broken Access Control** — A2/A3/A4/A5/A11/A9 all hold; SEC-9 community write-side IDOR FIXED since cycle 2. NEW-M3 elevated. C3-10 residual.
- **A02 Cryptographic Failures** — env 0600 + startup guard hold; AES-256-GCM + HKDF sound; AGG-10 still open (C3-4); AGG-2 design gap (C3-1).
- **A03 Injection** — 0 SQLi, 0 command-inj, 0 SSRF. Prompt-injection sanitized for messages + tool results (C3-9 residual contract gap).
- **A04 Insecure Design** — NEW-M5 step-up gap (C3-3); NEW-M2 SSE re-auth narrow (C3-6); AGG-2 recovery design (C3-1).
- **A05 Security Misconfiguration** — env guard + AUTH_URL boot-throw + nginx-overwrites-X-Real-IP all hold; C3-5 residual for non-nginx deploys.
- **A06 Vulnerable Components** — 0 high/critical; 2 moderate via bundled postcss (build-time).
- **A07 Auth Failures** — password hashing (bcrypt), 32-char AUTH_SECRET/JUDGE_AUTH_TOKEN min, role-escalation gates hold.
- **A08 Integrity Failures** — 3-layer backup manifest (path + sha256 + byteLength) intact; AGG-2 defeats recovery integrity (C3-1).
- **A09 Logging Failures** — CSV injection FIXED; restore audit durable; NEW-M3 JSON export audit gap (C3-2); SSE re-auth narrow.
- **A10 SSRF** — provider URLs hardcoded; model regex-validated; no user-controlled outbound fetch.

**Remediation priority:**
1. **Urgent (<1wk):** C3-1 snapshot redaction bypass (add `snapshot:true` mode — one-line + call-site); C3-2 JSON export audit gap (move audit outside `isDownload`).
2. **Important (<2wk):** C3-3 admin/settings step-up; C3-4 plaintext-decrypt default flip.
3. **Planned (<1mo):** C3-5 TRUST_X_REAL_IP flag, C3-6 SSE permission re-check, C3-7..C3-10 LOW batch + remaining AGG-1 design.

## Security Checklist
- [x] No hardcoded secrets (env files 0600; placeholders used only for equality-rejection)
- [x] All inputs validated (Zod at API boundary; C3-9 internal contract gap)
- [x] Injection prevention verified (Drizzle parameterized; sql.raw only literal/const)
- [x] Authentication/authorization verified (10 prior fixes hold; SEC-9 FIXED; C3-3/C3-10 residual)
- [x] Dependencies audited (0 high/critical; 2 moderate via bundled postcss)
- [ ] Recovery path verified (C3-1 snapshot unrestoreable — HIGH)
- [ ] Audit integrity verified for all PII exports (C3-2 JSON gap — HIGH)
