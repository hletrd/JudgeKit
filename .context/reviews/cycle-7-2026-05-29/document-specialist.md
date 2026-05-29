# Cycle 7 — document-specialist (doc/code mismatch)

## DOC-C7-1 (folds into N7-C7) — docs/api.md silent on override→ranking scope
`docs/api.md:698-731` documents the Score Overrides endpoints but does not state whether an override affects the contest leaderboard or only the gradebook. Combined with the code gap (N7-C7), behavior is undefined-by-docs and inconsistent-in-code. When N7-C7 is fixed, add one sentence to `docs/api.md` Score Overrides: "An override replaces the student's effective score for that problem in both the gradebook and the IOI contest leaderboard/export." Note the ICPC caveat if ICPC override semantics remain deferred.

## In-code comment to update with the fix
`overrides/route.ts:123-127` comment claims the `invalidateRankingCache` call fixes "I changed the score but the ranking didn't update." Until N7-C7 lands, that comment is ASPIRATIONAL, not accurate (the recomputed ranking still ignores the override). The fix makes the comment true; no comment edit needed beyond confirming it.

## Re-verified accurate docs
- `poll/route.ts:1-5` historical-name comment — accurate.
- `worker-staleness.ts` header (3-state lifecycle incl. N6-C6 `stale→offline`) — matches `heartbeat/route.ts:117-128`. Accurate.
- DOC-C5-2 (register advertises dead `staleClaimTimeoutMs`) — still a doc/field mismatch, non-impacting; RE-DEFER.

No other doc/code mismatches found.
