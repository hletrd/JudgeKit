# RPF Cycle 28 — Security Review

**Reviewer:** security-reviewer agent
**Date:** 2026-04-23
**HEAD:** ca62a45d
**Scope:** Full repository security audit — OWASP Top 10, secrets, unsafe patterns, auth/authz, Docker sandbox

---

## Summary

The codebase demonstrates mature security engineering: defense-in-depth Docker sandboxing, timing-safe token comparisons, proper CSRF protection, Argon2id password hashing with bcrypt migration, HKDF key derivation, and comprehensive audit logging. However, this review uncovered **1 CRITICAL**, **3 HIGH**, and **6 MEDIUM** severity findings that require attention, including a Ghostscript sandbox bypass that enables arbitrary command execution inside judge containers.

**Critical areas reviewed:**
- Auth system: `src/lib/auth/` (14 files), `src/app/api/auth/`
- API routes: 80+ route handlers across `src/app/api/`
- Security module: `src/lib/security/` (17 files)
- Proxy/middleware: `src/proxy.ts`
- Judge execution: `src/lib/compiler/execute.ts`, `src/lib/docker/client.ts`
- Docker image validation: `src/lib/judge/docker-image-validation.ts`
- Plugin secrets: `src/lib/plugins/secrets.ts`
- Encryption: `src/lib/security/encryption.ts`, `src/lib/security/derive-key.ts`

---

## Findings

### SEC-28-C1: PostScript `-dNOSAFER` Disables Ghostscript Sandbox (CRITICAL)

**Severity:** CRITICAL
**Confidence:** HIGH
**File:** `src/lib/judge/languages.ts:854`
**OWASP:** A03 — Injection / A05 — Security Misconfiguration

**Problem:** The PostScript language run command uses `-dNOSAFER`, which explicitly disables Ghostscript's built-in sandbox:

```ts
runCommand: ["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dNOSAFER", "/workspace/solution.ps"],
```

Modern Ghostscript defaults to SAFER mode; the `-dNOSAFER` flag reverses this. With `-dNOSAFER`, PostScript code has unrestricted access to Ghostscript's file I/O operators and the `run` operator, which can execute arbitrary shell commands inside the container. This is a well-known class of vulnerability — Ghostscript has a long history of critical CVEs (CVE-2018-16509, CVE-2019-6116, CVE-2020-36773) related to sandbox bypass.

The Docker sandbox (`--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534:65534`, seccomp) provides the primary containment. However, the seccomp profile allows `execve`/`execveat`, `clone`/`fork`, and `socket`/`connect` syscalls. With `-dNOSAFER`, a crafted PostScript file can invoke `/bin/sh` or any other binary in the container image via Ghostscript's `run` operator, executing arbitrary commands as UID 65534.

**Attack scenario:** Any user who can submit code (playground or contest) submits a PostScript solution containing:
```postscript
%!PS
(%pipe%id > /tmp/pwned) run
```
Or using file I/O operators to read container files and write to the mounted workspace volume. While `--network=none` prevents direct exfiltration, an attacker could write stolen data to the workspace volume (which is host-mounted and cleaned up after execution, but the write occurs before cleanup). More dangerously, `%pipe%` allows arbitrary command execution.

**Fix:**
```typescript
// BAD (current)
runCommand: ["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dNOSAFER", "/workspace/solution.ps"],

// GOOD — use -dSAFER (the modern default, explicitly set for clarity)
runCommand: ["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dSAFER", "/workspace/solution.ps"],
```

If specific PostScript programs require file I/O for legitimate reasons (unlikely for a judge system), consider using `-dDELAYSAFER` with `--permit-file-read=/workspace` and `--permit-file-write=/workspace` to scope access.

---

### SEC-28-H1: Judge IP Allowlist Defaults to Allow-All

**Severity:** HIGH
**Confidence:** HIGH
**File:** `src/lib/judge/ip-allowlist.ts:77-83`
**OWASP:** A01 — Broken Access Control / A05 — Security Misconfiguration

**Problem:** When `JUDGE_ALLOWED_IPS` is not configured (which is the default), the function returns `true` for all IPs:

```ts
export function isJudgeIpAllowed(request: NextRequest): boolean {
  const allowlist = getAllowlist();
  // No allowlist configured — allow all (temporary for worker access)
  if (!allowlist) {
    return true;
  }
  // ...
}
```

The judge API routes (register, claim, poll, heartbeat, deregister) are the most privileged endpoints in the system — they control code execution and submission verdicts. If an attacker obtains the `JUDGE_AUTH_TOKEN` (a single shared secret), they can access all judge endpoints from any IP address.

**Attack scenario:** An attacker who discovers the `JUDGE_AUTH_TOKEN` (e.g., through a separate info leak, weak token, or insider threat) can register a rogue worker, claim all pending submissions, and submit "accepted" verdicts for any submission — giving students credit for incorrect code.

**Fix:**
```typescript
// BAD (current)
if (!allowlist) {
  return true;
}

// GOOD — in production, require an explicit allowlist
if (!allowlist) {
  if (process.env.NODE_ENV === "production") {
    logger.error("[judge] JUDGE_ALLOWED_IPS is not configured — judge API is open to all IPs");
    return false;
  }
  return true;  // Allow all in development only
}
```
Additionally, add a startup-time warning/error if `JUDGE_ALLOWED_IPS` is not set in production, similar to the existing `RUNNER_AUTH_TOKEN` check.

---

### SEC-28-H2: Shared JUDGE_AUTH_TOKEN Fallback Weakens Worker Isolation

**Severity:** HIGH
**Confidence:** HIGH
**File:** `src/lib/judge/auth.ts:84-90`
**OWASP:** A01 — Broken Access Control / A07 — Auth Failures

**Problem:** When `isJudgeAuthorizedForWorker` is called with a `workerId` that does not exist in the database, the function falls back to checking the shared `JUDGE_AUTH_TOKEN`:

```ts
// Worker not found: fall back to shared token
const expectedToken = getValidatedJudgeAuthToken();
if (safeTokenCompare(providedToken, expectedToken)) {
  return { authorized: true };
}
```

This means the shared token can authenticate as any worker, even one that does not exist. The shared token fallback defeats the purpose of per-worker secrets. A compromised shared token grants access to all judge operations for all workers, past and present.

Additionally, the claim route allows claiming submissions without a `workerId` using only the shared token, bypassing capacity checks and worker tracking.

**Attack scenario:** An attacker with the shared `JUDGE_AUTH_TOKEN` sends a claim request without a `workerId`. They receive the submission source code, test cases (including hidden ones), and expected outputs. They can then submit fake verdicts via the poll endpoint.

**Fix:**
1. Do not fall back to the shared token for unknown workers — reject with `error: "workerNotFound"`.
2. Require a `workerId` for all claim operations, removing the shared-token-only path.
3. Consider deprecating the shared `JUDGE_AUTH_TOKEN` entirely in favor of per-worker secrets.

---

### SEC-28-H3: COMPILER_RUNNER_URL Not Validated (Environment-Controlled SSRF)

**Severity:** HIGH
**Confidence:** MEDIUM
**File:** `src/lib/compiler/execute.ts:507`, `src/lib/docker/client.ts:45-46`
**OWASP:** A10 — Server-Side Request Forgery

**Problem:** The `COMPILER_RUNNER_URL` environment variable is used directly in `fetch()` calls without URL validation or allowlisting. If an attacker can modify this environment variable (e.g., through a container misconfiguration, `.env` file exposure, or a vulnerability that allows env var injection), all compiler execution requests would be redirected to a malicious server. The request body contains the full source code and stdin, and the response is trusted as the compiler result.

In `src/lib/docker/client.ts:7`, the runner URL is also used with `JUDGE_AUTH_TOKEN` as a fallback for `RUNNER_AUTH_TOKEN`, meaning the shared judge token is sent as a Bearer token to the configured URL.

**Attack scenario:** An attacker with access to the `.env` file or Docker environment sets `COMPILER_RUNNER_URL=http://evil.internal:3001`. All compiler runs now send source code to the attacker's server. The attacker returns a crafted response with `exitCode: 0` and arbitrary output, potentially affecting contest results.

**Fix:** Validate the runner URL at startup:
```typescript
function validateRunnerUrl(url: string): URL {
  const parsed = new URL(url);
  const allowedHosts = ["localhost", "127.0.0.1", "::1", "judge-worker", "worker-0"];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`COMPILER_RUNNER_URL hostname must be an allowed internal host, got: ${parsed.hostname}`);
  }
  return parsed;
}
```

---

### SEC-28-1: SSRF via Chat Widget Test-Connection Endpoint

**Severity:** HIGH
**Confidence:** HIGH
**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:42-94`
**OWASP:** A10 — Server-Side Request Forgery

**Problem:** The `test-connection` endpoint accepts an arbitrary `apiKey` string from the request body and immediately uses it as a Bearer token / API key in server-side `fetch()` calls to hardcoded external URLs (api.openai.com, api.anthropic.com, generativelanguage.googleapis.com). While the provider enum limits which domains are hit, the `apiKey` field is user-controlled and sent verbatim as an `Authorization: Bearer` header or `x-api-key` header to these third-party services.

**Attack scenario:** A malicious admin with `system.plugins` capability could use this endpoint as a proxy to probe third-party API services — testing stolen API keys, or abusing the server's IP to bypass IP-based rate limits or firewall rules on those services. If the server has network access to internal services that share the same authentication scheme, the endpoint could be repurposed as an SSRF scanner (though the current provider enum limits this to three specific domains).

More critically, the Gemini path on line 83 constructs a URL using the user-supplied `model` parameter:
```ts
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
```
While `SAFE_GEMINI_MODEL_PATTERN` is validated, the model string is interpolated into the URL path. If the regex is permissive enough to allow path-traversal characters, this becomes a more classic SSRF. Even with validation, the server is making authenticated requests to external APIs using credentials the caller provides — effectively an open proxy for those three API domains.

**Fix:**
1. Remove the `apiKey` from the request body entirely. Use the API keys already stored in the plugin config (encrypted in DB) instead of accepting them from the client.
2. The test-connection endpoint should only test the *already-configured* credentials — not accept arbitrary ones.
3. For the Gemini URL, use `encodeURIComponent(model)` as defense-in-depth even if the regex already constrains it.

---

### SEC-28-H4: API Key Bypasses `mustChangePassword` Enforcement

**Severity:** HIGH
**Confidence:** HIGH
**File:** `src/proxy.ts:285-288`, `src/lib/api/api-key-auth.ts:65-129`
**OWASP:** A01 — Broken Access Control

**Problem:** The proxy explicitly skips `mustChangePassword` enforcement for API key requests:

```ts
const hasApiKeyAuth = isApiRoute && request.headers.get("authorization")?.startsWith("Bearer ");
if (hasApiKeyAuth) {
  return createSecuredNextResponse(request);
}
```

The comment claims that `authenticateApiKey()` returns 403 for `mustChangePassword=true`, but examining `api-key-auth.ts`, the `authenticateApiKey` function does NOT check `mustChangePassword` — it returns the user object with `mustChangePassword` as a boolean field, but never rejects based on it. The downstream route handler would need to check `mustChangePassword` individually, and there is no guarantee all route handlers do this.

**Attack scenario:** A user who has been forced to change their password (e.g., after a security incident) can bypass the forced-password-change gate by using their API key instead of the web session. They continue to access all protected resources, defeating the purpose of forced password rotation.

**Fix:**
Add `mustChangePassword` enforcement to `authenticateApiKey()`:
```typescript
// In api-key-auth.ts, after the isActive check:
if (user.mustChangePassword) return null;
```
This ensures API key auth is blocked when a password change is required, matching the proxy-level enforcement for session-based auth.

---

### SEC-28-2: Plaintext Fallback in Encryption Module

**Severity:** MEDIUM
**Confidence:** HIGH
**File:** `src/lib/security/encryption.ts:78-81`
**OWASP:** A02 — Cryptographic Failures

**Problem:** The `decrypt()` function returns the input as-is if it does not start with `enc:`. This is documented as a "plaintext fallback for data that was stored before encryption was enabled," but it means any unencrypted string will silently pass through decryption without any verification.

```ts
export function decrypt(encoded: string): string {
  if (!encoded.startsWith("enc:")) {
    return encoded;  // Plaintext fallback
  }
  // ...
}
```

**Attack scenario:** If an attacker gains write access to the database (e.g., via SQL injection elsewhere, or a compromised backup), they could replace encrypted values with plaintext values. The application would then use the attacker-controlled plaintext as if it were legitimately decrypted data. For example, replacing an encrypted API key with `malicious-key` would cause the application to use `malicious-key` for all API calls, potentially redirecting traffic.

Additionally, the dev-mode fixed key (`DEV_ENCRYPTION_KEY` on line 13-16) is hardcoded in source:
```ts
const DEV_ENCRYPTION_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex"
);
```
While it throws in production if `NODE_ENCRYPTION_KEY` is unset, any misconfiguration of `NODE_ENV` would silently use this known key.

**Fix:**
1. Consider adding an integrity check (HMAC or authenticated prefix) for values that should be encrypted, so the application can detect tampering rather than silently accepting plaintext.
2. Add monitoring/alerting when the plaintext fallback path is hit in production.
3. Consider removing the dev key entirely and requiring `NODE_ENCRYPTION_KEY` even in development, or at minimum logging loudly when it's used.

---

### SEC-28-3: Plugin Secrets Stored with Reversible Encryption

**Severity:** MEDIUM
**Confidence:** MEDIUM
**File:** `src/lib/plugins/secrets.ts:14-28`, `src/lib/api/api-key-auth.ts:25-31`
**OWASP:** A02 — Cryptographic Failures

**Problem:** Plugin API keys (OpenAI, Claude, Gemini) and API key values are encrypted at rest using AES-256-GCM, but the encryption keys are derived from environment variables (`PLUGIN_CONFIG_ENCRYPTION_KEY`, `NODE_ENCRYPTION_KEY`). This means:
1. Any process with access to the env vars can decrypt all stored secrets.
2. The `decryptPluginSecret()` function on line 30-58 tries two keys sequentially (HKDF-derived, then legacy SHA-256), which could mask key rotation issues.
3. In `api-key-auth.ts`, the raw API key is encrypted and stored in the database (`encryptedKey` column), meaning a DB compromise + env var leak exposes all API keys.

**Attack scenario:** If an attacker obtains a database dump and the `PLUGIN_CONFIG_ENCRYPTION_KEY` env var (e.g., from a `.env` file on the same server), they can decrypt all stored third-party API keys and user API keys.

**Fix:**
1. This is an inherent trade-off for application-layer encryption — the key must be accessible to the app. Ensure env vars are stored securely (not in `.env` files in production, use vault/KMS).
2. Consider using a hardware-backed key management service (AWS KMS, HashiCorp Vault) for envelope encryption instead of deriving keys from env vars.
3. Add key rotation tooling so that if `PLUGIN_CONFIG_ENCRYPTION_KEY` is compromised, stored secrets can be re-encrypted with a new key.

---

### SEC-28-4: Proxy Auth Cache Creates Revocation Delay Window

**Severity:** MEDIUM
**Confidence:** HIGH
**File:** `src/proxy.ts:22-27`
**OWASP:** A07 — Identification and Authentication Failures

**Problem:** The middleware proxy uses an in-memory FIFO cache for auth lookups with a default TTL of 2 seconds (`AUTH_CACHE_TTL_MS`):

```ts
const AUTH_CACHE_TTL_MS = (() => {
  const parsed = parseInt(process.env.AUTH_CACHE_TTL_MS ?? '2000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
})();
```

The code comment acknowledges: "revoked or deactivated users may retain access for up to AUTH_CACHE_TTL_MS (default: 2 seconds) after the change is applied to the database." While 2 seconds is short, the TTL is configurable via env var with no upper bound. An operator setting `AUTH_CACHE_TTL_MS=60000` would create a 60-second revocation window.

Additionally, negative results (user not found / inactive / token invalidated) are not cached, which means the cache can be bypassed by flooding with unique session tokens.

**Attack scenario:**
1. An admin deactivates a user or forces a password change. The user retains access for up to the cache TTL window.
2. An operator misconfigures `AUTH_CACHE_TTL_MS` to a large value, dramatically extending the revocation window.
3. An attacker with a valid-but-revoked session can make requests during the cache window.

**Fix:**
1. Add a hard upper bound for `AUTH_CACHE_TTL_MS` (e.g., max 10 seconds) and log a warning if set higher.
2. Consider cache invalidation on write: when a user is deactivated or their password is changed, emit a signal that clears the relevant cache entry.
3. Consider caching negative results for a very short TTL (e.g., 500ms) to prevent cache-bypass via token flooding.

---

### SEC-28-5: Docker Image Validation Allows Namespace Tricks

**Severity:** MEDIUM
**Confidence:** MEDIUM
**File:** `src/lib/judge/docker-image-validation.ts:1-50`
**OWASP:** A01 — Broken Access Control

**Problem:** The `isAllowedJudgeDockerImage()` function validates that Docker image names start with `judge-`, but the validation has potential edge cases:

1. The regex `/^[a-zA-Z0-9][a-zA-Z0-9._\-\/:]*$/` allows `/` characters, and the logic splits on `/` to detect registry prefixes. An image like `judge-foo/attack:latest` would pass `hasValidJudgeImageName()` since the last segment after `/` would need to start with `judge-`, but `attack` does not — so this specific case is caught.

2. However, `judge-foo/judge-bar:latest` would pass: the last segment `judge-bar` starts with `judge-`, and there's a registry-like prefix `judge-foo`. If `judge-foo` contains a `.` (e.g., `judge-foo.evil.com/judge-bar:latest`), it would be treated as a registry and checked against `TRUSTED_DOCKER_REGISTRIES`. If that env var is empty or misconfigured, the check falls through and the image is rejected (line 41: `return segments.length === 1` returns false for multi-segment paths). This is actually safe.

3. The real concern: `isLocalJudgeDockerImage()` only checks `image.split("/").length === 1`, which means `judge-python:latest` passes but so does `judge-:latest` (empty image name after `judge-`). The `hasValidJudgeImageName` regex would allow it since it only requires `imageName.startsWith("judge-")`.

**Attack scenario:** A compromised admin could set a language config's docker image to `judge-:latest`, which passes validation but refers to an image with an empty name component. Depending on Docker's behavior, this could error or potentially pull an unexpected image. The risk is limited because the build endpoint also requires a matching `Dockerfile.judge-` to exist.

**Fix:**
1. Add a minimum length check for the image name after the `judge-` prefix (e.g., at least 2 characters).
2. Consider using an allowlist of known judge images rather than a prefix-based approach.

---

### SEC-28-6: Argon2 `needsRehash` Always Returns `false`

**Severity:** MEDIUM
**Confidence:** HIGH
**File:** `src/lib/security/password-hash.ts:35-36`
**OWASP:** A07 — Identification and Authentication Failures

**Problem:** When verifying an Argon2 hash, `needsRehash` is hardcoded to `false`:

```ts
const valid = await argon2.verify(storedHash, password);
return { valid, needsRehash: false };
```

The argon2 library provides `argon2.needsRehash(hash, options)` which checks whether a hash was produced with parameters weaker than the current recommendation. By always returning `false`, the code ensures that if `ARGON2_OPTIONS` are ever tightened (e.g., increasing `memoryCost` from 19 MiB to 64 MiB in response to GPU advances), existing hashes with weaker parameters will never be flagged for rehashing. The bcrypt-to-argon2 migration path correctly returns `needsRehash: valid`, but the argon2-to-argon2 upgrade path is dead.

Additionally, the current `timeCost: 2` is at the very low end — OWASP recommends `timeCost >= 3` for argon2id. When that parameter is raised, every existing hash will silently remain at the weaker setting.

**Attack scenario:** Not directly exploitable, but silently prevents security upgrades. As GPU hardware improves and attack costs drop, existing password hashes remain at weak parameters indefinitely.

**Fix:**
```typescript
const valid = await argon2.verify(storedHash, password);
const needsRehash = valid && argon2.needsRehash(storedHash, ARGON2_OPTIONS);
return { valid, needsRehash };
```

---

### SEC-28-7: `sanitizeMarkdown` Security Relies Entirely on Consumer Discipline

**Severity:** MEDIUM
**Confidence:** MEDIUM
**File:** `src/lib/security/sanitize-html.ts:85-88`
**OWASP:** A03 — Injection (XSS)

**Problem:** `sanitizeMarkdown` only strips null bytes and control characters — it does not sanitize HTML at all. The security of this approach depends entirely on EVERY consumer rendering the output with `react-markdown` using `skipHtml`. The current `ProblemDescription` component does use `skipHtml`, but at least 7 API endpoints store data via `sanitizeMarkdown` (community threads, posts, announcements, clarifications, problem descriptions).

If ANY rendering path for any of these data types (including email notifications, PDF exports, future admin panels, or third-party API consumers) does not use `skipHtml`, an attacker who injects `<script>alert('xss')</script>` or `<img src=x onerror=alert(1)>` in markdown content achieves stored XSS.

```ts
export function sanitizeMarkdown(text: string): string {
  // Only strips control characters — NO HTML sanitization
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
```

**Attack scenario:** A user creates a community thread with markdown content containing `<img src=x onerror=alert(document.cookie)>`. If any consumer renders this without `skipHtml`, the attacker exfiltrates session cookies.

**Fix:**
1. Strip raw HTML tags from markdown input at the input layer: `text.replace(/<\/?[a-zA-Z][^>]*>/g, "")`
2. Or use DOMPurify with a markdown-aware allowlist so defense is provided at input time, not rendering time.
3. This is more robust than relying on every current and future rendering path to use `skipHtml`.

---

### SEC-28-8: Chat API Key Exposure in Memory

**Severity:** MEDIUM
**Confidence:** HIGH
**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:176-189`
**OWASP:** A02 — Cryptographic Failures

**Problem:** The chat endpoint calls `getPluginState("chat-widget", { includeSecrets: true })` and then destructures the decrypted API keys into a local variable:

```ts
const config = pluginState.config as {
  provider: string;
  openaiApiKey: string;  // Decrypted API key in memory
  claudeApiKey: string;  // Decrypted API key in memory
  geminiApiKey: string;  // Decrypted API key in memory
  // ...
};
```

These plaintext API keys remain in memory for the entire duration of the request, which includes waiting for the LLM streaming response. If the server crashes or a heap dump is taken during this time, the keys would be exposed.

**Attack scenario:** A memory dump (via OOM kill, debug tooling, or `/proc/pid/mem` access on Linux) during a chat request could reveal the plaintext API keys for the LLM provider.

**Fix:**
1. This is inherent to using the keys for API calls. Consider scoping the key extraction to only the provider being used (don't load all three keys when only one is needed).
2. Minimize the time the key is in memory by extracting it immediately before the `fetch()` call and zeroing the variable afterward (though JavaScript GC makes true zeroing unreliable).
3. Log access to decrypted plugin secrets for audit purposes.

---

### SEC-28-9: `validateShellCommand` Denylist Bypass via Unicode/Encoding

**Severity:** LOW
**Confidence:** MEDIUM
**File:** `src/lib/compiler/execute.ts:159-163`
**OWASP:** A03 — Injection

**Problem:** The shell command validator uses a regex denylist:

```ts
const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/;
```

This is defense-in-depth since commands run inside a Docker sandbox. However, the denylist approach has inherent limitations:
- Unicode homoglyphs (e.g., fullwidth pipe `｜` U+FF5C) would bypass the regex but may be interpreted by some shells.
- The `>` and `<` patterns don't distinguish between redirect operators and comparison operators, which is why `&&` and `;` are allowed — but this means `rm -rf / ; cat /etc/passwd` would pass if `rm` were an allowed command prefix (it's not in the current list).

The stricter `validateShellCommandStrict()` on line 225-233 adds an allowlist of command prefixes, which significantly raises the bar. This is good.

**Attack scenario:** A malicious admin configures a language with a compile command containing Unicode tricks. In practice, `sh -c` in the Docker container would need to interpret the Unicode, which is unlikely since standard shells don't process Unicode operators. The sandbox (`--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534`) further limits the blast radius.

**Fix:**
1. The current defense-in-depth (denylist + allowlist + sandbox) is adequate for the trust boundary (admin-only config). Document this as an accepted risk.
2. Consider adding `--noprofile --norc` to the `sh -c` invocation to prevent shell profile manipulation.

---

### SEC-28-10: Compile Phase Workspace Writable by Unprivileged User

**Severity:** LOW
**Confidence:** HIGH
**File:** `src/lib/compiler/execute.ts:640-641`
**OWASP:** A01 — Broken Access Control

**Problem:** The workspace directory is created with `chmod 0o770`:

```ts
await chmod(workspaceDir, 0o770);
```

This makes the workspace group-writable. Since the Docker container runs as user 65534:65534, the workspace must be accessible by that UID. The `0o770` permission means the directory is accessible to the owner and group, but not others. If the host's group ID happens to match 65534 (unlikely but possible in some Docker-in-Docker setups), other processes on the host could modify workspace files.

**Attack scenario:** In a Docker-in-Docker setup where the host process runs as a group that matches GID 65534, another container or process could modify the source code in the workspace between the compile and run phases, potentially injecting code.

**Fix:**
1. Use `0o755` or `0o777` and rely on the Docker sandbox for isolation rather than filesystem permissions (since the container user is 65534, which typically doesn't map to a host user).
2. Alternatively, use `chown` to set the workspace ownership to 65534:65534 and use `0o700`.

---

### SEC-28-11: No Rate Limiting on Recruiting Token Validation Endpoint

**Severity:** LOW
**Confidence:** HIGH
**File:** `src/app/api/v1/recruiting/validate/route.ts:9-13`
**OWASP:** A07 — Identification and Authentication Failures

**Problem:** The recruiting token validation endpoint does have a rate limit (`"recruiting:validate"`), but it uses IP-based rate limiting. An attacker behind a botnet or rotating proxy could brute-force recruiting tokens by trying many tokens from different IPs. Recruiting tokens are single-use SHA-256 hashes, which makes brute-force impractical if tokens have sufficient entropy — but the token format is not verified for minimum length before hashing.

**Attack scenario:** If recruiting tokens are predictable (e.g., sequential integers, short strings), an attacker could enumerate valid tokens by trying many values. The SHA-256 hash comparison prevents timing attacks, but the lack of minimum token length enforcement on the validation endpoint could allow testing short/weak tokens.

**Fix:**
1. Add minimum length validation for the token input (e.g., minimum 16 characters) before computing the hash.
2. Consider adding account lockout or progressive delays after repeated invalid attempts from the same IP.

---

### SEC-28-12: Test Seed Endpoint Accessible in Staging Environments

**Severity:** LOW
**Confidence:** HIGH
**File:** `src/app/api/v1/test/seed/route.ts:35-38`
**OWASP:** A01 — Broken Access Control

**Problem:** The test seed endpoint is gated by `PLAYWRIGHT_AUTH_TOKEN` env var and `NODE_ENV !== "production"`. If a staging environment runs with `NODE_ENV=development` (or any non-production value) and has `PLAYWRIGHT_AUTH_TOKEN` set, the endpoint is accessible. The localhost restriction provides additional protection, but in containerized environments, localhost may include other containers on the same network.

```ts
function isTestEnvironment(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return Boolean(getPlaywrightToken());
}
```

**Attack scenario:** In a staging environment running in development mode, an attacker who can reach the app server's localhost (e.g., via SSRF, or from another container in the same Kubernetes pod) could use the seed endpoint to create admin users or delete test data if they know or can guess the `PLAYWRIGHT_AUTH_TOKEN`.

**Fix:**
1. Consider adding an explicit `ENABLE_TEST_ENDPOINTS` env var that must be `true` in addition to the existing checks.
2. Document the security implications of running with `NODE_ENV=development` in staging.
3. The current defense (localhost + bearer token + non-production env) is reasonable for the intended use case, but adding an explicit opt-in flag would reduce the risk of accidental exposure.

---

### SEC-28-13: Seed Script Default Admin Password

**Severity:** LOW
**Confidence:** HIGH
**File:** `scripts/seed.ts:175`
**OWASP:** A07 — Identification and Authentication Failures

**Problem:** The seed script has a hardcoded default password:

```ts
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
```

While this is only a seed script and not the running application, if someone runs this in production without setting `ADMIN_PASSWORD`, the admin account will have the password `admin123`.

**Fix:**
1. Remove the default and require `ADMIN_PASSWORD` to be set, throwing an error if missing in production environments.
2. Add a startup check that warns if any user still has the password `admin123`.

---

### SEC-28-14: CSP Allows `unsafe-inline` for Styles

**Severity:** LOW
**Confidence:** HIGH
**File:** `src/proxy.ts:195`
**OWASP:** A03 — Injection (XSS)

**Problem:** The Content Security Policy includes `style-src 'self' 'unsafe-inline'`:

```ts
"style-src 'self' 'unsafe-inline'...",
```

While `unsafe-inline` for styles is significantly less dangerous than for scripts (CSS-based attacks are rare and limited), it does allow:
- CSS injection attacks that can exfiltrate data via attribute selectors
- Style-based UI spoofing

The `script-src` correctly uses nonce-based policy (no `unsafe-inline`), which is the critical protection.

**Fix:**
1. If feasible, migrate to nonce-based or hash-based style CSP. Many frameworks (including Tailwind CSS) require `unsafe-inline` for styles, so this may be an accepted limitation.
2. Consider using `style-src 'self' 'unsafe-inline' 'nonce-${nonce}'` to prepare for eventual removal of `unsafe-inline`.

---

## Positive Security Observations

The following practices are commendable and should be maintained:

1. **Docker Sandbox Hardening** (`execute.ts:332-358`): Comprehensive sandboxing with `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, `--pids-limit`, `--user 65534:65534`, seccomp profile, memory limits, and CPU limits. This is defense-in-depth done right.

2. **Timing-Safe Token Comparison** (`timing.ts`): Uses HMAC-based constant-time comparison with ephemeral keys, preventing both timing and length oracle attacks.

3. **Argon2id Password Hashing** (`password-hash.ts`): Uses OWASP-recommended Argon2id with proper memory cost (19 MiB), and transparent rehashing from legacy bcrypt.

4. **Dummy Password Hash for User Enumeration Prevention** (`config.ts:50-51,258`): Pre-computed Argon2id hash used when user doesn't exist, preventing timing-based user enumeration.

5. **CSRF Protection** (`csrf.ts`): Proper dual-check with `X-Requested-With` header, `Sec-Fetch-Site` validation, and Origin verification. Correctly skips CSRF for API key auth.

6. **IP Extraction with Hop Validation** (`ip.ts`): Configurable `TRUSTED_PROXY_HOPS` with proper Nth-from-last extraction prevents X-Forwarded-For spoofing.

7. **HTML Sanitization** (`sanitize-html.ts`): DOMPurify with strict allowlist, no data attributes, URI regex filtering, and image src restriction to root-relative paths only.

8. **Safe JSON-LD Embedding** (`json-ld.tsx`): Properly escapes `</script` and `<!--` sequences to prevent script tag breakout.

9. **Capability-Based Authorization** (`handler.ts`): The `createApiHandler` pattern with Zod validation, capability checks, CSRF, and rate limiting provides a consistent security layer across all API routes.

10. **Advisory Locks for Submission Rate Limiting** (`submissions/route.ts:252`): Uses `pg_advisory_xact_lock` with MD5-derived lock keys to prevent concurrent submission bypass.

11. **Password Re-Confirmation for Destructive Operations** (`backup/route.ts`, `restore/route.ts`): All database backup/restore/migration endpoints require the user's current password.

12. **Audit Event Buffering** (`events.ts`): Batched audit inserts with graceful degradation (caps buffer, logs critical failures after threshold).

---

## Findings Summary Table

| ID | Severity | Confidence | Category | File | Summary |
|----|----------|------------|----------|------|---------|
| SEC-28-C1 | CRITICAL | HIGH | Injection | `judge/languages.ts:854` | PostScript `-dNOSAFER` disables Ghostscript sandbox — arbitrary command execution |
| SEC-28-H1 | HIGH | HIGH | Access Control | `judge/ip-allowlist.ts:77-83` | Judge IP allowlist defaults to allow-all when `JUDGE_ALLOWED_IPS` not set |
| SEC-28-H2 | HIGH | HIGH | Auth | `judge/auth.ts:84-90` | Shared `JUDGE_AUTH_TOKEN` fallback defeats per-worker isolation |
| SEC-28-H3 | HIGH | MEDIUM | SSRF | `compiler/execute.ts:507` | `COMPILER_RUNNER_URL` not validated — environment-controlled SSRF |
| SEC-28-H4 | HIGH | HIGH | Access Control | `proxy.ts:285-288` | API key bypasses `mustChangePassword` enforcement |
| SEC-28-1 | HIGH | HIGH | SSRF | `chat-widget/test-connection/route.ts` | SSRF via user-supplied API keys in test-connection endpoint |
| SEC-28-2 | MEDIUM | HIGH | Crypto | `encryption.ts` | Plaintext fallback in decrypt(); hardcoded dev key |
| SEC-28-3 | MEDIUM | MEDIUM | Crypto | `secrets.ts`, `api-key-auth.ts` | Reversible encryption with env-var-derived keys |
| SEC-28-4 | MEDIUM | HIGH | Auth | `proxy.ts` | Auth cache revocation delay; configurable with no upper bound |
| SEC-28-5 | MEDIUM | MEDIUM | Access Control | `docker-image-validation.ts` | Edge cases in `judge-` prefix validation |
| SEC-28-6 | MEDIUM | HIGH | Auth | `password-hash.ts:35-36` | Argon2 `needsRehash` always false — prevents hash parameter upgrades |
| SEC-28-7 | MEDIUM | MEDIUM | XSS | `sanitize-html.ts:85-88` | `sanitizeMarkdown` relies on consumer discipline for XSS safety |
| SEC-28-8 | MEDIUM | HIGH | Crypto | `chat/route.ts` | Decrypted API keys held in memory during streaming |
| SEC-28-9 | LOW | MEDIUM | Injection | `execute.ts` | Shell command denylist limitations (mitigated by sandbox) |
| SEC-28-10 | LOW | HIGH | Access Control | `execute.ts` | Workspace 770 permissions in Docker-in-Docker setups |
| SEC-28-11 | LOW | HIGH | Auth | `recruiting/validate/route.ts` | No minimum token length before hash comparison |
| SEC-28-12 | LOW | HIGH | Access Control | `test/seed/route.ts` | Seed endpoint accessible in non-production environments |
| SEC-28-13 | LOW | HIGH | Auth | `scripts/seed.ts` | Hardcoded default admin password in seed script |
| SEC-28-14 | LOW | HIGH | XSS | `proxy.ts` | CSP allows `unsafe-inline` for styles |

**Total:** 1 CRITICAL, 5 HIGH, 8 MEDIUM, 6 LOW

**Priority remediation order:** SEC-28-C1 (immediate) → SEC-28-H1 → SEC-28-H2 → SEC-28-H3 → SEC-28-H4 → SEC-28-1 → SEC-28-2 → SEC-28-6 → SEC-28-7 → SEC-28-4 → SEC-28-8 → SEC-28-3 → SEC-28-5 → remaining by severity.
