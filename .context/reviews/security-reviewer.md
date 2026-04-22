# Security Review — RPF Cycle 11

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** 42ca4c9a

## Findings

### SEC-1: Chat widget test-connection endpoint accepts `apiKey` from request body — enables SSRF via server-side fetch [HIGH/HIGH]

**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:39`

**Description:** The test-connection endpoint accepts `apiKey` and `model` from the request body and uses them to make outbound API calls to OpenAI, Anthropic, or Google. The endpoint validates the `provider` enum and uses `SAFE_GEMINI_MODEL_PATTERN` for Gemini models, but:
1. The OpenAI and Claude cases accept arbitrary `model` strings without validation.
2. The `apiKey` is taken from the request body rather than the encrypted database storage.
3. An attacker who can send a POST to this endpoint (e.g., via CSRF or with a compromised admin session) can make the server issue HTTP requests with attacker-controlled headers to arbitrary URLs.

The endpoint does have CSRF protection (line 21) and requires admin capabilities (line 28-30), which mitigates the risk significantly. However, the API key should still be retrieved from the database rather than accepted from the request body.

**Concrete failure scenario:** An admin user visits a malicious website while logged in. The site sends a CSRF POST to `/api/v1/plugins/chat-widget/test-connection` with `provider: "openai"`, `apiKey: "sk-malicious"`, and `model: "../../internal-service"`. The server makes an outbound request with the attacker-controlled key.

**Fix:** Remove `apiKey` from the request schema. Retrieve the stored encrypted API key from the database using the `provider` field. Validate `model` against a strict pattern per provider.

**Confidence:** MEDIUM

---

### SEC-2: Plaintext fallback in encryption module — `decrypt()` silently returns unencrypted values [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:79-81`

**Description:** The `decrypt()` function returns the input as-is if it does not start with `enc:`. This plaintext fallback exists for backward compatibility with data stored before encryption was enabled. However, this means that if an attacker can modify encrypted data in the database (e.g., replacing an `enc:` prefix with arbitrary text), the `decrypt()` function will silently return the attacker's input without any integrity check. This is the same finding as SEC-2 from cycle 9.

**Fix:** Add an integrity check or HMAC to encrypted values. At minimum, log a warning when the plaintext fallback is hit in production.

**Confidence:** MEDIUM

---

### SEC-3: `window.location.origin` used for URL construction in multiple components — spoofable behind misconfigured proxy [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:99`
- `src/components/contest/access-code-manager.tsx:134`
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:147`

**Description:** Carried from DEFER-24. These components use `window.location.origin` to construct URLs. Behind a misconfigured reverse proxy (Nginx not setting X-Forwarded-Host), the URL could point to the wrong host. The invitation URLs and file management URLs are particularly sensitive since they are shared with external users.

**Fix:** Use a server-provided `appUrl` config value instead of `window.location.origin`.

**Confidence:** MEDIUM

---

### SEC-4: `edit-group-dialog.tsx` default error case exposes `error.message` — potential information leak [MEDIUM/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/groups/edit-group-dialog.tsx:69`

**Description:** The `getErrorMessage` function on line 47-71 handles specific known error codes correctly (mapping them to i18n keys). However, the default case on line 69 returns `tCommon("error")` which is safe, BUT the error itself is thrown on line 92 with `throw new Error((errorBody as { error?: string }).error || "updateError")`. If the API returns an unexpected error string (e.g., `"duplicate key value violates unique constraint"`), this string is thrown as an Error. The `getErrorMessage` function does catch `SyntaxError` separately (line 66-68), but any other unexpected error string flows through to the `default` case which is safe. The current code is correctly handling this — the error string is only used for switch matching, not displayed.

**Fix:** No fix needed — the `getErrorMessage` function correctly maps unknown errors to `tCommon("error")`. However, consider adding a `console.error` for debugging unexpected error codes.

**Confidence:** LOW

---

### SEC-5: `problem-submission-form.tsx:185` displays raw API error string to user — potential information leakage [LOW/MEDIUM]

**File:** `src/components/problem/problem-submission-form.tsx:185`

**Description:** On the compiler run error path, line 185 displays the raw API error string directly to the user: `toast.error((errorBody as { error?: string }).error ?? tCommon("error"))`. If the compiler API returns an internal error message (e.g., containing file paths or system details), it would be shown to the user. The submission error path on line 248 properly uses `translateSubmissionError()` to map API errors to i18n keys.

**Fix:** Use `translateSubmissionError()` on the compiler run error path as well.

**Confidence:** HIGH

---

## Final Sweep

The cycle 9 fixes are correctly applied. The `safeJsonForScript` function properly escapes dangerous sequences. The `normalizePage` upper bound prevents DoS via large offsets. The hCaptcha verification correctly checks `response.ok` before parsing. The proxy auth cache has a 2-second TTL with FIFO eviction. CSRF protection is in place across all mutating endpoints. The main security concerns this cycle are the carried-forward SEC-1 (SSRF via chat-widget test-connection), SEC-2 (encryption plaintext fallback), SEC-3 (window.location.origin), and the new finding of raw API error display in the compiler run path.
