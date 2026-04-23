# Security Review — RPF Cycle 15

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** 6c07a08d

## Previously Fixed Items (Verified)

All cycle 14 security findings remain addressed:
- SEC-2 (problem-import-button file size validation): Fixed — 10MB limit added

## Findings

### SEC-1: Plaintext fallback in encryption module — `decrypt()` silently returns unencrypted values without integrity check [MEDIUM/HIGH]

**File:** `src/lib/security/encryption.ts:78-81`

**Description:** Carried from SEC-2 (cycle 11). The `decrypt()` function returns the input as-is if it does not start with `enc:`. This plaintext fallback exists for backward compatibility. If an attacker can modify encrypted data in the database (replacing an `enc:` prefix with arbitrary text), the `decrypt()` function will silently return the attacker's input without any integrity check. The AES-256-GCM mode does provide an auth tag for encrypted values, but the fallback path bypasses it entirely.

**Fix:** Add an integrity check or HMAC to encrypted values. At minimum, log a warning when the plaintext fallback is hit in production. Consider adding a `enc:v1:iv:ciphertext:authTag` version prefix so future encryption can deprecate the fallback.

**Confidence:** HIGH

---

### SEC-2: `window.location.origin` for URL construction — carried from SEC-3 (cycle 14) [MEDIUM/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:99`
- `src/components/contest/access-code-manager.tsx:134`
- `src/app/(dashboard)/dashboard/admin/files/file-management-client.tsx:96`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:148`

**Description:** Carried from DEFER-24. These components use `window.location.origin` to construct URLs that are shared externally (invitation URLs, file download URLs, worker setup commands). Behind a misconfigured reverse proxy that doesn't set `X-Forwarded-Host`, these URLs could point to the wrong host. Invitation URLs are particularly sensitive since they are sent to external users via email.

**Fix:** Use a server-provided `appUrl` config value from the system settings instead of `window.location.origin`.

**Confidence:** MEDIUM

---

### SEC-3: Unguarded `res.json()` on success paths could mask response tampering [LOW/MEDIUM]

**Files:**
- `src/components/contest/recruiting-invitations-panel.tsx:137,152`
- `src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx:235,241`

**Description:** Carried from the code-reviewer CR-1 finding. The 4 remaining unguarded `res.json()` calls on success paths (after `res.ok` check) could throw SyntaxError if a proxy returns a modified non-JSON 200 response. While this is primarily a robustness issue, it could also mask response tampering — a MITM proxy could inject a non-JSON 200 body, and the resulting SyntaxError would be caught silently, potentially hiding the attack.

**Fix:** Add `.catch()` guards or use `apiFetchJson` for consistent handling.

**Confidence:** LOW

---

## Final Sweep

The encryption plaintext fallback (SEC-1) remains the highest-priority security concern, carried since cycle 11. The `window.location.origin` issue (SEC-2) is carried as a deferred item. The 4 remaining unguarded `.json()` calls are a minor security concern. No new high-severity security findings this cycle. CSRF protection, admin capability checks, and DOMPurify sanitization remain robust.
