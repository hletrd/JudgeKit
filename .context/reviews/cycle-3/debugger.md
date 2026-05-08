# Cycle 3/3 — Debugger

**HEAD:** c6f92a37

## B3-01 — Stale comment chains (no functional defect) — LOW
Same finding as code-reviewer C3-01. Listed for tracking; no defect to debug.

## B3-02 — `getActiveTimedAssignmentsForSidebar` orphaned export — LOW
Function exported, only referenced by its own unit test. No production caller. No bug; intentional rename target per cycle-3 plan.

## B3-03 — Recruit results Korean spacing rule violation — MEDIUM
Real user-visible defect. Korean labels render with `tracking-wide` due to unconditional class. Reproduces in `ko` locale on `/recruit/[token]/results`. Fix per cycle-3 plan.

## B3-04 — Mobile mock check — PASS
PublicHeader mobile menu still renders all items (base + cap-gated + dropdown) and is scrollable. No layout-shift or focus-trap regression detected.

## B3-05 — Server/client boundary on PublicHeader trailingSlot
PlatformModeBadge is an async server component, embedded as `trailingSlot` for PublicHeader (a client component). React supports server child components passed via props as JSX children — verified by the existing tests passing.

## Verdict
One real bug (B3-03), three doc-only follow-ups, two no-ops.
