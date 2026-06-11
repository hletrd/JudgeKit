# Comprehensive security review — 2026-04-17 (current head, post-remediation pass)

## Scope
Reviewed the current repository state with emphasis on:
- authenticated API routes and transcript handling
- production deployment trust boundaries
- dependency vulnerability posture
- chat/audit logging correctness

Primary files inspected this pass included:
- `src/app/api/v1/plugins/chat-widget/chat/route.ts`
- `src/lib/plugins/chat-widget/chat-widget.tsx`
- `docker-compose.production.yml`
- `package.json` / `package-lock.json`
- `docs/api.md`
- targeted tests under `tests/unit/api/` and `tests/unit/infra/`

## Executive summary
This pass found and fixed three material security issues:
1. **Denied AI chat requests were being persisted as transcripts** before assistant-availability checks cleared.
2. **Production `docker-proxy` permissions were incomplete**, which broke the documented worker-mediated admin image-management path.
3. **`npm audit` reported two moderate dependency vulnerabilities** (`dompurify`, `hono`).

### Security posture after this pass
- `npm audit`: **0 vulnerabilities**
- Chat transcript persistence: **authoritative-only for accepted requests**
- Production worker Docker proxy contract: **aligned with admin image operations**

## Findings and dispositions

### FIXED — HIGH — Denied chat-widget requests created transcripts before authorization/feature checks completed
**Evidence**
- `src/app/api/v1/plugins/chat-widget/chat/route.ts:220-258`
- `tests/unit/api/plugins.route.test.ts:456-477`

**Problem**
The route used to persist the latest user message before confirming that the AI assistant was enabled globally/per-problem. That meant rejected requests could still create durable chat-log rows.

**Fix**
Moved user-message persistence to after assistant-availability checks. Added regression tests to ensure denied requests do **not** write transcript rows.

**Residual risk**
Low. The route still intentionally persists accepted requests, but only after they clear gating.

### FIXED — MEDIUM — Client/docs still implied `skipLog` could influence transcript persistence
**Evidence**
- `src/lib/plugins/chat-widget/chat-widget.tsx:116-164`
- `docs/api.md:1597-1613`

**Problem**
The server had already stopped trusting client-controlled logging hints, but the client payload/docs still carried `skipLog`, which was misleading and audit-hostile.

**Fix**
Removed the dead client field and updated API documentation to reflect the authoritative server-side logging model.

**Residual risk**
Low.

### FIXED — MEDIUM — Production docker-socket-proxy did not expose the image/build verbs required by the documented worker admin contract
**Evidence**
- `docker-compose.production.yml:63-76`
- `tests/unit/infra/deploy-security.test.ts`

**Problem**
The production compose file only enabled container endpoints on `docker-proxy`, while the documented worker-managed admin image lifecycle requires image/build/post/delete capabilities.

**Fix**
Enabled `IMAGES=1`, `BUILD=1`, `POST=1`, and `DELETE=1` in production to match the already-correct worker/test-backend contracts.

**Residual risk**
Moderate but understood: the worker remains the privileged Docker boundary, so this path should keep admin-only access and strong monitoring.

### FIXED — MODERATE — Vulnerable transitive dependency ranges in the Node toolchain
**Evidence**
- `package.json:78-81`
- `package-lock.json`
- `npm audit --json`

**Problem**
`npm audit` reported:
- `dompurify` advisory `GHSA-39q2-94rc-95cp`
- `hono` advisory `GHSA-458j-xx4x-4375`

**Fix**
Pinned safe overrides for both packages and refreshed the lockfile.

**Residual risk**
Low for the audited Node dependency graph at this revision.

## Verification
- `npm audit --json` ✅ `0` vulnerabilities
- `npx vitest run tests/unit/api/plugins.route.test.ts` ✅
- `npx vitest run tests/unit/infra/deploy-security.test.ts` ✅
- `npx tsc --noEmit` ✅
- `npx eslint 'src/**/*.{ts,tsx}' 'tests/**/*.{ts,tsx}'` ✅

## Remaining security-adjacent risks not remediated in this pass
These showed up during broader review/verification but were not changed here:
- Full-suite test failures around judge auth/environment bootstrapping and stale contract tests (`tests/unit/judge/auth.test.ts`, `tests/unit/api/judge-poll.route.test.ts`).
- Documentation/inventory drift in backup/export and source-grep baseline tests.
- Role/capability contract tests that still assume four built-in roles despite the assistant role now existing.

Those deserve a separate stabilization pass because they span broader contracts than this targeted remediation.
