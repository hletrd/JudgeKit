# Security Researcher Review -- JudgeKit Platform

**Reviewer:** Security Researcher (adversarial / attacker perspective)
**Date:** 2026-05-04
**Scope:** Full platform -- Next.js app, Rust judge worker, Docker sandbox, DB, auth, anti-cheat, API, infrastructure

---

## Executive Summary

JudgeKit demonstrates a mature, defense-in-depth security posture with multiple layers of protection across authentication, code execution sandboxing, and API access control. The platform correctly implements JWT-based session management with token invalidation, Argon2id password hashing with transparent rehashing, atomic rate limiting with exponential backoff, and a hardened Docker execution sandbox (seccomp, no-new-privileges, cap-drop ALL, read-only rootfs, non-root user). However, several medium-to-high severity issues were identified: plaintext secrets committed to the local `.env` file (including SSH passwords and admin credentials for production servers), a plaintext fallback in the encryption module that could be exploited if an attacker gains DB write access, and an anti-cheat system that is largely observational rather than enforcement-oriented, leaving exam integrity dependent on post-hoc review rather than real-time prevention.

**Overall Grade: B+**

---

## Critical Vulnerabilities

### CRIT-1: Plaintext Secrets in Local Environment Files (on disk, not in git)

**Severity:** CRITICAL (if this machine is compromised)
**Files:**
- `/Users/hletrd/flash-shared/judgekit/.env` -- Contains:
  - `AUTH_SECRET` (JWT signing key)
  - `JUDGE_AUTH_TOKEN` (judge worker shared secret)
  - `TEST_SSH_PASSWORD=mcl1234~` (SSH password for test server 10.50.1.116)
  - `PROD_WEB_ADMIN_PASSWORD=solution6231` (production admin password)
  - `E2E_TEST_PASSWORD=mcl1234~`
  - `E2E_PROD_PASSWORD=e2etest1234`
  - `ALGO_API_KEY=jk_d74b5170d9202945aa32a033c0b33b0bf106d1b7`
- `/Users/hletrd/flash-shared/judgekit/.env.production` -- Contains:
  - `AUTH_SECRET=otU7Ko6gNoRHd4bod1FK0AjVEZIG7TLvfxn/WitPtCA=`
  - `JUDGE_AUTH_TOKEN=caff01a5aa37e8e49f3bbf5392cdbd5104c538c99b435839554f3538ac79f2c6`
  - `POSTGRES_PASSWORD=judgekit_prod_change_me`
- `/Users/hletrd/flash-shared/judgekit/.env.deploy` -- Contains `SSH_PASSWORD=mcl1234~`
- `/Users/hletrd/flash-shared/judgekit/.env.worv` -- Contains admin credentials and SSH key path

**Impact:** These files are properly gitignored (verified via `git ls-files`), but they exist on disk with weak permissions (644). An attacker with read access to this machine (lateral movement, backup leak, shared hosting) gains:
- Full admin access to all deployed JudgeKit instances
- SSH access to production servers (10.50.1.116, oj.auraedu.me, algo.xylolabs.com, 3.38.130.230)
- Ability to forge JWT tokens (AUTH_SECRET)
- Ability to impersonate judge workers (JUDGE_AUTH_TOKEN)
- Ability to exfiltrate the production database

**Exploitation Path:**
1. Gain read access to developer workstation (phishing, supply chain, shared volume)
2. Read `.env` file
3. SSH into production: `sshpass -p 'mcl1234~' ssh platform@10.50.1.116`
4. Full database and server compromise

**Recommendation:**
- Rotate ALL exposed credentials immediately
- Use a secrets manager (Vault, 1Password, AWS Secrets Manager) instead of `.env` files
- Set file permissions to 600 on all secret files
- Consider using `direnv` or similar with encrypted secrets

---

### CRIT-2: Weak/Default Passwords on Production Infrastructure

**Severity:** CRITICAL
**Evidence:**
- Test server admin password: `mcl1234~`
- Production admin password: `solution6231`
- Production PostgreSQL password: `judgekit_prod_change_me` (literally a placeholder)
- Worv test admin: `msl1234~`
- E2E test password: `e2etest1234`

**Impact:** These are trivially guessable passwords. The production Postgres password appears to be an unfilled placeholder. An attacker performing credential stuffing or targeted brute-force gains immediate admin access.

**Recommendation:**
- Enforce strong, unique passwords for all infrastructure
- Remove placeholder passwords and generate cryptographically random ones
- Implement password rotation policy for admin accounts

---

## Medium-Risk Issues

### MED-1: Encryption Plaintext Fallback in Production

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/security/encryption.ts` (lines 98-117)

The `decrypt()` function has an `allowPlaintextFallback` option that defaults to `false` in production, which is correct. However, the `decryptPluginSecret()` function in `/Users/hletrd/flash-shared/judgekit/src/lib/plugins/secrets.ts` (line 53) returns plaintext values as-is when they lack the `enc:v1:` prefix, without checking if this is production:

```typescript
export function decryptPluginSecret(value: string) {
  if (!isEncryptedPluginSecret(value)) {
    return value; // <-- returns plaintext without environment check
  }
```

**Impact:** If an attacker gains write access to the database (SQL injection, backup restore manipulation), they can replace encrypted plugin secrets (e.g., hCaptcha secret, API keys) with plaintext values that will be accepted by the system. This bypasses the GCM authenticity guarantee.

**Exploitation Path:**
1. Gain DB write access (e.g., via a future SQL injection, compromised backup)
2. Replace an encrypted plugin secret with a controlled plaintext value
3. The application uses the attacker-controlled value without verification

**Recommendation:** Add environment-aware plaintext rejection in `decryptPluginSecret()`, matching the pattern in `decrypt()`.

---

### MED-2: Anti-Cheat System is Observational, Not Preventive

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/anti-cheat/review-model.ts`

The anti-cheat system classifies events into tiers (context, signal, escalate) but does not enforce any real-time blocking. Events like `copy`, `paste`, `tab_switch`, and `blur` are only logged as "signal" tier for post-hoc review.

**Impact:** A determined cheater can:
1. Open a second browser tab with a search engine or AI assistant
2. Copy-paste solutions from external sources
3. Switch tabs freely during an exam
4. The system will flag these events but not prevent submission

**Attack Scenario:**
1. Student opens exam in Browser A
2. Student opens ChatGPT/Google in Browser B
3. Student copies solutions from Browser B, pastes into Browser A
4. Anti-cheat logs `copy`, `paste`, `tab_switch` events
5. Student submits correct solutions
6. Unless an instructor manually reviews the anti-cheat dashboard, cheating goes undetected

**Recommendation:**
- Implement configurable auto-flag thresholds (e.g., 3+ tab switches = automatic submission review hold)
- Consider a "lockdown mode" option for high-stakes exams that prevents submission if suspicious activity exceeds a threshold
- Add real-time warnings to the student when suspicious behavior is detected

---

### MED-3: Judge IP Allowlist Defaults to Allow-All

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/judge/ip-allowlist.ts` (lines 160-174)

When `JUDGE_ALLOWED_IPS` is not configured, the `isJudgeIpAllowed()` function returns `true` for all IPs:

```typescript
if (!allowlist) {
  return true; // no allowlist configured — allow all
}
```

**Impact:** If an operator deploys without configuring `JUDGE_ALLOWED_IPS`, any internet-facing host can:
1. Register as a judge worker (`POST /api/v1/judge/register`)
2. Claim submissions (`POST /api/v1/judge/claim`)
3. Inject fabricated verdicts (accept wrong answers, reject correct ones)
4. Exfiltrate source code from submissions

This requires knowing the `JUDGE_AUTH_TOKEN`, but combined with CRIT-1 (token in `.env`), this is exploitable.

**Recommendation:**
- Make `JUDGE_ALLOWED_IPS` mandatory in production (fail startup if not set)
- At minimum, log a loud warning at startup when not configured

---

### MED-4: Seccomp Profile Allows Socket/Fork/Execve

**File:** `/Users/hletrd/flash-shared/judgekit/docker/seccomp-profile.json`

The seccomp profile allows `socket`, `bind`, `listen`, `connect`, `fork`, `execve`, `clone`, `kill`, `chmod`, `chown`, `link`, `symlink`, `mkdir`, `mknod`, and many other potentially dangerous syscalls. The profile's own comment acknowledges this is because language runtimes need AF_UNIX sockets.

**Impact:** Inside the container, a malicious submission can:
1. Create local Unix domain sockets (IPC between processes)
2. Fork bomb (limited by pids-limit=128)
3. Create symbolic links (potential symlink attacks within the workspace)
4. Modify file permissions

The container mitigations (`--network=none`, `--read-only`, `--user 65534`, tmpfs size limits) significantly reduce the blast radius, but the permissive seccomp profile means a sophisticated attacker has more room to probe for container escape vulnerabilities.

**Recommendation:**
- Create per-language seccomp profiles (compiled languages rarely need socket/fork)
- Monitor for seccomp violation logs in production
- Consider using Landlock (already in the allowed list) for additional filesystem restrictions

---

### MED-5: Source Code Exposure in Judge Claim Response

**File:** `/Users/hletrd/flash-shared/judgekit/src/app/api/v1/judge/claim/route.ts`

The claim endpoint returns the full `sourceCode` of submissions to judge workers. Combined with MED-3 (allow-all IP) and CRIT-1 (leaked JUDGE_AUTH_TOKEN), an attacker can:
1. Register a fake worker
2. Poll for claims
3. Receive all submitted source code
4. Never actually judge the submissions (DoS + code theft)

**Exploitation Path:**
```
POST /api/v1/judge/register  -> get workerId + workerSecret
POST /api/v1/judge/claim     -> receive source code + test cases
# Never POST /api/v1/judge/result -> submission stays "queued" forever
```

**Recommendation:**
- Implement claim timeout monitoring and auto-requeue (already exists with staleClaimTimeoutMs=300000)
- Add worker reputation scoring (workers that never report results get deprioritized/blocked)
- Log and alert on workers that claim but never submit results

---

### MED-6: hCaptcha is Optional, Not Mandatory for Sign-Up

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/security/hcaptcha.ts`

hCaptcha verification is only active when configured. If the operator does not configure hCaptcha, sign-up has no bot protection.

**Impact:** An attacker can:
1. Create thousands of fake accounts
2. Consume database resources
3. Potentially abuse the platform for credential stuffing

**Recommendation:** Make hCaptcha (or equivalent) mandatory for production deployments, or implement alternative bot protection (rate limiting on sign-up endpoint, email verification).

---

### MED-7: Password Policy is Minimal (8 chars, no complexity)

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/security/password.ts`

Password validation only checks minimum length (8 characters). No requirements for:
- Uppercase/lowercase mix
- Numbers
- Special characters
- Not being in a common password list

Combined with the fact that recruiting candidates choose their own passwords during token redemption, this means candidate accounts may have weak passwords like `password` or `12345678`.

**Recommendation:** At minimum, check against the top 10,000 common passwords. Consider requiring at least one number or special character.

---

### MED-8: `AUTH_URL` Uses HTTP in Production Config

**File:** `/Users/hletrd/flash-shared/judgekit/.env.production` (line 3)

```
AUTH_URL=http://oj-internal.maum.ai
```

The production `AUTH_URL` uses HTTP, not HTTPS. This means:
1. The `shouldUseSecureSessionCookie()` returns `false`
2. Session cookies are set without the `Secure` flag
3. Cookies could be intercepted over the network (though the internal network may mitigate this)

**Recommendation:** Always use HTTPS for `AUTH_URL` in production, even on internal networks.

---

## Low-Risk Issues (Defense-in-Depth)

### LOW-1: Auth Cache Allows Brief Post-Deactivation Access

**File:** `/Users/hletrd/flash-shared/judgekit/src/proxy.ts` (lines 20-37)

The in-process FIFO auth cache has a TTL of up to 10 seconds. In multi-instance deployments, a deactivated user may retain access for up to `AUTH_CACHE_TTL_MS * N` seconds (e.g., 10s * 2 instances = 20s).

**Mitigation Already Present:** Negative results (user not found/inactive) are NOT cached, and the TTL is capped at 10 seconds. This is a documented and acceptable tradeoff.

---

### LOW-2: User-Agent Mismatch is Audit-Only, Not Blocking

**File:** `/Users/hletrd/flash-shared/judgekit/src/proxy.ts` (lines 292-306)

UA mismatch between sign-in and subsequent requests is logged as an audit event but does not block the request. A stolen JWT token used from a different browser/OS would be logged but not stopped.

**Recommendation:** Consider adding a configurable option to block sessions with UA mismatches for high-security deployments.

---

### LOW-3: CSP Uses `unsafe-inline` for Styles

**File:** `/Users/hletrd/flash-shared/judgekit/src/proxy.ts` (line 227)

The CSP includes `style-src 'self' 'unsafe-inline'` which allows inline CSS injection if combined with an XSS vector. This is necessary for CSS-in-JS libraries but reduces CSP effectiveness.

**Recommendation:** Migrate to CSS-in-JS solutions that support nonces or adopt Tailwind CSS (already in use) to eventually remove `unsafe-inline`.

---

### LOW-4: `X-XSS-Protection: 0` Header

**File:** `/Users/hletrd/flash-shared/judgekit/next.config.ts` (line 95)

This intentionally disables the browser's XSS auditor, which is correct (the auditor is deprecated and can introduce vulnerabilities), but should be noted.

---

### LOW-5: Seccomp Profile Missing Path Traversal Check on Workspace

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/compiler/execute.ts` (lines 660-665)

The compiler workspace validates that the temp directory is not a symlink, but relies on `lstat()` which could have a TOCTOU race with a symlink-creation attack on `/tmp`.

**Mitigation:** The container runs as user 65534 with `--read-only` rootfs, limiting the attack surface. The workspace is in a random temp directory.

---

### LOW-6: Recruiting Token Entropy is Adequate but Username is Low

**File:** `/Users/hletrd/flash-shared/judgekit/src/lib/assignments/recruiting-invitations.ts`

- Token: `randomBytes(24)` = 192 bits of entropy (excellent)
- Username: `nanoid(10)` = ~60 bits of entropy (adequate for display-only, but low if ever used for auth lookups)

The code documents this tradeoff explicitly.

---

## Attack Scenarios

### Scenario 1: Exam Cheating via Multi-Device

1. Student receives recruiting token for an exam
2. Opens the exam on their laptop (Browser A)
3. Opens a second device (phone/tablet) with Google/AI chatbot
4. Copies solutions from the second device into the exam browser
5. Anti-cheat logs `paste` and `tab_switch` events but does not block
6. Student submits all correct answers
7. Unless an instructor reviews the anti-cheat dashboard within the review window, cheating is undetected

**Difficulty:** Easy (no technical skill required)
**Impact:** Exam integrity compromise

### Scenario 2: Source Code Theft via Fake Judge Worker

Preconditions: Attacker has the `JUDGE_AUTH_TOKEN` (from `.env` leak or network sniffing on internal Docker network)

1. Attacker sends `POST /api/v1/judge/register` with arbitrary hostname
2. Receives `workerId` and `workerSecret`
3. Sends `POST /api/v1/judge/claim` repeatedly
4. Each response contains full source code, test cases, expected outputs
5. Attacker now has all submissions and can sell solutions or leak exam content

**Difficulty:** Low (requires JUDGE_AUTH_TOKEN)
**Impact:** Complete source code and test case exfiltration

### Scenario 3: Admin Account Takeover via Weak Password

1. Attacker discovers the admin username (default: `admin`)
2. Brute-forces the password (rate limiting exists but passwords are weak)
3. `mcl1234~` or `solution6231` may work on test/production
4. Full admin access: create problems, view all submissions, modify grades, export data

**Difficulty:** Low
**Impact:** Full platform compromise

### Scenario 4: Denial of Service via Submission Flooding

1. Attacker creates multiple accounts (no hCaptcha configured)
2. Submits many large submissions (64KB each) rapidly
3. Each submission consumes a judge worker slot for the duration of the time limit
4. Legitimate submissions are queued behind attacker's submissions
5. Rate limiting (5/minute/user) helps but distributed accounts bypass per-user limits

**Difficulty:** Medium
**Impact:** Platform unavailability for legitimate users

### Scenario 5: JWT Token Forgery via Leaked AUTH_SECRET

Preconditions: Attacker has `AUTH_SECRET` from `.env` file

1. Attacker crafts a JWT token with `role: "super_admin"` and a valid `id`
2. Signs the token with the leaked `AUTH_SECRET`
3. Sets the token as a cookie
4. Full admin access to the platform

**Difficulty:** Low (requires AUTH_SECRET)
**Impact:** Complete authentication bypass

---

## What's Done Well

1. **Password Hashing:** Argon2id with OWASP-recommended parameters, transparent rehashing from bcrypt
2. **Rate Limiting:** DB-backed, atomic (SELECT FOR UPDATE), exponential backoff, per-IP and per-username
3. **Docker Sandbox:** Comprehensive -- `--network=none`, `--cap-drop=ALL`, `--read-only`, `--user 65534`, seccomp, tmpfs size limits, PID limits
4. **CSRF Protection:** Custom header check + origin validation + Sec-Fetch-Site
5. **CSP:** Nonce-based for proxied routes, strict directives
6. **Token Security:** Recruiting tokens hashed with SHA-256 before storage, brute-force lockout per-token
7. **Audit Logging:** Comprehensive audit trail for security-relevant events
8. **API Key Security:** HKDF-derived domain-separated keys, encrypted at rest, hash-only lookup
9. **Input Validation:** Zod schemas on all API inputs, HTML sanitization with DOMPurify
10. **Session Invalidation:** `tokenInvalidatedAt` mechanism for forced logout on password change
11. **Timing-Safe Comparisons:** HMAC-based token comparison prevents timing side-channels
12. **Database Time Consistency:** All rate limits and deadline checks use DB server time to avoid clock skew

---

## Recommendations (Prioritized by Impact)

| Priority | Recommendation | Effort |
|----------|---------------|--------|
| P0 | Rotate all leaked credentials immediately (AUTH_SECRET, JUDGE_AUTH_TOKEN, SSH passwords, admin passwords, API keys) | 1 hour |
| P0 | Generate a real PostgreSQL password for production (replace `judgekit_prod_change_me`) | 5 minutes |
| P1 | Move secrets to a proper secrets manager; remove plaintext from `.env` files | 1 day |
| P1 | Set file permissions to 600 on all `.env*` files | 5 minutes |
| P1 | Enforce HTTPS for `AUTH_URL` in all production deployments | 5 minutes |
| P2 | Make `JUDGE_ALLOWED_IPS` mandatory in production | 2 hours |
| P2 | Add plaintext fallback rejection in `decryptPluginSecret()` for production | 1 hour |
| P2 | Implement common-password check in password validation | 2 hours |
| P3 | Add configurable anti-cheat enforcement thresholds | 1 week |
| P3 | Create per-language seccomp profiles | 1 week |
| P3 | Make hCaptcha mandatory for production sign-up | 2 hours |
| P4 | Worker reputation scoring (claim-without-result detection) | 2 days |
| P4 | Optional UA-mismatch session blocking | 1 day |

---

## Overall Security Grade: **B+**

**Rationale:** The application-layer security is strong -- authentication, authorization, sandboxing, and input validation are all implemented with modern best practices and defense-in-depth. The critical findings are primarily operational (secret management, weak passwords on infrastructure) rather than application-level design flaws. The Docker sandbox is exceptionally well-hardened. The anti-cheat system is the weakest link from an exam-integrity perspective, as it is observational rather than preventive. With the P0/P1 items addressed, this platform would merit an A-.