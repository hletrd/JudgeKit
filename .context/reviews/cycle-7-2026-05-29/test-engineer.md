# Cycle 7 — test-engineer (coverage gaps)

## Gap behind N7-C7
There is NO test asserting whether `computeContestRanking` / `computeLeaderboard` / `computeSingleUserLiveRank` reflect `score_overrides`. The omission is therefore untested in either direction — neither "applies override" nor "ignores override" is pinned. Existing override tests cover only the gradebook (`getAssignmentStudentStatus`) and the route's write+cache-bust, not the ranking output.

### Tests to add with the N7-C7 fix
1. **IOI ranking honors override (replace):** two users, user A judged 60 on problem P, user B judged 80; instructor overrides A's P to 100 → A must outrank B in `computeContestRanking` entries; A's per-problem `score` == 100.
2. **IOI override of 0 zeroes the problem:** user judged 100, override 0 → per-problem score 0 (presence test, not truthiness).
3. **Override does not double-apply late penalty:** late submission adjusted to 50; override 90 → result is 90 (override wins, penalty not re-applied on the override).
4. **Single-user live rank consistency:** `computeSingleUserLiveRank` for an overridden user matches that user's rank in the full `computeContestRanking` board (frozen-mode parity). NOTE: live-rank is computed from live (post-freeze) data while the full board is frozen — the test should compare two LIVE computations to assert parity, not live-vs-frozen.
5. **Invariant pin:** assert the ranking SQL references `score_overrides` (guards against silent regression / re-divergence from the gradebook engine).

### ICPC (deferred sub-item)
Pin a test documenting current behavior (ICPC override does not yet affect solved/penalty) with a TODO referencing the deferred exit criterion, OR leave ICPC untouched and out of the test matrix until the product defines override→AC-time semantics. Do not assert a guessed ICPC behavior.

## Existing suite health
2465 tests / 320 files PASS. The `rate-limiter-client` "Network error" log lines in test output are INTENTIONAL (circuit-breaker tests mock fetch failures) — not failures. No flaky tests observed.
