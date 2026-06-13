# Security Reviewer — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Authorized defensive review of the owner's own platform.
**Scope:** OWASP-style pass over auth/authz, access-token lifecycle, injection,
secrets, and the contest/exam access surface; cross-checked the cycle-6/7
access-control hardening for sibling gaps.

## SEC8-1 — Access-token expiry invariant violated at the access-code join path (MEDIUM, High, CONFIRMED)
**File:** `src/lib/assignments/access-codes.ts:191`.
The canonical access-control rule "a contest access token is valid until
`lateDeadline ?? deadline`" is enforced by `contestAccessTokenExpiry()` and by
`CONTEST_ACCESS_TOKEN_VALIDITY_SQL` (`(expires_at IS NULL OR expires_at >
NOW())`). The invite path and the schedule-edit sync respect it; the
**access-code redemption** path stamps `expiresAt: assignment.deadline`,
dropping the `lateDeadline` window.

**Direction of the defect (both ends matter for an access gate):**
- *Under-grant (availability):* with `lateDeadline > deadline`, an access-code
  joiner loses token-keyed catalog/platform-mode visibility
  (`platform-mode-context.ts:96/126/151`) at `deadline` — early de-provisioning
  of a still-open contest. Fairness/availability impact for the candidate.
- *No over-grant here:* expiry is set EARLIER than the canonical rule, so it
  never grants access past the close — the failure is restrictive, not
  permissive. That keeps it MEDIUM, not HIGH, but it is still an access-control
  consistency defect on a security-relevant predicate, and it is the precise
  "two join paths, two access lifetimes" divergence the cycle-6/7 work was
  meant to close. It must be fixed for correctness/consistency, not deferred.

**Fix:** `expiresAt: contestAccessTokenExpiry(assignment)` (data already loaded;
`effectiveClose` already computed at line 135 for the join gate). One line,
existing helper, no new surface.

## Positive findings (defenses confirmed intact)
- Access-code generation uses `crypto.randomBytes` with rejection sampling for
  an unbiased alphabet (access-codes.ts:13-24) — no modulo bias. ✅
- Invite search escapes LIKE wildcards (`escapeLikePattern` + `ESCAPE '\\'`)
  and the parameterized ILIKE binds user input — no SQL injection
  (invite/route.ts:35,48-49). ✅
- `CONTEST_ACCESS_TOKEN_VALIDITY_SQL` is a constant string with no user input;
  interpolation is safe; NOW() is DB time (no app-clock skew). ✅
- Token re-invite upsert refreshes ONLY `expiresAt`, leaving `redeemedAt` /
  `ipAddress` (the original-grant audit fields) intact (invite/route.ts:122-125).
  ✅
- Roster removal revokes tokens in-tx (`revokeContestAccessTokensForGroup`) so
  "remove from roster" actually revokes contest access. ✅
- Anti-cheat POST rejects server-only event classes via
  `z.enum(CLIENT_EVENT_TYPES)` (anti-forgery, cycle-4) — doc now matches. ✅

## Carried deferral (security-relevant, exit criterion NOT fired)
- AGG5-8 — similarity rerun delete+reinsert resets first-flagged timestamps
  (`code-similarity.ts:439-451`), LOW(policy)/Medium. Evidence-retention policy
  call, not a code defect; carried. No similarity-engine edit this cycle.
