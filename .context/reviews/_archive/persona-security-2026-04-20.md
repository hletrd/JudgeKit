# Security Review Report

**Reviewer:** Security Reviewer (adversarial persona)
**Date:** 2026-04-20
**Scope:** Full codebase — Next.js app (`src/`), Rust judge worker (`judge-worker-rs/`), Docker infrastructure, and deployment configuration
**Risk Level:** MEDIUM

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 3 |
| Medium   | 8 |
| Low      | 6 |
| Info     | 4 |

JudgeKit demonstrates a security posture well above average for a platform of its type. The Docker sandbox for code execution is hardened with seccomp, network isolation, capability dropping, PID/memory/CPU limits, and read-only rootfs. Authentication uses Argon2id with bcrypt migration. Rate limiting is transactionally atomic. Submission visibility is carefully scoped. The codebase shows evidence of security-conscious design decisions documented inline.

That said, several real vulnerabilities and near-misses deserve attention. The most dangerous class of issues involves the judge worker authentication and the raw SQL used in the claim endpoint.

---

## Findings

### HIGH-1: Judge API IP Allowlist Defaults to "Allow All" When Not Configured

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **OWASP** | A01: Broken Access Control |
| **Location** | `src/lib/judge/ip-allowlist.ts:77-83` |
| **Exploitability** | Remote, unauthenticated (if JUDGE_AUTH_TOKEN is leaked or weak) |
| **Blast Radius** | Full judge API access — claim submissions, report fake verdicts, register rogue workers |

**Issue:** When `JUDGE_ALLOWED_IPS` is not set, `isJudgeIpAllowed()` returns `true` for all IPs. The comment says "temporary for worker access" but this is the production default. Any IP can reach judge API routes if they possess a valid Bearer token.

```typescript
// Line 77-83
export function isJudgeIpAllowed(request: NextRequest): boolean {
  const allowlist = getAllowlist();
  // No allowlist configured — allow all (temporary for worker access)
  if (!allowlist) {
    return true;
  }
  // ...
}
```

**Risk:** If the shared `JUDGE_AUTH_TOKEN` is ever leaked (e.g., through a compromised worker, a log file, or a `.env` exposure), an attacker from any IP can claim submissions, report arbitrary verdicts (marking wrong answers as accepted), or deregister legitimate workers. This directly threatens contest integrity and exam validity.

**Remediation:**
```typescript
// BAD
if (!allowlist) {
  return true;
}

// GOOD — require explicit opt-in or deny by default in production
if (!allowlist) {
  if (process.env.NODE_ENV === "production") {
    logger.error("[security] JUDGE_ALLOWED_IPS is not configured in production — denying all judge API access");
    return false;
  }
  return true; // allow in development only
}
```

---

### HIGH-2: Raw SQL in Judge Claim Endpoint Uses Named Parameter Substitution but Parameter Names Come from Hardcoded Strings

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **OWASP** | A03: Injection |
| **Location** | `src/app/api/v1/judge/claim/route.ts:126-224`, `src/lib/db/queries.ts:66-91` |
| **Exploitability** | Not directly exploitable via user input (parameter names are hardcoded) |
| **Blast Radius** | If any parameter value were to contain SQL metacharacters in a future refactor, full database compromise |

**Issue:** The judge claim endpoint uses large raw SQL strings with named parameter substitution (`@claimToken`, `@staleClaimTimeoutMs`, etc.). The `namedToPositional()` function in `queries.ts` converts `@name` to `$1, $2...` and validates parameter names with `/^[a-zA-Z_]\w*$/`. Parameter values are passed via `pg.Pool.query()` which uses parameterized queries.

**Current state is safe** because:
1. All `@param` names are hardcoded strings, not user input
2. `namedToPositional()` converts to positional parameters (`$1`, `$2`) before execution
3. `pg.Pool.query()` uses server-side parameterized queries

**However, the risk is structural:** This pattern makes it very easy for a future developer to introduce SQL injection by:
- Constructing the SQL string dynamically with user input
- Using `sql` template literals alongside raw strings
- Adding `@param` names derived from request data

The `namedToPositional()` regex `/@(\w+)/g` will greedily replace any `@word` in the SQL string, so if a developer ever writes `@${userProvidedValue}` in a template literal, it becomes injectable.

**Remediation:**
```typescript
// GOOD — add explicit allowlist validation for named parameters
function namedToPositional(
  sql: string,
  params?: Record<string, unknown>,
  allowedParams?: Set<string> // NEW: explicit allowlist
): { text: string; values: unknown[] } {
  if (!params) return { text: sql, values: [] };
  const values: unknown[] = [];
  const paramNames: string[] = [];
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    if (!/^[a-zA-Z_]\w*$/.test(name)) {
      throw new Error(`Invalid SQL parameter name: ${name}`);
    }
    if (allowedParams && !allowedParams.has(name)) {
      throw new Error(`Unexpected SQL parameter: ${name}`);
    }
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing SQL parameter: ${name}`);
    }
    let idx = paramNames.indexOf(name);
    if (idx === -1) {
      paramNames.push(name);
      values.push(params[name]);
      idx = paramNames.length - 1;
    }
    return `$${idx + 1}`;
  });
  return { text, values };
}
```

Additionally, add a code comment at the top of the claim route's raw SQL: `// SECURITY: @param names are hardcoded and must never be derived from user input.`

---

### HIGH-3: Judge Worker Secret Token Hash Comparison Leaks Token Length via SHA-256

| Field | Value |
|-------|-------|
| **Severity** | HIGH |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/lib/judge/auth.ts:68`, `src/lib/security/timing.ts:9-18` |
| **Exploitability** | Local network / requires timing instrumentation |
| **Blast Radius** | Judge worker impersonation |

**Issue:** When a judge worker authenticates with a per-worker secret, the flow is:
1. `isJudgeAuthorizedForWorker()` receives the Bearer token
2. Calls `hashToken(providedToken)` which computes `SHA-256(providedToken)`
3. Calls `safeTokenCompare(hashToken(provided), storedHash)`

`safeTokenCompare` uses HMAC with a random key to avoid timing leaks on variable-length inputs. However, `hashToken()` at line 22 computes a raw SHA-256 hash of the provided token. This hash always produces a 64-character hex string, so the length leak is not an issue for the comparison itself.

**The real concern:** The `isJudgeAuthorizedForWorker` function at line 68 calls `hashToken(providedToken)` before comparison. If an attacker sends an extremely long token, the SHA-256 computation itself becomes a timing oracle. An attacker can distinguish "token is being hashed" (token matched a worker) from "token is not being hashed" (no worker found, falls back to shared token check). This reveals whether a given workerId exists in the database.

**Remediation:**
```typescript
// BAD — SHA-256 is only computed when worker is found
if (worker?.secretTokenHash) {
  if (safeTokenCompare(hashToken(providedToken), worker.secretTokenHash)) {
    return { authorized: true };
  }
  return { authorized: false, error: "invalidWorkerToken" };
}
// If worker not found, falls through without hashing → timing difference

// GOOD — always compute the hash to eliminate timing oracle
const providedHash = hashToken(providedToken); // always compute
if (worker?.secretTokenHash) {
  if (safeTokenCompare(providedHash, worker.secretTokenHash)) {
    return { authorized: true };
  }
  return { authorized: false, error: "invalidWorkerToken" };
}
```

---

### MEDIUM-1: Playground/Compiler Run Endpoint Exposed to All Authenticated Users Without Assignment Context

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A01: Broken Access Control |
| **Location** | `src/app/api/v1/playground/run/route.ts:19-21` |
| **Exploitability** | Remote, authenticated (any user with `content.submit_solutions` capability) |
| **Blast Radius** | Resource exhaustion via repeated code execution; no assignment-scoped restrictions |

**Issue:** The playground run endpoint requires only the `content.submit_solutions` capability, which is typically granted to students. Unlike the compiler run endpoint (`/api/v1/compiler/run`), the playground endpoint does not check `platformMode` or `assignmentContext`. This means students can always execute arbitrary code in the sandbox regardless of whether an exam is in "restricted" mode.

The compiler run endpoint correctly checks `getPlatformModePolicy(platformMode).restrictStandaloneCompiler` and returns 403 when the mode is restricted. The playground endpoint does not.

**Remediation:** Add the same platform mode check to the playground endpoint:
```typescript
const platformMode = await getEffectivePlatformMode({
  userId: user.id,
  assignmentId: null,
});
if (getPlatformModePolicy(platformMode).restrictStandaloneCompiler) {
  return apiError("compilerDisabledInCurrentMode", 403);
}
```

---

### MEDIUM-2: Docker Socket Proxy in Production Allows Image Listing and Inspecting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A05: Security Misconfiguration |
| **Location** | `docker-compose.production.yml:64-76` |
| **Exploitability** | Requires container-level access on the app server |
| **Blast Radius** | Information disclosure (image names, tags, IDs); lateral movement if `IMAGES=1` enables pulls |

**Issue:** The `tecnativa/docker-socket-proxy` in the production compose file is configured with `IMAGES=1`, which allows image listing and inspection. The `BUILD=0`, `POST=0`, `DELETE=0` settings correctly restrict mutations, but `IMAGES=1` allows the app container to list and inspect all Docker images on the host, including infrastructure images. If the app container is compromised, the attacker can enumerate all judge language images and their metadata.

The worker compose file uses `IMAGES=${WORKER_DOCKER_PROXY_IMAGES:-0}`, which defaults to disabled — a better posture.

**Remediation:** In production, set `IMAGES=0` unless image management is actively needed from the app container:
```yaml
docker-proxy:
  environment:
    - CONTAINERS=1
    - IMAGES=0    # Disable unless actively needed
    - BUILD=0
    - POST=0
    - DELETE=0
```

---

### MEDIUM-3: Compiler Local Fallback Executes Docker CLI Without Full Sandbox When Seccomp Profile Is Missing

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A05: Security Misconfiguration |
| **Location** | `src/lib/compiler/execute.ts:362-370` |
| **Exploitability** | Requires admin to misconfigure the deployment (missing seccomp file) |
| **Blast Radius** | Weaker sandbox for student-submitted code execution |

**Issue:** When the local Docker fallback is used (Rust runner unavailable), if the seccomp profile file is missing, the code logs a warning once but proceeds to run the container with only Docker's default seccomp policy. The default policy is more permissive than the custom profile. The Rust worker correctly refuses to run without the custom seccomp profile (returns `JudgeEnvironmentError`), but the Node.js fallback only warns.

```typescript
// Line 362-370
if (HAS_CUSTOM_SECCOMP_PROFILE) {
  args.push(`--security-opt=seccomp=${SECCOMP_PROFILE_PATH}`);
} else if (!hasLoggedMissingSeccompProfile) {
  hasLoggedMissingSeccompProfile = true;
  logger.warn(
    { path: SECCOMP_PROFILE_PATH },
    "[compiler] Seccomp profile not found; container will run with default seccomp policy"
  );
}
```

**Remediation:**
```typescript
// GOOD — refuse to run without custom seccomp in production
if (!HAS_CUSTOM_SECCOMP_PROFILE) {
  if (process.env.NODE_ENV === "production") {
    return {
      stdout: "",
      stderr: "Seccomp profile not found — refusing to execute in production without sandbox hardening",
      exitCode: null,
      executionTimeMs: 0,
      timedOut: false,
      oomKilled: false,
      compileOutput: null,
    };
  }
  if (!hasLoggedMissingSeccompProfile) {
    hasLoggedMissingSeccompProfile = true;
    logger.warn(/* ... */);
  }
}
```

---

### MEDIUM-4: Anti-Cheat Events Use nanoid() for IDs — Predictable and Not Cryptographically Random

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:99,115` |
| **Exploitability** | Theoretical — requires guessing event IDs |
| **Blast Radius** | Anti-cheat event tampering or deletion |

**Issue:** Anti-cheat event IDs are generated with `nanoid()` which uses a non-cryptographic PRNG in some environments. While nanoid's default alphabet provides 21 characters of entropy (126 bits), it is not guaranteed to use `crypto.getRandomValues()` in all bundler configurations. The submission ID generator correctly uses `crypto.getRandomValues()` directly.

If event IDs are predictable, an attacker could theoretically delete or modify anti-cheat events if an admin API for that purpose is ever added, or if event IDs are used as authorization tokens.

**Remediation:** Use `crypto.randomUUID()` or the same `crypto.getRandomValues()` pattern used for submission IDs.

---

### MEDIUM-5: Contest Access Code Redemption Has No Brute-Force Protection Beyond Rate Limiting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A07: Authentication Failures |
| **Location** | `src/app/api/v1/contests/join/route.ts` |
| **Exploitability** | Remote, authenticated — any user can attempt codes |
| **Blast Radius** | Unauthorized contest access |

**Issue:** Access codes are short (typically 6-8 character alphanumeric strings). The endpoint has rate limiting (`contest:join`) but no account-style lockout. A determined attacker could enumerate codes at the rate limit threshold. With a 6-character alphanumeric code (36^6 = ~2.2 billion possibilities) and a rate limit of, say, 100/minute, brute-forcing is impractical. However, if access codes are shorter or predictable, the risk increases.

**Remediation:** Add exponential backoff specific to access code attempts, similar to the login rate limiter. Also consider invalidating or locking access codes after N failed attempts.

---

### MEDIUM-6: No Integrity Verification on Judge Worker → App Server Communication

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A08: Integrity Failures |
| **Location** | `judge-worker-rs/src/api.rs`, `src/app/api/v1/judge/poll/route.ts` |
| **Exploitability** | Requires man-in-the-middle position on internal network |
| **Blast Radius** | Verdict tampering — attacker could modify judge results in transit |

**Issue:** The judge worker communicates with the app server over HTTP (see `docker-compose.production.yml:128`: `JUDGE_BASE_URL=http://app:3000/api/v1`). While the traffic stays within the Docker network, a compromised container on the same network could intercept and modify verdict data. The communication is authenticated via Bearer token but not encrypted or integrity-protected.

**Remediation:** If the threat model includes container compromise, use mTLS or HMAC-signed payloads for judge worker communication. At minimum, document that the threat model assumes a trusted internal network.

---

### MEDIUM-7: Token InvalidatedAt Check Uses Integer-Second Comparison Which Creates a 1-Second Window

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A07: Authentication Failures |
| **Location** | `src/lib/auth/session-security.ts:26-36` |
| **Exploitability** | Requires precise timing within a 1-second window |
| **Blast Radius** | Session persists for up to 1 second after admin invalidation |

**Issue:** `isTokenInvalidated()` compares `authenticatedAtSeconds` (truncated to integer) against `tokenInvalidatedAt` (also truncated). If an admin invalidates a token at time T, and the token's `authenticatedAt` is T-0.5, truncation gives `authenticatedAtSeconds = T-1`, which is less than the invalidation time, so the token is correctly invalidated. However, if `authenticatedAt` is T+0.3 (set during the same second), truncation gives `T`, which is equal to or greater than `T`, and the token survives.

This creates a window where a session created in the same second as an invalidation may not be properly revoked. The `clearAuthToken` function mitigates this by setting `authenticatedAt = 0`, but the `syncTokenWithUser` call in the JWT callback refreshes the token on every request.

**Remediation:** Use millisecond-precision comparison or round both values down to the nearest second consistently.

---

### MEDIUM-8: Hardcoded Development Encryption Key in Source Code

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/lib/security/encryption.ts:13-16` |
| **Exploitability** | Requires non-production deployment with NODE_ENCRYPTION_KEY unset |
| **Blast Radius** | Decryption of API keys and plugin configs in dev/staging |

**Issue:** A fixed development encryption key is hardcoded in source code:
```typescript
const DEV_ENCRYPTION_KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex"
);
```

This is safe in production (the function throws if `NODE_ENCRYPTION_KEY` is not set). However, if a developer deploys to staging without setting the env var and with `NODE_ENV` not set to `production`, all encrypted data is protected by a key that is publicly visible in the git repository.

**Remediation:** Consider removing the development fallback entirely and requiring the env var in all environments, or at minimum, add a startup banner warning when the dev key is active.

---

### LOW-1: Submission ID Generation Uses 32 Hex Characters (128 bits) — Adequate but Not Maximum

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/lib/submissions/id.ts:13-17` |
| **Exploitability** | Not exploitable with current technology |
| **Blast Radius** | ID collision if generation scale increases dramatically |

**Issue:** Submission IDs are 32 hex characters (16 bytes / 128 bits) generated with `crypto.getRandomValues()`. This provides approximately 2^64 collision resistance (birthday bound), which is sufficient for current scale. However, nanoid with 21 characters provides 126 bits — nearly the same entropy in fewer characters. No action required; this is informational.

---

### LOW-2: DUMMY_PASSWORD_HASH in Auth Config Is Not Rotated Across Deployments

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A07: Authentication Failures |
| **Location** | `src/lib/auth/config.ts:50-51` |
| **Exploitability** | Not directly exploitable — used only for timing-safe comparison when user does not exist |
| **Blast Radius** | None — the hash is of a random string, not an actual password |

**Issue:** The `DUMMY_PASSWORD_HASH` is an Argon2id hash of a random string, hardcoded in source to prevent user enumeration via response timing. This is a well-known pattern and is correctly implemented. However, all deployments share the same dummy hash. If an attacker can measure Argon2id verification time precisely, they could distinguish "user exists" from "user does not exist" if the real hash has different memory/time parameters.

**Remediation:** Generate a per-instance dummy hash at first startup and store it, or randomize the Argon2id parameters slightly for the dummy hash to match the production parameters exactly.

---

### LOW-3: XSS via dangerouslySetInnerHTML on Legacy HTML Descriptions Is Sanitized but Worth Monitoring

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A03: Injection (XSS) |
| **Location** | `src/components/problem-description.tsx:51`, `src/lib/security/sanitize-html.ts` |
| **Exploitability** | Requires admin to inject malicious HTML (admin is trusted) |
| **Blast Radius** | Stored XSS affecting all users who view the problem |

**Issue:** Legacy HTML descriptions are rendered with `dangerouslySetInnerHTML` after passing through DOMPurify with a restricted tag/attribute set. The `ALLOWED_URI_REGEXP` correctly restricts to `https?`, `mailto`, and root-relative URLs. Image `src` is restricted to root-relative paths only. This is well-configured. The remaining risk is a DOMPurify bypass (which has happened historically) or a misconfiguration.

**Remediation:** Add a Content-Security-Policy header as defense-in-depth:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
```

---

### LOW-4: Shell Command Validation Allows `;` Which Enables Command Chaining

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A03: Injection |
| **Location** | `src/lib/compiler/execute.ts:159-164`, `judge-worker-rs/src/runner.rs:116-167` |
| **Exploitability** | Requires compromised admin account or DB injection into language_configs |
| **Blast Radius** | Confined to Docker sandbox (network=none, cap-drop=ALL, read-only, seccomp) |

**Issue:** The shell command validator intentionally allows `;` for admin-configured compile commands. The code comments explain this is a trust boundary decision — commands come from `language_configs` rows that only admins can modify. The Docker sandbox is the primary security boundary. This is documented and acceptable given the trust model, but worth noting that a compromised admin account or SQL injection into `language_configs` could execute arbitrary chained commands within the sandbox.

---

### LOW-5: Rust Dependency Vulnerabilities in judge-worker-rs

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A06: Vulnerable Components |
| **Location** | `judge-worker-rs/Cargo.lock` |
| **Exploitability** | Varies by CVE |
| **Blast Radius** | Varies |

**Issue:** `cargo audit` found 3 vulnerabilities:
1. **RUSTSEC-2026-0099** (rustls-webpki 0.103.9): Name constraints accepted for wildcard certificates
2. **RUSTSEC-2026-0049** (rustls-webpki 0.103.9): CRL matching logic error
3. **RUSTSEC-2026-0097** (rand 0.9.2): Unsound with custom logger using `rand::rng()`

These affect TLS connections made by the worker (to the app server) and are not directly exploitable in the current deployment since the worker communicates over HTTP on an internal network. However, if TLS is ever enabled for worker-to-app communication, the rustls vulnerabilities become relevant.

**Remediation:** Upgrade `rustls-webpki` to >=0.103.12 and `rand` to the latest patch version.

---

### LOW-6: X-Forwarded-For Hop Count Configuration Is Per-Process and Not Validated Against Actual Proxy Topology

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **OWASP** | A05: Security Misconfiguration |
| **Location** | `src/lib/security/ip.ts:7-10` |
| **Exploitability** | Requires misconfigured TRUSTED_PROXY_HOPS |
| **Blast Radius** | IP-based rate limiting bypass |

**Issue:** `TRUSTED_PROXY_HOPS` defaults to 1 and is read from an env var. If an operator sets it incorrectly (e.g., to 0 when there is one proxy, or to 2 when there is only one), the extracted client IP will be wrong. Setting it too high allows IP spoofing via X-Forwarded-For; setting it too low means rate limits apply to the proxy IP instead of the client.

The `isValidIp()` function provides some defense by validating the extracted IP format, and the code falls back to the first entry if there are fewer entries than expected. This is reasonably safe.

**Remediation:** Add a startup validation that logs a warning if `TRUSTED_PROXY_HOPS` is set to a value that seems inconsistent with the deployment topology.

---

### INFO-1: npm audit Reports Zero Vulnerabilities

| Field | Value |
|-------|-------|
| **Severity** | INFO |
| **OWASP** | A06: Vulnerable Components |
| **Location** | `package-lock.json` |

The Node.js dependency tree (1125 total dependencies) reports zero known vulnerabilities. This is excellent.

---

### INFO-2: Password Hashing Uses Argon2id with OWASP-Recommended Parameters

| Field | Value |
|-------|-------|
| **Severity** | INFO |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/lib/security/password-hash.ts:4-9` |

Argon2id with memoryCost=19456 (19 MiB), timeCost=2, parallelism=1 matches OWASP minimum recommendations. Legacy bcrypt hashes are transparently rehashed on successful login. Well implemented.

---

### INFO-3: Token Comparison Uses HMAC-Based Constant-Time Comparison

| Field | Value |
|-------|-------|
| **Severity** | INFO |
| **OWASP** | A02: Cryptographic Failures |
| **Location** | `src/lib/security/timing.ts:9-18` |

The `safeTokenCompare` function HMACs both inputs with an ephemeral key before comparing with `timingSafeEqual`. This prevents length-based timing oracles. Well implemented.

---

### INFO-4: Docker Sandbox Configuration Is Comprehensive

| Field | Value |
|-------|-------|
| **Severity** | INFO |
| **OWASP** | A05: Security Misconfiguration |
| **Location** | `judge-worker-rs/src/docker.rs:257-289`, `src/lib/compiler/execute.ts:332-359` |

The Docker execution sandbox includes:
- `--network none` (no network access)
- `--memory` and `--memory-swap` limits
- `--cpus 1`
- `--pids-limit 128`
- `--read-only` root filesystem
- `--cap-drop=ALL`
- `--security-opt=no-new-privileges`
- Custom seccomp profile
- `--user 65534:65534` (nobody)
- `--ulimit nofile=1024:1024`
- `--tmpfs` with noexec for run phase
- Output truncation at 4 MiB
- Source code size limit at 256 KB (Rust) / 64 KB (Node)
- Concurrency limiting via semaphore

This is a robust sandbox configuration. The only gap is the seccomp fallback in the Node.js path (see MEDIUM-3).

---

## Security Checklist

- [x] No hardcoded production secrets in source code
- [x] All inputs validated via Zod schemas
- [x] SQL injection prevention verified (parameterized queries, Drizzle ORM, `escapeLikePattern`)
- [x] Authentication/authorization verified on all protected API routes
- [x] Password hashing uses Argon2id with OWASP parameters
- [x] Rate limiting is transactionally atomic (SELECT FOR UPDATE)
- [x] CSRF protection via X-Requested-With header + Origin validation
- [x] Docker image validation restricts to `judge-*` prefix
- [x] File upload validation (MIME type, size, ZIP bomb protection)
- [x] Path traversal prevention in file storage (`resolveStoredPath`)
- [x] XSS prevention via DOMPurify for HTML, `skipHtml` for Markdown
- [x] Submission visibility scoped by ownership and capability
- [x] Hidden test case outputs not leaked to students
- [ ] **Judge IP allowlist defaults to allow-all** (HIGH-1)
- [ ] **Raw SQL pattern needs structural guardrails** (HIGH-2)
- [ ] **Token hash comparison has timing oracle** (HIGH-3)
- [ ] **Playground bypasses platform mode restrictions** (MEDIUM-1)
- [ ] **Seccomp profile missing in Node.js fallback only warns** (MEDIUM-3)
- [ ] **Rust dependency CVEs need patching** (LOW-5)
- [ ] **Hardcoded dev encryption key** (MEDIUM-8)
- [ ] **No transport encryption for judge worker communication** (MEDIUM-6)

---

## Remediation Priority

| Priority | Finding | Timeline |
|----------|---------|----------|
| P1 (Urgent) | HIGH-1: Judge IP allowlist defaults to allow-all | 1 week |
| P1 (Urgent) | HIGH-3: Timing oracle in worker auth | 1 week |
| P2 (Important) | HIGH-2: Raw SQL structural risk | 1 month |
| P2 (Important) | MEDIUM-1: Playground bypasses platform mode | 1 month |
| P2 (Important) | MEDIUM-3: Seccomp fallback in Node.js | 1 month |
| P3 (Planned) | MEDIUM-2: Docker proxy IMAGES=1 | 1 month |
| P3 (Planned) | MEDIUM-6: No TLS for worker communication | 1 month |
| P3 (Planned) | MEDIUM-7: Token invalidation 1-second window | 1 month |
| P3 (Planned) | MEDIUM-8: Hardcoded dev encryption key | 1 month |
| P4 (Backlog) | MEDIUM-4: nanoid in anti-cheat | Backlog |
| P4 (Backlog) | MEDIUM-5: Access code brute force | Backlog |
| P4 (Backlog) | LOW-1 through LOW-6 | Backlog |

---

## Architectural Security Assessment

**Strengths:**
1. The Docker sandbox for code execution is well-hardened with defense-in-depth (seccomp + capabilities + network isolation + resource limits + user namespace).
2. The `createApiHandler` middleware enforces auth, CSRF, rate limiting, and input validation consistently across all routes.
3. Submission visibility is properly scoped — students cannot see other students' source code, and hidden test case outputs are filtered.
4. The capability-based RBAC system provides fine-grained authorization.
5. The Argon2id password hashing with transparent bcrypt migration is best-practice.
6. The `safeTokenCompare` HMAC-based constant-time comparison is a sophisticated defense against timing attacks.

**Weaknesses:**
1. The judge API is the most security-critical surface (code execution + verdict authority) but has the weakest network-level controls (allow-all IP default, HTTP-only internal communication).
2. The raw SQL pattern in the claim endpoint creates a structural injection risk that is not currently exploitable but could become so through a small refactor.
3. Platform mode restrictions can be bypassed through the playground endpoint, which could undermine exam integrity.

**Overall Risk Level: MEDIUM** — The platform has a strong security foundation but three HIGH-severity findings require attention. The most impactful scenario is a compromised JUDGE_AUTH_TOKEN combined with the default-allow IP policy, which would allow an attacker to report arbitrary verdicts on submissions, directly threatening exam and contest integrity.
