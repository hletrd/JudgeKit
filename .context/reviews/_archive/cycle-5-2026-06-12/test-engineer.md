# Test Engineer — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Unit 2606/2606 across 337 files at baseline; component
suite 236 tests/70 files (per cycle-4 record). Coverage-gap analysis follows
the cycle-5 findings.

## TE5-1 — No test pins "no flag for a rejected submission" (HIGH-value gap, High, CONFIRMED)
`tests/unit/assignments/submissions.test.ts` covers: flag inserted on stale
submit, no flag when fresh, no flag without opt-in, fail-open on insert error
— all good. MISSING: the property that a flag is **not** recorded when the
submission is subsequently rejected (problem mismatch, and the route-level
429/403/503 exits). This is exactly the hole CR5-1 found — the cycle-4 tests
pinned the opt-in plumbing, not the accepted-submission semantics the doc
promises. Red-first tests for the G1 fix: (1) mismatch path → no flag;
(2) route tx rejection (rate-limited) → no flag; (3) accepted path → exactly
one flag, `details.submissionId` equals the inserted id, `ipAddress` set,
`createdAt` from DB time; (4) flag-insert failure → submission still 201
(fail-open pin survives the move).

## TE5-2 — No UI test renders a `submission_stale_heartbeat` row (MEDIUM, High)
No component test mounts `anti-cheat-dashboard`/`participant-anti-cheat-
timeline` with a stale-flag event; the missing-i18n-key regression (V5-4)
would have been caught by a single render assertion (`expect(screen.getByText
("...")).not.toMatch(/eventTypes\./)`). Add alongside the G2 fix, plus a
catalog test asserting every `EVENT_TIERS` key has an `eventTypes.*` message
in both locales (pins future event types too).

## TE5-3 — `heartbeatGaps` has server tests but the contract is consumer-free (MEDIUM, High)
Route tests assert gap computation, but nothing asserts a consumer renders
them — which is how a dead API surface survived 4 cycles. With G3: component
test for the gaps card (incl. the `ongoing` boundary row) + route test for
`includeGaps` gating (absent param → no scan / no field).

## TE5-4 — Monitor in-flight recovery needs a component test (MEDIUM)
For G4 (SEC5-2 fix): simulate claim → unmount before send resolves → remount
→ assert the event is re-sent exactly once. Storage-level unit tests for the
new in-flight slot helpers (corrupt slot JSON → dropped gracefully, slot
cleared after success/permanent).

## TE5-5 — Dead branch: similarity `too_many_submissions` (LOW, High)
No test exercises `reason: "too_many_submissions"` because the lib cannot
produce it (CR5-3). With the fix: unit test pinning rows>MAX + sidecar-null →
`too_many_submissions` (and sidecar-present → completed regardless of count).

## TE5-6 — SVG `describeElement` guard (LOW)
Unit-level: jsdom copy event with an SVG target inside a classed SVG parent —
expect no throw and a usable target string.

## Suite health notes
- No flaky tests observed in this cycle's two full unit runs (baseline +
  pre-existing). Import cost (69 s of 41.7 s wall, parallelized) is fine.
- Known carried env gaps unchanged: login-gated E2E specs need
  E2E_PASSWORD/staging (DEFER-ENV-GATES); browser a11y audit needs a
  provisioned browser env (DES-ENV).
