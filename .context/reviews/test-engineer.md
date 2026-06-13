# Test Engineer — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Baseline: unit 340 files / 2661 PASS.

## TE8-1 — Coverage gap let CR8-1 slip: access-code redeem never tested with a lateDeadline (MEDIUM, High)
**File:** `tests/unit/assignments/access-codes.test.ts` — every redeem fixture
sets `lateDeadline: null` (lines 154, 213), so the `lateDeadline ?? deadline`
divergence is structurally untestable in the current suite. That is exactly why
the bare-`deadline` token expiry (access-codes.ts:191) survived cycles 6–7.

**Red-first test to add (drives the CR8-1 fix):**
- redeem with `deadline=T`, `lateDeadline=T+1h` → assert the inserted
  `contestAccessTokens` row has `expiresAt` equal to `lateDeadline` (T+1h), NOT
  `deadline`. With the current code this asserts T and FAILS (red); after the
  fix it asserts T+1h and passes.
- redeem with `lateDeadline=null`, `deadline=T` → `expiresAt === T` (guards the
  `?? deadline` branch).
- (optional) redeem with both null → `expiresAt === null`.

Mirror the existing redeem test harness (`access-codes.test.ts` already mocks
the tx insert and can capture the `.values(...)` argument).

## Confirmations (good coverage added in cycle-7)
- `contest-access-tokens.test.ts` covers the sync (extend/shorten/clear) and the
  invite refresh. ✅ — but note it tests the *helper*, not the *redeem caller*,
  which is the untested seam.
- `anti-cheat-dashboard.test.tsx` covers poll-merge seam loss, loadMore dedupe,
  stale-loadMore discard. ✅
- `listing-order-tiebreak.test.ts` + per-route arity pins cover G2. ✅

## Carried test debt
DEFER-ENV-GATES (login-gated E2E + browser a11y audit) — no provisioned staging
server/browser this cycle; carried.
