# Code Reviewer — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72 (main == origin/main; cycle-7 G1–G4 complete + review archive).
**Baseline gates:** tsc 0 · eslint 0/0 · lint:bash 0 · unit 340 files / 2661 PASS.
**Method:** full inventory of `src/`; deep focus on the cycle-6/7 churn surface
(contest access-token lifecycle, listing-order tiebreaks, anti-cheat dashboard
paging) to find sibling-mutation points earlier cycles missed.

## CR8-1 — Access-code redemption stamps token expiry at bare `deadline`, not the canonical `lateDeadline ?? deadline` (MEDIUM, High, CONFIRMED)
**File:** `src/lib/assignments/access-codes.ts:191` (`redeemAccessCode`).
```ts
await tx.insert(contestAccessTokens).values({
  id: nanoid(), assignmentId: assignment.id, userId,
  redeemedAt: now, ipAddress: ipAddress ?? null,
  expiresAt: assignment.deadline,   // <-- bare deadline
});
```
Cycle-6 AGG6-1 established a single token-expiry invariant — a contest access
token expires at the **effective close** `lateDeadline ?? deadline` — and put
it behind one helper, `contestAccessTokenExpiry()`
(`contest-access-tokens.ts:99-104`). Cycle-7 AGG7-3 then propagated that rule to
the invite insert (`invite/route.ts:115,124`) and to the schedule-edit sync
(`management.ts:320`, `syncContestAccessTokenExpiry`). **The access-code
redemption path — the primary self-service join flow — was never converted and
still hard-codes `assignment.deadline`.**

This is internally inconsistent within the same function: line 135 already
computes `const effectiveClose = assignment.lateDeadline ?? assignment.deadline`
to gate the *join* ("block join after contest deadline"), yet line 191 stamps
the *token expiry* at bare `deadline`. The function both loads `lateDeadline`
(line 120) and uses it (line 135) — only the token insert ignores it.

**Concrete failure:** a contest configured with a late-submission window
(`lateDeadline > deadline`). A participant who joins via **access code** gets a
token expiring at `deadline`; a participant who joins via **invite** gets one
expiring at `lateDeadline`. After `deadline` passes (but before `lateDeadline`),
the access-code joiner's token is expired, so the three platform-mode /
contest-catalog gates that key on `CONTEST_ACCESS_TOKEN_VALIDITY_SQL`
(`platform-mode-context.ts:96,126,151`) deny them — the contest disappears from
their catalog / platform-mode view during a window the instructor explicitly
opened. (Submission access is incidentally rescued by the auto-enrollment row at
access-codes.ts:195, so this is a consistency/visibility defect, not a total
lockout — which is why it is MEDIUM, not HIGH — but it is the exact "divergent
verdicts on the same logical access" class cycle-6/7 set out to eliminate.)

**Fix:** import `contestAccessTokenExpiry` and use it (the loaded `assignment`
already has the right shape), or reuse the `effectiveClose` already computed at
line 135:
```ts
import { contestAccessTokenExpiry } from "@/lib/assignments/contest-access-tokens";
...
expiresAt: contestAccessTokenExpiry(assignment),
```
**Red-first test:** `access-codes.test.ts` fixtures all set `lateDeadline: null`
(lines 154, 213), so the divergence is untested — add a redeem test with
`lateDeadline` set asserting the inserted token's `expiresAt === lateDeadline`.

## Confirmations (cycle-7 fixes verified correct, not regressions)
- `syncContestAccessTokenExpiry` is reached by BOTH assignment-edit entry points
  (`groups/.../[assignmentId]/route.ts:199` PATCH calls
  `updateAssignmentWithProblems`, which contains the in-tx sync) — no missed
  edit path. ✅
- All 7 sibling listings carry the `(createdAt desc, id desc)` tiebreak. The
  anti-cheat route's *second* `orderBy(desc(createdAt))` at line 324 is the
  bounded heartbeat-gap scan (limit 5000, reversed for gap walk), not a paged
  listing — id tiebreak is immaterial to gap detection. ✅
- Dashboard poll-merge id-union + loadMore stale-guard/dedupe are correct and
  covered by 3 component tests. ✅

## Carried (unchanged this cycle)
P6-1 (TS similarity normalize/n-gram phase not time-sliced,
`code-similarity.ts:266-275`) — `runSimilarityCheckTS` not edited this cycle;
exit criterion not fired. Stays deferred.
