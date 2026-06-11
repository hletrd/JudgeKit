# Code Reviewer — RPF Cycle 10 (2026-05-16)

**Cycle:** 3/100 of this RPF loop (orchestrator-numbered)
**HEAD reviewed:** `23dd9e80` (working tree clean)
**Scope:** Full source-tree sweep, with emphasis on cycle-8/cycle-9
materialised features and the still-open deferred ledger.

## Inventory

- 599 TS/TSX files under `src/`.
- Recent diff focus areas (since cycle-8):
  - `src/lib/plugins/secrets.ts` (cycle-9 rewire)
  - `src/lib/code/language-map.ts` (cycle-9 adapter)
  - `src/components/contest/code-timeline-panel.tsx` (cycle-9 consolidation)
  - `src/components/contest/participant-timeline-bar.tsx` (cycle-8 feat)
  - `src/lib/platform-mode-context.ts` (cycle-8 staff bypass)
  - `src/app/(public)/contests/[id]/page.tsx` (cycle-8 managing view)

## NEW Findings

### CR10-1 — Hardcoded English strings in i18n component
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:144-152, 189, 271`

`formatDuration` returns hardcoded `"h "`, `"m "`, `"s"` suffixes; the
axis label is hardcoded `"0m"`; the tooltip prefix is hardcoded
`"Score:"`. The component otherwise routes display strings through a
`TimelineTranslations` bag, so this is a regression from the
established pattern. Affects Korean users on the
`/contests/manage/<id>/students/<userId>` audit page (the leading
locale for this product).

**Fix:** Add `durationHours`, `durationMinutes`, `durationSeconds`,
`axisStart`, `scoreLabel` keys to the `TimelineTranslations` bag and
pull values from `next-intl` in the parent server component.

### CR10-2 — Dead translation keys in `TimelineTranslations`
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:49-64`,
`src/components/contest/participant-timeline-view.tsx:235`

The `TimelineTranslations` type declares `pointsValue`, `bestScore`,
`timeToFirstSubmission`, `timeToSolve`, `wrongBeforeAc`,
`relativeTime`, `tries` etc, but only `noSubmissions`, `attempts`,
`firstAccepted`, `codeSnapshot`, `best`, `tries` are actually used in
the render path. The unused keys still consume `messages/*.json`
entries (`contests.participantAudit.timelineBar.*`) and create dead
plumbing.

**Fix:** Drop unused fields from the type and the corresponding bag
construction; if the keys are kept for future use, mark them as
optional and remove from the bag-building call site.

### CR10-3 — `Link href="#"` fallback when `submissionId` is missing
**Severity:** LOW · **Confidence:** HIGH
**File:** `src/components/contest/participant-timeline-bar.tsx:222-243`

```ts
<Link href={ev.submissionId ? `/submissions/${ev.submissionId}` : "#"} ...>
```

A `next/link` to `#` performs a no-op navigation that still scrolls
the page (and shows `#` in the address bar). For events without a
`submissionId` (defensive case for non-submission rows) the marker
should render as a non-interactive `div` with the same a11y label
rather than a misleading link.

**Fix:** Branch on `ev.submissionId` and only emit `<Link>` when it
is present; emit a `<div role="img" aria-label=...>` otherwise.

### CR10-4 — `getEnrolledContestDetail` is now misnamed
**Severity:** LOW (cosmetic) · **Confidence:** HIGH (carry-forward of ARCH8b-4)
**File:** `src/app/(public)/contests/[id]/page.tsx:120-131`, helper site

After cycle-8 the helper is invoked for `userAccess === "enrolled" ||
userAccess === "managing"`, so the `Enrolled` prefix is misleading.
Rename to `getParticipationContestDetail` or
`getContestDetailForViewer`.

**Fix:** Rename + adjust callers. No behaviour change.

## Cross-file interactions

- `participant-timeline-bar.tsx` consumes
  `ParticipantTimeline.problems[].timeline` produced by
  `participant-timeline.ts`. Confirmed: events carry `at`,
  `submissionId`/`snapshotId`, no collision in `flatEvents` keying
  (`${problemId}-${type}-${at.getTime()}` is sufficient because
  same-millisecond + same-type + same-problem is implausible).

- The cycle-9 `getHighlightJsLanguage` adapter is now the single
  source of truth for "judge language → hljs"; the parallel map in
  `code-timeline-panel.tsx` was removed cleanly. Confirmed no other
  caller carries a parallel map (`grep`-verified).

- The cycle-8 `isAiAssistantEnabledForContext` staff bypass uses a
  dynamic `import("@/lib/capabilities/cache")` to avoid pulling the
  cache into RSC bundles where it's not needed; carry-forward
  PERF8b-2 stays deferred.

## Confirmed-clean

- `ROUND(<column>, N)` audit (regression-hunt after cycle-8 fix):
  remaining `ROUND(...)` sites either operate on already-`numeric`
  expressions (output of `buildIoiLatePenaltyCaseExpr`) or on
  `integer` columns (`ap.points`) which Postgres auto-casts. No
  Postgres-18 risk remaining.

## Verdict

Zero correctness/security bugs. Three small UX-quality items
(CR10-1/2/3) and one carry-forward rename (CR10-4). All LOW.
