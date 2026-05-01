# Verifier Review — RPF Cycle 1 (2026-05-01)

**Reviewer:** verifier
**HEAD reviewed:** `894320ff`

---

## Evidence-based correctness checks

### Password validation vs AGENTS.md

**Claim (AGENTS.md:562-568):** "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules."

**Actual code (`src/lib/security/password.ts`):**
- Line 40: checks `password.length < FIXED_MIN_PASSWORD_LENGTH` -- matches policy
- Line 44-47: checks `COMMON_PASSWORDS.has(password.toLowerCase())` -- violates policy
- Line 50-56: checks if password matches username -- violates policy
- Line 59-67: checks if password contains email local part -- violates policy

**Verdict:** Code does NOT match the documented policy. The policy says "no other rules" but the code enforces 3 additional rules beyond minimum length.

### Rate limit timestamp consistency

**Claim:** All rate-limit timestamp comparisons use DB server time.

**Verified:** `atomicConsumeRateLimit` uses `getDbNowMs()`, `checkServerActionRateLimit` uses `getDbNowUncached()`, `realtime-coordination.ts` uses `getDbNowUncached()`, `validateAssignmentSubmission` uses `getDbNowUncached()`. Consistent.

### Encryption plaintext fallback

**Claim:** Plaintext fallback defaults to false in production.

**Verified:** `src/lib/security/encryption.ts:99-100` — `allowPlaintext = options?.allowPlaintextFallback ?? (process.env.NODE_ENV !== "production")`. Correct.

---

## Findings

### C1-VE-1: [MEDIUM] Password validation code contradicts documented policy

- **File:** `src/lib/security/password.ts`
- **Confidence:** HIGH
- **Description:** Verified by direct comparison. The code enforces 3 additional checks that the AGENTS.md policy explicitly forbids.
- **Fix:** Resolve the mismatch.

### C1-VE-2: [INFO] Carry-forward deferred items verified as still deferred

- All 17 deferred items from the cycle-5 aggregate remain accurately described in the backlog.
- No deferred items have been silently resolved or silently worsened.
