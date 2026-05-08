# Critic Review — Cycle 2 (2026-05-03)

**Reviewer:** critic
**HEAD:** `689cf61d`

---

## C2-CRIT-1 (MEDIUM, HIGH confidence) — Recruiting candidate identity model is fragile

**Files:** `src/lib/assignments/recruiting-invitations.ts`, `src/app/(auth)/recruit/[token]/results/page.tsx`

The candidate identity is spread across three entities: the invitation row (by tokenHash), the user row (by userId on the invitation), and the session (by JWT). The results page first looks up the invitation by token, then checks `session.user.id !== invitation.userId`. If a candidate's invitation is deleted or revoked between the token lookup and the session check, the page shows a confusing "invalid token" error instead of "results not available."

More critically, the `redeemRecruitingToken` function creates a user with `username: nanoid(10)`. This is a random, non-human-readable username. If the candidate ever needs to log in via the normal login form (not the recruit link), they would need to know this random username. The `authorizeRecruitingToken` path in `config.ts` handles re-entry, but the normal `/login` form requires a username.

**Fix:** Either allow email-based login for recruiting-created accounts (the email is stored), or surface the generated username to the candidate after their first login.

---

## C2-CRIT-2 (LOW, HIGH confidence) — `computeRecruitResultsTotals` silently skips problems with `score: 0`

**File:** `src/lib/assignments/recruiting-results.ts:85`

```ts
if (best?.score !== null && best?.score !== undefined) {
```

This condition is correct (0 is truthy for `!== null && !== undefined`), but the comment above says "the helper skips null-score entries entirely" which could be misread as skipping `score: 0`. The actual behavior is correct, but the ambiguous phrasing could lead to a future regression where `score: 0` is accidentally treated as "no submission."

**Fix:** Add an explicit comment: "Note: score: 0 is a valid score (zero points earned) and is NOT skipped. Only score: null (no scored submission) is skipped."

---

## C2-CRIT-3 (LOW, HIGH confidence) — Multiple auth flows with different error handling patterns

**Files:** `src/lib/auth/config.ts`, `src/lib/auth/recruiting-token.ts`, `src/lib/api/api-key-auth.ts`

The codebase has three distinct auth flows (credentials, recruiting token, API key) with three different error handling patterns:
1. Credentials: returns `null` from `authorize()`, rate limits cleared on success
2. Recruiting token: returns `null` from `authorizeRecruitingToken()`, rate limits cleared on success
3. API key: returns `null` from `authenticateApiKey()`, no rate limiting

The recruiting token flow re-uses the credentials rate limiter keys but has different semantics. This divergence makes it harder to reason about auth behavior and could lead to subtle bugs.

**Fix:** Document the three auth flows and their rate-limiting behavior in a single reference doc. Consider unifying the rate-limit key naming convention.

---

## Final Sweep

Reviewed the overall change surface from cycle 1. The 31 commits from cycle 1 addressed real security issues (docker path validation, auth token fallback, magic-byte verification, metrics route). The remaining issues are in the recruiting flow PII handling and the per-request auth DB query. No major architectural regressions introduced.
