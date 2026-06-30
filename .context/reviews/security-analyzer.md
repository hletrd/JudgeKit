# Security Analyzer Review

Date: 2026-06-30
Scope: entire repository (`/Users/hletrd/flash-shared/judgekit`), with emphasis on files modified in the current cycle
Summary: Independent adversarial audit from a defensive security-researcher perspective. The current cycle remediates five concrete HIGH/MEDIUM items from the aggregate review (static-site directory listing, compiler-run command-validation bypass, IP-extraction fallback weakness, access-code brute-force gap, and nginx body-size scoping). No new Critical or remotely exploitable auth bypass was confirmed. Residual risk is concentrated in documented configuration defaults (`AUTH_TRUST_HOST`, judge IP allowlist) and a handful of medium-severity information-disclosure / design items already tracked in prior cycles.
Findings count: 12 (0 Critical, 2 High, 5 Medium, 5 Low)

---

## Confirmed Fixed This Cycle

These aggregate-review findings were independently re-verified in current source and are now resolved:

- **C3-3 (Medium)**: Generated and template nginx configs scope `client_max_body_size 50M` to `location = /api/v1/judge/poll` only; the server block no longer carries a broad 50M limit (`deploy-docker.sh:1478/1493/1505`, `scripts/online-judge.nginx.conf:58/72/83/93`).
- **C3-5 (High)**: `static-site/nginx.conf:21` now reads `autoindex off;` and `tests/unit/infra/deploy-security.test.ts` guards against reintroduction.
- **C3-6 (Medium)**: `src/lib/compiler/execute.ts:638-688` validates the Docker image reference, source-code size, and both compile/run shell commands **before** delegating to the Rust runner (`tryRustRunner` at `:691`). `tests/unit/compiler/execute.test.ts` covers the Rust-runner bypass case.
- **C3-7 (High)**: `src/lib/security/ip.ts:107-112/117` refuses to fall back to `X-Real-IP` when `X-Forwarded-For` is present but has fewer hops than `TRUSTED_PROXY_HOPS` expects. `tests/unit/security/ip.test.ts` was updated to assert the new behavior.
- **C3-8 (High)**: `src/app/api/v1/contests/join/route.ts:29-39` consumes both a per-user failure budget (`contest:join:invalid`) and a per-code failure budget (`contest:join:invalid-code`) on every failed access-code redemption, closing the distributed brute-force path.

---

## HIGH: `AUTH_TRUST_HOST` defaults to `true` in production compose (confidence: High)

- **File**: `docker-compose.production.yml:106`
- **Problem**: `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-true}` makes Auth.js trust the request host by default. When `AUTH_TRUST_HOST=true`, the framework derives the canonical URL from `Host` / `X-Forwarded-Host` headers during OAuth callbacks and session handling. If the upstream reverse proxy does not explicitly sanitize `X-Forwarded-Host`, an attacker who can inject or influence that header can redirect OAuth callbacks, poison password-reset/recruit-token links, or obtain JWTs bound to an attacker-controlled origin.
- **Failure scenario**: A misconfigured nginx (or a direct request to the app container in a split-host deployment) carries `X-Forwarded-Host: evil.example`. NextAuth uses that host when building callback URLs and session metadata. The impact is bounded because `src/lib/security/env.ts` validates `AUTH_URL` in production, but `trustHost=true` still expands the attack surface unnecessarily.
- **Suggested fix**: Change the production compose default to `AUTH_TRUST_HOST=${AUTH_TRUST_HOST:-false}`. Ensure the nginx template sets `proxy_set_header Host $host;` and strips/overwrites `X-Forwarded-Host` before forwarding. Document that operators should only set `AUTH_TRUST_HOST=true` when the proxy cannot set `Host` correctly.
- **Cross-references**: `.env.example:12` already defaults to `false`; `.env.production.example:9` defaults to `true`. This mismatch is the core issue. `src/proxy.ts` and `src/lib/security/env.ts` handle host validation but do not disable `trustHost` semantics.

## HIGH: Judge API endpoints reachable from any IP by default (confidence: High)

- **File**: `src/lib/judge/ip-allowlist.ts:182-210`
- **Problem**: When `JUDGE_ALLOWED_IPS` is unset and `JUDGE_STRICT_IP_ALLOWLIST` is not `1`, `isJudgeIpAllowed()` returns `true` for every client IP. The code emits a one-time startup warning, but the open posture is the production default. A leaked `JUDGE_AUTH_TOKEN` (bootstrap-only) or per-worker secret therefore has no network-layer backstop.
- **Failure scenario**: An attacker who obtains a worker secret from a backup, CI log, or compromised sidecar can register a rogue worker, claim submissions (reading source code and hidden test cases), and inject arbitrary verdicts from anywhere on the internet.
- **Suggested fix**: Document the risk in `docs/deployment.md` and ship production `.env.production.example` / deploy profiles with either `JUDGE_ALLOWED_IPS` set to the internal Docker/worker subnet or `JUDGE_STRICT_IP_ALLOWLIST=1`. Consider a boot-time `die` in production when neither is configured.
- **Cross-references**: AGENTS.md documents the opt-in matrix and the cycle-2 revert (`23851d69`) that preserved the allow-all default for backward compatibility. This is a configuration gap, not a code bug.

## MEDIUM: Docker Compose has no explicit network segmentation (confidence: High)

- **File**: `docker-compose.production.yml` (no `networks:` block)
- **Problem**: All services share the default bridge network. A compromised sidecar (`code-similarity`, `rate-limiter`, `docker-proxy`) can directly reach `db:5432`, `app:3000`, and `judge-worker:3001`.
- **Failure scenario**: An RCE or credential leak in the code-similarity service (which processes full submission sources) becomes a pivot point to the database and judge runner.
- **Suggested fix**: Declare explicit networks (`frontend`, `backend`, `judge`, `db`) and attach services to the minimum set required. `db` should be reachable only by `app`; `judge-worker` / `docker-proxy` should be isolated to a `judge` network; `code-similarity` should live on `backend` only.
- **Cross-references**: security-reviewer.md M-4; `src/lib/docker/client.ts` (worker talks to proxy), `src/lib/assignments/code-similarity-client.ts`.

## MEDIUM: Server-side filesystem path disclosed in restore/import responses (confidence: High)

- **File**: `src/app/api/v1/admin/restore/route.ts:170/196/207/229/239`; `src/app/api/v1/admin/migrate/import/route.ts:115/141/228/251`
- **Problem**: The literal pre-restore snapshot path (e.g., `/home/deployer/data/pre-restore-snapshots/...`) is returned in JSON responses to authenticated admin callers. The capability gate (`system.backup`) narrows exposure, but the path leak still aids lateral movement after any initial account compromise.
- **Failure scenario**: A phished or malicious admin obtains the absolute host path layout, which simplifies targeting backup directories, volume mounts, and post-exploitation file staging.
- **Suggested fix**: Return only a stable snapshot ID / timestamp; log the full path server-side. Example:
  ```ts
  const snapshotId = preSnapshotPath ? path.basename(preSnapshotPath) : null;
  logger.info({ preSnapshotPath, userId: user.id }, "[restore] pre-restore snapshot written");
  return NextResponse.json({ ..., preRestoreSnapshotId: snapshotId });
  ```
- **Cross-references**: security-reviewer.md M-2; `src/lib/db/pre-restore-snapshot.ts`.

## MEDIUM: Admin password still accepted in deprecated JSON-body import path (confidence: High)

- **File**: `src/app/api/v1/admin/migrate/import/route.ts:145-196`
- **Problem**: The deprecated JSON-body branch parses `{ password, data }` and verifies the admin password. The endpoint logs a deprecation warning but remains functional. Any upstream request-body logging (WAF, debug middleware, nginx `log_format` with body) captures the admin password in plaintext.
- **Failure scenario**: Operational troubleshooting enables body logging; an attacker with log access recovers a high-privilege credential.
- **Suggested fix**: Add a runtime kill-switch (e.g., `DISABLE_DEPRECATED_JSON_IMPORT=1`) defaulting to disabled in production, or move the sunset date earlier than November 2026. Emit a rate-limited `SECURITY_ALERT` audit event whenever the path is used.
- **Cross-references**: security-reviewer.md M-3; `src/lib/audit/events.ts`.

## MEDIUM: Assistant can rejudge their own submission (confidence: Medium)

- **File**: `src/app/api/v1/submissions/[id]/rejudge/route.ts:33`
- **Problem**: The route gates on `canAccessSubmission`, which returns true for the submitter. `submissions.rejudge` is present in the default assistant capability set. An assistant who is also a contest participant can therefore reset/re-queue their own submission during or after a contest.
- **Failure scenario**: A TA/assistant competing in the same assignment rejudges their own failing submission repeatedly, distorting penalty time or IOI best-score aggregation.
- **Suggested fix**: Require a grader relationship (`canViewAssignmentSubmissions` or `canManageContest`) in addition to the capability, or explicitly block self-rejudge when the assignment is closed or graded.
- **Cross-references**: `src/lib/auth/permissions.ts:340`; `src/lib/capabilities/defaults.ts:24`.

## MEDIUM: TA/instructor capability matrix still partially misaligned with route guards (confidence: Medium)

- **File**: `src/app/api/v1/contests/[assignmentId]/similarity-check/route.ts:9-22` (fixed), plus other TA/instructor routes flagged in aggregate C3-9
- **Problem**: The current cycle fixes the similarity-check API so that assistants with `anti_cheat.run_similarity` who are group TAs or assigned instructors can run scans. Other routes may still enforce `canManageContest` while the UI or capability matrix promises TA/course-staff access.
- **Failure scenario**: Course staff see affordances or hold configured capabilities that fail at API time during an exam, forcing escalation to an admin and degrading incident response.
- **Suggested fix**: Complete the route-by-route audit proposed in C3-9. Align `ASSISTANT_CAPABILITIES`, `INSTRUCTOR_CAPABILITIES`, UI affordances, and API guards for exam extension, clarification/announcement creation, and analytics export.
- **Cross-references**: aggregate review C3-9; `src/lib/capabilities/defaults.ts`; instructor-reviewer.md / assistant-reviewer.md.

## LOW: Static-site nginx omits standard security response headers (confidence: High)

- **File**: `static-site/nginx.conf`
- **Problem**: The config has no `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, or `Referrer-Policy`. While the root currently serves static documentation, any future HTML with inline scripts or framing becomes vulnerable to MIME sniffing/clickjacking.
- **Failure scenario**: An uploaded or accidentally copied HTML file under the static root executes inline script or is framed by a phishing site.
- **Suggested fix**: Add:
  ```nginx
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'" always;
  ```
- **Cross-references**: security-reviewer.md L-3.

## LOW: Dummy password hash uses an identifiable salt (confidence: High)

- **File**: `src/lib/auth/config.ts:51-52`
- **Problem**: The constant dummy hash's salt base64-decodes to `claudedummyhash`. This sentinel is used only for timing-safe comparison of unknown/inactive users, but its recognizability makes any accidental database storage or log leak immediately identifiable.
- **Failure scenario**: A bug or manual test stores the dummy hash in the `passwordHash` column; an attacker with a DB dump spots the sentinel instantly.
- **Suggested fix**: Replace with an argon2 hash generated from a random 32-byte salt and a fixed dummy password; store the new constant and add a test asserting it is never persisted.
- **Cross-references**: security-reviewer.md L-2.

## LOW: npm audit reports moderate-severity dependency findings (confidence: Medium)

- **File**: `package.json` / `package-lock.json`
- **Problem**: `npm audit` reported moderate-severity findings in a previous cycle. No high/critical vulnerabilities were confirmed, but the advisories have not been patched or waived in the current cycle.
- **Failure scenario**: A moderate CVE in a dependency chain (e.g., DOMPurify, next-auth beta, isomorphic-dompurify) becomes exploitable through the markdown sanitizer or auth callback parsing.
- **Suggested fix**: Run `npm audit` and `cargo audit`; patch or pin affected packages and add the audit to the CI quality gate.
- **Cross-references**: security-reviewer.md L-1; `tests/unit/infra/dependabot-config.test.ts`.

## LOW: Judge worker runner binds `0.0.0.0` with token-only protection (confidence: Medium)

- **File**: `docker-compose.production.yml:144`; `judge-worker-rs/src/runner.rs`
- **Problem**: `RUNNER_HOST=0.0.0.0` exposes the runner HTTP server to every peer on the compose network. Protection is a single bearer token (`RUNNER_AUTH_TOKEN`) with no IP allowlist or rate limit at the runner.
- **Failure scenario**: A compromised container on the compose network brute-forces or leaks the runner token and submits arbitrary judge jobs or Docker commands.
- **Suggested fix**: Default-bind the runner to `127.0.0.1` (reachable only via the app container's `COMPILER_RUNNER_URL` if on the same host) and add a runner-side IP allowlist plus rate limit.
- **Cross-references**: security-analyzer prior cycle §1.

## LOW: crun/OCI runtime installed without checksum verification (confidence: Medium)

- **File**: `scripts/install-crun-runtime.sh`
- **Problem**: The runtime binary is downloaded and installed without verifying a published SHA-256 or signature. A trojaned release asset or TLS-chain compromise would compromise every sandbox.
- **Failure scenario**: Supply-chain attacker replaces the crun binary; the malicious runtime disables seccomp/cap-drop when launching judge containers.
- **Suggested fix**: Pin the release version and verify a published SHA-256 checksum (or GPG signature) before install.
- **Cross-references**: security-analyzer prior cycle §1.

---

## Final Sweep

### Areas checked
- AuthN/Z: `src/lib/auth/**`, `src/app/api/auth/**`, `src/app/api/v1/**` route guards, capability defaults, permissions helpers.
- Sandbox: `judge-worker-rs/src/docker.rs`, `judge-worker-rs/src/executor.rs`, `docker/seccomp-profile.json`, `docker-compose.production.yml`.
- Input handling: `src/lib/security/sanitize-html.ts`, `src/components/problem-description.tsx`, `src/components/seo/json-ld.tsx`, `src/components/contest/code-timeline-panel.tsx`, file upload routes.
- Secrets/config: `.env.example`, `.env.production.example`, `src/lib/security/env.ts`, `src/lib/security/secrets.ts`.
- Footguns: searched for `dangerouslySetInnerHTML`, `eval(`, `new Function(`, `child_process.exec(`, `spawn({shell:true})`, `Math.random()` for tokens, `createHash('md5'|'sha1')`, raw SQL concatenation, and `NEXT_PUBLIC_*` secrets. Only the three guarded `dangerouslySetInnerHTML` sinks and two public-by-design `NEXT_PUBLIC_*` values were found.
- Deployment safety: verified no `docker system prune --volumes` / `docker volume prune` in production paths; prune logic uses dangling-only `docker image prune -f`.

### Items needing manual validation
- **Dependency advisories**: the exact `npm audit` / `cargo audit` output should be re-run at deploy time; this read-only pass did not execute the package managers.
- **Live worker seccomp enforcement**: the custom default-deny profile is believed to be enforced based on prior Wave-4 empirical verification, but this review did not spawn judge containers.
- **TA/instructor route alignment (C3-9)**: the similarity-check fix was verified; the broader route-by-route alignment remains to be completed.

### No incident escalation required
No live-attacker artifact, exfiltrated data, or unexpected privilege-escalation path was found. The review stayed within the defensive, platform-owner-authorized scope: findings and remediation only, with no weaponized exploit code or detection-evasion guidance. `src/lib/auth/config.ts` was audited read-only and not modified, per `CLAUDE.md`.
