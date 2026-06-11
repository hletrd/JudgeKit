# Cycle 6 — Designer / UX review (admin health + worker inventory surfaces)

**HEAD:** d1217b5a · Baseline green. The repo has a Next.js frontend; this cycle's review surface (judge-worker lifecycle backend) has an adjacent admin UI (health badge + worker inventory table) but no UI code change is proposed.

## Findings

### UX-C6-1 (indirect, from N6-C6) — "degraded" health badge loses meaning — **LOW (UX)**
The admin health page renders `status: "degraded"` whenever `stale > 0` (`admin-health.ts:89`). With no `stale -> offline` reaper, a single past crash pins the badge at degraded permanently. From a UX standpoint this is an alarm that never clears — operators habituate and stop trusting the indicator (the classic "blinking 12:00" problem). Fixing N6-C6 (terminal `offline` transition) restores the badge to reflecting *current* health. No component change required — the backend fix alone restores correct UI semantics. The worker inventory table (`admin/workers` GET) already surfaces `status` + `deregisteredAt`, so reaped workers remain visible as `offline` with a timestamp, which is the correct affordance for "this worker crashed and was reaped".

## Accessibility / i18n
No new user-facing strings introduced by the proposed backend fix. `offline` status label already exists in the worker status label set (`status-labels.ts` / i18n). No Korean letter-spacing concern (no markup change). No WCAG/contrast/focus implications this cycle.

## Verdict
No standalone UI work needed. The N6-C6 backend fix transitively corrects the health-badge UX. No net-new UI findings.
