# Verifier Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Verification of prior cycle fixes

All cycle-6 fixes verified at HEAD:

| Fix | Commit | Verified at HEAD |
|-----|--------|-----------------|
| C6-1: Rate limiting on recruit results page | `8d8bff9e` | YES — `checkServerActionRateLimit` present at `results/page.tsx:66-71` |
| C6-2: Cached `getRecruitingInvitationByToken` | `8d8bff9e` | YES — `cache()` wrapper at `results/page.tsx:32` |
| C6-3: Expired-but-redeemed token re-entry | `54486ce5` | YES — `isRedeemed` check before expiry at `page.tsx:105-107` |
| C6-5: Submissions offset query | `0e6a0166` | YES — queries at requested offset, falls back to 0 |
| C6-6: sha256Hex DRY docs | `d2a85df8` | YES — comment at `export-with-files.ts:35` |

## New findings verified

### C7-VF-1: Recruit start page lacks rate limiting — CONFIRMED (HIGH)

Verified by code inspection: `src/app/(auth)/recruit/[token]/page.tsx` imports `auth`, `getRecruitingInvitationByToken`, `getDbNow`, etc. but does NOT import or call `checkServerActionRateLimit`. The results page at `results/page.tsx:7,66-71` does. This is confirmed.

### C7-VF-2: Submission detail page missing visibility check — CONFIRMED (MEDIUM)

Verified by code inspection: `src/app/(public)/submissions/[id]/page.tsx:55-76` fetches any submission by ID with `db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) })` — no visibility filter. The list page at `/submissions/page.tsx:180-182` has `guestVisibilityFilter`. The detail page does not. Confirmed.

### C7-VF-3: Brute-force counter not reset on success — CONFIRMED (MEDIUM)

Verified by tracing `redeemRecruitingToken` in `src/lib/assignments/recruiting-invitations.ts`:
- Line 487: `void incrementFailedRedeemAttempt(token)` on failed password
- Line 483-489: On successful `verifyAndRehashPassword`, no reset of `_sys.failedRedeemAttempts`
- Line 559: `void incrementFailedRedeemAttempt(token)` on weak password in initial redeem
- No code path resets the counter to 0 on success. Confirmed.

### C7-VF-4: generateMetadata shows "Expired" for expired-but-redeemed tokens — CONFIRMED (LOW)

Verified by code inspection: `src/app/(auth)/recruit/[token]/page.tsx:38-39` checks `invitation.expiresAt && invitation.expiresAt < now` without first checking `invitation.status === "redeemed"`. The page body (line 105-107) checks `isRedeemed` first. Confirmed divergence.
