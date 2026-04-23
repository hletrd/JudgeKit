# RPF Cycle 4 — Security Reviewer

**Date:** 2026-04-22
**Base commit:** 5d89806d

## Findings

### SEC-1: `invite-participants.tsx` `res.json()` without `.catch()` on error path — potential unhandled SyntaxError [MEDIUM/MEDIUM]

**File:** `src/components/contest/invite-participants.tsx:78`
**Confidence:** HIGH

Same root cause as CR-1. When the server returns a non-JSON error body (e.g., 502 HTML from reverse proxy), `await res.json()` throws a SyntaxError. While this is caught by the outer `catch`, the user sees a generic `t("inviteFailed")` message instead of a specific error. This is the same class of issue fixed in cycle 3 for other components.

**Fix:** Add `.catch(() => ({}))` after `res.json()` on line 78.

---

### SEC-2: `access-code-manager.tsx` uses dynamic `import("@/lib/clipboard")` — CSP risk [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:61`
**Confidence:** MEDIUM (same as SEC-2 from cycle 3 for `recruiting-invitations-panel.tsx`, now fixed there but not here)

The `copyValue` function uses `await import("@/lib/clipboard")` (dynamic import). This was fixed in `recruiting-invitations-panel.tsx` by converting to a static import but the same pattern persists in `access-code-manager.tsx`. In a strict CSP environment, dynamic imports could be blocked.

**Fix:** Replace dynamic import with static `import { copyToClipboard } from "@/lib/clipboard"` at the top of the file.

---

### SEC-3: CSRF validation confirmed working for all mutation endpoints [VERIFIED]

**File:** `src/lib/security/csrf.ts`

Verified that `validateCsrf` checks `X-Requested-With: XMLHttpRequest` header, validates `sec-fetch-site`, and checks `origin` against the configured `AUTH_URL`. All API routes using `createApiHandler` get CSRF validation automatically. The SSE events route is the only raw route handler, and it uses `getApiUser` for authentication (GET only, no state changes).

The `apiFetch` client helper (line 37-39) automatically sets `X-Requested-With: XMLHttpRequest` on all requests. The `contest-clarifications.tsx` PATCH requests (flagged in cycle 3 SEC-3) are properly protected because `apiFetch` includes the CSRF header.

---

### SEC-4: `anti-cheat-monitor.tsx` event listeners re-registration gap — brief monitoring blind spot [LOW/MEDIUM]

**File:** `src/components/exam/anti-cheat-monitor.tsx:162-242`
**Confidence:** MEDIUM

When `reportEvent` or `flushPendingEvents` callbacks are recreated (e.g., on first failed event), the `useEffect` cleanup removes all 6 event listeners and then re-adds them. During this brief gap, anti-cheat events (tab switches, copy/paste) could be missed. In an exam context, missing a tab-switch event is a meaningful gap.

**Fix:** Use the ref-based callback pattern (like `useVisibilityPolling`) so event listeners are only registered once.

---

### SEC-5: `window.location.origin` used in `access-code-manager.tsx` — URL spoofing risk [LOW/MEDIUM]

**File:** `src/components/contest/access-code-manager.tsx:130`
**Confidence:** LOW (same class as DEFER-3 from cycle 3)

Uses `window.location.origin` to construct invitation URLs. This is the same class of issue as DEFER-3 and DEFER-24 from prior cycles — requires server-side `appUrl` config. Low risk in current deployment since users don't control the origin.

**Status:** Deferred per existing DEFER-3/DEFER-24.

---

## Verified Safe

- CSRF protection is working correctly via `apiFetch` + `validateCsrf`
- `dangerouslySetInnerHTML` uses are protected with DOMPurify or `safeJsonForScript`
- No hardcoded secrets or API keys in client code
- SSE events route properly excludes `sourceCode` from query results
- Anti-cheat event validation uses `z.enum(CLIENT_EVENT_TYPES)` on the server side
- Rate limiting is applied to anti-cheat and submission endpoints
- Auth checks on SSE connections include periodic re-authentication (every 30s)
