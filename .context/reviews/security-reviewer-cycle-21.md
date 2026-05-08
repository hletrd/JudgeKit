# Security Review — Cycle 21

**Date:** 2026-05-09
**HEAD:** 17ae0bda
**Agent:** security-reviewer (manual)

---

## S21-1: [MEDIUM] Unvalidated plugin config cast in auto-review background job

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/lib/judge/auto-review.ts:92`
- **Category:** input_validation
- **Summary:** Same as C21-2. The auto-review background job casts `pluginState.config` without runtime validation. While the downstream `if (!apiKey) return` guard prevents the null/undefined key from being used, the cast suppresses TypeScript safety and could mask config corruption. An attacker with write access to the `plugins` table (e.g., via a compromised admin account or SQL injection in another endpoint) could inject a malformed config that causes unexpected behavior in the auto-review pipeline.
- **Exploit scenario:** Requires admin-level DB access or a schema migration bug. Not directly exploitable by unauthenticated users, but represents a defense-in-depth gap. The fix from C20-5 (`pluginConfigSchema`) should be applied here as well.
- **Fix:** Reuse or extract the `pluginConfigSchema` from `chat/route.ts` and validate before casting.

## S21-2: [LOW] test-connection route uses loose config cast

- **Severity:** LOW
- **Confidence:** MEDIUM
- **File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:45`
- **Category:** input_validation
- **Summary:** The test-connection route casts `pluginState.config as Record<string, unknown>`. This is less dangerous than the `auto-review.ts` cast because it uses a broader type, but it still bypasses runtime validation. The downstream code accesses `config.openaiApiKey` etc. and treats them as potentially undefined, so the impact is limited.
- **Fix:** Validate with the shared `pluginConfigSchema` before accessing specific fields.

---

## Deferred / No Findings

- No SQL injection vulnerabilities (all queries use Drizzle parameterized queries).
- No XSS vulnerabilities (React auto-escapes, `dangerouslySetInnerHTML` is only used with `sanitizeHtml` in `problem-description.tsx` and with escaped JSON in `json-ld.tsx`).
- No authentication bypass paths found.
- No hardcoded secrets or API keys.
- All CSP, CORS, and CSRF protections are correctly implemented.
- The backup/restore path traversal checks remain correct.
