# Security Review Report — judgekit (HEAD 0b0ac198)

**Scope:** Full security audit — 113 API routes, ~101k LOC TS, ~9k LOC Rust. OWASP Top 10, authz/IDOR, secrets/crypto, injection/cmd/path/SSRF, XSS, CSRF, session/API-key, file upload, rate-limiting, audit-trail integrity, prompt injection.
**Mode:** READ-ONLY (delivered inline by security-reviewer agent; persisted by orchestrator for provenance.)
**Risk Level: HIGH** — One actionable secret-exposure finding requiring immediate rotation, plus several concrete authz-bypass chains. Core crypto, injection defenses, path/zip-slip guards, sandbox gating, and audit-trail integrity are sound.

## Summary
| Severity | Count |
|---|---|
| Critical | 0 |
| High | 6 |
| Medium | 8 |
| Low | 7 |

## High Issues

### SEC-1. World-readable `.env*` files expose live secrets to any local user
**Severity: HIGH · Confidence: HIGH** (A02/A05)
**Locations:** `/Users/hletrd/flash-shared/judgekit/.env`, `.env.deploy`, `.env.deploy.algo`, `.env.deploy.worv`, `.env.worv` (all mode `-rw-r--r--`). `.env.production` IS correctly `0600`.
**Exploitability:** Local — any co-located unprivileged user/process on the dev/deploy host.
**Blast Radius:** These contain `AUTH_SECRET`, `NODE_ENCRYPTION_KEY`, `PLUGIN_CONFIG_ENCRYPTION_KEY`, `JUDGE_AUTH_TOKEN`, DB creds, SMTP creds. `AUTH_SECRET` alone enables forging session JWTs for any user; `NODE_ENCRYPTION_KEY` decrypts every encrypted column. Files are gitignored but sit world-readable on disk.
**Fix:** `chmod 600` the files; rotate `AUTH_SECRET`/`NODE_ENCRYPTION_KEY`/`PLUGIN_CONFIG_ENCRYPTION_KEY` if they ever lived on a shared host. Add a startup check in `src/lib/security/env.ts` that validates the loaded env file's mode in production and refuses to boot if group/other bits are set.

### SEC-2. Group DELETE lacks object-level authorization (IDOR)
**Severity: HIGH · Confidence: HIGH** (A01)
**Location:** `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/groups/[id]/route.ts:192-217` (DELETE handler)
**Issue:** Verified. DELETE only checks the global capability `auth: { capabilities: ["groups.delete"] }` and uses `for("update")` row locking plus a submission-count guard, but never calls `canManageGroupResourcesAsync`. The sibling PATCH (line 127) and GET (line 58) both correctly call it. Any user holding `groups.delete` can delete ANY group regardless of instructor/ownership.
**Fix:** Mirror PATCH/GET: fetch `instructorId` inside the tx and `canManageGroupResourcesAsync(...)`, deny unless `groups.view_all`.

### SEC-3. Student→co_instructor/ta group-scoped privilege escalation (NEW)
**Severity: HIGH · Confidence: HIGH** (A01 Privilege Escalation)
**Location:** `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/groups/[id]/instructors/route.ts:74-100` (POST)
**Issue:** Verified. The route gates the actor via `canManageGroupResourcesAsync` but never validates the **target** user's role before inserting them into `group_instructors`. The target's `role` is fetched (line 76) then ignored. Sibling routes enforce this: `groups/[id]/members/route.ts:109-112` rejects non-students, and `groups/[id]/route.ts:160` rejects `getRoleLevel <= 0` on ownership transfer.
**Blast Radius:** A student colluding with any co_instructor of group G gets added with `role: "co_instructor"` — can read every other student's submissions, override scores, export roster CSV (PII), manage membership — while global role stays `student`.
**Fix:** mirror ownership-transfer gate at `groups/[id]/route.ts:160` — `if ((await getRoleLevel(targetUser.role)) <= 0) return apiError("instructorRoleInvalid", 409);`

### SEC-4. Plaintext-decryption fallback — INVERTED default in plugins/secrets.ts
**Severity: HIGH (design) · Confidence: HIGH** (A02/A04)
**Locations:** `src/lib/security/hcaptcha.ts:23`; `src/lib/email/providers/smtp.ts:54`; `src/lib/plugins/secrets.ts:61` — **`allowPlaintext = options?.allowPlaintextFallback ?? true`** (inverted from `encryption.ts` default of `false`); `src/lib/security/encryption.ts:98-116`.
**Issue:** Any path that plants a non-`enc:`-prefixed value into `systemSettings.hcaptchaSecret`, `systemSettings.smtpPass`, or `plugins.config.<secretKey>` silently bypasses the GCM authenticity guarantee. The plugin default is the most dangerous: new callers opt into plaintext passthrough without knowing it.
**Fix:** Flip default to `false` in `plugins/secrets.ts:61`; force every caller to opt in explicitly; one-shot re-encryption migration; then delete the fallback path.

### SEC-5. Pinned `next-auth@5.0.0-beta.31` is a stale beta (NEW)
**Severity: HIGH · Confidence: HIGH** (A06/A07)
**Location:** `package.json` (`"next-auth": "5.0.0-beta.31"`, exact pin — no `^`).
**Issue:** Auth.js v5 betas shipped multiple security fixes during the beta cycle (session-cookie handling, callback-url validation, PKCE edge cases). The exact pin freezes the project out of those fixes — `npm update` will not move it.
**Fix:** Track latest v5 beta (or stable v5 when released); subscribe to Auth.js security advisories.

### SEC-6. Chat-widget prompt injection — `sanitizePromptInput` not applied to user messages
**Severity: HIGH · Confidence: HIGH** (A03 LLM/prompt)
**Location:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:370-376` (no-context) and `432-436` (tool branch); `body.messages` and admin-set `systemPrompt`/`knowledgeBase` concatenated without sanitization.
**Issue:** Verified. User-controlled messages flow directly into the LLM context. Tools scope every query by `context.userId` today (so an injected `submissionId` only returns the caller's own data), but the system prompt/knowledge base is admin-controlled and can be exfiltrated/overridden, and any future cross-user tool inherits the bypass.
**Fix:** Apply `sanitizePromptInput` to user messages; treat `toolArgs` as user-controlled (Zod-validate per tool, re-scope to `context.userId`); add a code comment at `executeTool` reminding authors toolArgs is in the prompt-injection threat surface.

## Medium Issues

### SEC-7. `api-keys/[id]` PATCH escalation gap
**Severity: MEDIUM · Confidence: MEDIUM** (A01)
**Location:** `src/app/api/v1/admin/api-keys/[id]/route.ts:79-84`. `if (!canManage && user.role !== body.role)` allows assigning one's own role to a key even if `canManageRoleAsync` returns false. Existing key's current role is never fetched, so a manager could toggle `isActive`/change name/expiry on a higher-privilege key without the role check guarding them.
**Fix:** Fetch existing key role first; apply escalation check against BOTH existing and target role.

### SEC-8. XFF spoofing when `TRUSTED_PROXY_HOPS=0`
**Severity: MEDIUM · Confidence: HIGH** (A05)
**Location:** `src/lib/security/ip.ts:91-99`. When `TRUSTED_PROXY_HOPS=0` (documented "no proxies"), `parts.length >= 1` is true for any XFF and `clientIndex = parts.length - 1` selects the last entry — fully client-controlled. Intent of `0` is "don't trust XFF at all". Default `1` is safe. IP drives rate-limit keys, login-attribution, allowlist checks, audit logs.
**Fix:** When `trustedHops === 0`, ignore XFF entirely (fall through to socket remote address / X-Real-IP).

### SEC-9. Community reply/vote enforce inconsistent scope→problemId rules (NEW)
**Severity: MEDIUM · Confidence: HIGH** (A01 IDOR)
**Locations:** `community/threads/[id]/posts/route.ts:38` (only `problem`); `community/votes/route.ts:62-68` (`problem`+`editorial`, missing `solution`); reference `community/threads/route.ts:17` (correctly all three).
**Issue:** Copy-paste drift — editorial/solution threads carry a `problemId` meant to be gated by `canAccessProblem`. Write-side IDOR: any authenticated user who learns a thread id can post/vote on gated threads.
**Fix:** Centralize in `src/lib/discussions/permissions.ts` (`PROBLEM_LINKED_SCOPES = {problem, editorial, solution}`) and run `canAccessProblem` whenever non-null.

### SEC-10. No key-rotation path for `PLUGIN_CONFIG_ENCRYPTION_KEY`
**Severity: MEDIUM · Confidence: HIGH** (A02)
**Location:** `src/lib/plugins/secrets.ts:79-96`; `src/lib/security/derive-key.ts:23-31`. Legacy branch intended for migration but nothing ages it out. If env rotated, new writes re-encrypt but every old row still decrypts under the old key with no detection.
**Fix:** Versioned-key registry (`enc:v2:...`); explicit `reencryptAll` admin job; startup warning counting legacy-key decryptions; drop legacy branch after rotation window.

### SEC-11. Weak `AUTH_SECRET` validation (length only, no entropy floor)
**Severity: MEDIUM · Confidence: MEDIUM** (A02)
**Location:** `src/lib/security/env.ts:210-218`. `getValidatedAuthSecret()` rejects only the placeholder and strings shorter than 32 chars. A low-entropy 32-char string passes. NextAuth derives JWS signing keys from this secret → weak secret makes session cookies offline-forgeable.
**Fix:** Require ≥44 chars (matching `openssl rand -base64 32`), reject low-entropy strings.

### SEC-12. `postcss` XSS bundled via `next` (GHSA-qx2v-qp2m-jg93)
**Severity: MEDIUM · Confidence: HIGH** (A06). `npm audit`: 2 moderate via `postcss <8.5.10` (CVSS 6.1, CWE-79) bundled inside `next`. Build-time only. npm's proposed "fix" (downgrade next to 9.3.3) is wrong — disregard.
**Fix:** Keep `next` updated (`^16.2.9` → next 16.x patch shipping postcss ≥8.5.10).

### SEC-13. CSRF Origin check skipped when header is absent
**Severity: MEDIUM · Confidence: MEDIUM** (A01)
**Location:** `src/lib/security/csrf.ts:56` — `if (origin && expectedHost)`. Primary defense is `X-Requested-With` (holds). Origin only checked when both Origin and expectedHost present. Residual CSRF surface when Origin header missing.
**Fix:** When `expectedHost` is known (production), require Origin to be present and match on mutations.

### SEC-14. `AUTH_URL` unset → base URL derived from Host header
**Severity: MEDIUM · Confidence: HIGH** (A01 CWE-601)
**Location:** `src/lib/security/env.ts:95-107`. When `AUTH_URL`/`NEXTAUTH_URL` unset, `getPublicBaseUrl()` derives email-link origin from `host`/`x-forwarded-proto`. Comment says production requires `AUTH_URL`, but only a warning. Misconfigured prod → host-header-derived reset links → password-reset email link poisoning.
**Fix:** Promote `validateAuthUrl()` to throw in production if `AUTH_URL` is missing AND any outbound email path is configured.

## Low Issues

### SEC-15. Rate-limit bucket keyed on raw-token prefix
**Severity: LOW · Confidence: MEDIUM** (A07). `src/app/api/v1/auth/reset-password/route.ts:23` `` `reset_password:token:${token.slice(0, 8)}` ``; same in `verify-email/route.ts:21`. Attacker who learns prefix can drive to threshold and lock out legitimate holder. **Fix:** key on SHA-256 hash of token.

### SEC-16. `DUMMY_PASSWORD_HASH` is a hardcoded constant
**Severity: LOW · Confidence: HIGH** (A07). `src/lib/auth/config.ts:51-52`. If Argon2 cost params change without regenerating the constant, dummy path diverges from real path, reopening timing side-channel. **Fix:** derive at module load via same `ARGON2_OPTIONS`; add unit test asserting timing parity.

### SEC-17. Session cookie `SameSite=Lax`
**Severity: LOW · Confidence: HIGH** (A01). `src/lib/auth/config.ts:163`. Residual top-level-navigation CSRF surface for admin panel. No state-changing top-level-GET admin routes found. **Fix:** consider `SameSite=Strict` for admin paths.

### SEC-18. No 2FA/TOTP/WebAuthn for admin accounts
**Severity: LOW-MEDIUM (design) · Confidence: HIGH** (A07/A04). No `*totp*`/`*2fa*`/`*otp*` files under `src/`. Admins mint API keys, trigger DB export/restore, read encrypted SMTP secrets — all behind single-factor password auth. **Fix:** Add TOTP for `role` >= admin.

### SEC-19. Pre-restore snapshot (`sanitize:false`) still redacts ALWAYS-columns
**Severity: LOW · Confidence: MEDIUM** (A09 Recovery Integrity). `src/lib/db/pre-restore-snapshot.ts` calls `streamDatabaseExport({ sanitize: false })`. If it still strips ALWAYS-redacted columns, snapshot is not a faithful rollback. **Fix:** confirm `sanitize:false` skips ALL redaction for snapshots; introduce `mode: "snapshot"` if needed. (Cross-ref CRIT-1, DOC-3.)

### SEC-20. `AUTH_TRUST_HOST=true` documentation gap
**Severity: LOW · Confidence: MEDIUM** (A05). `src/lib/security/env.ts:186-192`. If operator enables this and reverse proxy doesn't sanitize `Host`/`X-Forwarded-Host`, attacker can spoof auth callback host. **Fix:** document in deployment runbook.

### SEC-21. API-key lookup is non-timing-safe DB equality
**Severity: LOW · Confidence: LOW** (A07). `src/lib/api/api-key-auth.ts:56-67`. `WHERE keyHash = $1`. Secret has 160 bits of entropy so timing leakage isn't exploitable. No fix required.

## Coverage

**OWASP Top 10:** A01 (SEC-2,3,7,9,13,14,17); A02 (SEC-1,4,10,11); A03 (SEC-6); A04 (SEC-4,18); A05 (SEC-1,8,20); A06 (SEC-5,12); A07 (SEC-5,15,16,18,21); A08 (backup ZIP 3-layer integrity); A09 (no UPDATE path on audit; SEC-19 recovery side); A10 (provider URLs hardcoded; no user-controlled outbound URL fetch).

**Verified clean (negative results):** Raw SQL only module-level constants; path traversal guarded (`SAFE_STORED_NAME_RE` + `..` rejection); zip slip/bomb guarded (size limits + normalization + sha256); command injection (argv arrays everywhere); SSRF (hardcoded URLs); deserialization (Zod after every JSON.parse); XSS (`sanitizeHtml` DOMPurify + `react-markdown skipHtml` in BOTH renderers); internal endpoints gated (Bearer + timing-safe + rate limit + localhost/env); recruiting validate uniform response; security headers (CSP, HSTS, XCTO, Referrer) set in `proxy.ts:262-271`.

**Already-fixed re-verified (not re-reported):** per-problem export `canManageProblem` gate, docker import-time throw → logged error, reset-password validation, user-deletion audit ordering, trusted-registries validation.

**NOTE — disagreement with code-reviewer CR-2 on `problems/[id]` GET:** This review read `route.ts:60-73` and concluded it "correctly uses `canManageProblem` (caps OR author) and strips `referenceSolution` for non-managers." The code-reviewer (CR-2) and verifier both flag that the GET uses a *local* `const canManageProblem = caps.has("problems.edit") || authorId === user.id` that is **looser** than the imported strict function used by PATCH/DELETE (which also enforces group-teaching scope). The asymmetry is confirmed by the verifier. Threat-model question: a `problems.edit` holder who does NOT teach the problem's group reads hidden tests/reference solution under the GET but would be denied by PATCH/DELETE. Recommend tightening GET to call the imported strict function (manual validation of intent).

## Top-Priority Remediation Order
1. **Immediate (<1h):** `chmod 600` the world-readable `.env*` files (SEC-1); rotate secrets if ever on a shared host.
2. **Urgent (<24h):** Group DELETE IDOR (SEC-2); student→instructor escalation (SEC-3); bump `next-auth` (SEC-5); `sanitizePromptInput` on chat-widget (SEC-6).
3. **Important (<1wk):** Plaintext-fallback default flip (SEC-4); community scope consistency (SEC-9); XFF `TRUSTED_PROXY_HOPS=0` (SEC-8); `AUTH_SECRET` entropy (SEC-11); CSRF Origin-required (SEC-13).
4. **Planned (<1mo):** key-rotation machinery (SEC-10); `AUTH_URL` enforcement (SEC-14); rate-limit bucket on hash (SEC-15); 2FA for admins (SEC-18).
