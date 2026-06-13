# Test Engineer — RPF Cycle 9 (2026-06-13)

**HEAD:** da6179f3. Baseline: 340 files / 2663 tests PASS.

## TE9-1 — the cycle-7 listing-order contract test is incomplete (test gap, High)
**File:** `tests/unit/api/listing-order-tiebreak.test.ts`. The AGG7-2 source-grep
contract enumerates only 5 routes (audit-logs, login-logs, users, files,
problems). It **omits three offset-paged listings that lack the unique tiebreak**
(CR9-1/2/3): `code-snapshots/[userId]/route.ts`, `recruiting-invitations.ts`,
`accepted-solutions/route.ts`. Because the test is an explicit allow-list, those
routes were never guarded — the sweep's own gate let them slip.

**Red-first plan:** extend `listing-order-tiebreak.test.ts` with three tailored
assertions (the existing harness asserts a `desc(createdAt), desc(id)` string;
the new routes use different orders, so assert the *presence of the id tiebreak*
and the *absence of the single-key order* per route):
- code-snapshots: contains `asc(codeSnapshots.createdAt), asc(codeSnapshots.id)`;
  must NOT match `orderBy(asc(codeSnapshots.createdAt))` alone.
- recruiting-invitations: contains `recruitingInvitations.createdAt,
  recruitingInvitations.id`; must NOT keep `orderBy(recruitingInvitations.createdAt)`
  as the sole clause.
- accepted-solutions: every `orderByClause` branch ends with `desc(submissions.id)`;
  the `newest` branch must NOT be `[desc(submissions.submittedAt)]` alone.

All three assertions are RED on current source and GREEN after the one-line
orderBy fix per route. This keeps the contract test the single source of truth
for the listing-order invariant and prevents a 4th omission.

## Existing coverage note
`code-snapshots.route.test.ts`, `contest-code-snapshots-get.route.test.ts`,
`problem-accepted-solutions.route.test.ts`, and the recruiting-invitation suite
exist but none asserts page-seam ordering — the contract test is the right place
(behavioural per-route seam tests would need full db-chain mocks per the existing
source-grep-inventory rationale in the test file header).
