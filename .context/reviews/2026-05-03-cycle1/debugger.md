# Debugger Review — Cycle 1 (2026-05-03)

**Reviewer:** debugger
**Scope:** Latent bug surface, failure modes, regressions
**HEAD:** 689cf61d

---

## Findings

### C1-DBG-1: Docker build path validation inconsistency could allow unintended builds
**File:** `src/lib/docker/client.ts:159` vs `:349`
**Severity:** MEDIUM | **Confidence:** HIGH

Same as C1-CR-2. The local path requires `docker/Dockerfile.judge-` prefix but the remote path allows `docker/Dockerfile.`. If the app is configured to use the worker (remote path), an admin could trigger a build of `Dockerfile.code-similarity` or `Dockerfile.rate-limiter-rs`, which would succeed on the worker side. While these are non-judge images, the build would consume worker resources and the logs could expose internal paths.

**Fix:** Align both paths to `docker/Dockerfile.judge-` prefix.

### C1-DBG-2: `candidateName` / `candidateEmail` stored as plaintext — data leak on DB compromise
**File:** `src/lib/assignments/recruiting-invitations.ts:57-58`
**Severity:** MEDIUM | **Confidence:** HIGH

Same as C1-CR-3 / C1-SEC-2. If the database is compromised (e.g., via SQL injection in a future feature, or a backup leak), all candidate PII is immediately readable. The encryption module exists but is not applied.

**Fix:** Apply column-level encryption.

### C1-DBG-3: JWT callback DB query on every authenticated request
**File:** `src/lib/auth/config.ts:394-407`
**Severity:** MEDIUM | **Confidence:** HIGH

Same as C1-PERF-1. The `jwt()` callback queries the database on every request to refresh user data. Under high load, this creates unnecessary DB pressure. More importantly, if the DB is slow or unreachable, every authenticated request will fail, creating a cascading failure.

**Fix:** Cache the user record in the JWT for a short TTL, or only re-query on a schedule (e.g., every 60 seconds per user).

---

## Failure Mode Analysis

- **DB outage during auth:** If the database is unreachable, `jwt()` callback fails, all authenticated requests return 500. The application has no auth-side caching fallback.
- **Encryption key rotation:** If `NODE_ENCRYPTION_KEY` is rotated, all existing `enc:`-prefixed values become unreadable. There is no key-versioning or multi-key support.
- **Worker outage during judging:** Submissions stuck in "judging" status have no automatic timeout at the app layer. The judge worker has a 10-minute container age limit, but if the worker process itself crashes, the submission stays in "judging" indefinitely until a rejudge is triggered.
