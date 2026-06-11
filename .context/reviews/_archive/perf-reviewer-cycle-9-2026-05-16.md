# Perf Reviewer — RPF Cycle 9 (2026-05-16)

**HEAD:** `9854e072`

## Findings

### PERF9-1 — Verified: hljs full bundle vs lib/common

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/code-timeline-panel.tsx:5`

`import hljs from "highlight.js/lib/common"` correctly uses the
common-languages bundle (~50kB gz) rather than the full
`highlight.js` (~1MB) bundle. Good choice. No action.

### PERF9-2 — Latent: `problems`/`problemLabels` rebuilt every render

**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/code-timeline-panel.tsx:150-156`

```ts
const problems = Array.from(new Map(snapshots.map(...)).entries());
const problemLabels = Object.fromEntries([["all", t("allProblems")], ...problems]);
```

Both rebuilt on every render even though `snapshots` only changes when
fetched. Wrap in `useMemo([snapshots])` to avoid the per-render Map
allocation. Negligible at small `snapshots` counts (≤ ~20) but cheap
to fix.

### PERF9-3 — Carry-forward, deferred: dynamic import in AI gate hot path

PERF8b-2; left deferred per cycle-8 ledger.

### PERF9-4 — Carry-forward, deferred: capability spread per render

PERF8b-3 / CR8b-4; left deferred.

## Verdict

Two LOWs, both worth a small refactor pass; no critical perf
regressions detected.
