# Verifier Review — RPF Cycle 2 (2026-05-04)

**Reviewer:** verifier
**HEAD reviewed:** `767b1fee`

---

## Evidence-based correctness checks

### Password validation vs AGENTS.md

**Claim (AGENTS.md):** "Password validation MUST only check minimum length — exactly 8 characters minimum, no other rules."

**Actual code (`src/lib/security/password.ts`):**
- Line 13: checks `password.length < FIXED_MIN_PASSWORD_LENGTH` — matches policy
- No other checks present

**Verdict:** Code MATCHES the documented policy. RESOLVED from cycle 1.

### DATA_RETENTION_LEGAL_HOLD deprecated constant

**Claim (cycle 1 aggregate):** Deprecated constant still exported alongside runtime function.

**Actual code (`src/lib/data-retention.ts:45-47`):**
- Lines 45-47: Comment documenting removal of deprecated constant
- Line 40-43: `isDataRetentionLegalHold()` function present

**Verdict:** Deprecated constant REMOVED. RESOLVED from cycle 1.

### ConditionalHeader correctness

**Claim:** Admin pages hide the top navbar.

**Actual code (`src/components/layout/conditional-header.tsx`):**
- Line 28: `pathname.startsWith("/dashboard/admin")`
- Lines 30-37: Admin branch renders minimal header with SidebarTrigger only
- Lines 40-48: Non-admin branch renders full PublicHeader

**Verdict:** Correct. Both branches include SidebarTrigger for sidebar toggle access.

### i18n externalization

**Claim:** Hardcoded strings replaced with translations.

**Actual code (`src/app/(public)/contests/[id]/page.tsx`):**
- Line 55: `tContest("metadataFallbackTitle")` — key exists in en.json and ko.json
- Lines 72-74: `tContest("keywords.programmingContest")` etc. — keys exist

**Verdict:** Correct. All hardcoded strings externalized.

### Rate limit timestamp consistency

**Claim:** All rate-limit timestamp comparisons use DB server time.

**Verified:** `atomicConsumeRateLimit` uses `getDbNowMs()`, `checkServerActionRateLimit` uses `getDbNowMs()`, `realtime-coordination.ts` uses `getDbNowUncached()`. Consistent.

---

## Findings

### C2-VE-1: [INFO] All cycle 1 resolutions verified

- Password policy-code mismatch: RESOLVED
- DATA_RETENTION_LEGAL_HOLD deprecated constant: RESOLVED
- ConditionalHeader: Correct
- i18n externalization: Correct

### C2-VE-2: [INFO] Carry-forward deferred items verified as still deferred

- All deferred items from cycle 1 aggregate remain accurately described.
- No deferred items have been silently resolved or worsened.
