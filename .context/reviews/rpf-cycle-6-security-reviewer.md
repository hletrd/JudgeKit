# Security Reviewer — RPF Cycle 6

## Scope
Security-focused review of recently changed files and carry-forward findings.

## Findings

### SEC-1: `recruiting-invitations-panel.tsx` — Missing catch block in `handleCreate` (CR-2 mirrors)
- **Severity:** MEDIUM
- **Confidence:** HIGH
- **File:** `src/components/contest/recruiting-invitations-panel.tsx:150-213`
- **Problem:** Unhandled exception on network error means no user feedback. While not a direct security vulnerability, it violates the "never silently swallow errors" convention in `apiFetch` JSDoc. A user might think the invitation was created when it wasn't.

### SEC-2: `window.location.origin` used in share URLs (DEFER-24 carry)
- **Severity:** LOW
- **Confidence:** MEDIUM
- **Files:** `access-code-manager.tsx:134`, `recruiting-invitations-panel.tsx:97`, `workers-client.tsx:147`, `file-management-client.tsx:96`
- **Problem:** These use `window.location.origin` to construct URLs that are shared with end users or displayed as copyable content. If the app is accessed through a non-canonical hostname (e.g., internal IP, wrong domain), the shared URL will point to the wrong origin. This is not an XSS risk but an operational/UX risk.
- **Status:** Deferred (DEFER-24). No fix yet.

### SEC-3: `anti-cheat-monitor.tsx` — localStorage reads lack try/catch on `getItem`
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/components/exam/anti-cheat-monitor.tsx:36`
- **Problem:** `localStorage.getItem` can throw in some browser configurations (e.g., disabled storage, Safari private browsing with strict settings). The outer `loadPendingEvents` function has a top-level try/catch, so this is actually handled. No action needed — confirmed safe on closer inspection.

### SEC-4: `sanitizeHtml` allows `<a href>` with relative URLs
- **Severity:** LOW
- **Confidence:** LOW
- **File:** `src/lib/security/sanitize-html.ts:72`
- **Problem:** `ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/(?!\/))/i` permits root-relative URLs like `/admin/secret`. This allows internal link navigation but could potentially be used to link to sensitive internal pages. However, since problem descriptions are authored by trusted admins, this is by design. No action needed.

### SEC-5: Carried from cycle 5 — Group assignment export now uses `createApiHandler` with rate limiting
- **Status:** CONFIRMED FIXED
- **Evidence:** `src/app/api/v1/groups/[id]/assignments/[assignmentId]/export/route.ts:16` now uses `createApiHandler({ rateLimit: "export" })` with `MAX_EXPORT_ROWS = 10_000`.

### SEC-6: Carried from cycle 28 — localStorage crashes in private browsing
- **Status:** CONFIRMED FIXED
- **Evidence:** `compiler-client.tsx:188` and `submission-detail-client.tsx:94` both wrap `localStorage.setItem` in try/catch.
