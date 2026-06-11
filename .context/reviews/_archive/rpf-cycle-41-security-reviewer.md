# Security Review — Cycle 41

**Date:** 2026-04-23
**Reviewer:** security-reviewer
**Base commit:** 24a04687

## SEC-1: PATCH route allows `"redeemed"` in state machine — risk of broken invite-to-redeem invariant [MEDIUM/MEDIUM]

**File:** `src/app/api/v1/contests/[assignmentId]/recruiting-invitations/[invitationId]/route.ts:97`

**Description:** The PATCH route's status transition map includes `"redeemed"` as a valid transition from `"pending"`. While the Zod schema limits `status` to `z.enum(["revoked"])` today, having `"redeemed"` in the state machine creates a defense-in-depth gap. If a future change adds `"redeemed"` to the Zod enum, the PATCH route would allow directly setting an invitation to "redeemed" without going through the `redeemRecruitingToken` transaction, which is the only path that atomically creates the user account, enrollment, and access token.

**Concrete failure scenario:** A developer extends `updateRecruitingInvitationSchema` to include `"redeemed"` (e.g., for an admin override feature). The PATCH route's state machine approves the transition, and `updateRecruitingInvitation` updates the status in the DB. The invitation is now "redeemed" but `userId` is null, and no user/enrollment/access token exists. The candidate cannot log in, and the invitation appears corrupted in the admin UI.

**Fix:** Remove `"redeemed"` from the allowed transitions map. Redeeming must only happen through the token-based flow.

**Confidence:** Medium (defense-in-depth; not exploitable today)

---

## SEC-2: CSP allows `'unsafe-eval'` in development mode for all script sources [LOW/LOW]

**File:** `src/proxy.ts:189`

**Description:** In development mode, the CSP `script-src` includes `'unsafe-eval'`. While this is only active in `NODE_ENV=development`, it significantly weakens the CSP during local development, potentially masking XSS issues that would only fail in production.

**Concrete failure scenario:** A developer introduces an XSS vulnerability during local development. The `'unsafe-eval'` directive allows the exploit to work locally, and the developer doesn't catch it. The vulnerability exists in production code but fails silently because production CSP doesn't include `'unsafe-eval'`.

**Fix:** Consider using a more targeted approach (e.g., only allowing `'unsafe-eval'` for specific React DevTools scripts) or adding a build-time check that warns about `'unsafe-eval'` in CSP.

**Confidence:** Low (development-only; production CSP is correct)

---

## Previously Flagged Items Still Present

- Anti-cheat copies text content — previously deferred
- Docker build error leaks paths — previously deferred
