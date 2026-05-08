# Test Engineer Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-TE-1: No test for rate limiting on recruit start page (MEDIUM, High confidence)

The recruit results page has rate limiting with no corresponding test. The recruit start page has no rate limiting and therefore no test. Given that this is a security-critical feature (brute-force token enumeration), tests should cover:
1. Rate limiting kicks in after N requests
2. Rate-limited responses return the same card as invalid tokens (no information leakage)
3. Rate limiting is applied per-IP, not globally

**Fix:** Add integration tests for the recruit start page rate limiting (once implemented). Add a test for the existing results page rate limiting.

---

### C7-TE-2: No test for submission visibility on the detail page (MEDIUM, Medium confidence)

The submission detail page at `/(public)/submissions/[id]/page.tsx` has no test verifying that non-owners cannot access private-problem submission metadata. The list page's guest filtering is tested via component tests, but the detail page's visibility rules are untested.

**Fix:** Add a component test or integration test that verifies a non-owner accessing a private-problem submission gets a 404, and that public-problem submissions are still accessible.

---

### C7-TE-3: No test for brute-force counter reset on success (LOW, High confidence)

The `_sys.failedRedeemAttempts` counter in recruiting invitations is incremented in `incrementFailedRedeemAttempt` (tested in unit tests), but there is no test verifying what should happen on successful password verification. Currently nothing happens (the counter is not reset), which is a bug — but the lack of a test means the expected behavior was never specified.

**Fix:** Add a test that verifies the counter resets to 0 after successful re-entry password verification.

---

### C7-TE-4: generateMetadata divergence from page body untested (LOW, Medium confidence)

The `isRedeemed` bypass of the expiry check in the page body (line 105) was added in cycle 6 (C6-3) but `generateMetadata` was not updated. No test checks that the metadata matches the page body for expired-but-redeemed tokens.

**Fix:** Add a test that verifies `generateMetadata` returns the "Claimed" title (not "Expired") for an expired-but-redeemed token.
