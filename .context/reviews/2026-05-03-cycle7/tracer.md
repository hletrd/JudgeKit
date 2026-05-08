# Tracer Review — Cycle 7

**Date:** 2026-05-03
**HEAD reviewed:** `d2a85df8`

## Causal Traces

### Trace 1: Recruiting token enumeration via start page

**Flow:** Attacker -> `/recruit/{token}` -> `getCachedInvitation(token)` -> DB lookup -> Response card

1. Attacker sends GET `/recruit/{guess}` at high volume
2. Server runs `getCachedInvitation(guess)` which queries `recruitingInvitations` by `tokenHash = hashToken(guess)`
3. If no match: returns "Invalid Token" card (lines 78-86)
4. If match + expired: returns "Expired" card (lines 108-116)
5. If match + revoked: returns "Invalid Token" card (lines 88-97, same as no match)
6. If match + redeemed: returns re-entry form (lines 157-186)
7. If match + valid: returns full start form (lines 215-321)

No rate limiting is applied at any point in this flow. The attacker can distinguish invalid/expired/redeemed/valid tokens by the different response cards.

**Contrast with results page:** `/recruit/{token}/results` has `checkServerActionRateLimit` at lines 66-71, which returns the same "invalidToken" card for rate-limited requests. The start page has no such protection.

**Hypothesis:** The start page was overlooked when rate limiting was added to the results page in cycle 6 (C6-1). The results page was the higher-priority fix because it was the one flagged in the review, but the start page has the same vulnerability.

---

### Trace 2: Submission metadata leakage via detail page

**Flow:** Authenticated user -> `/submissions/{id}` -> DB lookup -> Render

1. User authenticates successfully
2. User navigates to `/submissions/{guessed-id}`
3. Page requires auth (line 35: `if (!session?.user) redirect("/login")`)
4. Page fetches submission by ID (line 55-72): `db.query.submissions.findFirst({ where: eq(submissions.id, submissionId) })`
5. No visibility check on the problem: any submission ID that exists will be rendered
6. Non-owners see: language, score, status, execution time, memory, problem title (lines 148-172)
7. Non-owners don't see: source code, compile output, test case details (controlled by `isOwner` checks)

**Contrast with list page:** `/submissions` applies `guestVisibilityFilter` at line 180-182: `eq(problems.visibility, 'public')`. But this filter only applies to the list; the detail page has no equivalent.

**Hypothesis:** The detail page was built with the assumption that submission IDs are not guessable (they use nanoid), but the API also returns submission IDs in list responses, and the IDs are sequential enough that enumeration is feasible.

---

### Trace 3: Brute-force counter accumulation

**Flow:** Candidate -> `/recruit/{token}` -> `redeemRecruitingToken` -> counter increment

1. Candidate fails password attempt (line 487): `void incrementFailedRedeemAttempt(token)` — counter += 1
2. Candidate succeeds on next attempt (line 483): `verifyAndRehashPassword` returns `{ valid: true }` — no counter reset
3. Counter value persists in metadata as `_sys.failedRedeemAttempts`
4. Over multiple sessions, the counter only increases, never decreases
5. At `failedAttempts >= 5` (line 429): returns "tokenLocked" with no recovery path

The counter is also incremented on initial redeem failures (line 559) and on the already-redeemed error path (line 635). All three increment paths have no corresponding decrement/reset on success.

**Competing hypotheses:**
- H1 (intentional): The counter was designed to be cumulative to detect sustained attacks. (Unlikely — there's no admin UI to review or reset it.)
- H2 (oversight): The counter was added incrementally and the reset-on-success path was never implemented. (More likely — the counter was added in cycle 3 as an emergency fix.)
