# Architect Review — Cycle 1 (2026-05-03)

**Reviewer:** architect
**Scope:** Architectural/design risks, coupling, layering
**HEAD:** 689cf61d

---

## Findings

### C1-ARCH-1: 24 raw API handlers remain outside `createApiHandler` — inconsistent middleware coverage
**Files:** Various under `src/app/api/`
**Severity:** LOW | **Confidence:** HIGH

218 of 104 API routes use `createApiHandler`. The 24 raw handlers bypass the centralized middleware (auth, CSRF, rate limiting, body validation, error handling). While most raw handlers implement their own checks, the pattern increases the risk of missed middleware in new handlers.

Breakdown of raw handlers:
- Judge routes (5): acceptable — they use Bearer token auth, not cookie-based sessions
- SSE streaming route (1): acceptable — SSE cannot use the standard response wrapper
- Admin backup/restore/migrate routes (5): manually implement auth + CSRF
- Groups/assignments routes (2): manually implement auth + CSRF
- Files routes (2): manually implement auth + CSRF
- Health/metrics/time routes (4): no auth needed (health/time) or cron-auth (metrics)
- Internal cleanup (1): cron-auth
- Test seed (1): gated by env var + localhost + Bearer token
- Recruiting validate (1): rate-limited, no auth needed

**Fix:** Continue migrating admin/group/file routes to `createApiHandler`. Judge routes and SSE can remain raw with documented justification.

### C1-ARCH-2: Dual token fallback in docker client violates single-responsibility for auth
**File:** `src/lib/docker/client.ts:12`
**Severity:** MEDIUM | **Confidence:** HIGH

Same as C1-SEC-4 / C1-CRIT-2. The `RUNNER_AUTH_TOKEN || JUDGE_AUTH_TOKEN` fallback means the docker client module depends on the judge auth token, coupling two distinct authorization domains. If `JUDGE_AUTH_TOKEN` is rotated, the docker client may silently fail or succeed with stale credentials.

**Fix:** Remove the `JUDGE_AUTH_TOKEN` fallback. Require `RUNNER_AUTH_TOKEN` for docker operations.

---

## Positive Architectural Observations

- The capability-based RBAC system (`resolveCapabilities`, `AUTH_PREFERENCE_FIELDS`) is well-designed — new capabilities and preference fields are added in one place and propagate through the auth flow automatically.
- The `createApiHandler` factory pattern provides consistent middleware with good defaults.
- The recruiting flow is properly isolated from the main platform via `getRecruitingAccessContext` and the platform mode system.
- The encryption module's `enc:` prefix convention makes it easy to detect unencrypted values in the database.
