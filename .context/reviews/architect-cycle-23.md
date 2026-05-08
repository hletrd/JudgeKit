# Architect — Cycle 23

**Date:** 2026-04-24
**Scope:** Architectural and design review

---

## A-1: [MEDIUM] SSE connection tracking is process-local — breaks in multi-instance deployment

**Confidence:** HIGH
**Citations:** `src/app/api/v1/submissions/[id]/events/route.ts:26-29,246-254`

The `activeConnectionSet`, `connectionInfoMap`, and `userConnectionCounts` data structures are in-memory and process-local. When running multiple app instances (e.g., behind a load balancer), each instance tracks only its own connections. The global and per-user connection limits are enforced per-process, meaning a user could open `maxSseConnectionsPerUser` connections on each instance.

The code already has a shared coordination path via PostgreSQL (`usesSharedRealtimeCoordination`), but the fallback path (lines 246-254) has no cross-instance coordination. The `getUnsupportedRealtimeGuard` function blocks multi-instance deployments from using the SSE endpoint, but if a deployment misconfigures `APP_INSTANCE_COUNT`, the SSE limits are silently bypassed.

**Concrete failure scenario:** A production deployment runs 2 app instances with `APP_INSTANCE_COUNT=1` (misconfigured). Each instance allows 5 SSE connections per user. A single user can open 10 concurrent SSE connections (5 per instance), exceeding the intended limit.

**Fix:** The existing guard (`getUnsupportedRealtimeGuard`) already blocks the SSE route when multi-instance is detected. The risk is only from misconfiguration. Consider adding a startup warning when `APP_INSTANCE_COUNT` is not set and multiple instances are detected via other means.

---

## A-2: [LOW] Secret column redaction is fragmented across three independent config points

**Confidence:** HIGH
**Citations:** `src/lib/db/export.ts:245-258`, `src/lib/logger.ts` (REDACT_PATHS), `src/app/api/v1/admin/settings/route.ts:21-25`

Secret column redaction is defined independently in: (1) export.ts `SANITIZED_COLUMNS` / `ALWAYS_REDACT`, (2) the logger's `REDACT_PATHS`, and (3) the admin settings API's inline redaction set. The `hcaptchaSecret` omission in export was caught in cycle 19, but the same class of bug can recur whenever a new secret column is added.

**Concrete failure scenario:** A developer adds a new secret column `systemSettings.oauthClientSecret`. They update the export redaction maps but forget the logger and the admin settings API. The new secret is logged in plaintext and returned in the admin settings API response.

**Fix:** Create a single `SECRET_COLUMNS` registry (e.g., in `src/lib/security/secrets.ts`) that maps table names to secret column names. The export, logger, and settings API all read from this single source of truth.

---

## Summary

- Total findings: 2
- MEDIUM: 1 (A-1)
- LOW: 1 (A-2)
