# Critic — RPF Cycle 11 (2026-05-16)

**HEAD reviewed:** `8e10ebdd`. **Angle:** multi-perspective critique
of the whole change surface.

## Headline critique

Cycle-10 closed out cleanly: i18n hygiene, defensive a11y, predicate
extraction, defensive numeric clamp, and a small test. The aggregate
review claimed item #2 was complete ("trim unused fields from
`TimelineTranslations`; remove the now-orphaned `messages/*.json`
keys if no other component consumes them") but only the TS side was
trimmed. The JSON side carries six dead leaves. This is a small but
real plan-vs-implementation gap — see CR11-1.

## NEW findings

### CRIT11-1 — plan-vs-implementation drift on cycle-10 task #2
**Severity:** LOW. **Confidence:** HIGH.
**Cross-flag:** matches CR11-1.

`plans/open/2026-05-16-cycle-10-rpf-review-remediation.md` marks
task #2 as `[x]`, but `messages/{ko,en}.json` still contain the
orphaned leaves. The plan is the source of truth used by the next
reviewer to know what landed; partial completion under a green
checkbox is the failure mode the deferred ledger is designed to
prevent.

**Fix:** finish the trim in cycle 11 (delete the six leaves) AND add
a sentence to the cycle-10 plan acknowledging the cycle-11 follow-up.

### CRIT11-2 — `students/[userId]/page.tsx` mixes data-fetching with i18n bag-building
**Severity:** LOW (cosmetic). **Confidence:** MEDIUM.

Lines 95-108 of the page assemble the same `timelineTranslations`
bag that `participant-timeline-view.tsx` also assembles. The page is
already long (~270 lines); centralising via `buildParticipantTimelineTranslations`
(per ARCH11-2) would also remove this duplication.

### CRIT11-3 — `participant-timeline-bar.tsx` is 393 lines and growing
**Severity:** LOW. **Confidence:** LOW.

Top-bar markers, per-problem mini-bars, hover tooltip card, and
legend are all inline. A future feature (e.g. zoom controls or per-
event filter) will push this over the comfortable single-file
threshold. Not actionable this cycle; flag for awareness.

## Cross-agent overlap

- CR11-1 (orphaned JSON keys) — also flagged by critic (CRIT11-1).
- ARCH11-2 (duplicated bag-builder) — also flagged by critic
  (CRIT11-2).

## Verdict

The cycle-10 ship is fine. CRIT11-1 is the only meaningful finding;
the others are routine maintainability signals.
