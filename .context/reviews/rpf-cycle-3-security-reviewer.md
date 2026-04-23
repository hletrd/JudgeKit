# RPF Cycle 3 — Security Reviewer

**Date:** 2026-04-22
**Base commit:** 678f7d7d

## Findings

### SEC-1: `SubmissionListAutoRefresh` `router.refresh()` backoff is non-functional — no DDoS protection on polling [MEDIUM/HIGH]

**File:** `src/components/submission-list-auto-refresh.tsx:38-44`
**Confidence:** HIGH

Same root cause as CR-1 but from a security perspective. `router.refresh()` never throws, so the exponential backoff logic (lines 27-29) is dead code. During a server outage or overload, all 3 pages that use this component (`submissions/page.tsx`, `admin/submissions/page.tsx`, `public/submissions/page.tsx`) will keep polling at full rate with no backoff, acting as a self-inflicted DDoS.

**Fix:** Use a real `fetch()` call instead of `router.refresh()` so errors are catchable, or add a visibility-based rate limiter independent of error detection.

---

### SEC-2: `recruiting-invitations-panel.tsx` `handleCopyLink` and create-dialog clipboard calls use dynamic `import()` — potential for timing-based CSP bypass discussion [LOW/LOW]

**File:** `src/components/contest/recruiting-invitations-panel.tsx:183,208,310`
**Confidence:** LOW

The dynamic `await import("@/lib/clipboard")` calls work but add unnecessary async overhead. In a strict CSP environment, dynamic imports could be blocked. Since the component is always client-side and the clipboard utility is small, a static import is preferred.

**Fix:** Replace `const { copyToClipboard } = await import("@/lib/clipboard")` with a static `import { copyToClipboard } from "@/lib/clipboard"` at the top of the file.

---

### SEC-3: `contest-clarifications.tsx` admin answer draft and toggle-public have no CSRF token validation on the client side [MEDIUM/MEDIUM]

**File:** `src/components/contest/contest-clarifications.tsx:147-168,170-184`
**Confidence:** MEDIUM

The `handleAnswer` and `handleTogglePublic` functions send PATCH requests via `apiFetch`. The server-side routes may validate CSRF (if using `createApiHandler`), but since `contest-clarifications.tsx` is a client component that uses `apiFetch`, the CSRF header must be included. Need to verify that `apiFetch` automatically includes the CSRF header. If it does, this is a non-issue.

**Status:** Needs manual verification — check if `apiFetch` in `src/lib/api/client.ts` includes CSRF headers by default for mutation requests.

---

### SEC-4: `anti-cheat-monitor.tsx` stores events in localStorage without integrity check [LOW/LOW]

**File:** `src/components/exam/anti-cheat-monitor.tsx:28-47`
**Confidence:** LOW

Pending anti-cheat events are stored in localStorage and later flushed to the server. A determined user could modify localStorage to inject false events, suppress real events, or alter event details. Since anti-cheat data is advisory (not used for automatic disqualification), this is low risk.

**Fix:** Consider adding a simple HMAC or signed payload for stored events if integrity becomes important.

---

### SEC-5: `compiler-client.tsx` stdin textarea allows arbitrary input size — no client-side length limit [LOW/LOW]

**File:** `src/components/code/compiler-client.tsx:466-483`
**Confidence:** LOW

The stdin textarea has no `maxLength` attribute. A user could paste megabytes of stdin data, which would be sent to the `/api/v1/compiler/run` endpoint. Server-side validation should catch this, but a client-side limit provides better UX.

**Fix:** Add a reasonable `maxLength` (e.g., 1MB) to the stdin textarea, or add a client-side size check before sending.

---

## Verified Safe

- `clipboard.ts` properly sanitizes the textarea element (created/removed per operation)
- `contest-layout.tsx` navigation filter correctly blocks `javascript:` and `data:` scheme URLs
- `dangerouslySetInnerHTML` uses are protected with DOMPurify (`problem-description.tsx`) or JSON encoding (`json-ld.tsx`)
- No `as any` or `@ts-ignore` in production code
- No hardcoded secrets or API keys in client code
- `recruiting/validate/route.ts` uses constant-time comparison pattern (returns same response for all failure cases)
- Auth flow uses Argon2id with rate limiting
- API routes using `createApiHandler` have consistent auth, CSRF, and rate limiting
