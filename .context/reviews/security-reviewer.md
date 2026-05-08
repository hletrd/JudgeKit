# Security Review — Cycle 12/100

**Reviewer:** security-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** e584aeac
**Scope:** Authentication, authorization, input validation, error handling, and data exposure in API routes and UI

---

## NEW FINDINGS

### C12-SR-1 — Judge deregister route returns 500 on malformed JSON, leaking implementation details
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/app/api/v1/judge/deregister/route.ts:24`
- **Problem:** Malformed JSON in the deregister route request body causes an unhandled `SyntaxError` that propagates to the outer `try/catch`, returning HTTP 500 `internalServerError`. While not directly an information leak, 500 responses on client-provided bad input expose internal error-handling gaps to attackers probing the API surface. More importantly, the lack of a 400 response means legitimate workers cannot distinguish between "bad JSON" and "server down."
- **Fix:** Add explicit JSON parse try/catch before schema validation, returning 400.

---

## No Other Security Issues Found

All API routes continue to use `createApiHandler` with appropriate auth checks. CSRF protection enforced for non-API-key auth. Rate limiting applied to sensitive endpoints. No SQL injection vectors. No XSS in rendered HTML. File upload validation includes magic-byte checks and ZIP bomb protection. Judge routes enforce IP allowlisting and bearer token authentication.

**Routes verified for proper auth this cycle:**
- `/api/v1/judge/*` — IP allowlist + bearer token or per-worker secret (deregister now also validated)
- `/api/v1/files/*` — capability checks + ownership checks
- `/api/v1/admin/submissions/rejudge` — submissions.rejudge capability + group scope
- `/api/v1/problems/import` — problems.create capability + zod validation
- `/api/v1/recruiting/validate` — rate limit + CSRF
