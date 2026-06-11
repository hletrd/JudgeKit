# Architect — RPF Cycle 5 (2026-06-11)

**HEAD:** 04b8c1ec. Design/coupling review of the anti-cheat evidence chain
and the cycle-4 deltas; layering spot checks elsewhere.

## A5-1 — Write side-effect inside a validator violates command/query separation; finish the cycle-4 direction (MEDIUM-HIGH, High, CONFIRMED)
Cycle-4's A4-1 correctly diagnosed "a write inside a validator" and made it
opt-in — but left the write IN the validator
(`validateAssignmentSubmission`, `submissions.ts:343-392`). The structural
consequence is CR5-1: the validator cannot know whether the submission will
be accepted, so it cannot truthfully record an "accepted-submission" flag.
Correct ownership: the validator (query) returns a staleness verdict; the
submit route (command) records the flag after the accept point, enriched with
`submissionId`/IP. This removes the last hidden write from the validation
path and makes the evidence row self-describing. Option name should change
(`recordStaleHeartbeatFlag` → `probeStaleHeartbeat`) so the signature stops
promising a write the validator no longer performs.

## A5-2 — Anti-cheat presentation constants duplicated across two components (LOW, High, CONFIRMED)
`EVENT_TYPE_COLORS` and `formatDetailsJson` are copy-pasted between
`anti-cheat-dashboard.tsx:81-110` and
`participant-anti-cheat-timeline.tsx:35-59` and have already drifted (the
dashboard gained `REVIEW_TIER_COLORS` + tier badges; the timeline did not —
and BOTH are missing the `submission_stale_heartbeat` entry, the same bug
twice). Extract a shared `src/components/contest/anti-cheat-presentation.ts`
(colors, tier colors, details formatter) so G2's fix lands once. The
review-tier MODEL is already correctly placed in lib
(`anti-cheat/review-model.ts`) — only presentation constants are duplicated.

## A5-3 — Enum/UI contract drift in similarity reasons (LOW, High, CONFIRMED)
`SimilarityRunReason` declares `too_many_submissions`; the engine never emits
it; the dashboard implements a branch + i18n for it. Contract drift in the
narrow waist between lib and UI (CR5-3). Emit the declared value.

## A5-4 — Layering spot checks — sound (provenance)
- `client-events.ts` extraction (cycle-4 G1) holds: lib → lib imports only;
  the route consumes the lib; no route-module exports are imported by lib.
- Server-time discipline: all schedule checks and evidence inserts use DB
  time EXCEPT the flag insert (CR5-5) — fold into G1.
- `exam-close.ts` remains the single owner of effective-close semantics;
  both consumers (validator, ingest) delegate. Good.
- judge claim/poll/staleness-sweep triad: responsibilities cleanly split
  (claim = atomic SQL; poll = token-fenced writes; sweep = counter repair).
- deploy-docker.sh remains 1433 lines with SSH plumbing inline — C3-AGG-5
  extraction trigger stays TRIPPED for any cycle that edits SSH/remote-exec
  code (this cycle does not plan to).
