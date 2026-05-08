# Architect Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-ARCH-1: Inconsistent rate-limit coverage across the recruit token surface (MEDIUM, High confidence)

The recruiting token flow spans three entry points (API validate, start page, results page) but only two have rate limiting. This is an architectural gap: the security model should protect all token-lookup surfaces uniformly, since all reveal token validity.

The issue is structural: React Server Components don't have a middleware layer like API routes do (`createApiHandler` provides rate limiting), so RSCs must implement rate limiting inline. The results page does this correctly but the start page missed it.

**Fix:** Factor out a shared `withRecruitingTokenRateLimit` helper that both pages can use, similar to how `createApiHandler` wraps API routes.

---

### C7-ARCH-2: Submission visibility model has layering gap (MEDIUM, High confidence)

The submission visibility rules are enforced at the list level (`/submissions/page.tsx:180-182` filters guests to `problems.visibility = 'public'`) but not at the detail level (`/submissions/[id]/page.tsx` has no visibility check). This is a layering violation: the detail page assumes the list page is the only entry point, but submission IDs are sequential/predictable.

The API route at `/api/v1/submissions/[id]/route.ts` uses `createApiHandler` with auth and capability checks, so the API is properly gated. But the server-rendered detail page at `/(public)/submissions/[id]/page.tsx` has its own visibility logic that doesn't align with the list page.

**Fix:** Extract a shared `canViewSubmission(userId, submission)` check that both the list and detail pages use, consistent with the API layer's capability-based approach.

---

### C7-ARCH-3: Brute-force counter lifecycle incomplete (LOW, High confidence)

The `_sys.failedRedeemAttempts` metadata counter is write-only: incremented on failure but never reset on success or expired by time. Over a long recruiting campaign, candidates who make occasional typos can accumulate enough failures to get locked out, even if they successfully log in between failures.

The counter should have at least one of:
1. Reset on successful authentication (simplest)
2. Expiry window (counter resets after N minutes)
3. Admin reset capability in the dashboard

Option 1 is the most straightforward and has no UX downside.

---

### C7-ARCH-4: generateMetadata and page body have divergent visibility logic (LOW, Medium confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:23-59 vs 99-116`

The page component's `isRedeemed` check (line 105) correctly bypasses the expiry gate for redeemed tokens, but `generateMetadata` (line 38) does not apply this same check. This means the browser tab shows "Expired" while the page body shows the re-entry form.

This is a symptom of the duplicated logic between `generateMetadata` and the page component. A shared state machine or helper function would prevent such drift.

**Fix:** Extract the invitation state classification (invalid, expired, redeemed, valid, closed) into a helper function used by both `generateMetadata` and the page component.
