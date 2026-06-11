# Security Reviewer — Cycle 22 (Fresh)

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### SEC-1: Chat widget plugin bypasses centralized CSRF protection via raw `fetch()` [MEDIUM/HIGH]

**Files:**
- `src/lib/plugins/chat-widget/admin-config.tsx:89-92`
- `src/lib/plugins/chat-widget/chat-widget.tsx:154`

**Description:** Two client-side `fetch()` calls in the chat widget plugin manually set `X-Requested-With: XMLHttpRequest` instead of using `apiFetch`. This means any future CSRF hardening applied to `apiFetch` (e.g., double-submit cookie tokens, custom CSRF headers) will not cover these endpoints. The cycle-21 H1 migration fixed 11 similar calls but missed these two because they are in a plugin module rather than an admin component directory.
**Concrete failure scenario:** A CSRF protection enhancement is added to `apiFetch` (e.g., a `X-CSRF-Token` header). The two chat widget calls continue to use only `X-Requested-With`, which may not satisfy the updated server-side CSRF validation, resulting in 403 errors.
**Fix:** Replace with `apiFetch()` and remove the manual header.
**Confidence:** HIGH

### SEC-2: `use-unsaved-changes-guard.ts` monkey-patches `window.history` — potential for conflicts [LOW/MEDIUM]

**File:** `src/hooks/use-unsaved-changes-guard.ts:234-269`
**Description:** The hook patches `window.history.pushState` and `window.history.replaceState`. The hook's JSDoc already warns about this pattern, but the risk is worth reiterating: if another library or Next.js internals also patch these methods, the guard will either be overwritten or will override the other patch.
**Concrete failure scenario:** A Next.js update changes how `pushState`/`replaceState` are used internally. The guard's patched version intercepts Next.js router navigations that should not be intercepted, causing spurious "unsaved changes" dialogs.
**Fix:** Already documented as fragile. Consider migrating to the Navigation API when stable.
**Confidence:** MEDIUM

## Verified Safe

- CSRF protection is consistent across all mutation routes (checked via `X-Requested-With` header requirement).
- Auth flow is robust: Argon2id hashing, timing-safe dummy hash, rate limiting, proper token invalidation.
- HTML sanitization uses DOMPurify with strict allowlists for both `dangerouslySetInnerHTML` uses.
- No `innerHTML` assignments.
- No `as any` type casts.
- All `new Date()` in API routes migrated to `getDbNowUncached()` for temporal consistency.
- Password rehashing from bcrypt to Argon2id is properly handled.
- Rate limiting is applied per-IP and per-username on login attempts.
