# Verifier — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Evidence-based correctness check against stated invariants.

## Invariant under test: "a contest access token expires at lateDeadline ?? deadline"
Stated in `contest-access-tokens.ts:93-104` (the `contestAccessTokenExpiry`
docstring) and enforced by `CONTEST_ACCESS_TOKEN_VALIDITY_SQL`.

**Site-by-site verification of token `expiresAt`:**
| Creation/mutation site | expiresAt value | Conforms? |
|---|---|---|
| invite POST insert (`invite/route.ts:115`) | `contestAccessTokenExpiry(assignment)` | ✅ |
| invite POST upsert refresh (`:124`) | `contestAccessTokenExpiry(assignment)` | ✅ |
| schedule-edit sync (`management.ts:320` → `syncContestAccessTokenExpiry`) | `contestAccessTokenExpiry({deadline,lateDeadline})` | ✅ |
| **access-code redeem (`access-codes.ts:191`)** | **`assignment.deadline`** | ❌ **VIOLATION (V8-1)** |

**V8-1 (MEDIUM, High, CONFIRMED):** the access-code redeem insert violates the
stated invariant. Evidence: line 191 vs. the docstring + every other site.
Internal contradiction: line 135 computes `lateDeadline ?? deadline` for the
join gate, line 191 uses bare `deadline` for the token. Fix:
`expiresAt: contestAccessTokenExpiry(assignment)`.

## Verified-correct claims
- The cycle-7 plan's claim "both assignment-edit entry points reach the sync" —
  VERIFIED: the groups PATCH route calls `updateAssignmentWithProblems`. ✅
- Doc claim (`docs/api.md`) anti-cheat POST eventType enum = 6 client types —
  VERIFIED against `client-events.ts` CLIENT_EVENT_TYPES. ✅
- Listing-order doc claim `(createdAt desc, id desc)` for anti-cheat GET —
  VERIFIED against `anti-cheat/route.ts:295`. ✅
