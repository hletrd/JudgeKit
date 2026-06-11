# Perspective: Instructor — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Walked: authoring → exam config → live monitoring →
similarity review → grading/export → accommodation handling.

## IN5-1 — The flag I'm told to review is illegible and over-reported (HIGH workflow impact, High, CONFIRMED)
The integrity doc obligates me to review `submission_stale_heartbeat` events
before trusting results. In the dashboard that row shows a raw key path
instead of a label, with a neutral badge color quieter than a tab-switch
(V5-4/DES5-1/2), its details are a JSON blob (DES5-3), and — worse — some of
those flags correspond to submissions that were REJECTED (ST5-1/CR5-1), which
I cannot tell from the row because it carries no submission reference. To
discharge my obligation today I would need to cross-join three views by
timestamp. G1+G2 (flag-on-accept with submissionId + label/color/details
rendering) turns this from forensic archaeology into a 10-second check.

## IN5-2 — I cannot see who is absent RIGHT NOW (MEDIUM-HIGH, High, CONFIRMED)
During a live exam the per-participant timeline shows events but no absence
periods — the server even computes heartbeat gaps on my behalf and throws
them away (Trace 2), and an ongoing absence is structurally undetectable
(D5-3). For in-room exams "monitor dark since 12:40" is the single most
actionable signal I could get. G3 (render gaps + ongoing boundary) fixes the
supervision story.

## IN5-3 — Similarity tool: status messages can misdiagnose (LOW-MEDIUM, High, CONFIRMED)
For a 600-submission contest with the sidecar down I'm told "service
unavailable" — true but incomplete; the dedicated "too many submissions"
message exists, translated, and is unreachable (CR5-3). Also each re-run
resets all `code_similarity` evidence timestamps (delete+reinsert,
`code-similarity.ts:407-446`), so "when was this pair first flagged" is
unanswerable — relevant when a student disputes timing. The reset is a design
choice; registering the history question for an owner decision (AGG5-10).

## IN5-4 — Accommodations: verified solid (provenance)
Per-student extension composes under concurrency, exceeds assignment close by
design, keeps telemetry alive past close (cycle-3 AGG3-1 verified at this
HEAD), and is fully audited. The carried product asks (pre-start duration
overrides IN2-2; extension visible in participant timeline TA3-1-followup)
remain owner-scheduling decisions — unchanged.

## IN5-5 — Authoring/grading/export spot checks (verified)
Problem CRUD with drafts, test-case import/export, manual-problem grading
path (initial status `submitted`, skips judge queue), assignment status rows
aggregated in SQL (no N+1), CSV export uses the shared escape helper
(formula-injection safe), IOI partial scoring forces run-all-test-cases at
claim time. No new findings in these lanes this cycle.
