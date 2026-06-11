# Deep Security Review — 2026-04-18

**Scope:** Full application security — auth, secrets, judge execution, Docker, API routes, encryption, sandboxing
**Method:** Three parallel opus-grade agents reviewing auth/secrets, judge execution, and code quality independently, then consolidated with deduplication.
**Files Reviewed:** 50+ core files across src/lib, src/app, judge-worker-rs, docker/, docker-compose*.yml, .env*

---

## Verdict: HIGH RISK → REMEDIATION IN PROGRESS

**Remediation status as of 2026-04-19:** All Critical and most High/Medium findings have been fixed. See commits `f0fcf27e` through `b542838e`.

3 Critical, 7 High, 11 Medium, 6 Low = **27 findings**

The codebase demonstrates strong security instincts (Argon2id, HKDF key derivation, DOMPurify, CSRF, timing-safe comparisons, Docker sandbox defense-in-depth). The issues are concentrated in secrets management, a single sandbox escape vector, and defense-in-depth gaps — not in core design failures.

---

## Critical (Fix Immediately)

### S-CR1. Plaintext Production Secrets in .env Files

**OWASP:** A02, A07 | **Exploitability:** Local | **Blast Radius:** Full infrastructure takeover

| File | Content |
|------|---------|
| `.env:6-9,75-76` | Production `AUTH_SECRET`, `JUDGE_AUTH_TOKEN`, `ALGO_API_KEY` |
| `.env:52-70` | SSH commands with embedded passwords (`mcl1234~`) |
| `.env.deploy:6` | `SSH_PASSWORD=mcl1234~` |
| `.env.worv:3-6` | `WORV_ADMIN_PASSWORD=msl1234~`, public IP |
| `.env.production:8` | `POSTGRES_PASSWORD=judgekit_prod_change_me` (default!) |

A single file compromise gives: JWT forgery, fake judge results, SSH access, API key abuse, full DB access.

**Remediation:**
1. **Rotate ALL exposed secrets immediately** — every secret that has ever been in these files must be considered compromised
2. Move production secrets to a vault (1Password CLI, HashiCorp Vault, AWS Secrets Manager)
3. `.env` files should contain only non-secret configuration
4. Replace SSH password auth with key-based auth (`PasswordAuthentication no` in sshd_config)
5. Remove all comment blocks containing SSH commands/passwords from `.env` files
6. Add pre-commit hook or CI check scanning for secret patterns

---

### S-CR2. Ghostscript `-dNOSAFER` Disables Sandboxing in PostScript Judge

**OWASP:** A03 | **File:** `judge-worker-rs/src/languages.rs:757` | **Exploitability:** Remote, any user submitting PostScript | **Blast Radius:** Arbitrary file read/write in container, potential container escape via Ghostscript RCE CVEs

```rust
static POSTSCRIPT_RUN: &[&str] = &["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dNOSAFER", "/workspace/solution.ps"];
```

The `-dNOSAFER` flag explicitly disables Ghostscript's SAFER sandbox. This is a well-known security anti-pattern (CVE-2018-16509, CVE-2019-14811, CVE-2020-36773, etc.). With `-dNOSAFER`, submitted PostScript code can execute arbitrary file I/O via the `file` operator.

**Remediation:**
```rust
// Remove -dNOSAFER. Modern Ghostscript (9.50+) defaults to SAFER mode.
static POSTSCRIPT_RUN: &[&str] = &["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "/workspace/solution.ps"];

// If file access is needed for specific programs, use explicit SAFER with permits:
static POSTSCRIPT_RUN: &[&str] = &["gs", "-q", "-dNODISPLAY", "-dBATCH", "-dNOPAUSE", "-dSAFER",
  "-sPermitFileReading=/workspace", "/workspace/solution.ps"];
```

---

### S-CR3. Default PostgreSQL Password Never Changed in Production

**OWASP:** A02, A07 | **File:** `.env.production:8` | **Exploitability:** Network-adjacent (any container on Docker network) | **Blast Radius:** Full database access

`POSTGRES_PASSWORD=judgekit_prod_change_me` — this placeholder was never changed. Any container on the `judgekit_app` Docker network can connect with `judgekit:judgekit_prod_change_me`.

**Remediation:**
```bash
# Generate a strong random password
POSTGRES_PASSWORD=$(openssl rand -base64 32)
# Then rotate on the production server, update .env.production, restart containers
```

---

## High (Fix Within 1 Week)

### S-H1. RUNNER_AUTH_TOKEN Not Enforced at Startup

**File:** `src/lib/compiler/execute.ts:57-60` | **OWASP:** A02, A05

When `COMPILER_RUNNER_URL` is set but `RUNNER_AUTH_TOKEN` is missing, the app only logs an error but continues running. The production `.env.production` does not include `RUNNER_AUTH_TOKEN` at all.

**Remediation:** Make the check fatal, like `getValidatedAuthSecret`:
```typescript
if (COMPILER_RUNNER_URL && !RUNNER_AUTH_TOKEN && process.env.NODE_ENV === "production") {
  throw new Error("RUNNER_AUTH_TOKEN must be set when COMPILER_RUNNER_URL is configured in production.");
}
```

---

### S-H2. Docker Socket Proxy Allows Container Creation (POST=1)

**File:** `docker-compose.production.yml:69` | **OWASP:** A01

`POST=1` allows `docker create`/`docker start` via the proxy. A compromised judge-worker container could spawn new containers with different security settings (e.g., `--privileged`, host volume mounts).

**Remediation:** Remove `POST=1` — the worker spawns containers via Docker CLI on the host, not through the proxy. The proxy is only needed for listing/inspecting from the app container:
```yaml
- POST=0  # Block container creation through the proxy
```

---

### S-H3. Runner API `/docker/build` Endpoint Allows Arbitrary Image Building

**File:** `judge-worker-rs/src/runner.rs:504-537` | **OWASP:** A01, A03

An authenticated attacker (with runner auth token) can build arbitrary Docker images via this endpoint. The `docker build` runs with the repo root as context (`.`), giving the Dockerfile access to the entire source tree. The attacker could then use `/run` to execute code in that image.

**Remediation:** Remove the `/docker/build` endpoint from the runner API entirely. Image building should happen out-of-band via the deploy script, not through a network-accessible endpoint.

---

### S-H4. Compile Phase Allows 4x Swap, Enabling Memory-Exhaustion Attacks

**File:** `judge-worker-rs/src/docker.rs:266-269` | **OWASP:** A04

With default compilation memory limit of 2048 MB, a compile container can use up to 8192 MB of swap. A pathological source file or malicious compile command could exhaust host resources, causing OOM on the host.

**Remediation:** Cap swap to 2x with a hard ceiling:
```rust
const MAX_COMPILE_SWAP_MB: u32 = 4096;
let compile_swap = (mem_limit * 2).min(MAX_COMPILE_SWAP_MB);
format!("{}m", compile_swap)
```

---

### S-H5. `validateShellCommand` Allows `&&` and `;` — Command Chaining in `sh -c`

**File:** `src/lib/compiler/execute.ts:126` | **OWASP:** A03 | **Note:** Trust boundary is admin role; sandbox mitigates blast radius

Commands are passed to `sh -c`, meaning `&&` and `;` enable chaining arbitrary commands. If admin credentials or `language_configs` table is compromised, an attacker could inject malicious compile commands.

**Remediation (defense-in-depth):** Add a secondary allowlist check:
```typescript
const ALLOWED_COMMAND_PREFIXES = [
  'gcc', 'g++', 'clang', 'clang++', 'javac', 'go build', 'rustc',
  'python3', 'node', 'dotnet', 'mcs', 'ghc', 'dart', 'swiftc',
];
function validateShellCommandStrict(cmd: string): boolean {
  if (!validateShellCommand(cmd)) return false;
  const firstCommand = cmd.split(/&&|;/)[0].trim().split(/\s+/)[0];
  return ALLOWED_COMMAND_PREFIXES.some(prefix => firstCommand.startsWith(prefix));
}
```

---

### S-H6. Plaintext SSH Passwords in Deployment Config

**File:** `.env.deploy:6`, `.env.worv:3-6` | **OWASP:** A02, A07

`SSH_PASSWORD=mcl1234~` and `WORV_ADMIN_PASSWORD=msl1234~` with public IP `3.38.130.230`.

**Remediation:** Replace with SSH key-based auth. Disable password authentication on all servers.

---

### S-H7. Deploy Script Comments Leak SSH Commands with Embedded Passwords

**File:** `.env:52-70` | **OWASP:** A07, A09

Comment blocks contain exact SSH commands with passwords and `StrictHostKeyChecking=no`.

**Remediation:** Remove all operational comment blocks from `.env` files. Move to a secure wiki/runbook.

---

## Medium (Fix Within 1 Month)

### S-M1. Playground Run Endpoint Has No Capability Check

**File:** `src/app/api/v1/playground/run/route.ts:19-20`

Any authenticated user (including students) can execute arbitrary code in Docker containers. The compiler run endpoint checks `caps.has("content.submit_solutions")` but the playground does not.

**Remediation:** Add `capabilities: ["content.submit_solutions"]` or equivalent role restriction.

---

### S-M2. `redactSecret` Leaks Last 4 Characters of Plaintext Secrets

**File:** `src/lib/security/encryption.ts:107`

`return \u2022\u2022\u2022\u2022${value.slice(-4)}` reduces brute-force search space for API keys stored without the `enc:` prefix.

**Remediation:** Full redaction for all secrets regardless of encryption status.

---

### S-M3. Auth Cache Allows Revoked User Access for Up to 2 Seconds

**File:** `src/proxy.ts:24`

Deactivated/invalidated users may retain access for up to 2 seconds after revocation due to `AUTH_CACHE_TTL_MS`.

**Remediation:** Reduce TTL to 500ms or implement cache invalidation on `tokenInvalidatedAt` updates. Bypass cache for sensitive routes.

---

### S-M4. Workspace Directory Created with 0o777 Permissions

**Files:** `judge-worker-rs/src/runner.rs:674-679`, `src/lib/compiler/execute.ts:536`

World-readable/writable workspace means any local user can read submission source code and test cases during compilation.

**Remediation:** Use `0o770` with a dedicated group, or ACLs: `setfacl -m u:65534:rwx workspace_dir`.

---

### S-M5. Docker Images Referenced by Tag, Not SHA Digest

**Files:** `judge-worker-rs/src/languages.rs` (all `docker_image` fields), `docker-compose.production.yml:65`

Tags can be mutated (registry compromise, MITM). All judge images and the docker-socket-proxy use `:latest`.

**Remediation:** Pin to SHA256 digests in production.

---

### S-M6. Missing Security Headers on Runner API

**File:** `judge-worker-rs/src/runner.rs:833-845`

The runner HTTP API does not set CSP, X-Content-Type-Options, or X-Frame-Options.

**Remediation:** Add security headers via `tower_http::set_header::SetResponseHeaderLayer`.

---

### S-M7. Seccomp Profile Permits Network Syscalls Despite `--network=none`

**File:** `docker/seccomp-profile.json:13-16, 233-234`

`socket`, `bind`, `listen`, `connect`, etc. are explicitly allowed for AF_UNIX compatibility. Accepted trade-off, but consider restricting for compiled languages that don't need them.

---

### S-M8. `docker-socket-proxy:latest` Tag Not Pinned

**Files:** `docker-compose.production.yml:65`, `docker-compose.worker.yml:19`, `docker-compose.test-backends.yml:60`

Critical infrastructure component using `:latest` without version pin.

**Remediation:** Pin to a specific version tag or SHA digest.

---

### S-M9. `validateShellCommand` Regex Bypassable

**File:** `src/lib/compiler/execute.ts:126-127`

`\beval\b` only catches standalone `eval`. Variations like `bash -c eval`, `command eval` bypass. Since the sandbox is the true security boundary, the regex provides a false sense of security.

**Remediation:** Either remove the regex (document sandbox as true boundary) or switch to an allowlist approach.

---

### S-M10. `RUNNER_AUTH_TOKEN` Logged as Error but Not Enforced

**File:** `src/lib/compiler/execute.ts:58-59`

(Duplicate of S-H1, included here for completeness with the medium-severity aspect: the logging level should also be `fatal` or the app should exit.)

---

### S-M11. No CHECK Constraints on Score and Penalty Ranges

**File:** `src/lib/db/schema.pg.ts:339,646`

`latePenalty` can be negative (becomes a bonus). `overrideScore` has no range constraint. The codebase already uses CHECK constraints elsewhere (`active_tasks >= 0`).

**Remediation:** Add `check("assignments_late_penalty_nonneg", sql\`late_penalty >= 0\`)`.

---

## Low (Backlog)

### S-L1. User-Agent Hash Mismatch is Audit-Only, Not a Hard Reject
**File:** `src/proxy.ts:240-253` — Stolen session tokens used from a different browser are logged but not rejected. Documented as intentional.

### S-L2. No Automated Secret Rotation Mechanism
Project-wide — AUTH_SECRET, JUDGE_AUTH_TOKEN, encryption keys are static. Rotation requires downtime and manual coordination.

### S-L3. `Date.now()` Not Monotonic for `$defaultFn` Timestamps
**File:** `src/lib/db/schema.pg.ts:50-56` — `new Date(Date.now())` is redundant and may not be monotonic after clock adjustments. Simplify to `new Date()`.

### S-L4. SSE `generateConnectionId` Uses `Math.random()`
**File:** `src/app/api/v1/submissions/[id]/events/route.ts:32` — Not collision-resistant. Use `crypto.randomUUID()`.

### S-L5. `console.log/warn` Used Instead of Structured Logger
**Files:** `src/lib/db/migrate.ts:4,6`, `src/lib/security/encryption.ts:36,70`, `src/lib/judge/sync-language-configs.ts:58,61,77`

### S-L6. Default Password `"password"` in Bulk-Create Dialog
**File:** `src/app/(dashboard)/dashboard/admin/users/bulk-create-dialog.tsx:43` — Default form value is `"password"`. Could lead to accounts with trivially guessable passwords.

---

## Security Checklist

- [x] No hardcoded secrets in committed code (gitignored `.env` files)
- [x] All inputs validated (Zod schemas on all API routes)
- [x] Injection prevention (Drizzle ORM parameterized queries, execFile with array args)
- [x] Authentication/authorization (JWT + Argon2id, capability-based access control)
- [x] Dependencies audited (npm audit: 0 vulnerabilities)
- [x] Password hashing (Argon2id with OWSP params, bcrypt transparent rehash)
- [x] Anti-enumeration (timing-safe dummy hashes for non-existent users)
- [x] CSRF protection (multi-layered: X-Requested-With, Origin, Sec-Fetch-Site)
- [x] Docker sandboxing (network=none, cap-drop=ALL, read-only, seccomp, pids-limit, uid 65534)
- [x] CSP (per-request cryptographic nonce)
- [x] Security headers (HSTS 2yr, X-Content-Type-Options, X-Frame-Options DENY)
- [x] Open redirect protection (thorough: CRLF, protocol-relative, backslash, user-info)
- [x] XSS prevention (DOMPurify strict allowlist, react-markdown skipHtml, CSP nonce)
- [x] Timing-safe comparisons (HMAC-based constant-time for all tokens)
- [x] IP allowlisting on judge routes
- [x] Rate limiting (per-IP, per-username, per-route, per-user submission)
- [x] Encryption at rest (AES-256-GCM for plugin secrets)
- [x] Audit logging (login, submission, judge results, settings changes)
- [ ] **FAIL** — Plaintext production secrets in `.env` files (S-CR1)
- [ ] **FAIL** — PostgreSQL default password in production (S-CR3)
- [ ] **FAIL** — Ghostscript `-dNOSAFER` sandbox escape (S-CR2)
- [ ] **FAIL** — RUNNER_AUTH_TOKEN not enforced (S-H1)
- [ ] **FAIL** — Docker socket proxy POST=1 (S-H2)
- [ ] **FAIL** — Playground endpoint no capability check (S-M1)
