# Security Review — Cycle 4

**Date:** 2026-05-03
**HEAD reviewed:** `11d9b33a`
**Focus:** OWASP Top 10, secrets, unsafe patterns, auth/authz

---

## C4-SEC-1 (HIGH, HIGH confidence) — `updateRecruitingInvitation` allows `_sys.` namespace injection via PATCH metadata

**File:** `src/lib/assignments/recruiting-invitations.ts:258-289`

This is the security-critical side of C4-CR-1. The `_sys.` namespace was introduced in cycle 3 to prevent user-supplied metadata from colliding with internal flags. `createRecruitingInvitation` and `bulkCreateRecruitingInvitations` validate metadata keys at the library boundary, but `updateRecruitingInvitation` does not.

**Attack scenario:** An insider with `recruiting.manage_invitations` sends `PATCH /api/v1/contests/{id}/recruiting-invitations/{invId}` with body `{ metadata: { "_sys.failedRedeemAttempts": "0" } }`. This resets the brute-force counter, allowing further password guessing. Alternatively, setting `_sys.accountPasswordResetRequired: "true"` forces the next candidate login to set a new password, which the attacker knows if they control the session.

**Fix:** Same as C4-CR-1 — add `findInternalKeyViolation()` check in `updateRecruitingInvitation`.

---

## C4-SEC-2 (MEDIUM, HIGH confidence) — Recruiting start page `mailto:` link missing `rel="nofollow"`

**File:** `src/app/(auth)/recruit/[token]/page.tsx:231`

The recruit start page has a `mailto:${assignment.contactEmail}` anchor without `rel="nofollow"`. Cycle 2 (commit `42df4c66`) fixed this for the recruiter contact email. Cycle 3 (commit `286bc664`) fixed it for the privacy page. The recruit results page (line 289) was also fixed. But the recruit start page was missed.

**Fix:** Add `rel="nofollow"` to the anchor tag at line 231.

---

## C4-SEC-3 (LOW, HIGH confidence) — `sql.raw(FAILED_REDEEM_ATTEMPTS_KEY)` is safe but should be documented as intentional

**File:** `src/lib/assignments/recruiting-invitations.ts:70`

The `incrementFailedRedeemAttempt` function uses `sql.raw(FAILED_REDEEM_ATTEMPTS_KEY)` where `FAILED_REDEEM_ATTEMPTS_KEY` is a module-level constant (`_sys.failedRedeemAttempts`). This is safe because the constant is not user-controlled, but `sql.raw()` is inherently dangerous and a future refactor could inadvertently pass user input through it. The only other `sql.raw()` usage in the codebase is in `export.ts` for `SET TRANSACTION ISOLATION LEVEL`.

**Fix:** Add a comment at line 70 explaining that `sql.raw` is safe here because `FAILED_REDEEM_ATTEMPTS_KEY` is a hardcoded module constant, not user input.

---

## C4-SEC-4 (LOW, MEDIUM confidence) — Public submissions page exposes user names to unauthenticated guests

**File:** `src/app/(public)/submissions/page.tsx:196-212`

The public submission feed (visible to guests) joins `users` and returns `users.name` alongside each submission. While this appears intentional (the page shows "Student" column with names), it means any unauthenticated visitor can enumerate student names and correlate them with submission activity. This may conflict with privacy expectations in educational settings.

**Fix:** This is a design/policy question. If student names should not be public, add a `guestNameFilter` that replaces `users.name` with an obfuscated identifier for guest viewers. Low priority since the data appears to be intentionally public.
