# Code Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-CR-1: Recruit start page lacks rate limiting on token lookup (MEDIUM, High confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:71`

The recruit results page (`results/page.tsx`) has rate limiting on the token lookup via `checkServerActionRateLimit`, but the recruit *start* page does NOT. Both pages do a `getCachedInvitation(token)` DB lookup keyed on the same token hash. An attacker can enumerate tokens by hitting `/recruit/{guess}` at high volume without any rate limiting.

The `/api/v1/recruiting/validate/route.ts` already has rate limiting with `consumeApiRateLimit`. The start page is equally exposed to brute-force token enumeration since tokens are visible in URLs shared via email.

**Fix:** Add `checkServerActionRateLimit` to the start page, matching the pattern in `results/page.tsx`.

---

### C7-CR-2: Submissions public page does not rate-limit unauthenticated browsing (LOW, Medium confidence)

**File:** `src/app/(public)/submissions/page.tsx:109-258`

Guest users (not logged in) can browse the public submission feed at `/submissions` without any rate limiting. While the data shown is restricted (compileOutput excluded for guests, only public-problem submissions), the page runs DB queries with joins and LIKE patterns. A bot could scrape the full feed or trigger expensive LIKE queries via the `search` parameter without throttling.

**Fix:** Add `checkServerActionRateLimit` keyed on client IP for guest requests to this page.

---

### C7-CR-3: Public submission detail page leaks submission existence to any authenticated user (MEDIUM, Medium confidence)

**File:** `src/app/(public)/submissions/[id]/page.tsx:32-35,55-76`

The public submission detail page requires authentication (`if (!session?.user) redirect(...)`) and then fetches ANY submission by ID regardless of ownership or problem visibility. While the component does restrict `sourceCode` and `compileOutput` to owners (`isOwner` checks at lines 153-154, 172), the submission's existence, problem title, language, and score are revealed to any authenticated user who knows or guesses a submission ID.

The submission list page at `/submissions` restricts guests to `problems.visibility = 'public'` submissions. But the detail page has no such visibility check - any authenticated user can access any submission's metadata by ID.

**Fix:** Add a visibility check for non-owners: if the user is not the owner, verify `problems.visibility = 'public'` before rendering. Return `notFound()` for private-problem submissions viewed by non-owners.

---

### C7-CR-4: Recruiting token brute-force lockout counter not reset on successful redeem (LOW, High confidence)

**File:** `src/lib/assignments/recruiting-invitations.ts:64-80,483-489`

The `incrementFailedRedeemAttempt` function increments `_sys.failedRedeemAttempts` in the invitation metadata on each failed password attempt, and `redeemRecruitingToken` checks `failedAttempts >= MAX_FAILED_REDEEM_ATTEMPTS` (5). However, on a successful password verification (line 483), the counter is NOT reset. This means:

1. A candidate who fails 4 times then succeeds on the 5th still has a counter of 4.
2. One more failure (e.g., a typo on re-entry) would lock them out permanently.
3. There is no admin UI to reset the counter.

**Fix:** On successful re-entry password verification, reset `_sys.failedRedeemAttempts` to 0 in the invitation metadata.

---

### C7-CR-5: Dynamic import of `next/headers` in RSC is unnecessary (LOW, High confidence)

**File:** `src/app/(auth)/recruit/[token]/results/page.tsx:63-64`

```typescript
const { headers } = await import("next/headers");
const reqHeaders = await headers();
```

In a React Server Component, `next/headers` can be imported statically at the top of the file. The dynamic `await import()` adds unnecessary overhead and obscures the dependency. The parent recruit start page at `../page.tsx` imports from `next-intl/server` and `next-auth` statically.

**Fix:** Replace the dynamic import with a static `import { headers } from "next/headers"` at the top of the file.

---

### C7-CR-6: `isRedeemed` check bypasses expiry in generateMetadata but not consistently (LOW, Medium confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:32-49`

In `generateMetadata`, the `isRedeemed` bypass of the expiry check is NOT applied. Line 38 checks `invitation.expiresAt && invitation.expiresAt < now` without first checking `invitation.status === "redeemed"`. This means the metadata (page title) for an expired-but-redeemed token shows "Expired" in the browser tab, even though the page body correctly shows the re-entry form.

**Fix:** Apply the same `isRedeemed` check in `generateMetadata` before the expiry check, consistent with the page component at line 105-107.
