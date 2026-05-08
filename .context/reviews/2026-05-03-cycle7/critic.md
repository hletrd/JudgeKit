# Critic Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Findings

### C7-CT-1: Inconsistent rate limiting across recruit flow (MEDIUM, High confidence)

The recruiting flow has three token-lookup endpoints with inconsistent rate-limiting coverage:
1. `/api/v1/recruiting/validate` — rate limited (consumeApiRateLimit)
2. `/recruit/{token}/results` — rate limited (checkServerActionRateLimit)
3. `/recruit/{token}` (start page) — NOT rate limited

All three reveal token validity through their responses (different cards, different API responses). The start page is arguably the most sensitive because it reveals the most information (assignment title, organization name, contact email, problem count, language list) for valid tokens.

This inconsistency is the most impactful finding this cycle. It directly undermines the brute-force protection added in cycle 2 (C2-AGG-1) and the per-invitation lockout added in cycle 3 (C3-CRIT-3).

---

### C7-CT-2: generateMetadata leaks token status before rate-limit check (MEDIUM, Medium confidence)

**File:** `src/app/(auth)/recruit/[token]/page.tsx:23-59`

`generateMetadata` runs before the page component's rate-limit check (which doesn't exist yet on the start page). Even after adding rate limiting to the page component, `generateMetadata` will still reveal token status through the page title, OG metadata, and Twitter card. Rate limiting in the page body doesn't protect metadata that was already computed.

**Fix:** In `generateMetadata`, return a generic title for all states that could indicate token existence (invalid, expired, revoked). Only differentiate in the page body after rate-limit checks pass.

---

### C7-CT-3: Submission detail page is not consistent with list page visibility rules (MEDIUM, High confidence)

The submissions list at `/submissions` properly restricts guests to public-problem submissions. But the detail page at `/submissions/[id]` has no visibility check — any authenticated user can view any submission's metadata. This creates a security gap that defeats the purpose of the list page's filtering.

See C7-SR-2 for full details.

---

### C7-CT-4: Brute-force counter not reset on success — operational risk (MEDIUM, High confidence)

The `_sys.failedRedeemAttempts` counter in recruiting invitation metadata is incremented on failure but never reset on success. This creates a ticking time bomb: any candidate who accumulates 5 total failures across multiple sessions (even with successful logins in between) gets permanently locked out with no admin recovery path.

This is especially problematic for recruiting scenarios where candidates may:
- Try the wrong password from a phone, succeed from desktop
- Have a password manager that auto-fills an old password
- Accidentally trigger a failure after a previous typo

See C7-CR-4 / C7-SR-3 for details.

---

### C7-CT-5: Deferred items from prior cycles remain relevant (INFO)

The following deferred items from cycle 6 are still valid and should be carried forward:
- F3 (MEDIUM): Candidate PII encryption at rest
- F5 (MEDIUM): JWT callback DB query optimization
- F8 (LOW): API route rate limiting — now partially addressed by C7-CT-1
- 24 pre-existing test failures — investigation needed
