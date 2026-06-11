# Designer — UI/UX Review — Cycle 4 (2026-05-29)

Repo has a Next.js web frontend (`src/app`, `src/components`), so the designer
angle is in scope. However, the orchestrator scoped THIS cycle to backend
subsystems (judge worker, rate limiter, contests, auth/session, DB/drizzle,
scripts). The net-new findings this cycle are all backend (IP parsing, session
sentinel, judge result handling) with no UI surface.

## Findings
None net-new this cycle on the UI surface.

## Carried-over (already in cycle-3 deferred ledger — NOT re-counted)
- F6 (cycle-3): SMTP port `inputMode="numeric"` + masked-password clear semantics
  (`system-settings-form.tsx`). Still open, admin-only polish.

## Note on user-facing impact of backend findings
SEC-C4-1 (worker IP lockout) is not user-visible (judge infra), but its downstream
effect — submissions stuck in `pending`/`queued` — WOULD surface to students as a
"judging…" state that never resolves. If SEC-C4-1 is left open, the contest
submission UI's queue-status indicator should at least surface a stalled-queue
state rather than spinning indefinitely (already partly handled by the stale-claim
reclaim path). Informational; no action required beyond fixing SEC-C4-1.
