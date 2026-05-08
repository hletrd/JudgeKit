# Security Review — Cycle 1 (2026-05-03)

**Reviewer:** security-reviewer
**Scope:** OWASP Top 10, secrets, unsafe patterns, auth/authz
**HEAD:** 689cf61d

---

## Findings

### C1-SEC-1: Docker-socket-proxy allows `IMAGES=1` in production compose — enables image listing and pull
**File:** `docker-compose.production.yml:70`
**Severity:** MEDIUM | **Confidence:** HIGH

The production compose sets `IMAGES=1` for the docker-socket-proxy, which allows the app container to list and inspect Docker images through the proxy. While `POST=0` prevents creating new images via the proxy API, the `IMAGES=1` setting combined with the app's `buildDockerImageLocal()` function (which shells out to `docker build` directly, bypassing the proxy) creates an inconsistency. If the app ever routes build requests through the proxy instead of the worker, the proxy ACL would need updating.

The worker compose uses `IMAGES=${WORKER_DOCKER_PROXY_IMAGES:-0}` (opt-in), which is safer.

**Fix:** Document why `IMAGES=1` is needed in production (likely for the admin Docker images list page). Consider restricting to read-only image operations if the proxy supports granular ACLs.

### C1-SEC-2: Candidate PII not encrypted at rest (re-confirmation)
**File:** `src/lib/assignments/recruiting-invitations.ts:57-58`
**Severity:** MEDIUM | **Confidence:** HIGH

`candidateName` and `candidateEmail` are stored as plaintext in the `recruitingInvitations` table. The encryption module exists (`src/lib/security/encryption.ts`) with AES-256-GCM but is not applied here. A database backup or direct DB read exposes all candidate PII. This was flagged in the prior v2 review as structurally missing item #14.

**Fix:** Apply column-level encryption using `encrypt()`/`decrypt()` before insert and after select.

### C1-SEC-3: File upload lacks magic-byte verification for non-image types
**File:** `src/app/api/v1/files/route.ts:29-31, 71-74`
**Severity:** MEDIUM | **Confidence:** HIGH

Non-image uploads (PDF, ZIP, text) trust the browser-provided MIME type without verifying file content. An attacker could upload a malicious file disguised with a legitimate MIME type. The serving headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`) provide browser-side defense-in-depth, but the stored file itself is unverified.

**Fix:** Add magic-byte verification for PDF (`%PDF-`), ZIP (`PK` signature), and other supported types.

### C1-SEC-4: `RUNNER_AUTH_TOKEN` fallback chain in `docker/client.ts`
**File:** `src/lib/docker/client.ts:12`
**Severity:** LOW | **Confidence:** MEDIUM

```ts
const RUNNER_AUTH_TOKEN = process.env.RUNNER_AUTH_TOKEN || process.env.JUDGE_AUTH_TOKEN || "";
```

The docker client falls back from `RUNNER_AUTH_TOKEN` to `JUDGE_AUTH_TOKEN`. Meanwhile, `src/lib/compiler/execute.ts:57` does the same but also throws in production if `COMPILER_RUNNER_URL` is set without `RUNNER_AUTH_TOKEN`. The fallback to `JUDGE_AUTH_TOKEN` means a leaked judge auth token grants docker API access on the worker. While the prior commit `909fcbf5` removed the shared fallback for worker calls from the app side, the docker client still uses this chain.

**Fix:** Remove the `JUDGE_AUTH_TOKEN` fallback from `docker/client.ts` and require `RUNNER_AUTH_TOKEN` explicitly for docker operations, consistent with the security hardening in `909fcbf5`.

### C1-SEC-5: No CSRF protection on raw API route handlers
**File:** `src/app/api/v1/judge/poll/route.ts`, `src/app/api/v1/judge/register/route.ts`, `src/app/api/v1/groups/[id]/assignments/route.ts`, `src/app/api/v1/admin/backup/route.ts`, `src/app/api/v1/files/[id]/route.ts`
**Severity:** LOW | **Confidence:** MEDIUM

Several raw API handlers (not using `createApiHandler`) implement their own CSRF checks inconsistently:
- Judge routes: no CSRF (acceptable — they use Bearer token auth, not cookies)
- `groups/[id]/assignments/route.ts POST`: manually checks CSRF
- `admin/backup/route.ts`: manually checks CSRF
- `files/[id]/route.ts DELETE`: manually checks CSRF

The judge routes are safe because they use Bearer token authentication (no cookie-based session). However, the inconsistent pattern increases the risk that a new raw handler will forget CSRF. The `createApiHandler` wrapper handles this automatically.

**Fix:** Continue migrating raw handlers to `createApiHandler`. For judge-specific routes, document that CSRF is not needed because they use token auth.

### C1-SEC-6: Metrics endpoint leaks `CRON_SECRET` configuration status to anonymous callers
**File:** `src/app/api/metrics/route.ts:36-38`
**Severity:** LOW | **Confidence:** MEDIUM

When `CRON_SECRET` is not set, the metrics endpoint returns a 401 response AND logs a `console.warn` with the message "CRON_SECRET is not configured". The response body itself does not leak the env var name (good), but the server-side log is visible to anyone with access to the container logs. The `production-config.ts` startup check should prevent this in production (process exits), but the defense-in-depth log message is unnecessary in production.

**Fix:** Remove or downgrade the `console.warn` to `logger.debug()` since the startup gate already handles this. The prior review tracked a related finding about setting `CRON_SECRET` in production.

---

## Positive Security Observations

- Auth flow uses timing-safe password comparison (`DUMMY_PASSWORD_HASH` for non-existent users, `verifyAndRehashPassword` for rehashing).
- Recruiting tokens are 24-byte base64url, SHA-256 hashed before DB storage, and atomically claimed with SQL `NOW()`.
- CSRF implementation in `validateCsrf()` checks `X-Requested-With`, `Sec-Fetch-Site`, and `Origin` — triple defense.
- Image processing uses `sharp` with `failOn: "error"` and `limitInputPixels` — prevents image bombs.
- Encryption module properly uses AES-256-GCM with 96-bit IV and 128-bit auth tag.
- File serving includes `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, and `Cache-Control: private, no-store`.
- Backup route requires password re-confirmation before download.
- Production startup gate (`assertProductionConfig()`) exits if required secrets are missing.
