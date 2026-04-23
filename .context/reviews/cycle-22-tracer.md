# Tracer — Cycle 22

**Date:** 2026-04-20
**Base commit:** e80d2746

## Findings

### TR-1: Chat widget CSRF bypass trace — raw fetch in plugin code evades centralized protection [MEDIUM/HIGH]

**Causal trace:**
1. `apiFetch` in `src/lib/api/client.ts` adds `X-Requested-With: XMLHttpRequest` to all requests.
2. Server-side CSRF check in `src/lib/security/csrf.ts` requires this header on mutation requests.
3. Chat widget admin-config.tsx and chat-widget.tsx use raw `fetch()` with manually set `X-Requested-With`.
4. If `apiFetch` is updated (e.g., to add a custom CSRF token header), these two call sites would not receive the update.
5. The server-side CSRF check would then reject these requests with 403, or worse, if the check is loosened for backward compatibility, it would create a security gap.

**Competing hypothesis:** The chat widget endpoints may have different CSRF requirements. However, checking the route handlers shows they use the same CSRF middleware as all other mutation routes. The bypass is unintentional.

**Fix:** Replace raw `fetch()` with `apiFetch()` in both chat widget files.
**Confidence:** HIGH

## Verified Safe

- Exam submission flow correctly uses `getDbNowUncached()` for `submittedAt` (traced through the full submission creation path).
- Judge poll flow correctly uses `getDbNowUncached()` for `judgeClaimedAt` and `judgedAt`.
- Clipboard operations in admin components properly handle `execCommand("copy")` failures with user feedback.
