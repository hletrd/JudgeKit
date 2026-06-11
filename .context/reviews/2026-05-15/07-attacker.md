# Attacker Review — JudgeKit — 2026-05-15

**Reviewer persona:** Penetration tester / red-team operator evaluating JudgeKit as a target. Has no prior access. Goal: find exploitable vulnerabilities, privilege escalation paths, and sandbox escape routes. Reports from the attacker's perspective — what works, what does not, and what an attacker would try next.
**Method:** Traced auth flows, API routes, sandbox boundaries, and data access paths from an attacker's viewpoint. Evaluated reconnaissance surfaces, injection points, and trust boundary violations. Did not perform live attacks against production.
**Scope:** Network-facing attack surface, auth bypass, injection, sandbox escape, privilege escalation, information disclosure, client-side tampering.

## Attacker's overall assessment

**Difficulty: MODERATE-HARD.**

JudgeKit would frustrate an opportunistic attacker. The Docker sandbox has no network, a seccomp profile, and memory limits. The ORM uses parameterized queries. CSRF is enforced. Rate limiting is DB-backed with exponential backoff. Password hashing is Argon2id. These are real defenses, not checkbox security.

A determined attacker with time and motivation finds gaps: information disclosure on rankings and metrics, a cross-group submission leak for the assistant role, no MFA on admin accounts, and an anti-cheat model that is client-tamperable by design. The platform is defensible against script-kiddies but not against a targeted adversary.

**Attacker score: 7.0/10** (higher = harder to attack). The platform is genuinely hardened for its category.

---

## Reconnaissance surface

### R1. Public rankings disclose admin username and role
**Surface:** `GET /rankings` (no auth required).
**What attacker sees:** Username `admin`, display name "Super Admin", Diamond tier, high solve count. This tells the attacker: (a) the username `admin` exists, (b) it is a high-privilege account, (c) it is actively used (high solve count implies test submissions).
**Next step:** Credential-stuffing campaign against `/login` with `admin` and a password list. Rate limiting applies (exponential backoff), but the attacker only needs one hit.
**Mitigation:** Filter staff roles from rankings (15-minute fix, unfixed for 12 days).

### R2. Metrics endpoint leaks env var name
**Surface:** `GET /api/metrics` (no auth required).
**What attacker sees:** `503 {"error":"CRON_SECRET not configured"}`.
**Value:** Confirms the platform uses `CRON_SECRET` for cron/metrics auth. If the attacker finds a way to read environment variables (e.g., via a future SSRF or LFI), they know exactly what to look for.
**Next step:** Search for other endpoints that reference `CRON_SECRET` in error messages.
**Mitigation:** Return 404 without body (30-minute fix, unfixed for 12 days).

### R3. Platform tech stack is fully disclosed
**Surface:** `README.md`, `package.json`, public headers, and error messages.
**What attacker sees:** Next.js 16, TypeScript 5.9, PostgreSQL, Drizzle ORM, Docker, Rust worker, 102 judge images with exact versions.
**Value:** Enables targeted vulnerability research. Attacker can look for CVEs in `next-auth@5.0.0-beta.31`, `drizzle-orm@0.45.2`, etc.
**Mitigation:** Remove version badges from public pages. Add generic error messages without stack traces.

---

## Authentication attacks

### A1. Credential-stuffing against admin (HIGH likelihood, HIGH impact)
**Path:** `/login` → Credentials provider.
**Defenses:** Rate limiting with exponential backoff (IP + username keys), Argon2id dummy hash for non-existent users.
**Bypass:** Rate limiting resets on successful login for credential flow (see `clearRateLimitMulti` at `src/lib/auth/config.ts:309`). An attacker with a correct password is not rate-limited on subsequent attempts. But they still need the password.
**Why it matters:** No MFA. One correct password = total compromise.
**Attacker's note:** The dummy hash prevents username enumeration via timing. The `lower(username)` query prevents case-sensitive variation. These are competent defenses. But the `admin` username is public knowledge (R1), so the attacker has a focused target.

### A2. Recruiting token brute-force (LOW likelihood, MEDIUM impact)
**Path:** `/login` with `recruitToken` credential.
**Defenses:** Token format validation (`^[-A-Za-z0-9_]{16,128}$`), IP rate limiting (NOT cleared on success — correct design choice at `src/lib/auth/config.ts:244-250`).
**Token space:** Base64url of 20 random bytes = 160 bits. Infeasible to brute-force.
**Attacker's note:** Not a viable attack path. The token format validation is a nice touch — it prevents trivial rate-limit exhaustion with malformed tokens.

### A3. JWT token manipulation (NOT VIABLE)
**Path:** Forge or modify JWT session cookie.
**Defenses:** `getValidatedAuthSecret()` ensures secret is set. `useSecureCookies` in production. Token invalidation via `tokenInvalidatedAt`.
**Attacker's note:** Without the `AUTH_SECRET`, JWT forgery is impossible. The secret is not exposed in error messages or headers. Move on.

---

## Authorization attacks

### A4. Cross-group submission access via assistant role (EXPLOITABLE)
**Path:** Create account → be assigned `assistant` role → browse submissions.
**What happens:** `ASSISTANT_CAPABILITIES` includes `submissions.view_all`. The `getSubmissionReviewGroupIds` filter at `src/lib/assignments/submissions.ts:165-179` only activates when the user LACKS `view_all`. Because assistants have it, every submission on the platform is visible — source code, student names, execution times, everything.
**Impact:** A compromised or disgruntled TA sees every student's code across every course.
**Attacker's note:** This is a data-boundary violation, not an auth bypass. The assistant is "authorized" to see too much. The fix (remove `submissions.view_all` from capabilities) is trivial and has been recommended for 12 days.

### A5. Admin bypass of all integrity checks (INTENTIONAL)
**Path:** Compromise admin account → submit to any exam past deadline.
**What happens:** `validateAssignmentSubmission` checks `await isAdminAsync(user.role)` and skips deadline, exam-window, and heartbeat checks if true.
**Impact:** Admin compromise = total integrity failure for all exams.
**Attacker's note:** This is documented behavior (`docs/exam-integrity-model.md:42-44`). It is not a bug. But it means the integrity model's threat model does not include admin account compromise.

---

## Injection attacks

### A6. SQL injection (NOT VIABLE)
**Path:** Any API endpoint with user input.
**Defenses:** Drizzle ORM with parameterized queries everywhere. No raw SQL concatenation in API routes.
**Attacker's note:** I searched for `.raw(`, `sql\``, and string-interpolated queries. The few `sql` template literals use parameterized values (e.g., `sql\`lower(${users.username}) = lower(${identifier})\``). No injection vectors found.

### A7. Command injection in judge worker (MITIGATED)
**Path:** Submit code with malicious language config.
**Defenses:** Docker image name validation (`isAllowedJudgeDockerImage`) rejects arbitrary images. Source code is written to a file, not passed as shell arguments. Commands are arrays, not strings.
**Attacker's note:** The language config (compile command, run command) comes from the database, not user input. An attacker would need to compromise an instructor account to inject a malicious language config. Even then, the Docker sandbox limits damage.

### A8. XSS via problem statement (MITIGATED)
**Path:** Create problem with `<script>alert(1)</script>` in description.
**Defenses:** `isomorphic-dompurify` sanitizes HTML before rendering. React's default escaping handles non-HTML content.
**Attacker's note:** DOMPurify is well-maintained but not infallible. A bypass (e.g., via SVG, mathml, or a novel HTML parsing trick) could theoretically execute in the problem statement context. No CSP header exists to contain a bypass.
**Next step:** Test DOMPurify bypasses against the problem rendering pipeline.

---

## Sandbox attacks

### A9. Docker container escape (DIFFICULT)
**Path:** Submit code that exploits a Docker or kernel vulnerability.
**Defenses:**
- No network (`--network none`).
- Seccomp-bpf profile (`docker/seccomp-profile.json`).
- Memory limit (OOM killer).
- CPU limit (throttling, not termination).
- tmpfs with `noexec` during run phase.
- Read-only workspace during run.
- Short timeout (kills long-running processes).

**Attacker's note:** This is a properly layered sandbox. Known container escape techniques (privileged container, host PID namespace, host networking) are not available. A zero-day in the kernel or Docker runtime would be required.

**One concern:** The seccomp profile is a JSON file on disk. If the attacker gains host filesystem access (via a separate vulnerability), they could modify the profile before submission. This is out of scope for sandbox-only assessment.

### A10. Resource exhaustion via output flood (MITIGATED)
**Path:** Submit `while(1) printf("x")`.
**Defenses:** Output truncated to 4 MiB (`MAX_OUTPUT_BYTES`). The Rust worker reads stdout with a byte limit.
**Attacker's note:** The output limit is correct. But what about stderr? The Rust worker also caps stderr. Memory is OOM-killed. CPU is throttled. This is a well-defended path.

### A11. tmpfs exec bypass for JIT languages (ACCEPTED RISK)
**Path:** Submit C# or Mono code.
**What happens:** `.NET` and `Mono` need `exec` on `/tmp` for JIT compilation. The sandbox allows this via `needs_exec_tmp` flag.
**Risk:** A malicious JIT payload could execute arbitrary code in `/tmp`. But the rest of the sandbox (no network, seccomp, memory limits) still applies.
**Attacker's note:** This is a documented accepted risk. The alternative (no C# support) is worse. Not a practical escape route.

---

## Client-side tampering

### A12. Anti-cheat event forgery (TRIVIAL)
**Path:** Open browser DevTools → modify `antiCheatEvents` fetch payload.
**What happens:** Anti-cheat events are POSTed from the browser to `/api/v1/contests/[id]/anti-cheat`. There is no signature, no HMAC, no server-side correlation with actual browser state.
**Impact:** A candidate can send fake heartbeat events every 60 seconds from a script while solving on a different device. The server accepts them.
**Mitigation:** The heartbeat-freshness check (C-1 in overall verdict) mitigates this for submission — you need a fresh heartbeat to submit. But the heartbeats themselves are unauthenticated beyond the session cookie.
**Attacker's note:** The platform correctly documents this as a limit (`docs/exam-integrity-model.md`). The anti-cheat is telemetry, not evidence. A determined candidate defeats it trivially.

### A13. Client-side timer manipulation (MITIGATED)
**Path:** Change laptop clock to extend exam time.
**What happens:** The countdown timer fetches `/api/v1/time` and computes an offset. Changing the laptop clock does not affect the server-side deadline check.
**Attacker's note:** Not viable. The server uses DB `NOW()` for all deadline comparisons.

---

## Social engineering / phishing

### A14. Fake recruiting token page (PRACTICAL)
**Path:** Register a domain like `judgkit-algo.com` (typo of JudgeKit). Send phishing email with fake assessment link.
**What happens:** Candidates are not trained to verify assessment URLs. The real recruit page has optional company branding, which may not be set. A fake page can harvest credentials or tokens.
**Mitigation:** No technical mitigation exists. Operational: companies should communicate assessment URLs via verified channels (signed email, internal ATS).
**Attacker's note:** This is the most practical attack path against recruiting candidates. It bypasses all of JudgeKit's technical defenses.

---

## Summary: attack paths ranked by practicality

| Rank | Attack | Likelihood | Impact | Effort |
|---|---|---|---|---|
| 1 | Phishing fake recruit page | High | Medium | Low |
| 2 | Credential-stuffing admin (no MFA) | Medium | Critical | Medium |
| 3 | Assistant role cross-group data leak | Medium | High | Low |
| 4 | Anti-cheat event forgery | High | Low (telemetry only) | Low |
| 5 | DOMPurify bypass → XSS | Low | Medium | High |
| 6 | Docker container escape | Very Low | Critical | Very High |
| 7 | SQL injection | Not viable | — | — |
| 8 | JWT forgery | Not viable | — | — |

**Attacker's conclusion:** JudgeKit's technical defenses are competent. The practical attacks are operational (phishing, credential-stuffing) and architectural (anti-cheat is client-tamperable by design). A determined attacker targets the human, not the sandbox.
