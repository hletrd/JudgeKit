# Document Specialist — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3.

## DOC9-1 — listing-order contract doc scope (LOW, Low)
`listing-order-tiebreak.test.ts` header documents the invariant ("Every
offset-paginated or row-capped listing must order by a UNIQUE second key")
correctly, but its case list lagged the actual route set. After the CR9 fix the
header remains accurate and the case list will match reality. No prose doc edit
required beyond keeping the test's case list complete (handled in
test-engineer.md). No doc/code mismatch introduced.

## Token-lifecycle docs
The access/exam-integrity comments at `access-codes.ts:184-191` and
`contest-access-tokens.ts:93-104` accurately describe the effective-close expiry
rule after AGG8-1. The optional DOC8-1 ("note that ALL token creation paths
derive expiry from the effective close") was not added because the
values-constructor it referenced was not built; the inline comments already make
the invariant discoverable at each of the 4 sites. No doc gap.

## No other doc-code drift
README / deploy docs / API enum docs (corrected in cycle-7 at 576949e1) remain
consistent with code.
