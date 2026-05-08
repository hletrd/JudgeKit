# Security Review — Cycle 19/100

**Reviewer:** security-reviewer (manual)
**Date:** 2026-05-08
**HEAD:** 18b479ac
**Scope:** OWASP Top 10, auth/authz, input validation, secrets exposure

---

## NEW FINDINGS

### C19-SR-1: [LOW] ContestReplay NaN speed could cause client-side DoS via rapid timer loop

**Severity:** LOW
**Confidence:** MEDIUM
**File:** `src/components/contest/contest-replay.tsx:214`

**Problem:** The playback speed Select uses an unchecked `parseInt(v, 10) as (typeof PLAYBACK_SPEEDS)[number]`. If an attacker manipulates the DOM or injects an invalid value into the Select component, `speed` can become `NaN`. The playback timer uses `1400 / speed` (line 99), which becomes `NaN`. `setTimeout(callback, NaN)` fires immediately, and the callback unconditionally reschedules itself, causing a tight loop of `setCurrentIndex` updates that freeze the UI thread.

**Impact:** Client-side denial of service (browser tab freeze). No server impact, no data exfiltration.

**Fix:** Validate parsed speed against the allowed set before applying:
```tsx
const parsed = parseInt(v, 10);
if (PLAYBACK_SPEEDS.includes(parsed)) {
  setSpeed(parsed);
}
```

---

## No Other Confirmed Issues

- All API routes use `createApiHandler` or implement equivalent auth/CSRF/rate-limit checks.
- Judge worker routes (`/api/v1/judge/*`) correctly use IP allowlist + token auth.
- Backup/restore routes require capability check (`system.backup`) + password re-verification.
- File access route implements proper capability-based authorization.
- SQL queries use parameterized inputs via Drizzle ORM; no raw user input concatenation found.
- No secrets or credentials exposed in client-side code.
- CSP headers properly configured with nonce-based script-src.
