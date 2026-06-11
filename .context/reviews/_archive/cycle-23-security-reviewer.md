# Cycle 23 Security Reviewer

**Date:** 2026-04-20
**Base commit:** bb6f3fc2

## Findings

### SEC-1: `countdown-timer.tsx` raw `fetch()` bypasses centralized CSRF wrapper [MEDIUM/HIGH]

**Files:** `src/components/exam/countdown-timer.tsx:76`
**Description:** This is the last remaining client-side raw `fetch()` call in a `.tsx` file. While the target endpoint (`/api/v1/time`) is GET-only and thus not subject to CSRF validation, the centralized `apiFetch` wrapper exists specifically so that all client-side fetch calls go through a single choke point. If `apiFetch` is ever enhanced with additional security measures (e.g., CSP nonce headers, request signing, CSRF tokens), this call site will be missed.
**Concrete failure scenario:** A future security hardening adds a request-signing mechanism to `apiFetch`. The timer endpoint is not signed, and a MITM attacker could inject a malicious time offset to affect exam timer behavior.
**Fix:** Replace `fetch("/api/v1/time", ...)` with `apiFetch("/api/v1/time", ...)`.
**Confidence:** HIGH

### SEC-2: `anti-cheat-monitor.tsx` localStorage persistence is client-controlled and tamperable [LOW/LOW]

**Files:** `src/components/exam/anti-cheat-monitor.tsx:27-46`
**Description:** Pending anti-cheat events are stored in `localStorage` with the key `judgekit_anticheat_pending_{assignmentId}`. A technically skilled student can inspect and delete or modify this data via browser DevTools before it is flushed to the server. There is no integrity check (e.g., HMAC) on the stored data.
**Concrete failure scenario:** A student triggers a `tab_switch` event. The event is queued in localStorage. Before the flush succeeds, the student opens DevTools, clears the `judgekit_anticheat_pending_*` key, and the event is never reported.
**Fix:** Known limitation of client-side anti-cheat. Adding an HMAC would require a server-provided secret. The real mitigation is server-side detection. Document the limitation; no code change needed.
**Confidence:** LOW

## Verified Safe

- CSRF validation correctly checks `X-Requested-With`, `Sec-Fetch-Site`, and `Origin` headers.
- Auth flow uses Argon2id with timing-safe dummy hash for user enumeration prevention.
- HTML sanitization uses DOMPurify with strict allowlists, URI regexp blocking, and auto-rel=noopener.
- JSON-LD embedding uses `safeJsonForScript` to prevent `</script>` breakout.
- All SQL uses parameterized queries via Drizzle ORM's tagged template literals.
- Rate limiting is applied on login attempts (IP + username).
- Session tokens use `httpOnly`, `sameSite=lax`, and conditional `secure` cookies.
- Password rehashing from bcrypt to Argon2id is transparent and awaited.
