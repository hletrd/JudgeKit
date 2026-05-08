# Security Review — Cycle 20

**Date:** 2026-05-09
**HEAD:** e9ff5e04
**Agent:** security-reviewer (manual)

---

## S20-1: [LOW] JSON parse swallowing in public recruiting endpoint

- **Severity:** LOW
- **Confidence:** HIGH
- **File:** `src/app/api/v1/recruiting/validate/route.ts:23`
- **Category:** input_validation
- **Summary:** The endpoint uses `await req.json().catch(() => null)` which silently discards JSON parse errors. While the downstream `safeParse(null)` prevents further processing, the error-swallowing pattern hides malformed request bodies from logs and makes security monitoring harder (e.g., distinguishing between a scanner sending garbage and a legitimate user with a bad token).
- **Exploit scenario:** An attacker probing the API with malformed JSON bodies receives the same `"invalidToken"` response as a legitimate user with an expired token. This makes it harder to detect and distinguish probing behavior in logs.
- **Fix:** Log JSON parse failures at `warn` level and return a distinct error code (`"invalidJson"`).

## S20-2: [LOW] Missing zod validation on chat-widget plugin config shape

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/plugins/chat-widget/chat/route.ts:196-209`
- **Category:** input_validation
- **Summary:** The plugin config is cast with `as { provider: string; openaiApiKey: string; ... }` without runtime validation. If the config object stored in the DB is corrupted or partially migrated, fields like `provider` could be undefined, causing a runtime error when `config.provider` is checked against `VALID_PROVIDERS`.
- **Exploit scenario:** Requires admin-level DB access or a schema migration bug to corrupt the config. Not directly exploitable by unauthenticated users, but represents a defense-in-depth gap.
- **Fix:** Add a zod schema to validate `pluginState.config` before use.

---

## Deferred / No Findings

- No SQL injection vulnerabilities (all queries use Drizzle parameterized queries).
- No XSS vulnerabilities (React auto-escapes, no dangerousSetInnerHTML in reviewed code).
- No authentication bypass paths found.
- No hardcoded secrets or API keys.
- All CSP, CORS, and CSRF protections are correctly implemented.
- The backup/restore path traversal checks (`storedName.includes("/") || storedName.includes("\\") || storedName.includes("..")`) are correct.
