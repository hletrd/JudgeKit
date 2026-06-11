# Comprehensive Security Review — JudgeKit

**Date:** 2026-04-10  
**Scope:** Current repository state at `10182c7`, covering the Next.js app, PostgreSQL data layer, judge worker and sidecars, Docker/compose deployment, scripts, and security-relevant documentation.  
**Inventory baseline:** `src/` 419 files, `tests/` 158 files, `docs/` 12 files, `scripts/` 25 files, `docker/` 104 files, plus `judge-worker-rs/src` (10 files), `code-similarity-rs/src` (3 files), and `rate-limiter-rs/src` (3 files).  
**Review method:** local code inspection, cross-file interaction checks, grep sweeps for auth/secrets/process execution, and dependency scan via `npm audit --json`.

## Review inventory

Security-relevant areas examined:

- **Authentication & session security**
  - `src/lib/auth/config.ts`
  - `src/lib/auth/session-security.ts`
  - `src/lib/api/auth.ts`
  - `src/lib/security/env.ts`
  - `src/lib/security/csrf.ts`
  - `src/lib/security/password-hash.ts`
  - `src/lib/security/rate-limit.ts`
  - `src/lib/security/api-rate-limit.ts`
  - `src/lib/security/timing.ts`
- **Authorization / capability model**
  - `src/lib/capabilities/*`
  - `src/lib/security/constants.ts`
  - `src/lib/auth/permissions.ts`
  - representative admin pages/routes/actions
- **Secrets & cryptography**
  - `src/lib/api/api-key-auth.ts`
  - `src/lib/plugins/secrets.ts`
  - backup / import / restore routes
- **Judge / sandbox / sidecars**
  - `judge-worker-rs/src/{main,docker,executor,runner,validation}.rs`
  - `code-similarity-rs/src/main.rs`
  - `rate-limiter-rs/src/main.rs`
  - `src/lib/compiler/execute.ts`
  - `src/lib/docker/client.ts`
- **Deployment / infrastructure**
  - `Dockerfile`, `Dockerfile.judge-worker`, `Dockerfile.code-similarity`
  - `docker-compose.production.yml`, `docker-compose.worker.yml`, `docker-compose.test-backends.yml`
  - `deploy-docker.sh`, `deploy.sh`, `scripts/deploy-worker.sh`
  - `scripts/*.service`, `README.md`, `docs/deployment.md`, `docs/judge-workers.md`
- **Dependency security**
  - `package.json`
  - `npm audit --json`

Excluded from deep review:
- generated directories and caches (`node_modules`, `.next`, `coverage`, `test-results`, `*/target`, `.omc`, `.omx`, etc.)
- local untracked secrets not part of the tracked repository state

## Executive summary

**Overall assessment:** good security fundamentals with a handful of important remaining weaknesses.

Strong areas:
- Argon2id password hashing with legacy bcrypt migration
- timing-safe bearer token comparison on the judge/API paths
- CSRF protection for state-changing cookie-auth requests
- capability-based authorization model now used in most modernized admin surfaces
- non-root execution inside compiler/judge containers
- full-fidelity backups gated by password reconfirmation

Main concerns that still remain:
1. **The app container itself still has broad Docker daemon authority** through `docker-proxy`, so a web-app compromise can become a host compromise.
2. **Judge worker containers still run with `SYS_ADMIN` and AppArmor disabled** in production and worker compose files.
3. **Login/recruit-token rate limiting is still split into separate check and record operations**, so concurrent brute-force attempts can bypass the effective threshold.
4. **The Rust worker still accepts arbitrary registry-qualified image references** as long as they are syntactically valid; unlike the TS path, it does not enforce a trusted registry allowlist.
5. **Operational scripts still create overly permissive or plaintext-secret-bearing files** on remote hosts.

## Remediation addendum — 2026-04-10

All actionable findings from this review have been addressed in the working tree:

- The app container no longer ships `docker-cli` or a Docker group membership; Docker image management now goes through authenticated internal worker endpoints and the production/test compose files stop exposing Docker to the app container directly.
- The production, dedicated-worker, and test-backend worker compose files no longer grant `SYS_ADMIN` or `apparmor:unconfined` to the worker container.
- Login and recruiting-token throttling now consume attempts atomically before credential verification, closing the prior TOCTOU gap.
- The Rust worker now enforces the same `TRUSTED_DOCKER_REGISTRIES` allowlist model as the TypeScript compiler path for fully qualified external images.
- `deploy.sh` now provisions `/compiler-workspaces` as an owner-only directory for the app UID instead of a world-writable sticky directory.
- `deploy-docker.sh` no longer writes a plaintext `.env.dbcreds` file on the remote host; it exports the required DB variables directly into the transient migration containers.
- `code-similarity-rs` now returns HTTP 500 on panic instead of a false-success empty result set.
- The rate-limiter sidecar now binds explicitly to `127.0.0.1` in the shipped service file and disables the reset endpoint by default.
- `scripts/deploy-worker.sh` now uses stricter SSH defaults and copies the worker `.env` file with `0600` permissions instead of embedding the judge token in a remote heredoc command.
- `npm audit` is now clean (`0` vulnerabilities) after pinning a safe `esbuild` override in the dev toolchain.

## Findings

---

## 1) Confirmed — High — The web app container still has broad Docker daemon authority, making any app compromise effectively host-compromise capable

**Files / regions**
- `Dockerfile:55-61`
- `docker-compose.production.yml:56-68`
- `docker-compose.production.yml:70-89`
- `src/app/api/v1/compiler/run/route.ts:23-88`
- `src/lib/docker/client.ts:20-120`

**Why this is a problem**
The production app image installs `docker-cli`, joins a `docker` group, and is configured with `DOCKER_HOST=tcp://docker-proxy:2375`. The `docker-proxy` service grants container, image, build, POST, and DELETE access. On top of that, the app exposes features that exercise Docker from inside the web process:
- standalone compiler execution (`/api/v1/compiler/run`)
- admin Docker image listing / pull / delete / build routes

This means the trust boundary is extremely thin: if the Next.js app process is compromised (RCE, template escape, severe SSRF into privileged internal code, future dependency bug, etc.), the attacker effectively gains the ability to control Docker on the host and can likely escape into host-level execution.

**Concrete failure scenario**
An attacker finds a future RCE in the app process or lands arbitrary server-side code execution through a dependency bug. Because the app container can already talk to `docker-proxy` with broad permissions, the attacker can launch a new container that bind-mounts the host filesystem or Docker socket surfaces and pivot to full host compromise.

**Suggested fix**
- Remove Docker access from the **app** container entirely if possible.
- Delegate all Docker-based compiler execution and admin image management to a separate privileged worker/admin service.
- If Docker access in the app is unavoidable, drastically reduce proxy permissions and isolate the routes behind stronger admin-only controls and network segmentation.

**Confidence:** High

---

## 2) Confirmed — High — Judge worker containers still run with `CAP_SYS_ADMIN` and `apparmor:unconfined`

**Files / regions**
- `docker-compose.production.yml:102-124`
- `docker-compose.worker.yml:31-53`
- `docker-compose.test-backends.yml:145-164`

**Why this is a problem**
The judge-worker services still run with one of the most dangerous Linux capabilities (`SYS_ADMIN`) and with AppArmor confinement disabled. Those settings dramatically expand the impact of any compromise inside the worker container. The repository now routes Docker through `docker-proxy`, so these elevated privileges are especially hard to justify.

**Concrete failure scenario**
A future bug in the worker HTTP runner, Docker invocation logic, or a dependency in the worker container yields code execution in the worker process. Because the container is granted `SYS_ADMIN` and no AppArmor confinement, the attacker gets a much easier path to host escape or sensitive kernel-surface interaction than they would under a normal locked-down container profile.

**Suggested fix**
- Prove the minimum required capability set empirically.
- Remove `SYS_ADMIN` and `apparmor:unconfined` unless there is a demonstrated hard requirement.
- If some exception is truly necessary, split that responsibility into a narrower isolated helper rather than the main long-running worker.

**Confidence:** High

---

## 3) Confirmed — High — Login and recruiting-token throttling still has a TOCTOU race that allows concurrency-amplified brute force

**Files / regions**
- `src/lib/auth/config.ts:137-175`
- `src/lib/auth/config.ts:201-215`
- `src/lib/security/rate-limit.ts:102-117`
- `src/lib/security/rate-limit.ts:160-170`

**Why this is a problem**
The login flow still does a separate:
1. `isAnyKeyRateLimited(...)` check, then later
2. `recordRateLimitFailureMulti(...)`

Even though each helper uses transactions internally, they are **different transactions**. Under concurrency, multiple requests can all observe “not yet limited” before any of them records the failure, multiplying the effective allowed attempts.

This affects both the normal username/password path and the recruiting-token path.

**Concrete failure scenario**
An attacker submits 20 parallel bad-password requests for the same username/IP. Because each request performs the rate-limit read before any write commits, far more than the intended threshold can be attempted before the block state catches up.

**Suggested fix**
Move login/recruit-token throttling to a single atomic “check-and-record” operation, e.g.:
- a dedicated helper that increments and decides in one transaction, or
- the sidecar approach with one authoritative RPC per attempt.

**Confidence:** High

---

## 4) Confirmed — High — The Rust worker only syntax-validates image references; it still does not enforce the trusted-registry policy that the TS path uses

**Files / regions**
- `judge-worker-rs/src/validation.rs:1-12`
- `judge-worker-rs/src/executor.rs:37-45`
- `judge-worker-rs/src/runner.rs:153-160`
- compare with `src/lib/compiler/execute.ts:95-114`

**Why this is a problem**
The TS compiler path rejects registry-qualified images unless they match `TRUSTED_DOCKER_REGISTRIES`. The Rust worker/runner path only enforces a character whitelist and rejects protocols like `http://`, but it still allows arbitrary external registry prefixes such as:
- `evil.example.com/judge-rust:latest`

That means a malicious or compromised admin, or any upstream database corruption of language config, can instruct the worker to pull and execute attacker-controlled images from arbitrary registries.

**Concrete failure scenario**
An attacker gains admin-panel access or finds a route that mutates language configuration. They change a language Docker image to `evil.example.com/judge-python:latest`. The Rust worker accepts the reference as valid, pulls it, and executes student code inside an attacker-supplied image.

**Suggested fix**
Mirror the TS allowlist semantics in `judge-worker-rs/src/validation.rs`:
- allow local `judge-*` / known safe images
- if a registry-qualified prefix is present, require it to match `TRUSTED_DOCKER_REGISTRIES`
- use the same policy in both the executor and runner paths

**Confidence:** High

---

## 5) Confirmed — Medium/High — The legacy deploy path still creates `/compiler-workspaces` as world-writable on the host

**Files / regions**
- `deploy.sh:117-120`

**Why this is a problem**
The legacy deploy script creates `/compiler-workspaces` with `chmod 1777`. That makes the workspace root world-writable with a sticky bit. On any multi-user host, other local users/processes can create, race, or tamper with workspace contents used for compiler execution.

Even if this path is not the preferred deployment path anymore, it is still a tracked operational script and is still callable.

**Concrete failure scenario**
A low-privilege user or another process on the same VM watches `/compiler-workspaces` and races to read or tamper with newly created compiler directories or source files, potentially leaking submissions or altering compile/run behavior.

**Suggested fix**
Use a dedicated service account or group-based directory model instead, for example:
- `root:docker` with `0770` + setgid, or
- a dedicated `judgekit` group with only the app/worker users in it.

**Confidence:** High

---

## 6) Confirmed — Medium — `deploy-docker.sh` writes plaintext DB credentials into a temporary remote file and only cleans it up on the happy path

**Files / regions**
- `deploy-docker.sh:366-411`

**Why this is a problem**
The deployment script writes `${REMOTE_DIR}/.env.dbcreds` containing:
- `POSTGRES_PASSWORD`
- `PGPASSWORD`
- full `DATABASE_URL`

It later deletes the file, but only after the migration/analyze steps. If the script aborts or SSH disconnects at the wrong point, the file persists on disk with live credentials.

**Concrete failure scenario**
A deploy is interrupted by network loss or an operator Ctrl-C after the env file is created but before cleanup runs. The remote host is left with a plaintext DB credential file in the app directory, available to anyone with filesystem access there.

**Suggested fix**
- create the temp file using `mktemp`
- set a shell `trap` on the **remote** side so cleanup runs on failure as well as success
- or avoid writing the file entirely by piping the credentials into the one-shot containers over stdin or a temporary isolated mount

**Confidence:** High

---

## 7) Confirmed — Medium — The code-similarity sidecar still fails open on panics by returning an empty result set with HTTP 200

**Files / regions**
- `code-similarity-rs/src/main.rs:24-38`
- `src/lib/assignments/code-similarity-client.ts:21-45`

**Why this is a problem**
If `compute_similarity(...)` panics inside `spawn_blocking`, the service logs the panic and returns `Vec::new()`, which becomes a normal successful JSON response. The caller then sees “no similar pairs” rather than “scan failed.” Because the client only falls back when the HTTP call errors or returns non-OK, this path silently suppresses anti-cheat detection.

**Concrete failure scenario**
A malformed edge-case input or future bug causes a panic in the Rust similarity engine. Instead of surfacing an error and allowing the caller to react, the sidecar returns 200 with `pairs: []`. The assignment is incorrectly recorded as having no suspicious similarities.

**Suggested fix**
Return an explicit 500/error payload when the computation task panics, and have the client treat that as a failed scan rather than “no matches.”

**Confidence:** High

---

## 8) Risk needing manual validation — The rate-limiter sidecar exposes an unauthenticated `/reset` endpoint and relies entirely on localhost binding for safety

**Files / regions**
- `rate-limiter-rs/src/main.rs:240-245`
- `rate-limiter-rs/src/main.rs:319-337`
- `scripts/rate-limiter-rs.service:12-13`

**Why this matters**
The sidecar exposes a destructive `POST /reset` with no auth. The main mitigation is that it binds to `127.0.0.1` by default and the provided systemd unit only sets the port, not the host. That is good, but it means the security model is purely “not exposed.” If an operator ever rebinds it, proxies it, or exposes it through SSRF in the local app, the endpoint can be abused to clear throttles.

**Concrete failure scenario**
A future operator changes `RATE_LIMITER_HOST=0.0.0.0` for convenience, or reverse-proxies the service for debugging. An attacker can then spam `/reset` to remove rate-limit state and brute-force protected flows.

**Suggested fix**
- keep localhost binding as a hard default
- add a bearer token or local mTLS/shared-secret guard for `/reset`
- document that the sidecar must never be exposed directly

**Confidence:** Medium

---

## 9) Risk needing manual validation — `scripts/deploy-worker.sh` still transfers the global judge auth token over plain SSH commands and does not harden SSH host-key behavior or remote file permissions

**Files / regions**
- `scripts/deploy-worker.sh:79-102`

**Why this matters**
The worker deploy script:
- shells out to plain `ssh` / `scp` with no explicit host-key policy hardening (`StrictHostKeyChecking=accept-new`, pinned known_hosts, etc.)
- writes a remote `.env` containing `JUDGE_AUTH_TOKEN`, but does not set restrictive permissions afterward

On a typical host umask, that file may end up more readable than intended. Because `JUDGE_AUTH_TOKEN` is the global bearer used to register/deregister/claim/report judge work, leakage is high impact.

**Concrete failure scenario**
An operator deploys a worker to a shared host. The remote `.env` ends up readable to another local user/service on that host, or an SSH MITM is not rejected because host keys are not explicitly managed by the script. The attacker steals the global judge token and impersonates a worker.

**Suggested fix**
- add hardened SSH options (`StrictHostKeyChecking=accept-new` or pinned known_hosts)
- create the remote env file with `chmod 600`
- consider not writing the global token to disk at all if a safer secret-distribution path is available

**Confidence:** Medium

---

## 10) Confirmed — Low — `npm audit` still reports four moderate dev-toolchain vulnerabilities through `drizzle-kit` → `@esbuild-kit/*` → `esbuild`

**Files / regions**
- `package.json:92`
- `npm audit --json` output during this review

**Why this is a problem**
The current dev dependency set still carries moderate advisory exposure via the Drizzle toolchain. The reported issue is:
- `esbuild` advisory `GHSA-67mh-4wv8-2f99`

This is a **dev/build-time** concern rather than a production-runtime bug, but it still affects local developer machines and CI environments that execute the toolchain.

**Concrete failure scenario**
A developer runs an affected local dev/build workflow in a hostile browser/network environment matching the advisory preconditions, or CI uses the vulnerable chain in a context where the esbuild issue can be triggered.

**Suggested fix**
Upgrade or replace the vulnerable toolchain path when a compatible `drizzle-kit` release is available, or document the residual dev-only risk if upgrading would require a disruptive migration.

**Confidence:** High

## Positive observations

- Argon2id is the default password hash, with transparent bcrypt migration on login.
- Judge/API bearer checks use timing-safe comparison.
- CSRF validation is consistently applied to cookie-auth state-changing requests.
- Plugin secrets and API keys now require a dedicated encryption key instead of silently falling back to `AUTH_SECRET`.
- Full database backup/restore now requires password re-confirmation.
- Code-snapshot writes are now scoped to assignment/problem access rather than blindly accepting arbitrary IDs.
- The compiler/judge paths now run containers as a non-root UID inside the sandbox.
- Post-fix deployment validation and live health checks are strong.

## Final missed-issues sweep

After the main review, I did an extra pass for commonly missed security problems:

- hardcoded secret patterns in tracked files (`rg` over repo, excluding generated dirs)
- Docker/compose privilege and daemon-access surfaces
- auth/capability inconsistencies across pages, routes, and server actions
- sidecar auth / host-binding assumptions
- backup/export/import/restore secret-handling
- child-process and shell execution patterns
- dependency vulnerabilities (`npm audit --json`)

## Coverage confirmation

Reviewed categories:
- [x] auth/session/JWT flow
- [x] CSRF / env / secret handling
- [x] API key and plugin secret crypto paths
- [x] judge routes and worker auth
- [x] compiler/docker execution path
- [x] deployment scripts and compose files
- [x] Rust sidecars and worker runtime
- [x] security-relevant docs and env examples
- [x] dependency vulnerability scan

Generated/cache directories were intentionally excluded from deep review (`node_modules`, `.next`, coverage, target dirs, etc.).
