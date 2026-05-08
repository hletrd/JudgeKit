# Security Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-SR-1: Recruit start page missing rate limiting — token enumeration risk (HIGH, High confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:71`

The recruit *start* page performs a DB lookup of the invitation by token hash (`getCachedInvitation(token)`) without any rate limiting. The recruit *results* page at `results/page.tsx:66-71` already has rate limiting via `checkServerActionRateLimit`. The API endpoint at `/api/v1/recruiting/validate/route.ts:10` has `consumeApiRateLimit`. But the start page, which reveals whether a token is valid (different cards for invalid, expired, redeemed, and valid tokens), is completely unthrottled.

An attacker can brute-force 24-byte base64url tokens by trying different values at `/recruit/{token}` and observing the different response cards. Even though the token space is large (2^192), the lack of rate limiting enables:
- Confirmation that a specific token exists (distinct "invalid" vs "expired" responses)
- Timing-based differentiation (DB query vs cache hit)

**Fix:** Add `checkServerActionRateLimit` with client IP as key, matching the results page pattern. Return the "invalidToken" card on rate limit (same as invalid lookup).

---

### C7-SR-2: Public submission detail page missing visibility check (MEDIUM, High confidence)

**File:** `src/app/(public)/submissions/[id]/page.tsx:55-76`

Any authenticated user can access any submission by ID, including submissions for private problems (contest/exam submissions). While the source code and compile output are hidden from non-owners (lines 153-154, 172), the page reveals:
- Submission existence (no 404 for private-problem submissions)
- Problem title and ID
- Language
- Score
- Status (accepted, wrong_answer, etc.)
- Execution time and memory

This is an information disclosure vector for exam/contest integrity. A student could enumerate submission IDs to discover exam problems and results.

The list page at `/submissions/page.tsx:180-182` properly filters guests to `problems.visibility = 'public'`, but the detail page has no equivalent guard for non-owners.

**Fix:** For non-owners, add a visibility check: if `problem.visibility !== 'public'`, return `notFound()`. This aligns the detail page with the list page's guest filtering.

---

### C7-SR-3: Recruiting brute-force lockout counter not reset on success (MEDIUM, High confidence)

**File:** `src/lib/assignments/recruiting-invitations.ts:483-489`

See C7-CR-4. The `_sys.failedRedeemAttempts` counter accumulates but is never reset on successful authentication. A candidate who fails 4 times, succeeds, then fails once more (e.g., on re-entry from a different device) is permanently locked out with no admin recovery path. This is a denial-of-service risk against legitimate candidates.

**Fix:** Reset `_sys.failedRedeemAttempts` to 0 on successful password verification in the re-entry path.

---

### C7-SR-4: `generateMetadata` reveals token status via title differentiation (LOW, Medium confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:38-39`

In `generateMetadata`, the expiry check (line 38) produces the title "Expired" for expired tokens. This reveals token status to anyone who can see the browser tab title or Open Graph metadata, even before they interact with the page. Combined with C7-SR-1 (no rate limiting), an attacker can enumerate tokens and distinguish valid/expired/invalid from the metadata alone.

**Fix:** For unauthenticated or rate-limited requests, return a generic title that doesn't differentiate between invalid, expired, and revoked states. Only reveal specific status (claimed, valid) to the page render after rate-limit checks.

---

### C7-SR-5: Dynamic import of `next/headers` in RSC hides dependency (LOW, Low confidence)

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:63-64`

The dynamic `await import("next/headers")` obscures the module dependency. While this is not a security vulnerability per se, it makes code review harder and could lead to the import being overlooked during security audits.

**Fix:** Use static import.
