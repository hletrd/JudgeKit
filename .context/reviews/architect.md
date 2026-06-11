# Architect — RPF Cycle 2 (2026-06-11)

**HEAD reviewed:** 4cf01035 (main)

## Assessment

### A2-1 — Telemetry write-surfaces lack a shared ingestion contract (MEDIUM, structural)
Three sibling student-write surfaces (submissions, source drafts, code
snapshots) each hand-roll the same trio of concerns — language registry gate,
size cap, retention — and each has drifted independently (snapshots currently
missing two of three). Minimal structural fix this cycle: close the snapshot
gaps (SEC2-1/2) and add the retention class-closer test (T2-2). Larger
refactor (a shared `validateTelemetryWrite` helper) is NOT recommended yet —
two call sites do not justify the indirection; revisit if a fourth telemetry
table appears.

### A2-2 — deploy-docker.sh: build-resilience belongs in the script, not the operator (HIGH ops)
The script already embodies DB-safety architecture (pre-deploy dump, volume
safety check, destructive-diff halt), but build-state resilience is absent:
one corrupted buildx history store turns a deploy into a manual incident
(cycle-1 auraedu). The DEFERRED-OPS-1 hardening (signature detection +
`docker buildx history rm --all` + bounded retry + serialized language
builds) is architecturally consistent with the script's existing
"detect → remediate → verify" patterns (cf. Step 5b secret_token flow).
Carry-forward note: C3-AGG-5 (modular extraction of SSH helpers) trigger
remains TRIPPED for the SSH-helpers area specifically; this cycle's edits
touch the language-build step, not SSH helpers — the extraction obligation
carries unchanged, and the file is now ~1335 lines, approaching the
1500-line size trigger. Record in the deferral register again.

### A2-3 — Exam-session domain boundary held up well under F12 (positive)
The extension feature landed without violating layering: SQL-composition in
the lib (`extendExamSession`), gate + audit in the route, render in a
client component, validation honoring in `validateAssignmentSubmission`.
The one seam it missed is the client-side deadline subscription (V2-1) —
the student page treats the session deadline as immutable-per-render. The
fix should stay client-local (poll/refetch), NOT introduce a push channel;
SSE for exam sessions would be over-architecture at current scale.

## Carried architectural items (unchanged preconditions)
- ARCH-CARRY-1: raw judge handlers (claim/poll) not on createApiHandler —
  deliberate (streaming/latency); re-evaluate only if a third raw handler
  appears.
- ARCH-CARRY-2: SSE O(n) eviction beyond 500 tracked connections.
- C7-AGG-9: two rate-limit modules drift risk — NOTE: this cycle's CR2-2 fix
  touches both modules' shared core; apply the fix in `rate-limit-core.ts`
  where possible so the consolidation debt does not grow.
