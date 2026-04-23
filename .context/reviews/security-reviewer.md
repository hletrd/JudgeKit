# Security Review — RPF Cycle 14

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** 023ae5d4

## Previously Fixed Items (Verified)

- SEC-2 from cycle 13 (chat-logs-client.tsx missing res.ok check): Fixed — both `res.ok` check and `.catch()` guard added
- AGG-2 from cycle 13 (chat-logs-client.tsx unguarded res.json()): Fixed

## Findings

### SEC-1: Plaintext fallback in encryption module — `decrypt()` silently returns unencrypted values without integrity check [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:78-81`

**Description:** Carried from SEC-2 (cycle 11). The `decrypt()` function returns the input as-is if it does not start with `enc:`. This plaintext fallback exists for backward compatibility. If an attacker can modify encrypted data in the database (replacing an `enc:` prefix with arbitrary text), the `decrypt()` function will silently return the attacker's input without any integrity check. The AES-256-GCM mode does provide an auth tag for encrypted values, but the fallback path bypasses it entirely.

**Fix:** Add an integrity check or HMAC to encrypted values. At minimum, log a warning when the plaintext fallback is hit in production. Consider adding a `enc:v1:iv:ciphertext:authTag` version prefix so future encryption can deprecate the fallback.

**Confidence:** HIGH

---

### SEC-2: `problem-import-button.tsx` parses uploaded JSON without size limit [LOW/MEDIUM]

**File:** `src/app/(dashboard)/dashboard/problems/problem-import-button.tsx:22-23`

**Description:** Carried from SEC-3 (cycle 13). Line 22-23 reads the entire file content and parses it with `JSON.parse()` without any size validation. A user could upload an extremely large JSON file that causes excessive memory consumption on the client side.

**Fix:** Add a client-side file size check before parsing (e.g., reject files > 10MB).

**Confidence:** MEDIUM

---

### SEC-3: `window.location.origin` used for URL construction — carried from DEFER-24 [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:99`
- `src/components/contest/access-code-manager.tsx:134`
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:147`

**Description:** Carried from DEFER-24. These components use `window.location.origin` to construct URLs that are shared externally (invitation URLs, file download URLs, worker setup commands). Behind a misconfigured reverse proxy that doesn't set `X-Forwarded-Host`, these URLs could point to the wrong host. Invitation URLs are particularly sensitive since they are sent to external users via email.

**Fix:** Use a server-provided `appUrl` config value from the system settings instead of `window.location.origin`.

**Confidence:** MEDIUM

---

### SEC-4: `contest-join-client.tsx` does not clear access code from URL on server component level [LOW/LOW]

**File:** `src/app/(dashboard)/dashboard/contests/join/contest-join-client.tsx:21-26`

**Description:** The component correctly clears the access code from the URL via `window.history.replaceState()` on line 25. However, the `searchParams.get("code")` on line 18 is read on the first render, meaning the code briefly exists in React state. This is not a significant security risk since the state is local and the URL cleanup is prompt, but it is worth noting that the code persists in the browser's `history.replaceState` until the component unmounts.

**Fix:** No action needed — this is informational. The current implementation is adequate.

**Confidence:** LOW

---

## Final Sweep

The encryption plaintext fallback (SEC-1) remains the highest-priority security concern, carried since cycle 11. The `window.location.origin` issue (SEC-3) is carried as a deferred item. The `problem-import-button.tsx` size validation (SEC-2) is carried from cycle 13. The new finding this cycle is informational only (SEC-4). The CSRF protection, admin capability checks, and DOMPurify sanitization remain robust.
