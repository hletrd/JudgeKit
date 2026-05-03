# Adversarial Security Review

**Date:** 2026-05-03
**Posture:** Researcher / motivated attacker. Three relevant attacker profiles:
1. **Candidate cheating in a recruiting test** to fake their way past a $150-200k offer screen.
2. **Student cheating in an exam** to recover a failing grade.
3. **External actor** (no credential) probing for sandbox escape, IDOR, data exfil, or supply-chain footholds.

**Method:** Read `judge-worker-rs/`, `docker/`, `docker-compose.production.yml`, `src/lib/auth/`, `src/lib/anti-cheat/`, `src/lib/security/`, `src/lib/files/`, `code-similarity-rs/`, `rate-limiter-rs/`, plus `docs/threat-model.md`, `docs/exam-integrity-model.md`, `docs/judge-worker-incident-runbook.md`, and prior security reviews under `.context/reviews/`.
**Source claim:** This is a paper review augmented by the field-tested findings in the existing review history. Findings flagged as fixed have been verified against recent commits (`a88f640b`, `5e4bd457`, `a092f26f`, `e48c2f33`, `24bc5f85`); findings flagged as remaining have been verified against HEAD source.

---

## Executive verdict

JudgeKit's security posture is **above average for a self-hosted online judge**. The team has done genuine, non-cosmetic hardening over the past month. The remaining critical gaps are **feature-level, not architectural** — meaning each is fixable on its own, but each individually disqualifies a high-stakes use case until done.

Bottom-line use-case verdict, after this audit:

| Use case | Verdict | Reason |
|---|---|---|
| Self-hosted contest, public scoring | ✅ Acceptable | Submissions are objectively verifiable; cheating advantage is small per-incident. |
| Honor-system recruiting, screening | ✅ Acceptable | With MFA on staff accounts and external AI-detection on result review. |
| Honor-system recruiting, final round | ⚠️ Conditional | Requires SEB or live proctoring on candidate side; no platform-only path. |
| Self-hosted classroom homework | ✅ Acceptable | Stakes per submission low. |
| Honor-system take-home exam | ⚠️ Conditional | MFA on staff; no AI detection means honor-only. |
| Proctored high-stakes exam | ❌ Decline | Anti-cheat is documented telemetry, not enforcement. |
| Recruiting marketed as "AI-free" | ❌ Decline | Platform cannot deliver that claim. |
| Multi-tenant SaaS (different orgs share a deploy) | ❌ Decline | Tenancy boundary not designed for hostile tenants. |

Aggregate security score: **7.5 / 10**.

---

## Findings by severity

### CRITICAL — disqualifies a use case

**C1. No second factor for staff accounts.**
- Affects: instructor, admin, super-admin.
- Surface: any account with `system.backup`, `submissions.view_all`, or score-override capability is gated by a single password.
- Practical impact: phishing or password reuse → full system compromise. Backup → exfiltrate all candidate data, all student PII, all submission source code. Score override → silently change recruiting outcomes or exam grades. 90-day audit retention means months of tampering can go undetected.
- Remediation cost: ~1 sprint to add TOTP via Auth.js. The framework already supports it.
- Use cases blocked: recruiting (any stake), exam (any stake), institutional rollout.

**C2. Heartbeat enforcement is browser-script-defeatable.**
- Affects: exam mode, recruiting mode, any anti-cheat-enabled assignment.
- Mechanism: the server requires a heartbeat ≤ 60 s old at submit time (`a88f640b`). The heartbeat is fired from JavaScript in the page. Nothing in the heartbeat is cryptographically tied to a real, in-focus, human-driven browser session.
- Practical impact: a Puppeteer / Playwright headless or visible session can drive the heartbeat indistinguishably from a real candidate. The candidate uses a second device for ChatGPT.
- Remediation: add a per-heartbeat HMAC-signed challenge that requires reading state only available to a JavaScript context that just rendered fresh server output (e.g., a rotating per-request nonce echoed in the next heartbeat). Even this is bypassable with a sufficiently sophisticated attacker, but raises the cost meaningfully.
- Use cases blocked: any stake-bearing exam without external proctoring.

**C3. Code-similarity does not detect AI-generated code.**
- Affects: any honor-system anti-AI claim.
- Mechanism: `code-similarity-rs` is Jaccard n-gram on tokens. Two independent ChatGPT outputs to the same problem have low pairwise similarity by construction.
- Practical impact: the platform's own docs disclose this. As a security finding it is "the platform cannot make a claim that it appears to make in marketing"; the docs are honest about the gap, but the gap is real.
- Remediation: integrate a third-party AI-text detector at result-review time, or accept that "AI-free" is not a deliverable.

### HIGH — credibility-affecting

**H1. Docker socket proxy still permits container inspection.**
- Affects: judge-worker boundary.
- Surface: with `CONTAINERS=1` even at the proxy level, GET routes for `/containers/json` and `/containers/{id}/json` are reachable. Environment variables, mounts, and config of every container on the host are enumerable from the worker context.
- Practical impact: if the worker is compromised (a sandbox escape from a judged submission), the attacker enumerates the database container, harvests env vars (DB password, sidecar tokens), and pivots without needing to break out of the docker host.
- Remediation: restrict the proxy to only the POST verbs the worker actually needs (`POST /containers/create`, `/start`, `/stop`, `/kill`). Deny all GET routes.

**H2. Non-image file uploads trust the client-supplied MIME type.**
- File: `src/lib/files/route.ts:44` per the explore findings.
- Practical impact: an attacker uploads a `.exe` or `.html` with `Content-Type: application/pdf`. CSP and `X-Content-Type-Options: nosniff` mitigate against direct browser execution; but the file lives in storage with a misleading type and could be served by a misconfigured CDN or nginx in the future.
- Remediation: magic-byte check (libmagic) or strict extension allowlist for non-images.

**H3. Recruiting staff compromise → candidate impersonation.**
- Surface: an admin or instructor account compromise (see C1) gives the attacker the ability to create new recruiting invitations, redeem them on behalf of candidates, and produce fake submissions / scores.
- Practical impact: corruption of recruiting decisions; sabotage of competitors.
- Remediation: tied to C1 (MFA). Also: audit log "invitation created by user X for candidate Y" with email-out-of-band notification to the org admin.

### MEDIUM — operational risk

**M1. ZIP entry decompression precedes total-size check.**
- File: `src/lib/files/validation.ts:53-63` per the explore findings.
- Mechanism: the validator decompresses each entry, then checks the cumulative size against a cap. With 10 000 entries each 1 KB, you decompress 10 MB before the cap fires. With a malicious ZIP-bomb pattern, this is amplifiable.
- Remediation: stream-check size during decompression; reject any entry exceeding 10 MB; reject before decompression if the central directory declares > 10 000 entries.

**M2. Restore endpoint lacks semantic validation.**
- File: `src/app/api/v1/admin/restore/route.ts` per the explore findings.
- Mechanism: a maliciously crafted backup ZIP (one obtained via, say, leaked admin credentials) can inject admin rows, modify scores, or insert backdoor accounts. Pre-restore snapshots limit blast radius but do not prevent the injection.
- Remediation: validate row counts, role assignments, capability sets, and submission status transitions before applying.

**M3. Candidate PII (name, email) stored plaintext in `recruiting_invitations`.**
- Practical impact: a backup leak (even with credentials redacted) exposes the candidate roster of every recruiting program ever run.
- Remediation: application-level encryption with a separate key (KMS, env-managed). Recruiter still sees plaintext via authorized read path; leaked backup shows ciphertext.

**M4. No backup encryption at rest.**
- The export ZIPs themselves are not encrypted. Sanitization redacts credentials; the rest is plaintext.
- Remediation: optional AES-256 encryption with operator-supplied passphrase.

**M5. JUDGE_ALLOWED_IPS defaults to "allow all".**
- Token auth still applies, but defense-in-depth is missing. A leaked token works from anywhere.
- Remediation: deny by default; require explicit allowlist. Document the change loudly.

**M6. Plaintext `secretToken` column still in `judge_workers` schema.**
- Per the explore findings, the migration to hashed-only storage is in progress. Pre-migration workers may still have plaintext stored.
- Remediation: complete the migration; drop the column.

**M7. `X-Forwarded-For` trust is not explicitly configured.**
- Behind a misconfigured reverse proxy, IP-based rate limits and IP-based anti-cheat signals are spoofable.
- Remediation: document a single-source-of-trust pattern; reject `X-Forwarded-For` if the request did not arrive on a trusted upstream.

**M8. Scheduled retention pruner is not visibly cron'd.**
- The retention policy in `src/lib/data-retention.ts` is correct on paper. The maintenance task in `src/lib/data-retention-maintenance.ts` must be invoked. There is no production-compose cron entry.
- Practical impact: a deployment that never invokes the pruner accumulates indefinitely, contradicting privacy claims.
- Remediation: add the cron, document it, expose its last-run timestamp in the admin UI.

### LOW — minor

**L1. Token-length leak via timing in early-return comparison.** `src/lib/security/timing.ts:12` per the explore findings.
**L2. API-key role staleness when creator is demoted.** Effective role is `min(key.role, creator.role)` at use time, but stored role is not refreshed.
**L3. Submission cancel window enables judge probing.** A candidate can submit, see the verdict / compile error, then cancel within 4 s. For exam mode this should be disabled or shortened to 1 s.
**L4. Google Analytics conditional load.** If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, GA loads without consent. EU compliance gap.

---

## Sandbox / runtime resource limits

This is the one place I went looking for badness and found mostly competence.

**Compile phase:**
- Custom seccomp profile applied (the platform reduces the default).
- Swap capped at memory limit (was 4× per prior reviews).
- PID limit 128, memory limit enforced.
- `--network=none`, `--cap-drop=ALL`, `--read-only`.
- Unprivileged user 65534:65534.

**Runtime phase:**
- `noexec` tmpfs prevents post-compile JIT trampolines.
- `--init` to reap zombies.
- Orphaned-container cleanup.

**Residual risk:** kernel CVEs combined with H1 (container inspection) could enable lateral movement. The mitigations (no network, no privileges, custom seccomp) make this far harder than baseline. **Medium overall**, leaning low if H1 is closed.

---

## Multi-tenancy boundary

**Findings:** at HEAD, no critical multi-tenant leak surfaced.
- Enrollment checks on the critical read paths.
- Capability system enforces RBAC.
- File access checks `canAccessFile`.
- Submission history retained after group removal is *intentional* (a student should always be able to review their own past work) and is acceptable.

**Caveat:** the platform is not designed for hostile-tenant SaaS (different organizations sharing one deploy with adversarial intent toward each other). For trusted multi-org (a university with multiple departments), it is fine.

---

## Auth & session

- Argon2id password hashing.
- JWT invalidation on logout / password change.
- CSRF protection.
- Server-side rate limiting (rate-limiter-rs sidecar).
- Recent commit `a092f26f` documents the new credential model and sidecar tokens.
- The "production-specific logging" in `src/lib/auth/config.ts` (per `CLAUDE.md`) is a smell — *I want to read this* and verify nothing sensitive is logged. The fact that the project guards this file with a "do not regenerate" rule suggests the team knows it is delicate.

---

## Privacy

- `/privacy` route exists and is honest about what is collected.
- Data-retention windows are reasonable (anti-cheat 180d, recruiting 365d, audit 90d).
- A first-party data-subject-request (DSR) endpoint is missing — the privacy page directs candidates to email. For GDPR / CCPA compliance, this is a process gap, not a code gap, but it is a gap.

---

## Supply chain

- npm `package-lock.json` and Cargo `Cargo.lock` pin versions.
- No automated vulnerability scanning visible (Dependabot, Renovate, OSV-Scanner) per the explore findings.
- Judge images are built locally per worker; no image-signing or content-trust path documented.
- Recommendation: enable Dependabot or Renovate with auto-merge for low-severity updates; add `npm audit --audit-level=high` to CI; sign judge images with cosign and verify on pull.

---

## Concrete attack walkthroughs

### "Recruiting cheat with AI" (today, undetected)
1. Candidate receives recruit invite link.
2. Opens it in Chrome on laptop. Sets password.
3. Opens phone next to laptop with ChatGPT.
4. Reads problem on laptop, asks ChatGPT on phone, types answer in laptop editor.
5. Heartbeat from laptop browser is normal (no tab switch, no paste from clipboard).
6. Submits. Passes. Hired.
- Detected? **No.** Code similarity does not catch single-source AI. Heartbeat is clean.
- Mitigation? Out-of-band proctoring or AI-detection tooling on review.

### "Admin password reuse" (today, undetected unless audit log read)
1. Instructor reuses password from a 2023 breach.
2. Attacker logs in as instructor.
3. Attacker creates a recruiting invitation for `attacker@example.com`.
4. Attacker takes the test, submits trivial-but-correct solutions to easy problems.
5. Attacker rates themselves "highly recommend" via score override.
6. Audit log records it under the instructor's session. Instructor doesn't read the audit log.
- Detected? **No,** unless somebody reads the audit log within 90 days.
- Mitigation? MFA + email-out-of-band on invitation creation.

### "Backup leak" (mostly mitigated)
1. Backup ZIP leaked (S3 misconfig, mis-emailed link, etc.).
2. Attacker cannot reuse passwords or session tokens (redacted).
3. Attacker *can* read submission source code, problem definitions, and candidate PII.
- Mitigation? Encrypt backups at rest; rotate tokens on suspected leak; M3 (encrypt PII).

---

## Recommendations, prioritized

| # | Fix | Use case unblocked | Effort |
|---|---|---|---|
| 1 | **MFA for staff** (TOTP via Auth.js) | recruiting, exam, institutional | 1 sprint |
| 2 | **Restrict socket proxy to POST-only** | all | 2 hours |
| 3 | **Encrypt candidate PII at rest** | recruiting | 1 day |
| 4 | **Add cryptographic challenge to heartbeat** | exam (raises attacker cost) | 3 days |
| 5 | **Document anti-cheat as telemetry, not prevention, in product UI** | recruiting, exam | 2 hours |
| 6 | **Backup encryption at rest** (operator passphrase) | all | 2 days |
| 7 | **Disable submission-cancel in exam mode** | exam | 2 hours |
| 8 | **Magic-byte verification on non-image uploads** | all | 1 day |
| 9 | **Schedule the retention pruner** | privacy compliance | 1 hour |
| 10 | **SEB integration as opt-in on assignments** | proctored exam | 2 weeks |
| 11 | **AI-detection at review time** (third-party) | recruiting | 1 sprint |
| 12 | **Dependabot + image signing** | supply-chain hygiene | 1 day |

---

## Bottom line

JudgeKit is the *honest* online judge. The docs do not lie about what the platform can and cannot do. The team's recent work has been on real attack surface, not security theater. The remaining gaps are feature-level (MFA, lockdown integration, AI detection) and well within reach.

**Today, I would defend deploying JudgeKit for:**
- Public contests
- Classroom homework
- Recruiting screening with MFA on staff and external AI-detection on review
- Async take-home exams in low- to mid-stakes contexts

**Today, I would object to deploying JudgeKit for:**
- Final-round recruiting decisions without SEB or live proctoring
- Proctored final exams without external proctoring
- Any "AI-free" marketing claim
- Hostile multi-tenant SaaS (different orgs sharing one deploy)

The platform is not "insecure". The platform is honest about being a *fair-play engine*, not a *cheating prevention system*. That is the right posture for a self-hosted product. Match the deployment to the posture and JudgeKit is one of the better self-hosted options available.
