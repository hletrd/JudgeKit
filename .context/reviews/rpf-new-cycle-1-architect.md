# RPF New Cycle 1 -- Architect Review (2026-05-04)

**Reviewer:** architect
**HEAD reviewed:** `d617f2d7` (main)
**Scope:** Architectural/design risks, coupling, layering. Full codebase scan.
**Prior aggregate:** `_aggregate.md` (cycle 5 RPF, 0 new findings at HEAD `f65d0559`).

---

## Changes since prior reviewed HEAD

Zero source or test changes. Documentation-only commits.

---

## Findings

**0 HIGH, 0 MEDIUM, 0 LOW NEW.**

---

## Architecture scan results

### Module Structure
- Clean separation: `lib/` (business logic), `app/` (Next.js routes), `components/` (React UI), `types/` (shared types), `hooks/` (React hooks), `contexts/` (React contexts).
- `createApiHandler` factory provides consistent middleware (auth, CSRF, rate limiting, validation, error handling) across all API routes.
- Security modules properly isolated: `lib/security/` (rate-limit, CSRF, IP, timing, encryption, password), `lib/auth/` (session, sign-out, recruiting tokens).

### Layering
- API routes delegate to lib functions for business logic. No direct DB access from components.
- Proxy middleware handles auth, CSP, locale, security headers before route handlers.
- Docker operations abstracted through `lib/docker/client.ts` with local/remote fallback.

### Coupling
- Rate limit modules (`rate-limit.ts` and `api-rate-limit.ts`) share the same DB table but have documented drift tracking (C7-AGG-9). Consolidation deferred with exit criterion.
- Auth config (`config.ts`) is self-contained with all field mappings centralized in `mapUserToAuthFields`.

### Deferred architectural items (carried forward)
- ARCH-CARRY-1: 20 raw API handlers (MEDIUM, deferred for API-handler refactor cycle)
- ARCH-CARRY-2: SSE coordination (LOW, deferred for SSE perf cycle)
- C3-AGG-5: deploy-docker.sh size (LOW, deferred at >1500 lines)

## Cross-agent agreement

Consistent with all prior RPF cycle reviews: zero new findings.
