# Cycle 10 Verifier Review

**Date:** 2026-04-20
**Reviewer:** verifier
**Base commit:** fae77858

## Findings

### V-1: Access code `redeemAccessCode` — DB time fetched but not used for writes [MEDIUM/HIGH]

**Files:** `src/lib/assignments/access-codes.ts:130-134,170,189`
**Description:** Verification confirms that `now` (DB time) is fetched at line 134 but is only used for the deadline comparison at line 136. Lines 170 and 189 write `new Date()` instead of `now`. This is a confirmed inconsistency — the variable is in scope but not reused.
**Fix:** Replace `new Date()` with `now` on lines 170 and 189.
**Confidence:** High (verified by code inspection)

### V-2: `withUpdatedAt()` without explicit `now` in `access-codes.ts` — produces app-server-time timestamps [LOW/MEDIUM]

**Files:** `src/lib/assignments/access-codes.ts:33,69`
**Description:** `setAccessCode` and `revokeAccessCode` call `withUpdatedAt({ accessCode })` and `withUpdatedAt({ accessCode: null })` without passing `now`. This produces `updatedAt: new Date()` via the helper's default. Verified by reading `helpers.ts:20`.
**Fix:** Fetch DB time and pass it as the second argument to `withUpdatedAt()`.
**Confidence:** High (verified by code inspection)

### V-3: Prior cycle fixes confirmed working [INFO]

**Description:** Verified that the following prior fixes are still in place and correct:
- Recruit page uses `getDbNow()` (line 37 of `recruit/[token]/page.tsx`)
- `globals.css` uses CSS custom properties with `:lang(ko)` override (lines 129-137, 218-223)
- SSE events route captures `viewerId` before closure (confirmed in prior cycle)
- Community threads route uses `getDbNowUncached()` (line 40 of `threads/[id]/route.ts`)

## Verified Safe

- All prior fixes are intact and working.
- No regressions detected in the review surface.
