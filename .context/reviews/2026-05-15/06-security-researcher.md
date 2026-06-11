# Security Researcher Review — JudgeKit — 2026-05-15

**Reviewer persona:** Defensive security engineer conducting a pre-production security assessment. Focuses on architecture, implementation correctness, and residual risk. Reports findings with CVSS-style severity and concrete remediation paths. Operates under responsible disclosure.
**Method:** Inspected `src/lib/security/`, `src/lib/auth/`, `src/app/api/v1/`, `judge-worker-rs/src/`, Docker configs, `docker/seccomp-profile.json`, `docs/exam-integrity-model.md`, `docs/high-stakes-operations.md`. Traced auth flows, sandbox boundaries, and data access paths.
**Scope:** Authentication, authorization, sandboxing, cryptography, input validation, anti-cheat integrity, operational security.

## Verdict

| Domain | Score | One-line summary |
|---|---|---|
| Authentication | **7/10** | Argon2id password hashing, JWT with token invalidation, DB-time auth timestamps, rate-limiting with exponential backoff, and API key auth with role-demotion are all above-average. Missing MFA is the critical gap. |
| Authorization | **7/10** | Capability-based RBAC with custom roles, group-scope filters for instructors, and API handler middleware with auth/CSRF/rate-limit are well-architected. Assistant role bypass (cross-group submissions) and admin override of all checks are residual risks. |
| Sandboxing | **8/10** | Docker containers with no network, seccomp profile, CPU/memory limits, tmpfs with noexec, and cgroup peak-memory reading. The Rust worker's executor is clean. Output truncation prevents DoS. Compile-time tmpfs is exec-enabled only for JIT languages. |
| Cryptography | **7.5/10** | AES-256-GCM for API key encryption with HKDF-derived keys, SHA-256 for token hashing, Argon2id for passwords, and cryptographically random tokens. Legacy key fallback for API key decryption is a necessary compatibility shim but should have a migration deadline. |
| Input validation | **7/10** | Zod schemas on API endpoints, parameterized Drizzle ORM queries (no raw SQL injection), Docker image name validation with registry allowlisting, and source-code size limits. Some endpoints may still accept oversized payloads before Zod runs. |
| Anti-cheat integrity | **5/10** | Correctly scoped as "telemetry, not evidence." Heartbeat freshness closes the trivial curl-submit attack. Browser events are tamperable by design (client-side JavaScript). The model is honest about its limits. |
| Operational security | **5.5/10** | Audit logs, login events, pre-restore snapshots with 0o700, Docker socket proxy, and documented runbooks are mature. Broken metrics endpoint (12 days), no MFA, single-worker SPOF, and no dependency scanning are gaps. |

**Overall security posture: 6.5/10.** JudgeKit is above-average for an open-source online judge. The sandbox architecture, credential handling, and CSRF protection show genuine security engineering. The gaps are operational (broken monitoring, no MFA) and architectural (anti-cheat ceiling, admin override of integrity checks).

---

## Things done well (genuine security engineering)

### S1. Argon2id with automatic rehashing
**Where:** `src/lib/security/password-hash.ts`.
Passwords are hashed with Argon2id (memory-hard, resistant to GPU cracking). The `verifyAndRehashPassword` function automatically upgrades weak hashes on login. The dummy hash for non-existent users prevents timing-based username enumeration.

### S2. Token invalidation via `tokenInvalidatedAt`
**Where:** `src/lib/auth/session-security.ts`, `src/lib/auth/config.ts`.
JWT tokens carry an `authenticatedAt` timestamp. On every request, the DB's `tokenInvalidatedAt` is checked. If the token was issued before invalidation, it is rejected. This enables global logout and session revocation without waiting for JWT expiry.

### S3. Docker sandbox with layered restrictions
**Where:** `judge-worker-rs/src/docker.rs`, `docker/seccomp-profile.json`.
- No network (`--network none`).
- Seccomp-bpf profile dropping dangerous syscalls.
- Memory and CPU limits via cgroup.
- tmpfs `/tmp` with `noexec` during run phase (except for .NET/Mono JIT which needs exec).
- Read-only workspace during run phase.
- Output truncated to 4 MiB to prevent memory exhaustion via stdout.

This is a properly layered sandbox. The Rust worker does not trust the submitted code.

### S4. CSRF with defense in depth
**Where:** `src/lib/security/csrf.ts`.
Checks `X-Requested-With: XMLHttpRequest`, `Sec-Fetch-Site`, and `Origin` against expected host. API key auth bypasses CSRF (correct: no cookies involved). The triple-check is stronger than many platforms that only check one header.

### S5. Rate limiting with exponential backoff
**Where:** `src/lib/security/rate-limit.ts`.
DB-backed rate limiting with configurable window, max attempts, and exponential backoff on consecutive blocks (2^n multiplier, capped at 32x). Clears on successful login. Uses DB server time to avoid clock-skew races.

### S6. API key role demotion
**Where:** `src/lib/api/api-key-auth.ts`.
An API key's effective role is the LESSER of the key's declared role and the creator's current role. If a user's role is downgraded, their API keys are automatically downgraded. Keys created before `tokenInvalidatedAt` are rejected.

### S7. Pre-restore snapshot permissions
**Where:** `src/lib/db/pre-restore-snapshot.ts`.
Before any admin-driven DB restore, a full-fidelity snapshot is taken. Directory: `0o700`. Files: `0o600`. Retention: 5 snapshots max. This is the right safety net.

### S8. Docker socket proxy isolation
**Where:** `docker-compose.production.yml`.
Only `docker-proxy` container has `/var/run/docker.sock`. The judge worker connects via TCP. The Next.js app delegates Docker work to the worker's authenticated API. This is defense-in-depth for container escape.

---

## Findings (severity + remediation)

### F1. No MFA on any account tier (CRITICAL)
**Where:** `src/lib/auth/config.ts`.
The `super_admin` account is protected by password alone. A single phishing or credential-stuffing hit owns the platform, all backups, all audit logs, and all user data.
**CVSS-style severity:** High (7.5) — requires attacker to obtain password, but no second factor blocks them.
**Remediation:** Add TOTP to the NextAuth credentials flow. Gate sensitive actions (settings changes, backup restore, role edits) on MFA verification. Consider WebAuthn for super_admin.
**ETA:** 3-5 days.

### F2. Admin username disclosed on public rankings (HIGH)
**Where:** `src/app/(public)/rankings/page.tsx`.
The `admin` user (name "Super Admin", Diamond tier) is rendered to anonymous visitors. Combined with F1 (no MFA), this is a targeted credential-stuffing advertisement.
**Severity:** High (7.0) — information disclosure enabling targeted attack.
**Remediation:** Filter staff roles from public rankings. Add a `isStaff` flag to the rankings query.
**ETA:** 15 minutes.

### F3. Metrics endpoint leaks env var name (MEDIUM)
**Where:** `src/app/api/metrics/route.ts:33`.
`503 {"error":"CRON_SECRET not configured"}` leaks the exact env var name and confirms the platform uses `CRON_SECRET` for auth. This aids reconnaissance.
**Severity:** Medium (5.3) — information disclosure aiding reconnaissance.
**Remediation:** Return 404 without body for missing secrets. Add `CRON_SECRET` to deploy script's `ensure_env_secret` list.
**ETA:** 30 minutes.

### F4. API key encryption key derivation may use legacy path (LOW)
**Where:** `src/lib/api/api-key-auth.ts:39-48`.
`decryptApiKey` tries HKDF-derived key first, then falls back to a legacy key. The fallback is a compatibility shim. If the legacy key is weaker (e.g., derived from a static secret rather than HKDF), this is a decryption path that should have a migration deadline.
**Severity:** Low (3.5) — depends on legacy key quality.
**Remediation:** Audit `legacyEncryptionKey()` source. Set a deprecation date for legacy decryption. Re-encrypt all keys with HKDF-derived key before deprecation.
**ETA:** 1 day for audit; 1 day for re-encryption.

### F5. Username/email case-insensitive lookup is a subtle oracle (LOW)
**Where:** `src/lib/auth/config.ts:277-284`.
Login queries use `lower(username) = lower(identifier)` and `lower(email) = lower(identifier)`. This disables PostgreSQL's case-sensitive index and may be slightly slower. The dummy hash mitigates timing differences for non-existent users, but the double-query pattern (username first, email fallback) could leak whether a username exists via timing if the DB is under load.
**Severity:** Low (2.5) — theoretical under specific conditions.
**Remediation:** Use a single query with `OR` and `lower()` on both columns. Monitor login timing variance.
**ETA:** 1 hour.

### F6. Worker registration token is plaintext on the wire (MEDIUM)
**Where:** `judge-worker-rs/src/main.rs` (registration), `src/app/api/v1/admin/workers/route.ts`.
The worker receives a plaintext `secretToken` on registration. The token hash is stored. If the registration request is intercepted (e.g., compromised deploy script, man-in-the-middle on the internal network), the attacker can impersonate the worker.
**Severity:** Medium (5.5) — requires network-level access.
**Remediation:** Use a short-lived JWT for registration. The worker exchanges it for a long-term token. Rotate tokens periodically.
**ETA:** 1 day.

### F7. Admin capabilities bypass all integrity checks (MEDIUM — documented)
**Where:** `docs/exam-integrity-model.md:42-44`.
Any role with `system.settings` capability bypasses deadline, exam-window, and heartbeat-freshness checks. This is intentional for incident response but means an admin compromise cannot be defended by the integrity model.
**Severity:** Medium (5.0) — documented architectural choice, not a bug.
**Remediation:** Document this in the admin security ops guide. Add MFA gating for admin login.
**ETA:** Documentation only.

### F8. No Content Security Policy (MEDIUM)
**Where:** `src/app/layout.tsx` or `next.config.ts`.
There is no `Content-Security-Policy` header. The platform renders user-generated content (problem statements, comments) and loads external scripts (KaTeX). A reflected XSS via problem statement is theoretically possible if `isomorphic-dompurify` has a bypass.
**Severity:** Medium (5.5) — depends on DOMPurify bypass existence.
**Remediation:** Add a strict CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;`. Use nonce-based CSP for inline scripts.
**ETA:** 3 hours.

---

## Exam integrity model assessment

JudgeKit's integrity model is **honest about its limits**, which is rare and commendable. The `docs/exam-integrity-model.md` document explicitly states:

- Heartbeat freshness closes the curl-submit attack.
- It does NOT close the "hidden tab on laptop A, solve on laptop B" attack.
- It does NOT detect AI-generated code.
- It is "advisory" not "proof."

**Security researcher's assessment:** This is the correct scope. The platform should not claim more than it can prove. For high-stakes exams, pair JudgeKit with Safe Exam Browser or live proctoring. The telemetry is useful for post-hoc review, not real-time enforcement.

**One concern:** The recruit-start page does not carry the same honest disclaimer as the internal docs. Candidates and recruiters may misinterpret a clean heartbeat log as evidence of honesty. This is a communication risk, not a technical one.
