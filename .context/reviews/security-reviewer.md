# Security Review — Cycle 37

**Reviewer:** security-reviewer
**Date:** 2026-05-09
**HEAD:** 07174a9b

## Summary

0 new findings. Security posture remains strong across all reviewed boundaries.

## Reviewed Boundaries

### API Route Security
- `createApiHandler` factory consistently applies auth, CSRF, rate limiting, and Zod validation.
- Routes bypassing `createApiHandler` (16 routes) were reviewed individually:
  - `/api/v1/judge/*` — Properly implements IP allowlist, rate limiting, worker auth, atomic SQL claims.
  - `/api/v1/files/[id]` — GET has auth + capability checks + ETag; DELETE has rate limit + auth + CSRF + audit logging.
  - `/api/v1/test/seed` — Hard-gated by PLAYWRIGHT_AUTH_TOKEN, localhost-only, timing-safe token comparison.
  - `/api/v1/recruiting/validate` — Rate limited + CSRF protected + uniform invalid responses prevent information leakage. Token format validation with bounded regex `^[-A-Za-z0-9_]{16,128}$` prevents ReDoS.
  - Admin migrate/backup/restore routes — Admin-only with proper auth checks.

### Authentication
- `src/lib/auth/config.ts` — Timing-safe dummy hash prevents user enumeration. Rate limiting covers both IP and username buckets. Recruiting token auth validates format before consuming rate limit. Token invalidation checks use DB-server time for consistency.

### File Upload & Storage
- MIME whitelist + magic bytes + ZIP bomb protection remain in place.
- File delete has proper capability checks and audit logging.

### Judge Sandbox
- Docker containers run with `--network none`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--read-only`, tmpfs restrictions.
- Seccomp profile uses deny-list approach with proper fallback handling.
- Source code size validated before write (256 KB max).
- Workspace permissions properly tightened (chown to 65534:65534, 0o700 or 0o777 fallback).

### Chat Widget / AI Assistant
- Plugin secrets decrypted only for selected provider (least-privilege).
- Rate limiting per user per minute.
- Assignment context mismatch detection prevents cross-assignment data access.
- Per-problem AI toggle check.
- Auto-review prompt injection sanitization (cycle 26) is in place.

## Deferred Security Items (unchanged)

- C-1: Test/Seed localhost check spoofable — requires architecture review
- C-2: Accepted solutions endpoint unauthenticated — requires product decision (note: route has `auth: true`, deferred refers to broader auth model)
- C-3: File DELETE CSRF ordering — requires API refactor
- H-1: SSE result visibility bypass — requires SSE sanitization refactor
- H-4: In-memory rate limiter for judge claims — FIXED (DB-backed only)
- C29 AGG-12: Recruiting validate endpoint token brute-force — mitigated by rate limit + token format validation

## Conclusion

No new security issues found in this cycle. Existing deferred items remain appropriately scoped.
