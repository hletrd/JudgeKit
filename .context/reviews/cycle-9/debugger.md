# Debugger — Cycle 9

**Date:** 2026-05-11
**HEAD reviewed:** `06f74d76`
**Change surface:** 0 new commits since cycle 8.

---

## Finding C9-DB-1: False-positive success states on proxy HTML responses (LOW)

**Files:** Multiple auth and upload components (see C9-CR-3, C9-CR-4)
**Confidence:** High

If an nginx reverse proxy or Cloudflare WAF returns an HTML challenge page with HTTP 200, components that check `res.ok` without verifying JSON parse success will enter their success states. This is a latent bug that only manifests with specific infrastructure misconfigurations, making it difficult to debug in production.

**Failure scenario:**
1. Admin configures WAF to return HTML verification page for all requests
2. User submits password reset form
3. Component receives HTTP 200 + HTML body
4. `res.json()` fails, returns `{ error: "unknown" }`
5. `res.ok` is true, so component shows "reset email sent" success message
6. No email was actually sent; user is misled

**Suggested fix:** Use `apiFetchJson` which returns `{ ok: false, data: fallback }` when JSON parsing fails, even if `res.ok` is true.

---

## Finding C9-DB-2: SIGINT race with second signal (LOW)

**File:** `src/lib/audit/node-shutdown.ts:48-50`
**Confidence:** Medium

If a user presses Ctrl+C twice rapidly, the second SIGINT may arrive while the first handler's `flushAuditBuffer()` promise is still pending. The first handler's `.finally()` will call `exit(130)` while the second handler is also running, creating a race. Node.js signal handling is single-threaded, but the `exit()` call is immediate and non-blocking.

**Suggested fix:** Remove forced exit from SIGINT.

---

## Final Sweep

No new latent bugs, failure modes, or regression risks identified beyond the above.
