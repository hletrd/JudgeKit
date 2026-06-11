# Designer (UI/UX) — Cycle 5 (2026-05-29)

Web UI is present (Next.js app). This cycle's scope is the judge-worker subsystem,
whose only UI surface is the admin workers table.

## DSN-C5-1 (= N1, UI symptom) — admin workers table shows stale `active_tasks`
`workers-client.tsx:376` renders `w.activeTasks` directly. For an orphaned crashed
worker (N1), the table shows a `stale`-status row with a non-zero active_tasks that
no longer reflects reality (its tasks were reclaimed elsewhere). An admin reading
the table sees phantom load on a dead worker. The N1 backend fix (zero
active_tasks past the stale-claim timeout) also corrects this display. No separate
UI change required. Low.

## Accessibility / Korean typography
No Korean-text or letter-spacing changes in scope this cycle. The admin workers
table is Latin/numeric content; no `tracking-*` applied to Korean glyphs. No WCAG
regression introduced (no UI code touched this cycle).

Net-new: DSN-C5-1 (= N1 UI symptom; resolved by the backend fix).
