# Security Review — Adversarial Perspective

**Reviewer**: Security Researcher / Attacker
**Date**: 2026-04-17
**Scope**: Full-stack security audit of JudgeKit online judge platform

---

## Executive Summary

JudgeKit demonstrates **above-average security maturity** for a self-hosted platform. Authentication is solid (Argon2id, anti-enumeration, JWT invalidation), CSP is well-configured with per-request nonces, and the Docker sandbox architecture is thoughtful (socket proxy, no direct Docker access from app). However, several **medium-to-high severity issues** exist around the judge worker auth model, client-side anti-cheat reliability, file upload attack surface, and lack of defense-in-depth for the code execution pipeline.

---

## 1. Code Execution Sandbox — Risk: MEDIUM

### Architecture (GOOD)
- Judge worker runs in separate container, talks to Docker via `tecnativa/docker-socket-proxy` on port 2375
- No direct Docker socket mount on the app container
- Rust worker uses bollard for Docker API, containers run with seccomp profiles
- Memory/CPU/PID limits applied per container
- Network disabled (`--network none`) for judge containers

### Findings

**[MEDIUM] Docker socket proxy has overly broad permissions**
- `docker-compose.production.yml` line 69-73: `CONTAINERS=1, IMAGES=1, BUILD=1, POST=1, DELETE=1`
- The proxy allows building images, deleting containers, and creating arbitrary containers
- If the judge-worker container is compromised, an attacker can build and run privileged containers
- **Recommendation**: Restrict to `CONTAINERS=1` only; disable BUILD, IMAGES, DELETE

**[MEDIUM] Seccomp profile is not audited in this review**
- The seccomp profile path is configured (`JUDGE_SECCOMP_PROFILE=/etc/judge/seccomp-profile.json`) but the profile itself was not found in the repository
- A misconfigured or overly permissive seccomp profile negates the sandbox
- **Recommendation**: Include the seccomp profile in the repo and audit it

**[LOW] No resource quota enforcement on host**
- While containers have per-execution limits, there's no cgroup-level quota on the host
- A buggy or malicious worker could spawn unlimited containers, exhausting host resources
- **Recommendation**: Add container count limits in the worker configuration

**[INFO] Shared workspace volume**
- `/judge-workspaces` is mounted on the worker for temp files
- This is standard for OJ platforms, but a container breakout could access other submissions' files
- Mitigated by the per-execution container isolation

---

## 2. Authentication — Risk: LOW

### Findings

**[GOOD] Argon2id with OWASP-recommended parameters**
- `password-hash.ts`: memoryCost=19456 (19 MiB), timeCost=2, parallelism=1
- Matches OWASP minimum recommendation

**[GOOD] Anti-enumeration via dummy hash**
- `auth/config.ts` line 68-69: `DUMMY_PASSWORD_HASH` — when user doesn't exist, the provided password is verified against a pre-computed Argon2id hash
- Prevents timing-based user enumeration

**[GOOD] Transparent bcrypt → Argon2id migration**
- Legacy bcrypt hashes are rehashed on successful login
- No forced password resets needed

**[GOOD] JWT invalidation via `tokenInvalidatedAt`**
- `proxy.ts` line 224-234: on every protected request, the JWT's `authenticatedAt` is checked against the user's `tokenInvalidatedAt`
- Password change or forced logout invalidates all existing tokens
- 2-second auth cache is a reasonable tradeoff (negative results not cached)

**[GOOD] User-Agent hash monitoring**
- `proxy.ts` line 240-254: UA mismatch logged as audit event
- Not a hard reject (legitimate UA changes) — correct decision

**[LOW] No 2FA/MFA**
- Single-factor authentication only
- For a platform handling exam integrity and recruiting, this is a gap
- **Recommendation**: Add TOTP-based 2FA for admin/instructor roles

**[LOW] Recruiting token auth bypasses password flow**
- `auth/config.ts` line 143-173: recruiting token alone can create a session
- If a token is leaked (email intercept, URL exposure), anyone can authenticate as the candidate
- Mitigated by single-use tokens, but no IP binding or time window
- **Recommendation**: Add IP binding and/or time window to recruiting tokens

**[INFO] Session cookie security**
- `httpOnly: true, sameSite: lax, secure: true` (in production)
- Correct configuration

---

## 3. Authorization & Access Control — Risk: MEDIUM

### Findings

**[GOOD] Capability-based permission system**
- 38 capabilities across 12 groups
- Custom roles with arbitrary capability sets
- `super_admin` hardcoded with all capabilities as safety net

**[GOOD] `createApiHandler` enforces auth/role/capability consistently**
- `handler.ts`: centralized auth, CSRF, rate limiting, Zod validation
- All API routes use this factory

**[MEDIUM] IDOR risk in submission access**
- `permissions.ts` `canAccessSubmission()`: students see own submissions, instructors see group submissions
- But the check depends on `submission.assignmentId` — if `assignmentId` is null, the group scoping falls back to `submissions.view_all` capability only
- A student who discovers a submission ID could potentially view submissions not tied to assignments
- **Recommendation**: Always require ownership OR explicit group membership check, regardless of assignmentId

**[MEDIUM] Role stored in JWT, refreshed on every JWT refresh cycle**
- JWT callback (`auth/config.ts` line 372-423) re-fetches user from DB on every refresh
- But between refreshes (default session maxAge), a demoted user retains their old role
- The auth cache (2s TTL) mitigates this somewhat, but the window exists
- **Recommendation**: Consider shorter JWT maxAge or role-change invalidation

**[LOW] `assertRole` only checks built-in roles**
- `permissions.ts` line 78-84: `assertRole(...roles: UserRole[])` uses `isUserRole()` which checks against the 4 built-in roles
- Custom roles with equivalent capabilities could bypass role checks that use `assertRole` instead of `assertCapability`
- Some routes may use `assertRole(["admin"])` when they should use `assertCapability("system.settings")`
- **Recommendation**: Audit all `assertRole` calls and replace with `assertCapability` where appropriate

**[INFO] Recruiting access scoping**
- `permissions.ts` line 123-126: recruiting candidates are scoped to specific problem IDs
- Prevents lateral access to problems outside the candidate's test

---

## 4. Input Validation & Injection — Risk: LOW

### Findings

**[GOOD] Drizzle ORM prevents SQL injection**
- All database queries use parameterized queries via Drizzle
- Raw SQL in `judge/claim/route.ts` uses parameterized `@param` syntax via `rawQueryOne()`
- No string interpolation in SQL

**[GOOD] Zod validation on all API inputs**
- `createApiHandler` enforces Zod schema validation before handler execution
- Prevents malformed input from reaching business logic

**[MEDIUM] Markdown/XSS attack surface**
- Problem statements use `react-markdown` with `rehype-highlight`, `rehype-katex`, `remark-gfm`, `remark-math`
- CSP with nonces prevents inline script execution, but `style-src 'unsafe-inline'` allows CSS injection
- A malicious instructor could craft CSS that exfiltrates data (CSS exfiltration attacks on `:visited`, attribute selectors)
- KaTeX rendering processes LaTeX — potential for LaTeX injection (denial of service via deeply nested expressions)
- **Recommendation**: Sanitize HTML output with DOMPurify before rendering; consider LaTeX complexity limits

**[LOW] File upload MIME type validation**
- `files/validation.ts`: allowlist-based MIME type checking (images, PDF, ZIP, text)
- Images are re-processed (converted to WebP, resized) — strips EXIF and embedded payloads
- ZIP files are not scanned for contents — a ZIP bomb (decompression bomb) is possible
- **Recommendation**: Add ZIP file size validation after decompression; consider ZIP content scanning

---

## 5. CSRF & Clickjacking — Risk: LOW

### Findings

**[GOOD] CSRF protection via `X-Requested-With` header**
- `handler.ts` line 133-138: mutation methods require `X-Requested-With: XMLHttpRequest`
- API key auth skips CSRF (no cookies involved) — correct
- This is a standard CSRF mitigation that works because browsers don't add this header to cross-origin requests

**[GOOD] CSP with per-request nonces**
- `proxy.ts` line 39-43: `createNonce()` generates 16 random bytes per request
- `script-src` requires `'nonce-{value}'` — inline scripts without the nonce are blocked
- `frame-ancestors 'none'` prevents clickjacking
- `object-src 'none'` prevents plugin-based attacks

**[GOOD] Security headers**
- HSTS with `includeSubDomains` (when behind HTTPS)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera, geolocation, microphone

**[LOW] `style-src 'unsafe-inline'`**
- Required by Tailwind CSS and some UI libraries
- Enables CSS injection vectors, though CSP script-src prevents the most damaging XSS
- Acceptable tradeoff for most deployments

---

## 6. API Security — Risk: MEDIUM

### Findings

**[GOOD] API key handling**
- Keys prefixed with `jk_` for identification
- Hashed at rest (SHA-256) — only the hash is stored
- AES-256-GCM encrypted for reversible display (key prefix shown to admin)
- Effective role = min(key role, creator role) — prevents privilege escalation via key

**[MEDIUM] Judge worker auth is a single shared Bearer token**
- `judge/auth.ts`: `isJudgeAuthorized()` compares a Bearer token against `JUDGE_AUTH_TOKEN` env var
- All judge API endpoints (`/claim`, `/poll`, `/heartbeat`, `/deregister`) use this single token
- If the token is leaked (e.g., from worker container, env file, log), an attacker can:
  - Claim submissions and see source code + test cases
  - Submit fabricated judge results (accept any submission)
  - Deregister workers (denial of service)
- The worker secret is transmitted in the claim request body — could appear in logs
- **Recommendation**: Use per-worker tokens with scoped permissions; rotate tokens regularly; never log secrets

**[MEDIUM] Judge claim returns source code + test cases + expected output**
- `judge/claim/route.ts` line 292-304: the claim response includes `sourceCode`, `testCases` (with expected output), and language configs
- If the judge worker auth is compromised, all problem test data is exposed
- This is architecturally necessary (worker needs test data to judge), but the blast radius is large
- **Recommendation**: Add IP allowlist for judge API routes; consider mTLS between app and worker

**[LOW] SSE connection limits**
- Max 500 global SSE connections (configurable)
- Per-user cap exists
- No authentication required for SSE endpoint beyond session — an authenticated user could open many connections
- **Recommendation**: Add stricter per-user SSE limits

**[LOW] Rate limiting is IP-based only**
- Login rate limiting combines IP + username — good
- API rate limiting is IP-based only
- An attacker with a botnet or rotating proxies can bypass IP-based limits
- **Recommendation**: Consider token-based or behavioral rate limiting for sensitive operations

---

## 7. Data Protection — Risk: MEDIUM

### Findings

**[MEDIUM] IP addresses stored indefinitely**
- `login_events` and `submissions` store IP addresses
- `anti_cheat_events` stores IP change events
- No retention policy or automatic purging
- For GDPR (EU students) and general privacy, this is problematic
- **Recommendation**: Add configurable retention periods; anonymize IPs after 90 days

**[MEDIUM] PII in database without encryption at rest**
- User emails, names, class names stored in plaintext
- No column-level encryption
- If the database is compromised (SQL injection, backup leak), all PII is exposed
- Database password is in `.env.production` and `docker-compose.production.yml` — accessible to anyone with server access
- **Recommendation**: Encrypt sensitive columns; ensure `.env.production` has restricted file permissions

**[LOW] Backup contains all PII unencrypted**
- `pg_dump` output is plaintext SQL
- If backup files are stored on the same server or transferred unencrypted, PII is at risk
- **Recommendation**: Encrypt backups at rest and in transit (GPG, S3 SSE)

---

## 8. Docker Security — Risk: MEDIUM

### Findings

**[MEDIUM] Docker socket proxy allows broad operations**
- As noted in Section 1: `BUILD=1, DELETE=1` are overly permissive
- The proxy is the only container with Docker socket access (read-only mount) — good
- But the proxy's API allowlist is too broad

**[LOW] No network isolation between services**
- All services are on the default Docker network
- The code-similarity and rate-limiter sidecars have no authentication on their HTTP endpoints
- Any container on the network can call these services
- **Recommendation**: Use Docker network isolation; add authentication to sidecar endpoints

**[LOW] No container resource limits in compose**
- No `deploy.resources.limits` on any service
- A misbehaving service can consume all host resources
- **Recommendation**: Add memory/CPU limits to all services

**[INFO] App port bound to 127.0.0.1**
- `127.0.0.1:3100:3000` — not exposed to the internet directly
- Expects nginx reverse proxy in front — correct architecture

---

## 9. Anti-Cheat Integrity — Risk: HIGH

### Findings

**[HIGH] Client-side anti-cheat is trivially bypassable**
- `anti-cheat-monitor.tsx`: relies on browser events (visibilitychange, copy, paste, blur, contextmenu)
- **All checks are client-side JavaScript** — disabling JS, using a separate device, or using curl completely bypasses monitoring
- For exam integrity, this provides **zero actual security** — only deterrence against honest students
- A determined cheater using a second device, VM, or phone will never be detected
- **Recommendation**: Integrate Safe Exam Browser or similar lockdown browser; add server-side anomaly detection (submission timing patterns, code structure analysis); consider proctoring for high-stakes exams

**[MEDIUM] Anti-cheat events can be spoofed**
- Events are sent via API from the client — a sophisticated attacker can inject fake events (e.g., heartbeat with no tab_switch) or suppress real events (not sending tab_switch events)
- No server-side validation that events are consistent with actual behavior
- **Recommendation**: Add server-side cross-validation (e.g., submission timestamps vs. claimed active periods)

**[MEDIUM] Code similarity detection has known bypasses**
- Jaccard n-gram similarity catches exact structural copying
- Does not catch: variable renaming, statement reordering, semantic-preserving transformations, AI-generated code
- For recruiting and exams, this is a significant gap
- **Recommendation**: Consider AST-based similarity, MOSS-style comparison, or AI-assisted plagiarism detection

---

## 10. Supply Chain & Dependencies — Risk: LOW

### Findings

**[LOW] Large dependency surface**
- Next.js 16, React 19, Drizzle, Auth.js v5 beta, CodeMirror 6, shadcn/ui, Argon2, bcryptjs
- Auth.js is still in beta (5.0.0-beta.30) — beta software in auth is concerning
- **Recommendation**: Monitor Auth.js release status; pin exact versions in package-lock.json

**[LOW] Rust dependencies for judge worker**
- tokio, reqwest, bollard, axum — all well-maintained crates
- `cargo audit` should be run regularly

**[INFO] No dependency scanning in CI**
- No Dependabot, Snyk, or similar automated scanning visible
- **Recommendation**: Add automated dependency vulnerability scanning

---

## 11. Attack Surfaces — Prioritized

| Priority | Attack Vector | Impact | Difficulty |
|----------|--------------|--------|-----------|
| 1 | Judge worker auth compromise → steal test data | Critical | Medium (need container access) |
| 2 | Client-side anti-cheat bypass → undetected cheating | High | Trivial |
| 3 | Docker socket proxy compromise → container escape | High | Medium |
| 4 | IDOR in submissions without assignmentId | Medium | Low |
| 5 | ZIP bomb in file upload → DoS | Medium | Low |
| 6 | LaTeX injection in problem statements → DoS | Medium | Medium |
| 7 | API key leak → unauthorized access | Medium | Medium |
| 8 | CSS injection via Markdown → data exfiltration | Low | Medium |

---

## 12. Compliance & Privacy — Risk: MEDIUM

### Findings

**[MEDIUM] GDPR/Privacy concerns**
- IP addresses stored indefinitely without consent or retention policy
- No privacy policy or consent mechanism visible
- No data export/deletion mechanism for individual users (right to erasure)
- No cookie consent banner
- For EU institutions, this is a compliance gap
- **Recommendation**: Add privacy policy, consent mechanism, data retention policies, and user data export/deletion

**[LOW] Recruiting data retention**
- Candidate submissions, anti-cheat events, and code snapshots stored after recruiting process
- No automatic cleanup after recruiting is complete
- **Recommendation**: Add configurable retention periods for recruiting data

---

## Remediation Priority List

### Critical (Do Now)
1. Restrict Docker socket proxy permissions (remove BUILD, DELETE)
2. Add per-worker authentication tokens instead of shared secret
3. Implement server-side anomaly detection for anti-cheat

### High (Do Soon)
4. Add IP allowlist or mTLS for judge API routes
5. Audit seccomp profile and include in repository
6. Add ZIP bomb protection in file upload
7. Sanitize Markdown/HTML output with DOMPurify

### Medium (Plan For)
8. Add 2FA for admin/instructor roles
9. Implement data retention policies with automatic purging
10. Add privacy policy and consent mechanism
11. Encrypt database backups
12. Fix IDOR risk for submissions without assignmentId
13. Add network isolation between Docker services

### Low (Nice to Have)
14. Add dependency vulnerability scanning
15. Add container resource limits in compose
16. Add stricter per-user SSE connection limits
17. Implement API key rotation mechanism

---

## Summary Verdict: 6/10 (Security Posture)

JudgeKit has **solid authentication and CSP foundations** but suffers from a **critical gap in exam integrity** (client-side anti-cheat) and **insufficient defense-in-depth around the code execution pipeline**. The shared judge worker auth token is the highest-severity technical vulnerability. For a platform handling recruiting and exams, the anti-cheat limitations are a **functional security failure** — not a technical bug, but an architectural shortfall.

The platform is **acceptable for low-stakes coursework and practice contests** but **needs significant investment in proctoring and anti-cheat before being trusted for high-stakes exams or recruiting**.
