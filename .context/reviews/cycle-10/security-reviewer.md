# Security Reviewer — Cycle 10

**Date:** 2026-05-11
**HEAD reviewed:** `32554762`
**Change surface:** Cycle 9 fixes + plan archival.
**Files examined:** All modified auth forms, node-shutdown, countdown-timer, plus sweep of auth API routes and security-critical paths.

---

## Findings

### C10-SR-1: JSON parse validation in auth forms closes false-positive success vector (VERIFIED FIX)

**Confidence:** High
**Files:**
- `src/app/(auth)/verify-email/page.tsx`
- `src/app/(auth)/forgot-password/forgot-password-form.tsx`
- `src/app/(auth)/reset-password/reset-password-form.tsx`

**Description:** Before cycle 9, these components used `.catch(() => ({ error: "unknown" }))` and branched on `res.ok` alone. If a WAF or reverse proxy returned HTTP 200 with HTML (e.g., a CAPTCHA challenge page), the component would enter the success path with fallback data, showing a false-positive success message to the user.

The cycle 9 fix adds an explicit `parseOk` check. Now the component only enters the success path when both `res.ok` AND `parseOk` are true. This is a correct security improvement.

**Verification:** All three auth forms use the same safe pattern. The `create-problem-form.tsx` also uses this pattern for image upload responses.

---

### C10-SR-2: No new auth/authz issues in modified code (VERIFIED)

**Confidence:** High

**Description:** The modified files do not introduce new authorization boundaries, do not change session handling, and do not affect API route handlers. The changes are purely client-side error-handling improvements.

**Sweep performed:**
- Checked API routes for auth bypass: No modified routes in this cycle
- Checked for secret leakage in modified files: None
- Checked for XSS vectors in modified components: No new user-content rendering paths
- Checked CSRF handling: `apiFetch` wrapper still adds `X-Requested-With` header

---

## Deferred Security Items (unchanged)

All deferred security items from previous cycles remain in their deferred state:
- DEFER-1: SSE unbounded `inArray` query (MEDIUM)
- DEFER-2: `stopSharedPollTimer` race (LOW)
- DEFER-4: `sanitizeHtml` allows `mailto:` (LOW)
- DEFER-6: Anti-cheat heartbeat gap detection loads 5000 rows (LOW)
- DEFER-11: `submissionSubscribers` Map leak (LOW)

No new security findings identified in the current change surface.
