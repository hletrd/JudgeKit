# Tracer — RPF Cycle 8 (2026-06-13)

**HEAD:** c862ff72. Causal trace of the contest-access lifecycle.

## Trace 1 — "Why does an access-code joiner lose the contest from their catalog at `deadline` when a late window is open?"
Competing hypotheses:
- H1: the catalog gate is wrong. — REJECTED. `platform-mode-context.ts:96/126/151`
  correctly applies `CONTEST_ACCESS_TOKEN_VALIDITY_SQL = (expires_at IS NULL OR
  expires_at > NOW())`. The gate faithfully enforces whatever `expires_at` says.
- H2: the token's `expires_at` is wrong at creation. — CONFIRMED.
  `redeemAccessCode` (access-codes.ts:184-191) writes `expiresAt:
  assignment.deadline`. With `lateDeadline > deadline`, the token expires at the
  earlier instant, so the gate (correctly) hides the contest once NOW() passes
  `deadline`.
- H3: the schedule-edit sync should have fixed it. — PARTIAL. The sync only
  runs on an edit; for a contest created with `lateDeadline` from the start and
  never edited, the bad value is never corrected.

**Root cause:** single line, access-codes.ts:191 — bare `deadline` instead of
the canonical `lateDeadline ?? deadline`. The whole chain downstream is correct.

## Trace 2 — "Does submission also break, or only catalog visibility?"
Submission gate (submissions.ts:322-329) accepts enrollment OR valid token.
`redeemAccessCode` auto-enrolls (line 195). So submission survives via the
enrollment branch; only the token-keyed surfaces (catalog/platform-mode) break.
This bounds the blast radius and explains the MEDIUM (not HIGH) severity — but
it is the same divergent-access-lifetime defect class, so still a fix.
