# Performance Reviewer — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop
**HEAD reviewed:** `23dd9e80`

## NEW Findings

### PERF10-1 — `flatEvents` re-built on every render
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:90-129`

The `flatEvents` array, `earliest`, and `latest` are recomputed in
the function body on every render, even though they only depend on
`assignmentProblems` + `timelineByProblem`. For an audit page that
re-renders on hover-tooltip CSS state (no state changes here in
practice, but still), `useMemo` would make this a no-op. Component
is a server component (`Link` from `next/link`, no `"use client"`),
so this is actually fine for SSR — single render per request. Down-
grade to *informational*; would only matter if the component is
later converted to client-side.

### PERF10-2 — `formatDuration` repeated work in tight loop
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:144-152, 254, 364`

`formatDuration` is called once per event marker (tooltip relative
time) plus once per problem card (`firstAcAt` badge). On a 50-problem
contest with 200 events, that's ~250 calls per render; cheap, but
could be memoised against `(ev.at.getTime() - startTime.getTime())`
if hot.

**Status:** Informational.

## Re-verified

- Cycle-9 `useMemo` on `problems`/`problemLabels` in
  `code-timeline-panel.tsx` confirmed in place (lines 114-124).
- Cycle-9 `getHighlightJsLanguage` adapter is constant-time map
  lookup; no extra cost vs the deleted parallel map.
- Cycle-8 dynamic `import("@/lib/capabilities/cache")` in
  `platform-mode-context.ts:280` still deferred (cosmetic).

## Carry-forward deferred

- **PERF8b-1** (TLE +2s budget) — operator-accepted.
- **PERF8b-2** (dynamic import) — cosmetic.
- **PERF8b-3** (capability-spread copy in submissions page) —
  cosmetic.
- **PERF8b-4** (lecture-mode iOS scroll restoration) — needs
  device runtime check.

## Verdict

Zero perf regressions. Both NEW findings are informational
micro-optimisations that don't merit a fix in a server-rendered
context.
