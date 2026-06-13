# Architect — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## A8-1 — Token-expiry rule has a single OWNER but not a single CALLER (MEDIUM, High)
**Files:** `src/lib/assignments/contest-access-tokens.ts` (owner);
`src/lib/assignments/access-codes.ts:191` (non-conforming caller).
Cycles 6–7 correctly centralized the token-expiry *rule* into
`contestAccessTokenExpiry()` and the *sync* into `syncContestAccessTokenExpiry()`.
That is the right layering. The architectural gap is that **token creation is
still distributed across three call sites** (invite, access-code redeem,
[implicitly] any future grant), and only two of them call the canonical helper.
The access-code path open-codes `expiresAt: assignment.deadline`, so the
"single source of truth" is bypassed at one of its three consumers.

**Design fix (beyond the one-line value change):** the durable way to prevent a
fourth divergence is to make the helper the *only* way to build the insert
payload. Recommend a small constructor in `contest-access-tokens.ts`, e.g.
`buildContestAccessTokenValues({ assignmentId, userId, now, ipAddress,
assignment })` returning the full `values()` object with `expiresAt` already
derived. Both insert sites call it; a new grant site cannot forget the rule.
(In-scope minimal fix is the one-liner; the constructor is the no-future-drift
version — record as the structural recommendation.)

## Confirmations
- Lifecycle ownership pattern (in-tx sync mirroring in-tx revoke) is consistent
  and correct for the schedule-edit path. ✅
- No new cross-layer coupling introduced by cycle-7. The listing-order tiebreak
  is a per-route concern, appropriately local. ✅

## Carried (unchanged): C3-AGG-5 (deploy-docker.sh SSH-helper extraction, 1433
lines) — not touched this cycle; carried.
