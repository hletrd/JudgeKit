# Aggregate Review — Cycle 1 (2026-05-03)

**Date:** 2026-05-03
**HEAD reviewed:** `689cf61d`
**Reviewers:** code-reviewer, perf-reviewer, security-reviewer, critic, architect, debugger, verifier, tracer, test-engineer, document-specialist (10 lanes; per-agent files in `.context/reviews/2026-05-03-cycle1/<agent>.md`).

---

## Total deduplicated NEW findings (applicable at HEAD `689cf61d`)

**4 MEDIUM, 6 LOW NEW.**

---

## Deduplicated Findings (merged across agents, preserving highest severity)

### F1 (MEDIUM, HIGH confidence) — Docker build path validation mismatch
**Cross-agent agreement:** C1-CR-2, C1-CRIT-1, C1-DBG-1, C1-VER-1, C1-TE-1, C1-DS-1 (6 lanes)

**File:** `src/lib/docker/client.ts:159` (local) vs `:349` (remote)

The local `buildDockerImageLocal()` validates `dockerfilePath.startsWith("docker/Dockerfile.judge-")` while the remote `buildDockerImage()` validates `dockerfilePath.startsWith("docker/Dockerfile.")`. The local path is more restrictive (only judge images), the remote allows any Dockerfile under `docker/`. Tracer confirmed that an admin can trigger a build of `Dockerfile.code-similarity` through the remote path, which the local path would reject.

**Fix:** Align both paths to use `"docker/Dockerfile.judge-"` prefix. Extract validation to a shared function.

### F2 (MEDIUM, HIGH confidence) — `RUNNER_AUTH_TOKEN` fallback to `JUDGE_AUTH_TOKEN` in docker client
**Cross-agent agreement:** C1-SEC-4, C1-CRIT-2, C1-ARCH-2, C1-DBG-2, C1-VER-2 (5 lanes)

**File:** `src/lib/docker/client.ts:12`

`const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN || "";`

The fallback means a single compromised `JUDGE_AUTH_TOKEN` grants both judge submission API access and Docker management API access. This violates the principle of least privilege. The compiler/execute.ts module has the same fallback but adds production guards (lines 58-66); the docker client has no such guard.

**Fix:** Remove the `JUDGE_AUTH_TOKEN` fallback from `docker/client.ts`. Require `RUNNER_AUTH_TOKEN` explicitly for docker operations.

### F3 (MEDIUM, HIGH confidence) — Candidate PII not encrypted at rest
**Cross-agent agreement:** C1-CR-3, C1-SEC-2, C1-DBG-2 (3 lanes)

**File:** `src/lib/assignments/recruiting-invitations.ts:57-58`

`candidateName` and `candidateEmail` are stored as plaintext in the `recruitingInvitations` table. The encryption module (`src/lib/security/encryption.ts`) exists with AES-256-GCM but is not applied. Database compromise exposes all candidate PII.

**Fix:** Apply column-level encryption using `encrypt()`/`decrypt()` before insert and after select.

### F4 (MEDIUM, HIGH confidence) — File uploads lack magic-byte verification for non-image types
**Cross-agent agreement:** C1-CR-4, C1-SEC-3 (2 lanes)

**File:** `src/app/api/v1/files/route.ts:29-31, 71-74`

Non-image uploads (PDF, ZIP, text) trust the browser-provided MIME type without verifying file content. The serving headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`) provide browser-side defense but the stored content is unverified.

**Fix:** Add magic-byte verification for PDF (`%PDF-`), ZIP (`PK` signature), and other supported types.

### F5 (MEDIUM, HIGH confidence) — JWT callback queries database on every authenticated request
**Cross-agent agreement:** C1-PERF-1, C1-DBG-3 (2 lanes)

**File:** `src/lib/auth/config.ts:394-407`

The `jwt()` callback queries `db.query.users.findFirst` on every API request that checks auth. Under high load, this creates unnecessary DB pressure. If the DB is slow or unreachable, all authenticated requests fail.

**Fix:** Cache the user record in the JWT for a short TTL (e.g., 60 seconds), or only re-query on a schedule.

### F6 (LOW, HIGH confidence) — Production deployment lag
**Cross-agent agreement:** C1-CRIT-3, C1-DS-2 (2 lanes)

Routes that exist in source (`/signin`, `/privacy`, `/groups`) return 404 in production. Not a code issue — deploying HEAD fixes this.

**Fix:** Deploy current HEAD to production.

### F7 (LOW, HIGH confidence) — `console.error`/`console.warn` in 24 client components
**Cross-agent agreement:** C1-CR-6 (1 lane, carry-forward from prior cycles)

24 client-side `console.error`/`console.warn` calls across dashboard components. Visible in production DevTools.

**Fix:** Replace with a structured client-side logger or strip in production build.

### F8 (LOW, MEDIUM confidence) — SSE cleanup timer runs every 60s regardless of active connections
**Cross-agent agreement:** C1-PERF-2 (1 lane)

The cleanup interval fires even with zero connections. Minor — the `unref()` call allows process exit.

**Fix:** Stop the interval when no connections exist and re-register on new connection.

### F9 (LOW, MEDIUM confidence) — Shared SSE poll timer interval is fixed at startup
**Cross-agent agreement:** C1-PERF-3 (1 lane)

The poll timer interval is read once at startup and never adjusts if the setting changes at runtime.

**Fix:** Restart the poll timer when `ssePollIntervalMs` changes.

### F10 (LOW, HIGH confidence) — No unit tests for docker build path validation and magic-byte verification
**Cross-agent agreement:** C1-TE-1, C1-TE-2, C1-TE-3 (1 lane)

Missing test coverage for the docker path validation logic and for the planned encryption/magic-byte features.

**Fix:** Add tests for `isValidImageReference()` and the dockerfile path validation logic.

---

## Carry-forward DEFERRED items (status verified at HEAD `689cf61d`)

| ID | Severity | File+line | Status | Exit criterion |
| --- | --- | --- | --- | --- |
| AGG-2 | LOW | `src/lib/security/in-memory-rate-limit.ts` | DEFERRED | Telemetry signal OR rate-limit module touched 2 more times |
| C3-AGG-5 | LOW | `deploy-docker.sh` (whole) + `deploy.sh:58-66` | DEFERRED | Modular extraction OR >1500 lines OR next SSH-helpers edit |
| C3-AGG-6 | LOW | `deploy-docker.sh:182-191` | DEFERRED | Multi-tenant deploy host added |
| C2-AGG-5 | LOW | 5 polling components | DEFERRED | Telemetry signal OR 7th instance |
| C2-AGG-6 | LOW | `src/app/(public)/practice/page.tsx:417` | DEFERRED | p99 > 1.5s OR > 5k matching problems |
| C1-AGG-3 | LOW | client `console.error` sites (24 at HEAD) | DEFERRED | Telemetry/observability cycle opens |
| DEFER-ENV-GATES | LOW | Env-blocked tests | DEFERRED | Fully provisioned CI/host |
| D1 | MEDIUM | `src/lib/auth/...` JWT clock-skew | DEFERRED | Auth-perf cycle; fix outside config.ts |
| D2 | MEDIUM | `src/lib/auth/...` JWT DB query per request | DEFERRED → NOW F5 | Auth-perf cycle; fix outside config.ts |

Note: D2 is now promoted to active finding F5 this cycle. The prior deferral exit criterion "Auth-perf cycle" has been met by this cycle's review finding.

---

## Plan-vs-implementation reconciliation

No prior cycle-1 plans exist. This is the first cycle of a new RPF loop. Prior cycle-10 plans are archived.
