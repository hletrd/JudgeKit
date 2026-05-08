# Security Review — Cycle 10/100

**Reviewer:** security-reviewer (orchestrator direct)
**Date:** 2026-05-08
**HEAD:** 2a6db3dd
**Scope:** Authentication, authorization, input validation, error handling, and data exposure in API routes and UI

---

## NEW FINDINGS

### C10-SR-1 — Judge routes return 500 on malformed JSON, leaking implementation details
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Files:**
  - `src/app/api/v1/judge/register/route.ts:34`
  - `src/app/api/v1/judge/claim/route.ts:65`
  - `src/app/api/v1/judge/heartbeat/route.ts:30`
  - `src/app/v1/judge/poll/route.ts:32`
- **Problem:** Malformed JSON in judge route request bodies causes an unhandled `SyntaxError` that propagates to the outer `try/catch`, returning HTTP 500 `internalServerError`. While not directly an information leak, 500 responses on client-provided bad input can expose internal error-handling gaps to attackers probing the API surface. More importantly, the lack of a 400 response means legitimate workers cannot distinguish between "bad JSON" and "server down."
- **Fix:** Add explicit JSON parse try/catch before schema validation, returning 400.

### C10-SR-2 — apiFetchJson success-path parse failure could mask compromised responses
- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/lib/api/client.ts:126-127`
- **Problem:** If a man-in-the-middle or compromised proxy replaces a JSON API response with HTML (e.g., captive portal, phishing page injection), `apiFetchJson` treats it as a successful response with fallback data. The client proceeds with empty/default data without any warning. While the app's same-origin/CSP policies mitigate this for browser clients, API-key-authenticated server-to-server callers could be affected.
- **Fix:** Distinguish JSON parse failures on 200 responses from parse failures on error responses. Return `{ok: false}` when a 200 response cannot be parsed as JSON.

---

## No Other Security Issues Found

All API routes continue to use `createApiHandler` with appropriate auth checks. CSRF protection enforced for non-API-key auth. Rate limiting applied to sensitive endpoints. No SQL injection vectors. No XSS in rendered HTML. File upload validation includes magic-byte checks and ZIP bomb protection. Judge routes enforce IP allowlisting and bearer token authentication.

**Routes verified for proper auth this cycle:**
- `/api/v1/judge/*` — IP allowlist + bearer token or per-worker secret
- `/api/v1/files/*` — capability checks + ownership checks
- `/api/v1/admin/submissions/rejudge` — submissions.rejudge capability + group scope
- `/api/v1/problems/import` — problems.create capability + zod validation
- `/api/v1/recruiting/validate` — rate limit + CSRF
