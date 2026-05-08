# Code Reviewer — Cycle 17

## Findings

### CR-1: [MEDIUM] `hcaptchaSecret` Not in Logger REDACT_PATHS
**File:** `src/lib/logger.ts:5-25`
**Confidence:** High

The `REDACT_PATHS` array in the logger configuration does not include `hcaptchaSecret`. While the DB column stores the encrypted value and API responses redact it via `redactSecret()`, if the system settings object is ever logged (e.g. during debugging or error logging), the encrypted ciphertext could leak into log output. The logger already redacts `encryptedKey` and other sensitive columns but misses this one.

**Failure scenario:** An admin updates hCaptcha settings and an error occurs in the server action. The full settings object is logged at error level, including the `hcaptchaSecret` encrypted ciphertext. While not plaintext, the encrypted value could be used for offline decryption attempts if the NODE_ENCRYPTION_KEY is also compromised.

**Fix:** Add `"hcaptchaSecret"` and `"body.hcaptchaSecret"` to `REDACT_PATHS` in `src/lib/logger.ts`.

---

### CR-2: [LOW] DRY Violation — Rate Limit Key Construction Pattern
**File:** `src/lib/security/rate-limit.ts:42-48`, `src/lib/security/api-rate-limit.ts`
**Confidence:** Medium

The `getRateLimitKey` function constructs keys as `${action}:${ip}` while `getUsernameRateLimitKey` constructs as `${action}:user:${username}`. This pattern is replicated across multiple files. If the key format changes, all call sites must be updated.

**Fix:** Centralize rate-limit key construction into a single module with exported factory functions.

---

### CR-3: [LOW] `truncateObject` Double Serialization in Array Path
**File:** `src/lib/audit/events.ts:66-70`
**Confidence:** High

In the array branch of `truncateObject()`, each item is serialized twice: once via `JSON.stringify(truncateObject(item, remaining - 1))` for the budget check, and then `truncateObject(item, remaining - 1)` is called again for the actual push. For complex objects, this doubles the CPU cost. The second call could use the already-serialized result.

**Fix:** Compute the truncated item once, serialize it for the budget check, and push the already-computed truncated value.

---

### CR-4: [LOW] `sanitizeMarkdown` Only Strips Control Characters — No Tag Stripping
**File:** `src/lib/security/sanitize-html.ts:85-88`
**Confidence:** High

The `sanitizeMarkdown` function only strips null bytes and control characters. It does not strip HTML tags from markdown input. This is documented as safe because react-markdown with `skipHtml` is used on the render side. However, the function is called on the server-side write path (community posts, announcements, clarifications), meaning HTML tags are persisted to the DB. If a future client renders this content without `skipHtml`, it becomes an XSS vector.

**Fix:** This is a defense-in-depth concern. Consider stripping `<script>` tags and event handler attributes from markdown input on the server side, even though the current render path is safe. Alternatively, document this explicitly as an accepted risk.

---

### CR-5: [INFO] `json-ld.tsx` Uses `dangerouslySetInnerHTML` Safely
**File:** `src/components/seo/json-ld.tsx`
**Confidence:** High

The `safeJsonForScript` function properly escapes `</script>` and `<!--` sequences before injection. This is the correct mitigation for JSON-in-script-tag XSS. No action needed.

---

### CR-6: [INFO] `problem-description.tsx` Uses Heuristic HTML Detection
**File:** `src/components/problem-description.tsx:44`
**Confidence:** Medium

The `looksLikeLegacyHtml` heuristic uses a regex to detect HTML. If a markdown description happens to start with an HTML tag (e.g., `<p>` inside a code block's text), it will be routed through `sanitizeHtml()` instead of ReactMarkdown. This is safe (sanitizeHtml is strict) but may produce unexpected rendering for edge cases. Low risk.
