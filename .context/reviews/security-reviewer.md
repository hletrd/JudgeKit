# Security Review — RPF Cycle 18

**Date:** 2026-04-22
**Reviewer:** security-reviewer
**Base commit:** d32f2517

## SEC-1: `access-code-manager.tsx` constructs invitation URL using `window.location.origin` — carried from DEFER-24 [MEDIUM/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:137`
**Confidence:** HIGH

The `handleCopyLink` function constructs an invitation URL using `window.location.origin`. If the app is accessed through a reverse proxy that rewrites the Host header, `window.location.origin` may differ from the intended public URL. This was previously identified as DEFER-24 and remains unfixed.

**Fix:** Use a server-provided public URL or a configurable base URL for invitation links.

---

## SEC-2: `recruiting-invitations-panel.tsx` uses `window.location.origin` for invitation links — same as SEC-1 [MEDIUM/MEDIUM]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:99`
**Confidence:** HIGH

Same pattern as SEC-1. The `baseUrl` variable is constructed from `window.location.origin`.

---

## SEC-3: `test-connection/route.ts` Gemini model name interpolated directly into URL path — defense-in-depth [LOW/MEDIUM]

**File:** `src/app/api/v1/plugins/chat-widget/test-connection/route.ts:127`
**Confidence:** MEDIUM

The Gemini model name is interpolated directly into the URL path: `` `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` ``. While the model name is validated against `SAFE_GEMINI_MODEL_PATTERN`, this is a defense-in-depth concern. URL path interpolation is a common SSRF vector if validation is ever relaxed.

**Fix:** Use `URL` constructor and `encodeURIComponent` for the model segment, or ensure the pattern strictly disallows `/`, `?`, `#`, and other URL metacharacters. The current `SAFE_GEMINI_MODEL_PATTERN` from the imported module already restricts to safe characters, so this is a LOW concern.

---

## SEC-4: Encryption plaintext fallback — carried from cycle 11 SEC-2 [MEDIUM/MEDIUM]

The encryption module falls back to plaintext when encryption keys are not configured. This is a known deferred item.

---

## Verified Safe

- CSRF protection is consistent across all mutation routes
- `apiFetch` adds `X-Requested-With` header on all requests
- `test-connection/route.ts` now properly validates `req.json()` with try/catch (returns 400 on malformed JSON)
- API keys are retrieved from server-side storage, not accepted from request body
- Model name validation patterns prevent path traversal
- No secrets in client-side code
- HTML sanitization uses DOMPurify with strict allowlists
- `safeJsonForScript` escapes `<!--` sequences (fixed in commit 8654e5a2)
- All clipboard operations use the shared `copyToClipboard` utility with proper error handling
