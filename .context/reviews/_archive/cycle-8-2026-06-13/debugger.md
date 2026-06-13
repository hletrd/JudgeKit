# Debugger — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Latent-bug / failure-mode sweep.

## D8-1 — Stale token after schedule EXTEND for access-code joiners (MEDIUM, High, CONFIRMED)
**File:** `src/lib/assignments/access-codes.ts:191`.
Reproduction: (1) instructor creates a contest with `deadline=T`, no
`lateDeadline`. (2) Student redeems the access code → token `expires_at=T`.
(3) Instructor later sets `lateDeadline=T+1h` (extend). The schedule-edit sync
(`syncContestAccessTokenExpiry`) now rewrites the existing token to `T+1h` — so
post-cycle-7 this *self-heals on the next edit*. BUT if no edit happens, or for
the steady-state case where `lateDeadline` was set from the start, the
access-code joiner's token is born at `deadline` and stays there. Failure: the
token-keyed catalog gate denies them between `deadline` and `lateDeadline`.

Root cause is purely the creation-time value (line 191), not the sync — the sync
masks it only when an edit follows. Fix at the source:
`expiresAt: contestAccessTokenExpiry(assignment)`.

## D8-2 (LOW) — Heartbeat-gap scan cap is timestamp-only ordered
**File:** `anti-cheat/route.ts:316-325`. The `limit(5000)` "most recent
heartbeats" query orders by `desc(createdAt)` without an `id` tiebreak. At the
exact 5000th-row boundary, same-`createdAt` rows could be included/excluded
nondeterministically, shifting the earliest detected gap by one interval.
Bounded and near-impossible in practice (heartbeats ~60s apart; 5000 rows ≈ 83h);
NOT a paged listing so it was correctly out of G2's scope. Record as LOW; a
`desc(id)` secondary key would make it fully deterministic if the gap scan is
ever touched.

## Confirmations
- `loadMore` stale-guard (fetchSeqRef) + id-dedupe correctly prevents the
  duplicate-key React warning and seam loss. Covered by component tests. ✅
- Concurrent access-code redemption handled by the 23505 catch + already-redeemed
  in-tx check (access-codes.ts:140-150,200-213). ✅
