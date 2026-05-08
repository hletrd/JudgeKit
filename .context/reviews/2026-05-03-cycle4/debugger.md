# Debugger Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** Latent bug surface, failure modes, regressions

---

## C4-DBG-1 (HIGH, HIGH confidence) — `_sys.` metadata injection on update path enables brute-force bypass

Same root cause as C4-CR-1 / C4-SEC-1. This is a latent bug because:
1. The brute-force counter was made atomic in cycle 3 (commit `c88c53cc`)
2. The initial redeem increment was added in cycle 3 (commit `4bb4c22b`)
3. But the counter can be silently reset via `updateRecruitingInvitation(id, { metadata: { "_sys.failedRedeemAttempts": "0" } })`

**Failure mode:** Attacker with recruiter access resets the counter after each lockout, allowing unlimited password guessing. The brute-force protection becomes a speed bump rather than a hard stop.

---

## C4-DBG-2 (LOW, MEDIUM confidence) — `recruiting-token.ts` fingerprint hash will silently diverge from `tokenHash` if algorithm changes

**File:** `src/lib/auth/recruiting-token.ts:33`

If `hashToken` is ever changed (e.g., to SHA-512 or a keyed HMAC), the audit log fingerprint at line 33 will no longer match the first 8 hex characters of `tokenHash` stored in the DB. This would break the ability to correlate audit events with invitation records. The fingerprint is not used for security comparison (only logging), so this would be a debugging/audit-forensics issue rather than a live failure.

**Fix:** Use `hashToken(token).slice(0, 8)` instead of duplicating the hash logic.
