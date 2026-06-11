# Security Review — Adversarial Perspective

**Reviewer**: Security Researcher / Attacker
**Date**: 2026-04-17 (Post-Plan-008)
**Scope**: Full-stack security audit of JudgeKit online judge platform
**Context**: Platform used for coding tests (recruiting), student exams, and programming contests — high-stakes scenarios where security failures have real consequences

---

## Executive Summary

JudgeKit demonstrates **above-average security maturity** for a self-hosted platform. Authentication is solid (Argon2id, anti-enumeration, JWT invalidation), CSP is well-configured with per-request nonces, and the Docker sandbox architecture is thoughtful (socket proxy, no direct Docker access from app, now restricted to CONTAINERS=1). Several fixes were applied recently (IP allowlisting, per-worker tokens, DOMPurify, ZIP bomb protection, IDOR fixes).

However, **one critical and several high-severity issues** remain: backup exports leak all password hashes and secrets by default, anti-cheat is trivially bypassed, the compile sandbox uses a relaxed seccomp profile, and the worker compose file allows BUILD/DELETE through the socket proxy.

---

## 1. Code Execution Sandbox — Risk: MEDIUM (improved)

### Architecture (GOOD)
- Judge worker runs in separate container, talks to Docker via socket proxy
- Socket proxy now restricted to `CONTAINERS=1` only (production compose)
- Rust worker uses bollard for Docker API, containers run with seccomp profiles
- Memory/CPU/PID limits applied per container
- Network disabled (`--network none`) for judge containers
- `--cap-drop=ALL`, `--read-only`, `--security-opt=no-new-privileges`
- Unprivileged user (65534:65534), PID limit 128
- Separate tmpfs for compile (1GB, exec) and run (64MB, noexec)
- Output truncation at 4 MiB, orphaned container cleanup

### Findings

**[HIGH] Compile phase uses default seccomp profile with exec tmpfs and 4x swap**
- `docker.rs:222-224,261-265`: Compile phase uses Docker's default seccomp profile (not the custom restrictive one) and allows exec on tmpfs with 4x swap memory
- A student submitting crafted source code in a language with a complex compiler (JVM, .NET, Rust) could exploit the relaxed compile sandbox to probe the host environment or attempt container escape
- The default seccomp profile allows many more syscalls than the custom one

**[HIGH] Worker Docker compose allows BUILD and DELETE through socket proxy**
- `docker-compose.worker.yml:23-25`: `BUILD=1, DELETE=1`
- More permissive than the production compose which only allows `CONTAINERS=1`
- A compromised judge worker container could build a malicious Docker image or delete production containers

**[MEDIUM] Seccomp profile is not in the repository**
- The path is configured (`JUDGE_SECCOMP_PROFILE=/etc/judge/seccomp-profile.json`) but the profile itself was not found
- A misconfigured or missing profile negates the sandbox

**[LOW] No resource quota enforcement on host**
- While containers have per-execution limits, there is no cgroup-level quota
- A buggy or malicious worker could spawn unlimited containers, exhausting host resources

---

## 2. Authentication — Risk: LOW

### Findings

**[GOOD] Argon2id with OWASP-recommended parameters**
- `password-hash.ts`: memoryCost=19456 (19 MiB), timeCost=2, parallelism=1

**[GOOD] Anti-enumeration via dummy hash**
- `auth/config.ts:68-69`: `DUMMY_PASSWORD_HASH` — when user doesn't exist, the provided password is verified against a pre-computed Argon2id hash

**[GOOD] JWT invalidation on password change**
- `session-security.ts:25-35`: `tokenInvalidatedAt` tracking

**[GOOD] Timing-safe token comparison**
- `timing.ts:9-17`: HMAC + dual-digest comparison

**[LOW] Token length leak via early return**
- `timing.ts:12`: Returns early when lengths differ, leaking the exact token length and reducing brute-force search space

**[LOW] No MFA for admin/instructor accounts**
- For an exam platform, lack of MFA on instructor accounts is a gap

---

## 3. Authorization — Risk: LOW-MEDIUM

### Findings

**[GOOD] Granular capability system**
- 38 capabilities across 12 groups (`types.ts:8-80`)

**[GOOD] Per-resource access checks**
- `canAccessSubmission`, `canAccessProblem`, `canAccessGroup`, `canAccessFile` all verify enrollment/ownership/capability

**[GOOD] Hidden test case results stripped for non-privileged users**

**[MEDIUM] Redundant built-in admin/super_admin bypass**
- `permissions.ts:23-25`: Multiple `canAccess*` functions have hardcoded `role === "admin"` or `role === "super_admin"` checks alongside capability checks
- If a custom role is assigned a capability but is later demoted, the capability check may pass while the hardcoded role check creates inconsistent behavior

**[LOW] API key role not updated when creator is demoted**
- `api-key-auth.ts:98-103`: The effective role is the lesser of the key's declared role and the creator's current role, but the key's stored `role` field is not updated on demotion

---

## 4. API Security — Risk: LOW-MEDIUM

### Findings

**[GOOD] Three-layer CSRF protection**
- X-Requested-With header, Sec-Fetch-Site validation, Origin/Host matching (`csrf.ts:29-66`)

**[GOOD] Rate limiting with TOCTOU prevention**
- Sidecar pre-check + authoritative DB check with `SELECT FOR UPDATE` (`api-rate-limit.ts:59-113`)

**[GOOD] Parameterized queries**
- All raw SQL uses parameterized queries via `namedToPositional` (`queries.ts:66-84`)

**[HIGH] In-memory rate limiter resets on process restart**
- `in-memory-rate-limit.ts:5-6`: An attacker could crash the Next.js process via DoS, then brute-force login credentials during the reset window
- The DB-backed rate limiter is authoritative but the in-memory fallback is used for high-throughput paths

**[LOW] Raw SQL query helpers accept unsanitized SQL strings**
- `queries.ts:31-52`: `rawQueryOne`/`rawQueryAll` accept raw SQL. While the named-parameter system prevents injection for current callers, a future developer could concatenate user input

---

## 5. File Upload Security — Risk: MEDIUM (improved)

### Findings

**[GOOD] Strict MIME type allowlist** (`validation.ts:5-12`)
**[GOOD] ZIP bomb protection with decompressed size validation and 10,000 entry cap** (`validation.ts:44-68`)
**[GOOD] Path traversal prevention** (`storage.ts:19-26`)
**[GOOD] Images re-processed (WebP) stripping malicious payloads**
**[GOOD] File access control via `canAccessFile`**

**[MEDIUM] Non-image file MIME types trusted from client**
- `files/route.ts:44`: `file.type` is trusted without magic-byte verification
- A malicious actor could upload a `.exe` or `.html` with a spoofed `application/pdf` content type
- CSP headers (`default-src 'none'`) and `X-Content-Type-Options: nosniff` partially mitigate

**[MEDIUM] ZIP validation fully decompresses entries**
- `validation.ts:53-63`: A ZIP with 10,000 small entries could consume significant CPU and memory during validation before hitting the total limit

---

## 6. Anti-Cheat — Risk: HIGH

### Findings

**[HIGH] Anti-cheat events are entirely client-reported**

This is the most significant security issue for a recruiting/exam platform. A technically skilled candidate can:

1. **Disable JavaScript** — No anti-cheat events are generated. The system records zero tab switches and zero copy/paste events, which looks "clean" rather than suspicious.
2. **Use a second device** — Phone, tablet, or VM running ChatGPT/Copilot alongside the exam. The monitor sees a focused browser window.
3. **Submit directly to the API via curl** — `POST /api/v1/submissions` with a valid session cookie. No anti-cheat events are generated because no browser is involved. The system has no server-side detection of API-only submissions.
4. **Block anti-cheat POST calls** — Browser devtools can block the `POST /api/v1/contests/{id}/anti-cheat` requests. Heartbeats stop, but the system only flags gaps over 2 minutes — a student can send a heartbeat every 119 seconds while using a second device.
5. **Spoof events** — The anti-cheat event format is simple JSON. A browser extension or userscript could generate fake "focus" and "heartbeat" events while the student works on another screen.

**There is no server-side enforcement that the monitor must be active for submissions to be accepted.**

**[MEDIUM] Code similarity doesn't catch AI-generated code**
- Jaccard n-gram comparison detects similar code between candidates, but AI-generated submissions are unique by design
- Two candidates using ChatGPT for the same problem produce different code that passes the similarity check

**[MEDIUM] Similarity threshold can be gamed**
- A student who reorders variable declarations or adds dead code can reduce similarity below the 0.85 threshold without fundamentally changing the solution

**[LOW] Heartbeat throttling allows 119-second gaps**
- Events throttled to one DB row per 60 seconds; gaps only flagged over 120 seconds

---

## 7. Data Protection — Risk: HIGH

### Findings

**[CRITICAL] Database backups include password hashes and all secrets by default**
- `backup/route.ts:90`: `streamDatabaseExport()` is called without `sanitize: true`
- `export.ts:272`: `REDACTED_COLUMNS` is an empty object by default
- Any backup file leak exposes:
  - Every user's Argon2id password hash
  - All active session tokens
  - All API keys (encrypted, but the encryption key is in the same `.env`)
  - Judge worker auth tokens
  - Recruiting invitation tokens
  - Contest access tokens
- **Fix**: Pass `sanitize: true` by default, or make sanitization the default with explicit opt-out for disaster recovery

**[MEDIUM] Restore imports lack semantic validation**
- `restore/route.ts:102-105`: Only structural validation, not semantic integrity
- A maliciously crafted export could inject admin users, modify role capabilities, or alter submission scores

**[MEDIUM] No backup encryption**
- ZIP archives are unencrypted at rest, containing all database data plus uploaded files

**[LOW] Recruiting temp password exposed in UI**
- `recruiting-invitations.ts:164`: `Recruit-{nanoid(16)}` pattern with no audit log

---

## 8. Docker Security — Risk: MEDIUM (improved)

### Findings

**[GOOD] Production socket proxy restricted to CONTAINERS=1**
**[GOOD] Image name validation requires `judge-` prefix**
**[GOOD] Production ports bound to `127.0.0.1` only**
**[GOOD] Docker socket mounted read-only**

**[HIGH] Worker compose allows BUILD and DELETE**
- `docker-compose.worker.yml:23-25`: More permissive than production
- A compromised worker could build malicious images or delete containers

**[MEDIUM] Worker communicates over HTTP, not HTTPS**
- `production.yml:123`: `JUDGE_BASE_URL=http://app:3000`
- Within Docker network, but if compromised, the judge auth token can be sniffed

**[LOW] Read-only socket still allows listing containers and environment variables**

---

## 9. IDOR Vulnerabilities — Risk: LOW-MEDIUM (improved)

### Findings

**[GOOD] Submission access gated by `canAccessSubmission`**
- Checks ownership, role, capability, and group instructor relationship
- Non-assignment submissions now check group membership (IDOR fix applied)

**[GOOD] File access checks `canAccessFile`**
- Verifies problem visibility or ownership

**[MEDIUM] Students retain access to past submissions after group removal**
- `permissions.ts:246-248`: A student removed for cheating can still view their past submission source code and test case results

**[LOW] Submissions list allows filtering by any assignment/problem**
- No verification that the user has access to that specific assignment
- Could enumerate submission counts/metadata for unenrolled assignments

---

## 10. XSS/Injection — Risk: LOW (improved)

### Findings

**[GOOD] DOMPurify with strict tag/attribute allowlists** (`sanitize-html.ts:21-65`)
**[GOOD] URI regex restricted to `https?`, `mailto`, and root-relative paths**
**[GOOD] Image `src` restricted to root-relative paths**
**[GOOD] Links get `rel="noopener noreferrer"` and `target="_blank"`**
**[GOOD] react-markdown uses `skipHtml`**

**[LOW] Markdown sanitization depends entirely on react-markdown's `skipHtml`**
- `sanitizeMarkdown` only strips control characters and null bytes
- If `skipHtml` configuration is changed or bypassed, HTML in markdown would render unsanitized

---

## Vulnerability Summary

| Severity | Issue | File:Line | Status |
|----------|-------|-----------|--------|
| CRITICAL | Backups leak password hashes and secrets by default | `export.ts:272`, `backup/route.ts:90` | Not fixed |
| HIGH | Anti-cheat is client-side only; API submissions bypass all monitoring | `anti-cheat/route.ts:33-127` | Not fixed |
| HIGH | Compile phase uses default seccomp profile with exec tmpfs | `docker.rs:222-224,261-265` | Not fixed |
| HIGH | Worker compose allows BUILD and DELETE through socket proxy | `docker-compose.worker.yml:23-25` | Not fixed |
| HIGH | In-memory rate limiter resets on process restart | `in-memory-rate-limit.ts:5-6` | Not fixed |
| MEDIUM | Non-image uploads trust client MIME type | `files/route.ts:44` | Not fixed |
| MEDIUM | ZIP validation fully decompresses entries (CPU exhaustion) | `validation.ts:53-63` | Not fixed |
| MEDIUM | Restore lacks semantic validation | `restore/route.ts:102-105` | Not fixed |
| MEDIUM | No backup encryption | N/A | Not fixed |
| MEDIUM | Code similarity doesn't catch AI-generated code | `code-similarity.ts` | Architectural |
| MEDIUM | Students retain submission access after group removal | `permissions.ts:246-248` | By design |
| LOW | Token length leak via timing comparison | `timing.ts:12` | Not fixed |
| LOW | API key role not updated on demotion | `api-key-auth.ts:98-103` | Not fixed |
| LOW | Markdown XSS depends on react-markdown skipHtml | `sanitize-html.ts:86-88` | Mitigated |

---

## Attack Scenarios for Recruiting/Exam Context

### Scenario 1: Candidate Cheats with ChatGPT
1. Candidate opens the test on their laptop
2. They use their phone to photograph each problem and feed it to ChatGPT
3. They transcribe the solution into the browser
4. Anti-cheat shows perfect heartbeats and zero tab switches — looks clean
5. Code similarity shows no matches — ChatGPT generates unique code each time
6. **Result: Candidate scores 100% with zero detection**

### Scenario 2: Leaked Backup Exposes All Test Data
1. An admin downloads a backup ZIP
2. The ZIP is stored on a shared drive, sent via email, or left on a lost laptop
3. The ZIP contains all password hashes, API keys, and judge auth tokens
4. An attacker cracks the Argon2id hashes (slow but feasible for weak passwords)
5. Or uses the judge auth token to submit fabricated results
6. **Result: Full system compromise**

### Scenario 3: Compromised Worker Container
1. A student submits crafted Rust code that exploits the relaxed compile sandbox
2. The compile phase runs with the default seccomp profile and exec tmpfs
3. The exploit breaks out of the container via a kernel vulnerability
4. On the worker host, the socket proxy allows BUILD=1 (worker compose)
5. The attacker builds a malicious image and runs it with elevated privileges
6. **Result: Access to all test data and submission source code on the host**

---

## Priority Fixes

| # | Fix | Severity | Effort |
|---|---|---|---|
| 1 | Enable backup sanitization by default | CRITICAL | Low |
| 2 | Add server-side anti-cheat (submission origin verification) | HIGH | High |
| 3 | Apply custom seccomp profile to compile phase | HIGH | Medium |
| 4 | Restrict worker compose socket proxy to CONTAINERS=1 | HIGH | Low |
| 5 | Persist rate limit state to survive process restarts | HIGH | Medium |
| 6 | Add magic-byte MIME verification for non-image uploads | MEDIUM | Medium |
| 7 | Add semantic validation to restore imports | MEDIUM | Medium |
| 8 | Add backup encryption option | MEDIUM | Medium |
