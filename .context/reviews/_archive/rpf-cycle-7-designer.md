# RPF Cycle 7 — designer (orchestrator-driven, 2026-04-29)

**Date:** 2026-04-29
**HEAD reviewed:** `45502305`.
**Cycle-7 change surface vs prior cycle close-out:** **0 commits, 0 files, 0 lines.**

## Summary

Empty change surface. UI/UX posture unchanged. Stale prior cycle-7 designer finding (C7-UX-1: countdown timer wrong-clock UX bug) is **RESOLVED at HEAD** since the time endpoint now uses DB time.

## Stale prior cycle-7 designer findings — re-validated at HEAD

### C7-UX-1 (exam countdown shows incorrect time under server clock skew) — RESOLVED at HEAD

- Time endpoint uses `getDbNowMs()` at HEAD.
- Countdown component (`src/components/exam/countdown-timer.tsx`) uses the time endpoint to compute an offset; with DB time on the server, client+server are aligned.
- Frustrating "submission rejected with time remaining" UX bug eliminated.

### C7-UX-2 (Korean letter-spacing properly handled) — STILL POSITIVE

Verified: `tracking-*` Tailwind utilities are guarded with `locale !== "ko"` checks or applied to Latin-only content (keyboard shortcuts, monospace). `DropdownMenuShortcut` exception remains correct (Cmd+K Latin). No new violations.

### C7-UX-3 (loading states present) — STILL POSITIVE

Dashboard pages have `loading.tsx` skeletons. Good.

## Re-validation of cycle-6 backlog — UI/UX impact

- **C2-AGG-5** (visibility-aware polling): UX impact is non-visual but real — background tabs continue eating bandwidth + CPU. Pre-emptive helper extraction recommended (matches code-reviewer + perf-reviewer + critic).
- **C1-AGG-3** (client console.error): doesn't affect end-user UX directly; observability concern. Defer.
- **C2-AGG-6** (practice page Path B): perf concern, may show as slow-page UX at very large problem-table sizes. Below trigger.

## Source-level UI/UX scan at HEAD `45502305`

- **Focus management:** `Dialog`, `DropdownMenu`, `Popover` use Radix primitives (correct focus-trap + keyboard nav).
- **Reduced motion:** `animate-pulse` used on countdown final minute; no `motion-safe:` guard. **Minor**: not a new finding (this pattern existed pre-cycle-1); not injecting because this is a pre-existing UX choice and the orchestrator hasn't flagged it through prior cycles.
- **Dark mode:** Recent commits (cycle ≤ 11 reviews; not this cycle) addressed multiple dark-mode parity issues for chat widget admin, problems page, assignment-form, etc. No new dark-mode regressions in cycle-6 commits (deploy-script-only).
- **Korean letter-spacing:** No `tracking-*` violations introduced.

## NEW designer findings this cycle

**0 NEW.** Empty change surface; no UI code touched.

## Recommendations for cycle-7 PROMPT 2

1. Record C7-UX-1 closure (silently RESOLVED at HEAD).
2. Concur with code-reviewer + perf-reviewer + critic on `useVisibilityAwarePolling` hook extraction. From a UX perspective: power and battery savings on mobile/laptop background tabs are a real (if invisible) UX win.

## Confidence

H.
