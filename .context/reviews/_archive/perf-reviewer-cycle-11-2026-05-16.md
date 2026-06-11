# Perf Reviewer — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** CPU, memory, UI responsiveness.

## NEW findings

**0 HIGH, 0 MEDIUM, 0 LOW, 1 INFORMATIONAL.**

### PERF11-1 (INFO) — translation-bag construction allocates 9 closures per render
**File:** `participant-timeline-view.tsx:229-242`,
`(public)/contests/manage/[assignmentId]/students/[userId]/page.tsx:95-108`

`ParticipantTimelineBar`'s `translations` prop is rebuilt fresh on
every render with nine inline arrow functions. Both call sites are
server components, so each request renders once — closure allocation
is dwarfed by the page's other work (`db.query.*`,
`getParticipantTimeline`). No actionable item.

**Exit criterion:** re-evaluate if either page is converted to a
client component.

## Carry-forward (perf)

- PERF8b-1, PERF8b-2/3/4, PERF10-1, PERF10-2 — all unchanged this cycle.

## Verdict

No actionable perf regression introduced this cycle.
