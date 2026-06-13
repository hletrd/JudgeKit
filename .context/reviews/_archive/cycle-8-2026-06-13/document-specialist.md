# Document Specialist — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72.

## No NEW doc/code mismatch found this cycle.
- `docs/api.md` anti-cheat POST eventType enum now lists the 6 client types with
  the server-only note (cycle-7 G4) — matches `client-events.ts`. ✅
- `docs/api.md` documents the anti-cheat GET order `(createdAt desc, id desc)` —
  matches `anti-cheat/route.ts:295`. ✅

## DOC8-1 (LOW) — Code comment is the only "spec" for the token-expiry invariant
The rule "token expires at `lateDeadline ?? deadline`" lives only in the
`contestAccessTokenExpiry` docstring (contest-access-tokens.ts:93-104) and the
exam-integrity model doc. Because CR8-1 shows a creation site can silently
diverge from a docstring-only invariant, recommend the exam-integrity / access
docs explicitly state that **all** token creation paths (invite, access-code
redeem) derive expiry from the effective close — so the next reviewer/author has
an authoritative cross-check. Tie this note to the CR8-1 fix commit.

## Carried: CI-RESTORE (wire RESTORE_DATABASE_URL into CI postgres service) —
no CI workflow edit this cycle; carried.
