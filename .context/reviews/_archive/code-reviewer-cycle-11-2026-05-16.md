# Code Reviewer — RPF Cycle 11 (2026-05-16)

**Cycle:** 4/100 of this RPF loop (orchestrator-numbered)
**HEAD reviewed:** `8e10ebdd` (cycle-10 deploy confirmation commit)
**Angle:** code quality, logic, SOLID, maintainability.

## Inventory

Scoped to the cycle-10 surface plus the prior-cycle deferred list:

- `src/components/contest/participant-timeline-bar.tsx`
- `src/components/contest/participant-timeline-view.tsx`
- `src/app/(public)/contests/[id]/page.tsx`
- `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx`
- `messages/{en,ko}.json` — `contests.participantAudit.problemSummary` group
- `tests/component/participant-timeline-bar.test.tsx`

## NEW findings

### CR11-1 — orphaned `problemSummary` translation keys after cycle-10 trim
**Severity:** LOW. **Confidence:** HIGH.

`messages/ko.json` and `messages/en.json` still contain six keys under
`contests.participantAudit.problemSummary` that no consumer references
after the cycle-10 trim of the `TimelineTranslations` bag:

- `bestScore`
- `timeToFirstSubmission`
- `timeToSolve`
- `wrongBeforeAc`
- `relativeTime`
- `snapshots`

Cycle-10 plan item #2 explicitly stated: "remove the now-orphaned
`messages/*.json` keys if no other component consumes them." The TS
side was trimmed, but the JSON keys remained. `rg "problemSummary\." src/`
returns only `firstAccepted | codeSnapshot | attempts | tries | best`.

**Failure scenario:** translators continue maintaining dead strings;
future readers waste time chasing call sites; gradual JSON bloat.

**Fix:** delete the six dead leaves from both locale JSONs. Run
`npm run test:unit` to confirm no test reads them.

### CR11-2 — snapshot marker `aria-label` omits event type
**Severity:** LOW. **Confidence:** HIGH.
**File:** `participant-timeline-bar.tsx:215-223`

Submission / first_ac markers include status/type in their aria-label:

```
${ev.problemTitle} — ${ev.status ?? ev.type} — ${formattedDate}
```

The snapshot branch only uses `${ev.problemTitle} — ${formattedDate}`,
so screen readers cannot distinguish a snapshot from a submission. Tooltip
content (`codeSnapshot(chars)`) is keyboard-inaccessible (hover-only),
so the aria-label is the only assistive cue.

**Fix:** include a localized "snapshot" word in the aria-label, e.g.
add a `snapshotMarkerAriaLabel: (problemTitle, formattedDate) => string`
to the translations bag, or reuse the existing `codeSnapshot` key.

### CR11-3 — `eventKey` collision risk in per-problem mini-bar when submissionId is missing
**Severity:** LOW. **Confidence:** MEDIUM.
**File:** `participant-timeline-bar.tsx:348-352`

```ts
const eventKey =
  ev.type === "snapshot"
    ? `snapshot-${ev.snapshotId}`
    : `${ev.type}-${ev.submissionId}`;
```

If multiple submission events lack `submissionId` (the cycle-10
plan added the defensive path in the top bar but not here), the key
collapses to `submission-undefined` and React will warn + drop one.
The cycle-10 plan only hardened the top-bar marker path, not the
mini-bar.

**Fix:** fall back to `${ev.type}-${ev.at?.getTime?.() ?? idx}` when
`submissionId` is missing (and pass `idx` from the surrounding
`.map`).

### CR11-4 — `statusColors` map in `students/[userId]/page.tsx` duplicates `buildStatusLabels` palette
**Severity:** LOW (cosmetic). **Confidence:** MEDIUM.
**File:** `src/app/(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:110-120`

The local `statusColors` table re-encodes status → Tailwind palette
inline. The same palette (or a near-clone) likely exists elsewhere
(`submission-status-badge.tsx`, scoreboard rows, etc.). Drifting
copies are a maintainability hazard.

**Fix:** verify whether a shared helper already exists; if so, use
it. Otherwise defer with an exit criterion ("extract when a third
copy appears").

## Verifier check on cycle-10 fixes

All cycle-10 fixes are intact at HEAD:

- `canShowParticipationView` predicate helper present.
- `formatDuration` clamps with `Math.max(0, totalSeconds)`.
- Non-interactive `<div role="img">` marker when `submissionId` missing.
- `translations` bag carries `axisStart`, `scoreLabel`, `durationLong`, `durationShort`.
- Render-shape test file present with 5 assertions.

## Verdict

Cycle 11 starts from a green baseline. NEW findings are limited to
a JSON-trim follow-up (CR11-1), an a11y label fix (CR11-2), a
defensive key fallback (CR11-3), and a deferrable cosmetic
duplication (CR11-4). No HIGH/MEDIUM severity items.
