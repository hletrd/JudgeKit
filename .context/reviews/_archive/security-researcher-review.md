# JudgeKit Offensive Security Review

**Reviewer:** Security Researcher (Attacker Perspective)
**Date:** 2026-05-10
**Scope:** Full codebase offensive review
**Methodology:** Manual static analysis, threat modeling, exploitation path analysis

---

## Executive Summary

JudgeKit is a well-architected platform with several mature security controls: Argon2id password hashing, DB-backed atomic rate limiting, Docker sandboxing with seccomp, and a consistent API handler pattern. However, from an attacker perspective, there are critical gaps in the anti-cheat system, insufficient separation between judge worker trust boundaries, and several bypass paths that could compromise exam integrity or lead to privilege escalation.

**Critical findings: 2**
**High findings: 8**
**Medium findings: 10**
**Low findings: 7**

---

## Positive Security Controls (Defenses That Work)

Before detailing vulnerabilities, acknowledge these well-implemented controls that withstood offensive scrutiny:

1. **Password hashing:** Argon2id with 19 MiB memory cost, OWASP-compliant parameters. Automatic bcrypt-to-argon2id migration on login. (`src/lib/security/password-hash.ts:8-13`)

2. **Rate limiting:** PostgreSQL-backed with advisory locks (`pg_advisory_xact_lock`) to prevent TOCTOU races. Exponential backoff for repeated violations. (`src/lib/security/rate-limit.ts:178-228`)

3. **Docker sandboxing:** Containers run with `--network=none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, `--user 65534:65534`, and optional seccomp profiles. (`src/lib/compiler/execute.ts:343-365`)

4. **API handler consistency:** `createApiHandler` enforces auth, CSRF, rate limiting, and Zod validation uniformly across almost all routes. (`src/lib/api/handler.ts:92-206`)

5. **Session token invalidation:** JWT tokens carry `authenticatedAt`; revocation compares against DB `tokenInvalidatedAt` using DB server time to prevent clock-skew bypasses. (`src/lib/auth/session-security.ts:26-36`)

6. **File upload hardening:** Magic-byte verification, ZIP bomb detection with decompressed size limits, MIME type restrictions, and Sharp-based image processing. (`src/lib/files/validation.ts:167-201`)

7. **SQL injection prevention:** All Drizzle ORM queries use parameterized queries. Raw SQL in `rawQueryOne`/`rawQueryAll` uses named-parameter-to-positional conversion with validation. (`src/lib/db/queries.ts:66-91`)

---

## Critical Severity Findings

### C1: Anti-Cheat System Completely Bypassable via Direct API Calls

**File:** `src/components/exam/anti-cheat-monitor.tsx`, `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts`
**Severity:** CRITICAL
**Category:** Anti-cheat evasion / Exam integrity compromise

**Description:**
The anti-cheat system is client-side only. The `AntiCheatMonitor` React component (lines 32-328) listens for browser events (tab switch, copy, paste, blur, heartbeat) and POSTs them to `/api/v1/contests/{assignmentId}/anti-cheat`. The server-side validation at `anti-cheat/route.ts` (lines 34-137) only checks:

1. User is enrolled in the contest (or has an access token)
2. Contest is active (started, not ended)
3. Anti-cheat is enabled for the assignment

There is **no** browser fingerprinting, **no** challenge-response, **no** WebSocket connection verification, **no** proof of browser rendering, and **no** verification that events originate from a genuine browser session.

**Attack Scenario:**
1. Attacker logs in via curl or a headless script (legitimate credentials)
2. Attacker POSTs a heartbeat to `/api/v1/contests/{assignmentId}/anti-cheat` with body `{"eventType": "heartbeat"}` every 30 seconds
3. Attacker submits solutions via `/api/v1/submissions` from a different device, different IP, or automated script
4. The submission passes the anti-cheat heartbeat check at `src/lib/assignments/submissions.ts:298-317` because the latest heartbeat event is within the 90-second freshness window
5. Attacker can also fabricate "tab_switch" events to make the anti-cheat log look realistic

**Proof of Concept:**
```bash
# Step 1: Authenticate and obtain session cookie
# Step 2: Send heartbeat every 30s in background
while true; do
  curl -H "Cookie: authjs.session-token=$TOKEN" \
       -H "Content-Type: application/json" \
       -H "X-Requested-With: XMLHttpRequest" \
       -d '{"eventType":"heartbeat"}' \
       "https://target/api/v1/contests/$ASSIGNMENT_ID/anti-cheat"
  sleep 30
done &

# Step 3: Submit from any device/script without browser
curl -H "Cookie: authjs.session-token=$TOKEN" \
     -H "Content-Type: application/json" \
     -H "X-Requested-With: XMLHttpRequest" \
     -d '{"problemId":"...","language":"python","sourceCode":"..."}' \
     "https://target/api/v1/submissions"
```

**Impact:** Complete circumvention of the anti-cheat monitoring system. Enables:
- Multi-device cheating (one device for heartbeat decoy, another for actual work)
- Automated submission via scripts/bots
- Outsourced exam-taking (heartbeat from attacker, solutions from accomplice)
- Copy-paste bypass (just never send copy/paste events)

**Mitigation:**
1. Implement browser fingerprinting (canvas/WebGL fingerprint) and verify consistency across heartbeats
2. Add a cryptographic challenge-response: server sends a nonce that must be signed/returned within a time window using browser APIs that are hard to replicate (e.g., WebRTC ICE candidate gathering)
3. Correlate IP address changes with anti-cheat events (flag submissions from different IPs than heartbeats)
4. Implement WebSocket-based real-time monitoring with unexpected server-initiated checks
5. Use CodeMirror/Monaco editor telemetry (keystroke timing, cursor movement patterns) to detect bot usage
6. Require the anti-cheat events to include a timestamp-signed token generated by the frontend build

---

### C2: Judge Worker Result Fabrication (No Result Integrity Verification)

**File:** `src/app/api/v1/judge/poll/route.ts`
**Severity:** CRITICAL
**Category:** Data integrity / Arbitrary verdict manipulation

**Description:**
The `/api/v1/judge/poll` endpoint (lines 26-217) accepts submission results from judge workers without any cryptographic integrity verification. A worker submits:
- `submissionId`
- `claimToken`
- `status` (e.g., "accepted", "wrong_answer")
- `compileOutput`
- `results` (array of per-test-case results with execution times, memory usage)

There is no HMAC, no signature, no way for the server to verify that the worker actually ran the code or that the results are truthful. The `claimToken` only prevents replay of old claims, not fabrication of new results.

**Attack Scenario:**
1. Attacker compromises or impersonates a judge worker (leaked `JUDGE_AUTH_TOKEN` or worker secret)
2. Attacker claims a submission via `/api/v1/judge/claim`
3. Attacker immediately POSTs fabricated results to `/api/v1/judge/poll` with `status: "accepted"` without ever running the code
4. The submission is marked accepted; scores are awarded; leaderboard positions change

**Impact:**
- Arbitrary manipulation of submission verdicts
- Contest result fraud (fake accepted solutions)
- Scoreboard manipulation
- Denial of service by marking all submissions as wrong_answer

**Mitigation:**
1. Require workers to sign results with an HMAC using a per-worker symmetric key
2. Include a cryptographic proof of execution (e.g., hash of stdout + stderr + exit code + container ID + timestamp)
3. Implement result verification: for "accepted" submissions, re-run a random sample to verify
4. Add anomaly detection (e.g., all submissions from a single worker getting accepted, execution times that are impossibly fast)

---

## High Severity Findings

### H1: API Keys Not Subject to Session Invalidation

**File:** `src/lib/api/api-key-auth.ts:66-131`
**Severity:** HIGH
**Category:** Authentication bypass / Privilege persistence

**Description:**
The `authenticateApiKey` function validates API keys against the `apiKeys` table but does NOT check the creator user's `tokenInvalidatedAt` field. When a user's session is revoked (e.g., admin disables account, password changed, security incident), their API keys remain valid indefinitely.

**Code:**
```typescript
// api-key-auth.ts:88-101
if (candidate.expiresAt) {
  if (candidate.expiresAt < now) return null;
}
// Missing: check if user's tokenInvalidatedAt > apiKey.createdAt
```

**Attack Scenario:**
1. User's account is compromised; admin revokes all sessions by updating `tokenInvalidatedAt`
2. Attacker still has the user's API key
3. Attacker continues to authenticate via API key, bypassing the revocation

**Mitigation:**
Add a check in `authenticateApiKey` that validates the creator user's `tokenInvalidatedAt` against the API key's `createdAt` or `lastUsedAt`:
```typescript
if (user.tokenInvalidatedAt && apiKey.createdAt < user.tokenInvalidatedAt) {
  return null; // API key created before revocation
}
```

---

### H2: Shell Command Injection via Unbraced Variable Expansion

**File:** `src/lib/compiler/execute.ts:170-175`, `src/lib/judge/languages.ts:1527-1545`
**Severity:** HIGH
**Category:** Command injection (Docker sandbox)

**Description:**
The `validateShellCommand` function blocks many dangerous patterns but misses unbraced variable expansion (`$VAR` without braces). The regex is:
```typescript
const dangerous = /`|\$\(|\$\{|[<>]\(|\|\||\||>|<|\n|\r|\beval\b|\bsource\b/;
```

This blocks `$()` and `${}` but NOT `$VAR`. While the Docker sandbox limits blast radius, an attacker with admin access to language configs could set a `runCommand` like:
```
python3 /workspace/solution.py; rm -rf $HOME/.ssh
```

Or more insidiously, using `$IFS` or other shell special variables for obfuscation:
```
python3 /workspace/solution.py; cat /etc/passwd>$TMPFILE
```

**Mitigation:**
Add `$[A-Za-z_]` to the dangerous pattern regex to block unbraced variable expansion. Also consider running commands via an allowlist of exact command arrays rather than `sh -c` strings.

---

### H3: LLM Chat Widget Creates Implicit Data Exfiltration Channel

**File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts`, `src/lib/plugins/chat-widget/tools.ts`
**Severity:** HIGH
**Category:** Data exfiltration / Privacy violation

**Description:**
The AI chat widget (lines 195-543) sends student code, submission history, compile errors, and problem descriptions to external LLM providers (OpenAI, Anthropic, Google). The tools (`get_problem_description`, `get_submission_history`, `get_submission_detail`, `get_current_code`) retrieve sensitive data and include it in LLM API calls.

**Attack Scenario:**
1. A student uses the AI assistant during an exam
2. Their source code, submission history, and problem descriptions are transmitted to third-party LLM providers
3. This data may be logged, retained, or used for model training by the provider
4. In a recruiting context, this leaks proprietary assessment content to external systems

**Code:**
```typescript
// tools.ts:84-114
const problem = await db.query.problems.findFirst({...});
return JSON.stringify({
  title: problem.title,
  description: problem.description, // Full problem text sent to LLM
  ...
});
```

**Impact:**
- Exam problem content leaked to external APIs
- Student solutions and thought process exposed to third parties
- Potential training data contamination (problems appearing in future model outputs)
- Violation of data processing agreements in enterprise recruiting contexts

**Mitigation:**
1. Add explicit data processing agreement warnings before AI assistant use
2. Implement a local/on-premise LLM option for sensitive deployments
3. Strip or summarize problem descriptions before sending to external APIs
4. Log all data sent to LLM providers for audit purposes
5. Add per-assignment opt-in for AI assistant (not just per-problem toggle)

---

### H4: IP Spoofing via X-Forwarded-For Manipulation

**File:** `src/lib/security/ip.ts:39-74`
**Severity:** HIGH
**Category:** Rate limit bypass / Identity spoofing

**Description:**
The `extractClientIp` function parses `X-Forwarded-For` to extract client IPs. The hop count is controlled by `TRUSTED_PROXY_HOPS` (default: 1). In deployments with multiple reverse proxies (e.g., CDN -> ALB -> Nginx -> App), if `TRUSTED_PROXY_HOPS` is not increased, an attacker can prepend a fake IP to bypass rate limits:

```
X-Forwarded-For: 1.2.3.4, <attacker's real IP>, <proxy IP>
```

With `TRUSTED_PROXY_HOPS=1`, the extracted IP becomes `1.2.3.4` (the fake prepended IP), giving the attacker unlimited fresh rate-limit buckets.

**Attack Scenario:**
1. Attacker sends requests with `X-Forwarded-For: 1.2.3.4, <real-ip>`
2. Server extracts `1.2.3.4` as client IP
3. Attacker rotates the first IP for each request
4. Rate limits are effectively bypassed (each appears to come from a different IP)

**Mitigation:**
1. Document the exact proxy chain and required `TRUSTED_PROXY_HOPS` value in deployment docs
2. Add validation that the extracted IP is not from known bogon/routed ranges
3. Consider using a per-user rate limit instead of (or in addition to) per-IP limits
4. Log rate-limit key composition for anomaly detection

---

### H5: File Upload Original Name Used in Content-Disposition Without Sanitization

**File:** `src/app/api/v1/files/[id]/route.ts:107-125`
**Severity:** HIGH
**Category:** Header injection / XSS

**Description:**
The file download endpoint uses the uploaded file's `originalName` directly in the `Content-Disposition` header:
```typescript
const disposition = isImage
  ? "inline"
  : contentDispositionAttachment(file.originalName.replace(/\.[^.]+$/, ""), ext);
```

The `contentDispositionAttachment` function (not fully reviewed) may not sufficiently sanitize control characters, newlines, or Unicode characters that could break header parsing. An attacker could upload a file with `originalName` containing newline characters or other header-control sequences.

**Attack Scenario:**
1. Attacker uploads a file with `originalName` containing `\r\n` followed by additional headers
2. When downloaded, the response headers are split, allowing injection of arbitrary headers
3. Could be used for cache poisoning, cookie injection, or XSS via `Content-Type` override

**Mitigation:**
1. Strictly validate `originalName` on upload (allow only printable ASCII, reject control chars)
2. Use a robust content-disposition library that handles encoding properly
3. Sanitize `originalName` before using in headers with a whitelist approach

---

### H6: Test Seed Endpoint Can Create Instructor Users

**File:** `src/app/api/v1/test/seed/route.ts`
**Severity:** HIGH
**Category:** Privilege escalation

**Description:**
The test seed endpoint allows creating users with `role: "instructor"` (line 67: `role: z.enum(["student", "instructor"])`). While protected by localhost check and `PLAYWRIGHT_AUTH_TOKEN`, in containerized environments (Kubernetes, Docker Compose), "localhost" may not provide meaningful isolation. If the token leaks or if the app is behind a reverse proxy that forwards localhost traffic, an external attacker could create privileged accounts.

**Code:**
```typescript
// test/seed/route.ts:61-69
role: z.enum(["student", "instructor"]).optional(),
//...
case "create_user": {
  const [created] = await db.insert(users).values({
    role: role ?? "student",
    // ...
  });
}
```

**Mitigation:**
1. Remove the ability to create instructor/admin users via the seed endpoint
2. Add an additional env var `PLAYWRIGHT_ALLOW_INSTRUCTOR_CREATE` that defaults to false
3. Consider removing the seed endpoint entirely from production builds

---

### H7: Docker Build Exposes Full Repository as Build Context

**File:** `src/lib/docker/client.ts:245-246`, `src/lib/compiler/execute.ts:688-693`
**Severity:** HIGH
**Category:** Information disclosure / Sandbox escape

**Description:**
The `buildDockerImageLocal` function uses `contextDir = "."` (the repository root) as the Docker build context:
```typescript
const contextDir = ".";
const proc = spawn("docker", ["build", "-t", imageName, "-f", dockerfilePath, contextDir]);
```

This means the entire repository (including `.env` files, configuration, source code, and potentially secrets) is copied into the Docker build context. While the Dockerfile path is validated, a malicious or compromised Dockerfile could use `COPY` instructions to exfiltrate repository contents during build.

Similarly, `executeCompilerRun` creates a temp workspace but mounts it as a Docker volume. The workspace directory is under `COMPILER_WORKSPACE_DIR` which defaults to `os.tmpdir()`.

**Mitigation:**
1. Use an empty/minimal build context directory for Docker builds instead of `.`
2. Ensure `.dockerignore` excludes sensitive files from build context
3. Run builds in a separate CI pipeline, not on the production app server

---

### H8: Source Code Exposure to Workers Without Encryption

**File:** `src/app/api/v1/judge/claim/route.ts:150-260`
**Severity:** HIGH
**Category:** Data exposure

**Description:**
When a worker claims a submission, the full `sourceCode` is returned in plaintext:
```sql
s.source_code AS "sourceCode",
```

If the worker communication is over HTTP (not HTTPS), or if the `JUDGE_AUTH_TOKEN` is compromised, all pending submission source code is exposed in transit. There is no end-to-end encryption between the app and workers.

**Mitigation:**
1. Encrypt source code at rest and decrypt only inside the worker's trusted environment
2. Use TLS with certificate pinning for worker communication
3. Implement a one-time decryption token that the worker uses to fetch source code separately

---

## Medium Severity Findings

### M1: Encryption Plaintext Fallback Weakness

**File:** `src/lib/security/encryption.ts:98-117`
**Severity:** MEDIUM
**Category:** Cryptographic weakness

**Description:**
The `decrypt()` function accepts plaintext values (without `enc:` prefix) when `allowPlaintextFallback` is true (default in non-production). Even in production, it logs a warning but the data is still returned. An attacker who can write plaintext to an encrypted column bypasses the GCM authenticity guarantee.

The comment at lines 8-20 explicitly acknowledges this as a deferred attack surface ("C7-AGG-7, deferred").

**Mitigation:**
1. Complete the deferred hardening: audit all encrypted columns and ensure only `enc:`-prefixed values exist
2. Remove the plaintext fallback entirely after migration confirmation

---

### M2: Similarity Check Blocks Event Loop (DoS)

**File:** `src/lib/assignments/code-similarity.ts:260-310`
**Severity:** MEDIUM
**Category:** Denial of service

**Description:**
The TypeScript fallback for code similarity runs O(n²) pair-wise comparisons. While it yields every 8ms, with 500 submissions this still creates significant CPU load. The endpoint has a 30-second timeout but no request-level CPU throttling or queueing.

**Attack Scenario:**
1. Attacker triggers similarity checks on large assignments repeatedly
2. Each check consumes significant CPU, degrading response times for other users
3. Multiple concurrent requests could saturate CPU

**Mitigation:**
1. Offload similarity checks to a background job queue
2. Limit to one concurrent similarity check per assignment
3. Cache results and invalidate only on new submissions

---

### M3: Health Endpoint Information Disclosure

**File:** `src/app/api/v1/health/route.ts:27-41`
**Severity:** MEDIUM
**Category:** Information disclosure

**Description:**
The health endpoint returns `uptime`, `responseTimeMs`, and `version`. While individually low-risk, combined they aid targeted attacks:
- `uptime` reveals server restart timing (useful for timing attacks)
- `version` enables checking for known vulnerabilities
- `responseTimeMs` helps detect load conditions

**Mitigation:**
1. Remove `uptime` and `responseTimeMs` from public health checks
2. Move detailed metrics behind an authenticated `/admin/health` endpoint

---

### M4: Container Cleanup Race Condition

**File:** `src/lib/compiler/execute.ts:800-894`
**Severity:** MEDIUM
**Category:** Race condition / Denial of service

**Description:**
The `cleanupOrphanedContainers` function identifies stale containers by name prefix (`compiler-`) and removes them. However, it doesn't verify ownership or that the container was created by this application instance. In a multi-tenant Docker environment, a malicious container named `compiler-evil` could be created externally and then killed by this cleanup.

**Mitigation:**
1. Use Docker labels to mark legitimate containers
2. Verify container labels before removal

---

### M5: Weak Advisory Lock for Submission Rate Limiting

**File:** `src/app/api/v1/submissions/route.ts:255`
**Severity:** MEDIUM
**Category:** Race condition

**Description:**
The submission rate limit uses:
```sql
SELECT pg_advisory_xact_lock(('x' || md5(user.id))::bit(64)::bigint)
```

MD5 hashes to 128 bits, then truncated to 64 bits via `::bit(64)::bigint`. With enough users (e.g., 2^32), collision probability becomes non-negligible. Two different users could share the same advisory lock, creating cross-user serialization.

**Mitigation:**
1. Use two 64-bit advisory locks (high and low bits of the MD5) or SHA-256 truncated to 64 bits with a salt
2. Alternatively, use row-level locks on a dedicated rate-limit table

---

### M6: Recruiting Token Format Too Permissive

**File:** `src/lib/auth/config.ts:208`
**Severity:** MEDIUM
**Category:** Weak authentication token

**Description:**
The recruiting token validation regex is `^[-A-Za-z0-9_]{16,128}$`. This is extremely permissive and could match many unintended strings. More critically, there is no entropy requirement or format that ensures cryptographic randomness.

**Mitigation:**
1. Enforce a minimum entropy (e.g., 128 bits)
2. Use a dedicated prefix like `recruit_` to prevent token confusion
3. Implement token expiry and one-time-use restrictions

---

### M7: Rate Limit Eviction Timer Never Stops

**File:** `src/lib/security/rate-limit.ts:70-81`
**Severity:** MEDIUM
**Category:** Resource exhaustion

**Description:**
`startRateLimitEviction()` creates a `setInterval` that runs every 60 seconds forever. In serverless/containerized environments with frequent restarts, this could accumulate. The timer is only stopped by `stopRateLimitEviction()`, which may never be called.

**Mitigation:**
1. Ensure `stopRateLimitEviction()` is called on graceful shutdown
2. Use a TTL-based approach in PostgreSQL instead of application-level eviction

---

### M8: Bulk File Delete Missing Per-File Ownership Verification

**File:** `src/app/api/v1/files/bulk-delete/route.ts`
**Severity:** MEDIUM
**Category:** Authorization gap

**Description:**
The bulk delete endpoint requires `files.manage` capability but does not verify that the requesting user owns each file before deletion. While this is appropriate for admin users, a bulk delete operation by an admin could accidentally delete files uploaded by other users without explicit confirmation.

**Mitigation:**
1. Add an `ownerFilter` option to restrict bulk deletes to owned files for non-admin users
2. Return a confirmation listing of files to be deleted before execution

---

### M9: CSRF Origin Validation Falls Back to Request Headers in Non-Production

**File:** `src/lib/security/csrf.ts:7-17`
**Severity:** MEDIUM
**Category:** CSRF bypass (development-only)

**Description:**
In non-production environments, `getExpectedHost` falls back to `x-forwarded-host` or `host` headers if `AUTH_URL` is not set. This means CSRF protection can be bypassed by setting these headers in development/staging, creating a false sense of security during testing.

**Code:**
```typescript
if (process.env.NODE_ENV === "production") {
  return null;
}
return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host")?.trim() ?? null;
```

**Mitigation:**
1. Always require `AUTH_URL` to be set, even in development
2. Remove the non-production fallback entirely

---

### M10: Compiler/Playground Run Accepts Arbitrary User Input Without Assignment Binding Validation

**File:** `src/app/api/v1/compiler/run/route.ts:28-113`, `src/app/api/v1/playground/run/route.ts:19-71`
**Severity:** MEDIUM
**Category:** Resource abuse

**Description:**
The compiler run endpoint accepts an optional `assignmentId` but does not strictly validate that the user is currently enrolled in that assignment before allowing compilation. While `resolvePlatformModeAssignmentContextDetails` performs some validation, a user could potentially run code for an assignment they're not enrolled in by manipulating the `assignmentId` parameter.

**Mitigation:**
1. Strictly validate assignment enrollment before allowing compiler runs with an assignment context
2. Reject `assignmentId` values that don't match the user's active enrollments

---

## Low Severity Findings

### L1: Missing CSRF on Judge Worker Endpoints

**File:** `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/judge/claim/route.ts`, `src/app/api/v1/judge/poll/route.ts`
**Severity:** LOW
**Category:** CSRF (acceptable for API-to-API)

**Description:**
Judge worker endpoints don't use CSRF protection (appropriately, since they're API-to-API). However, if a worker's Bearer token is leaked, it can be used from any origin without CSRF constraints.

**Mitigation:**
This is acceptable for the current architecture. Consider adding origin allowlisting for worker endpoints as defense-in-depth.

---

### L2: Backup/Restore No Multi-Factor Authentication

**File:** `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/admin/restore/route.ts`
**Severity:** LOW
**Category:** Authorization gap

**Description:**
Database backup and restore endpoints require only password re-confirmation. There is no MFA, no time-delayed approval, and no secondary admin confirmation. A compromised admin account password is sufficient to exfiltrate or destroy the entire database.

**Mitigation:**
1. Add MFA requirement for backup/restore operations
2. Implement a time-delayed approval system (request backup, approve after delay)
3. Log backup/restore to external SIEM immediately

---

### L3: Anti-Cheat Events Stored Without Client Integrity Verification

**File:** `src/app/api/v1/contests/[assignmentId]/anti-cheat/route.ts:123-133`
**Severity:** LOW
**Category:** Data integrity

**Description:**
Anti-cheat events are stored with `details` as a raw string from the client. While length is limited to 500 chars, there is no structure validation, no HMAC, and no way to detect tampered events.

**Mitigation:**
1. Sign event details with a short-lived client-side key
2. Include server-generated nonces in event payloads

---

### L4: User Enumeration via Username/Email Case-Insensitive Queries

**File:** `src/lib/auth/config.ts:277-284`
**Severity:** LOW
**Category:** Information disclosure

**Description:**
Login uses `lower(username) = lower(identifier)` which allows username enumeration via timing or error messages. The dummy hash mitigates timing attacks, but the error message distinction ("invalid credentials" is the same for all) helps.

**Status:** Partially mitigated by dummy hash. Acceptable risk.

---

### L5: Judge IP Allowlist Disabled by Default

**File:** `src/lib/judge/ip-allowlist.ts:160-174`
**Severity:** LOW
**Category:** Network security

**Description:**
When `JUDGE_ALLOWED_IPS` is not configured, all IPs are allowed to access judge endpoints. This is documented as "temporary for worker access" but represents an open network boundary.

**Mitigation:**
1. Require explicit IP allowlist in production
2. Fail startup if `JUDGE_ALLOWED_IPS` is not set in production mode

---

### L6: File Download Caches Images Without Validation

**File:** `src/app/api/v1/files/[id]/route.ts:113-125`
**Severity:** LOW
**Category:** Cache poisoning

**Description:**
Images are served with `Cache-Control: private, no-store, max-age=0` but the ETag is based on file ID (not content hash). If a file is replaced (same ID, different content), clients with cached ETags may receive stale 304 responses.

**Mitigation:**
1. Use content-based ETags (hash of file content)
2. Add cache-busting query parameters for mutable files

---

### L7: Submission Comments Missing Content Validation

**File:** `src/app/api/v1/submissions/[id]/comments/route.ts` (not fully reviewed)
**Severity:** LOW
**Category:** XSS potential

**Description:**
Submission comments likely accept user-provided text. If not properly sanitized before rendering, they could be a vector for stored XSS.

**Mitigation:**
1. Ensure all user-generated content is sanitized before rendering
2. Use a robust HTML sanitization library (e.g., DOMPurify on client, similar on server)

---

## Final Sweep: Routes Not Using createApiHandler

The following routes implement their own auth/error handling and were reviewed for consistency gaps:

| Route | Auth Method | CSRF | Rate Limit | Issues |
|-------|------------|------|-----------|--------|
| `/api/v1/judge/register` | `isJudgeAuthorized` + IP allowlist | N/A | No | No rate limiting; token brute-force possible |
| `/api/v1/judge/claim` | `isJudgeAuthorized` / per-worker | N/A | `consumeUserApiRateLimit` | Good |
| `/api/v1/judge/poll` | `isJudgeAuthorized` / per-worker | N/A | No | No rate limiting on result submission |
| `/api/v1/judge/heartbeat` | `isJudgeAuthorized` / per-worker | N/A | No | No rate limiting |
| `/api/v1/judge/deregister` | `isJudgeAuthorized` / per-worker | N/A | No | No rate limiting |
| `/api/v1/health` | None | N/A | `consumeApiRateLimit` | Good |
| `/api/v1/test/seed` | `PLAYWRIGHT_AUTH_TOKEN` + localhost | Yes | No | Can create instructor users |
| `/api/v1/admin/backup` | `getApiUser` + password reconfirm | Conditionally | `consumeApiRateLimit` | Good |
| `/api/v1/admin/restore` | `getApiUser` + password reconfirm | Conditionally | `consumeApiRateLimit` | Good |
| `/api/v1/files/[id]` | `getApiUser` | Conditionally | `consumeApiRateLimit` | Good |

**Finding:** Judge worker routes lack rate limiting. A leaked worker token could be used to flood the system with claims, registrations, or fabricated results. Add rate limiting to all judge endpoints.

---

## Raw SQL / Shell Execution Inventory

| Location | Type | User Input | Sanitization | Risk |
|----------|------|-----------|-------------|------|
| `src/lib/db/queries.ts:31-52` | Raw SQL | Named params | Positional parameterization | LOW |
| `src/app/api/v1/judge/claim/route.ts:150-260` | Raw SQL CTE | Named params | Parameterized values | LOW |
| `src/lib/compiler/execute.ts:718,760` | `sh -c` | DB config | `validateShellCommand` + `validateShellCommandStrict` | MEDIUM |
| `src/lib/docker/client.ts:256` | `docker build` | DB config | `validateDockerfilePath` | LOW |
| `src/lib/assignments/code-similarity.ts:606-640` | Raw SQL | Named params | Parameterized | LOW |
| `src/app/api/v1/test/seed/route.ts:194-205` | Raw SQL LIKE | Client prefix | `escapeLikePattern` | LOW |

---

## Cryptographic Operations Inventory

| Operation | Algorithm | Key Source | Risk |
|-----------|-----------|-----------|------|
| Password hashing | Argon2id | N/A (one-way) | LOW - well configured |
| API key encryption | AES-256-GCM | HKDF-derived from `PLUGIN_CONFIG_ENCRYPTION_KEY` | LOW |
| Column encryption | AES-256-GCM | `NODE_ENCRYPTION_KEY` | MEDIUM - plaintext fallback |
| Token hashing | SHA-256 | N/A (one-way) | LOW |
| Session cookie | JWT (HMAC) | `AUTH_SECRET` | LOW - validated at startup |
| Worker auth | HMAC-SHA256 comparison | `JUDGE_AUTH_TOKEN` | MEDIUM - single shared secret |
| Judge claim token | `nanoid()` | Random | LOW - sufficient entropy |

---

## Summary of Attack Paths

### Path 1: Anti-Cheat Bypass (Easiest)
1. Obtain legitimate credentials
2. Send periodic heartbeats via curl/script
3. Submit from any device/script
4. **Impact:** Full exam integrity compromise

### Path 2: Judge Worker Compromise
1. Leak `JUDGE_AUTH_TOKEN` or compromise a worker
2. Claim submissions without judging
3. POST fabricated "accepted" results
4. **Impact:** Arbitrary score manipulation

### Path 3: API Key Persistence After Revocation
1. User's account is compromised
2. Admin revokes sessions (updates `tokenInvalidatedAt`)
3. Attacker continues using API key
4. **Impact:** Persistent unauthorized access

### Path 4: Rate Limit Bypass via IP Spoofing
1. Send requests with manipulated `X-Forwarded-For`
2. Rotate fake IPs to evade rate limits
3. Brute-force passwords or tokens
4. **Impact:** Credential stuffing, token brute-forcing

### Path 5: LLM Data Exfiltration
1. Student uses AI assistant
2. Problem text + source code sent to external LLM APIs
3. Provider logs/retains data
4. **Impact:** Proprietary content leakage

---

## Recommended Priority Order

1. **Immediate (Critical):**
   - Implement server-side anti-cheat verification (challenge-response, browser fingerprinting)
   - Add cryptographic result signing for judge worker submissions

2. **Short-term (High):**
   - Add `tokenInvalidatedAt` check to API key authentication
   - Fix `$VAR` bypass in shell command validation
   - Add LLM data processing warnings and audit logging
   - Sanitize file `originalName` before use in headers
   - Document and enforce correct `TRUSTED_PROXY_HOPS`

3. **Medium-term (Medium):**
   - Remove encryption plaintext fallback after audit
   - Offload similarity checks to background jobs
   - Reduce health endpoint information disclosure
   - Harden test seed endpoint

4. **Long-term (Low):**
   - Add MFA for backup/restore
   - Implement end-to-end encryption for worker communication
   - Add origin allowlisting for worker endpoints
   - Replace MD5-based advisory locks
